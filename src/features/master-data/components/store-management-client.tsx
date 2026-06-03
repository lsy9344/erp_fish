"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import {
  createStore,
  updateStore,
  updateStoreStatus,
} from "~/features/master-data/actions";
import type {
  StoreListItem,
  StoreStatusFilter,
} from "~/features/master-data/queries";
import type { FieldErrors } from "~/lib/action-result";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type StoreManagementClientProps = {
  stores: StoreListItem[];
  filters: {
    q: string;
    status: StoreStatusFilter;
  };
};

type EditingState =
  | {
      mode: "create";
      store?: never;
    }
  | {
      mode: "edit";
      store: StoreListItem;
    };

const statusLabels = {
  active: "활성",
  inactive: "비활성",
} as const;

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function getStatusValue(isActive: boolean) {
  return isActive ? "active" : "inactive";
}

export function StoreManagementClient({
  stores,
  filters,
}: StoreManagementClientProps) {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<EditingState | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [rowStatusValues, setRowStatusValues] = useState<
    Record<string, string>
  >({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function pushFilters(next: { q?: string; status?: StoreStatusFilter }) {
    const params = new URLSearchParams();

    if (next.q) {
      params.set("q", next.q);
    }

    if (next.status && next.status !== "all") {
      params.set("status", next.status);
    }

    router.push(
      `/app/master-data/stores${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function openCreateDialog() {
    setDialogState({ mode: "create" });
    setName("");
    setIsActive(true);
    setFieldErrors({});
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function openEditDialog(store: StoreListItem) {
    setDialogState({ mode: "edit", store });
    setName(store.name);
    setIsActive(store.isActive);
    setFieldErrors({});
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function closeDialog() {
    setDialogState(null);
    setFieldErrors({});
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const qValue = formData.get("q");
    const q = typeof qValue === "string" ? qValue.trim() : "";

    pushFilters({ q, status: filters.status });
  }

  async function handleStatusFilterChange(value: string) {
    const nextStatus =
      value === "active" || value === "inactive" ? value : "all";

    pushFilters({ q: filters.q, status: nextStatus });
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});

    const result =
      dialogState?.mode === "edit"
        ? await updateStore(dialogState.store.id, { name, isActive })
        : await createStore({ name, isActive: true });

    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
      return;
    }

    closeDialog();
    router.refresh();
  }

  async function handleRowStatusSave(store: StoreListItem) {
    const statusValue =
      rowStatusValues[store.id] ?? getStatusValue(store.isActive);
    const nextIsActive = statusValue === "active";

    if (nextIsActive === store.isActive) {
      return;
    }

    setRowSavingId(store.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[store.id];
      return next;
    });

    const result = await updateStoreStatus(store.id, {
      isActive: nextIsActive,
    });

    setRowSavingId(null);

    if (!result.ok) {
      setRowErrors((current) => ({
        ...current,
        [store.id]: result.error.message,
      }));
      return;
    }

    router.refresh();
  }

  const nameError = fieldErrors.name?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Field className="sm:min-w-64">
            <FieldLabel htmlFor="store-search">지점 검색</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="store-search"
                name="q"
                defaultValue={filters.q}
                placeholder="지점명 검색"
              />
              <Button type="submit" variant="outline">
                <SearchIcon data-icon="inline-start" />
                검색
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="store-status-filter">상태 필터</FieldLabel>
            <select
              id="store-status-filter"
              value={filters.status}
              onChange={(event) =>
                void handleStatusFilterChange(event.currentTarget.value)
              }
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="all">전체</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </Field>
        </form>
        <Button type="button" onClick={openCreateDialog}>
          <PlusIcon data-icon="inline-start" />
          지점 추가
        </Button>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>지점명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 수정자</TableHead>
              <TableHead>마지막 수정 시각</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((store) => {
              const statusValue =
                rowStatusValues[store.id] ?? getStatusValue(store.isActive);
              const isRowStatusChanged =
                statusValue !== getStatusValue(store.isActive);
              const rowError = rowErrors[store.id];

              return (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell>
                    <Badge variant={store.isActive ? "secondary" : "outline"}>
                      {store.isActive
                        ? statusLabels.active
                        : statusLabels.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>{store.updatedByName}</TableCell>
                  <TableCell>{formatUpdatedAt(store.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <select
                        aria-label="활성 상태"
                        value={statusValue}
                        onChange={(event) => {
                          const nextStatusValue = event.currentTarget.value;

                          setRowStatusValues((current) => ({
                            ...current,
                            [store.id]: nextStatusValue,
                          }));
                          setRowErrors((current) => {
                            const next = { ...current };
                            delete next[store.id];
                            return next;
                          });
                        }}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                      >
                        <option value="active">활성</option>
                        <option value="inactive">비활성</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleRowStatusSave(store)}
                        disabled={
                          rowSavingId === store.id || !isRowStatusChanged
                        }
                      >
                        상태 적용
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(store)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        수정
                      </Button>
                    </div>
                    {rowError ? (
                      <p className="text-destructive mt-2 text-sm" role="alert">
                        {rowError}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {stores.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 지점이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(dialogState)}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit" ? "지점 정보 수정" : "지점 추가"}
            </DialogTitle>
            <DialogDescription>
              지점명과 운영 상태를 관리합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDialogSubmit} className="flex flex-col gap-4">
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="store-name">지점명</FieldLabel>
              <Input
                ref={nameInputRef}
                id="store-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "store-name-error" : undefined}
              />
              {nameError ? (
                <FieldError id="store-name-error">{nameError}</FieldError>
              ) : null}
            </Field>
            {dialogState?.mode === "edit" ? (
              <Field>
                <FieldLabel htmlFor="store-active">활성 상태</FieldLabel>
                <select
                  id="store-active"
                  value={getStatusValue(isActive)}
                  onChange={(event) =>
                    setIsActive(event.currentTarget.value === "active")
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
              </Field>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                취소
              </Button>
              <Button type="submit" disabled={isSaving}>
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
