"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import {
  createLedgerInputCode,
  updateLedgerInputCode,
  updateLedgerInputCodeStatus,
} from "~/features/master-data/code-actions";
import type {
  LedgerInputCodeGroupFilter,
  LedgerInputCodeListItem,
  LedgerInputCodeStatusFilter,
} from "~/features/master-data/code-queries";
import {
  LEDGER_INPUT_CODE_GROUPS,
  getLedgerInputCodeGroupLabel,
  type LedgerInputCodeGroupValue,
} from "~/features/master-data/code-schemas";
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

type CodeManagementClientProps = {
  codes: LedgerInputCodeListItem[];
  filters: {
    q: string;
    group: LedgerInputCodeGroupFilter;
    status: LedgerInputCodeStatusFilter;
  };
};

type EditingState =
  | {
      mode: "create";
      code?: never;
    }
  | {
      mode: "edit";
      code: LedgerInputCodeListItem;
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

function normalizeGroupFilter(value: string): LedgerInputCodeGroupFilter {
  return LEDGER_INPUT_CODE_GROUPS.some((group) => group.value === value)
    ? (value as LedgerInputCodeGroupValue)
    : "all";
}

export function CodeManagementClient({
  codes,
  filters,
}: CodeManagementClientProps) {
  const router = useRouter();
  const groupInputRef = useRef<HTMLSelectElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const displayOrderInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<EditingState | null>(null);
  const [group, setGroup] =
    useState<LedgerInputCodeGroupValue>("PAYMENT_METHOD");
  const [name, setName] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rowStatusValues, setRowStatusValues] = useState<
    Record<string, string>
  >({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function pushFilters(next: {
    q?: string;
    group?: LedgerInputCodeGroupFilter;
    status?: LedgerInputCodeStatusFilter;
  }) {
    const params = new URLSearchParams();

    if (next.q) {
      params.set("q", next.q);
    }

    if (next.group && next.group !== "all") {
      params.set("group", next.group);
    }

    if (next.status && next.status !== "all") {
      params.set("status", next.status);
    }

    router.push(
      `/app/master-data/codes${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.group?.length) {
        groupInputRef.current?.focus();
        return;
      }

      if (errors.name?.length) {
        nameInputRef.current?.focus();
        return;
      }

      if (errors.displayOrder?.length) {
        displayOrderInputRef.current?.focus();
      }
    }, 0);
  }

  function openCreateDialog() {
    setDialogState({ mode: "create" });
    setGroup("PAYMENT_METHOD");
    setName("");
    setDisplayOrder("");
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function openEditDialog(code: LedgerInputCodeListItem) {
    setDialogState({ mode: "edit", code });
    setGroup(code.group);
    setName(code.name);
    setDisplayOrder(String(code.displayOrder));
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function closeDialog() {
    setDialogState(null);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const qValue = formData.get("q");
    const q = typeof qValue === "string" ? qValue.trim() : "";

    pushFilters({ q, group: filters.group, status: filters.status });
  }

  async function handleGroupFilterChange(value: string) {
    pushFilters({
      q: filters.q,
      group: normalizeGroupFilter(value),
      status: filters.status,
    });
  }

  async function handleStatusFilterChange(value: string) {
    const nextStatus =
      value === "active" || value === "inactive" ? value : "all";

    pushFilters({ q: filters.q, group: filters.group, status: nextStatus });
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const payload = {
        group,
        name,
        displayOrder,
      };
      const result =
        dialogState?.mode === "edit"
          ? await updateLedgerInputCode(dialogState.code.id, payload)
          : await createLedgerInputCode(payload);

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFormError(result.error.message);
        setFieldErrors(nextErrors);
        focusFirstError(nextErrors);
        return;
      }

      closeDialog();
      router.refresh();
    } catch {
      setFormError("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRowStatusSave(code: LedgerInputCodeListItem) {
    const statusValue =
      rowStatusValues[code.id] ?? getStatusValue(code.isActive);
    const nextIsActive = statusValue === "active";

    if (nextIsActive === code.isActive) {
      return;
    }

    setRowSavingId(code.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[code.id];
      return next;
    });

    try {
      const result = await updateLedgerInputCodeStatus(code.id, {
        isActive: nextIsActive,
      });

      if (!result.ok) {
        setRowErrors((current) => ({
          ...current,
          [code.id]: result.error.message,
        }));
        return;
      }

      router.refresh();
    } catch {
      setRowErrors((current) => ({
        ...current,
        [code.id]: "상태 변경 중 오류가 발생했습니다.",
      }));
    } finally {
      setRowSavingId(null);
    }
  }

  const groupError = fieldErrors.group?.[0];
  const nameError = fieldErrors.name?.[0];
  const displayOrderError = fieldErrors.displayOrder?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Field className="sm:min-w-64">
            <FieldLabel htmlFor="ledger-input-code-search">
              코드 검색
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="ledger-input-code-search"
                name="q"
                defaultValue={filters.q}
                placeholder="코드명 검색"
              />
              <Button type="submit" variant="outline">
                <SearchIcon data-icon="inline-start" />
                검색
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="ledger-input-code-group-filter">
              그룹 필터
            </FieldLabel>
            <select
              id="ledger-input-code-group-filter"
              value={filters.group}
              onChange={(event) =>
                void handleGroupFilterChange(event.currentTarget.value)
              }
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="all">전체</option>
              {LEDGER_INPUT_CODE_GROUPS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ledger-input-code-status-filter">
              상태 필터
            </FieldLabel>
            <select
              id="ledger-input-code-status-filter"
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
          코드 추가
        </Button>
      </div>

      <div
        aria-label="코드 그룹 빠른 필터"
        className="grid gap-2 sm:grid-cols-3"
      >
        {LEDGER_INPUT_CODE_GROUPS.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={filters.group === item.value ? "secondary" : "outline"}
            aria-pressed={filters.group === item.value}
            onClick={() =>
              pushFilters({
                q: filters.q,
                group: item.value,
                status: filters.status,
              })
            }
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>그룹</TableHead>
              <TableHead>코드명</TableHead>
              <TableHead>표시 순서</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 수정 시각</TableHead>
              <TableHead>마지막 수정자</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((code) => {
              const statusValue =
                rowStatusValues[code.id] ?? getStatusValue(code.isActive);
              const isRowStatusChanged =
                statusValue !== getStatusValue(code.isActive);
              const rowError = rowErrors[code.id];

              return (
                <TableRow key={code.id}>
                  <TableCell>{code.groupLabel}</TableCell>
                  <TableCell className="font-medium">{code.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {code.displayOrder}
                  </TableCell>
                  <TableCell>
                    <Badge variant={code.isActive ? "secondary" : "outline"}>
                      {code.isActive
                        ? statusLabels.active
                        : statusLabels.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUpdatedAt(code.updatedAt)}</TableCell>
                  <TableCell>{code.updatedByName}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <select
                        aria-label="활성 상태"
                        value={statusValue}
                        onChange={(event) => {
                          const nextStatusValue = event.currentTarget.value;

                          setRowStatusValues((current) => ({
                            ...current,
                            [code.id]: nextStatusValue,
                          }));
                          setRowErrors((current) => {
                            const next = { ...current };
                            delete next[code.id];
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
                        onClick={() => void handleRowStatusSave(code)}
                        disabled={
                          rowSavingId === code.id || !isRowStatusChanged
                        }
                      >
                        상태 적용
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(code)}
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
            {codes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 코드가 없습니다.
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
              {dialogState?.mode === "edit" ? "코드 수정" : "코드 추가"}
            </DialogTitle>
            <DialogDescription>
              장부 입력에서 사용할 결제수단, 비용 항목, 손실 유형 코드를
              관리합니다.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleDialogSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field data-invalid={Boolean(groupError)}>
              <FieldLabel htmlFor="ledger-input-code-group">
                코드 그룹
              </FieldLabel>
              <select
                ref={groupInputRef}
                id="ledger-input-code-group"
                value={group}
                onChange={(event) =>
                  setGroup(
                    event.currentTarget.value as LedgerInputCodeGroupValue,
                  )
                }
                aria-invalid={Boolean(groupError)}
                aria-describedby={
                  groupError ? "ledger-input-code-group-error" : undefined
                }
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {LEDGER_INPUT_CODE_GROUPS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {getLedgerInputCodeGroupLabel(item.value)}
                  </option>
                ))}
              </select>
              {groupError ? (
                <FieldError id="ledger-input-code-group-error">
                  {groupError}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="ledger-input-code-name">코드명</FieldLabel>
              <Input
                ref={nameInputRef}
                id="ledger-input-code-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={
                  nameError ? "ledger-input-code-name-error" : undefined
                }
              />
              {nameError ? (
                <FieldError id="ledger-input-code-name-error">
                  {nameError}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(displayOrderError)}>
              <FieldLabel htmlFor="ledger-input-code-display-order">
                표시 순서
              </FieldLabel>
              <Input
                ref={displayOrderInputRef}
                id="ledger-input-code-display-order"
                inputMode="numeric"
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.currentTarget.value)}
                aria-invalid={Boolean(displayOrderError)}
                aria-describedby={
                  displayOrderError
                    ? "ledger-input-code-display-order-error"
                    : undefined
                }
              />
              {displayOrderError ? (
                <FieldError id="ledger-input-code-display-order-error">
                  {displayOrderError}
                </FieldError>
              ) : null}
            </Field>
            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
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
