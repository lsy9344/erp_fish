"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";

import {
  createPurchaseStandard,
  updatePurchaseStandard,
  updatePurchaseStandardStatus,
} from "~/features/master-data/purchase-standard-actions";
import type {
  PurchaseStandardListItem,
  PurchaseStandardStatusFilter,
} from "~/features/master-data/purchase-standard-queries";
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

type ActiveProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
  // 선택적 참고 단가(없으면 null). 이 화면에서는 표시/사용하지 않는다.
  defaultUnitPrice: number | null;
};

type PurchaseStandardManagementClientProps = {
  standards: PurchaseStandardListItem[];
  products: ActiveProductOption[];
  filters: {
    status: PurchaseStandardStatusFilter;
  };
};

type EditingState =
  | {
      mode: "create";
      standard?: never;
    }
  | {
      mode: "edit";
      standard: PurchaseStandardListItem;
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

function formatKrw(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function getStatusValue(isActive: boolean) {
  return isActive ? "active" : "inactive";
}

export function PurchaseStandardManagementClient({
  standards,
  products,
  filters,
}: PurchaseStandardManagementClientProps) {
  const router = useRouter();
  const productInputRef = useRef<HTMLSelectElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<EditingState | null>(null);
  const [productId, setProductId] = useState("");
  const [standardUnitPrice, setStandardUnitPrice] = useState("");
  const [referenceInfo, setReferenceInfo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rowStatusValues, setRowStatusValues] = useState<
    Record<string, string>
  >({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function pushFilters(next: { status?: PurchaseStandardStatusFilter }) {
    const params = new URLSearchParams();

    if (next.status && next.status !== "all") {
      params.set("status", next.status);
    }

    router.push(
      `/app/master-data/purchase-standards${
        params.size ? `?${params.toString()}` : ""
      }`,
    );
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.productId?.length) {
        productInputRef.current?.focus();
        return;
      }

      if (errors.standardUnitPrice?.length) {
        priceInputRef.current?.focus();
        return;
      }

      if (errors.referenceInfo?.length) {
        referenceInputRef.current?.focus();
      }
    }, 0);
  }

  function openCreateDialog() {
    setDialogState({ mode: "create" });
    setProductId(products[0]?.id ?? "");
    setStandardUnitPrice("");
    setReferenceInfo("");
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function openEditDialog(standard: PurchaseStandardListItem) {
    setDialogState({ mode: "edit", standard });
    setProductId(standard.productId);
    setStandardUnitPrice(
      standard.standardUnitPrice === null
        ? ""
        : String(standard.standardUnitPrice),
    );
    setReferenceInfo(standard.referenceInfo ?? "");
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function closeDialog() {
    setDialogState(null);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleStatusFilterChange(value: string) {
    const nextStatus =
      value === "active" || value === "inactive" ? value : "all";

    pushFilters({ status: nextStatus });
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const payload = {
        productId,
        standardUnitPrice,
        referenceInfo,
      };
      const result =
        dialogState?.mode === "edit"
          ? await updatePurchaseStandard(dialogState.standard.id, payload)
          : await createPurchaseStandard(payload);

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

  async function handleRowStatusSave(standard: PurchaseStandardListItem) {
    const statusValue =
      rowStatusValues[standard.id] ?? getStatusValue(standard.isActive);
    const nextIsActive = statusValue === "active";

    if (nextIsActive === standard.isActive) {
      return;
    }

    setRowSavingId(standard.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[standard.id];
      return next;
    });

    try {
      const result = await updatePurchaseStandardStatus(standard.id, {
        isActive: nextIsActive,
      });

      if (!result.ok) {
        setRowErrors((current) => ({
          ...current,
          [standard.id]: result.error.message,
        }));
        return;
      }

      router.refresh();
    } catch {
      setRowErrors((current) => ({
        ...current,
        [standard.id]: "상태 변경 중 오류가 발생했습니다.",
      }));
    } finally {
      setRowSavingId(null);
    }
  }

  const productIdError = fieldErrors.productId?.[0];
  const priceError = fieldErrors.standardUnitPrice?.[0];
  const referenceError = fieldErrors.referenceInfo?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field>
          <FieldLabel htmlFor="purchase-standard-status-filter">
            상태 필터
          </FieldLabel>
          <select
            id="purchase-standard-status-filter"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" onClick={openCreateDialog}>
            <PlusIcon data-icon="inline-start" />
            매입 기준 추가
          </Button>
        </div>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>품목</TableHead>
              <TableHead>기준 단가</TableHead>
              <TableHead>참조 정보</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 수정 시각</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standards.map((standard) => {
              const statusValue =
                rowStatusValues[standard.id] ??
                getStatusValue(standard.isActive);
              const isRowStatusChanged =
                statusValue !== getStatusValue(standard.isActive);
              const rowError = rowErrors[standard.id];

              return (
                <TableRow key={standard.id}>
                  <TableCell className="font-medium">
                    <span>{standard.productName}</span>
                    <span className="text-muted-foreground block text-xs">
                      {standard.productCategory} · {standard.productSpec}
                      {standard.productIsActive ? "" : " · 품목 비활성"}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatKrw(standard.standardUnitPrice)}
                  </TableCell>
                  <TableCell>{standard.referenceInfo ?? "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={standard.isActive ? "secondary" : "outline"}
                    >
                      {standard.isActive
                        ? statusLabels.active
                        : statusLabels.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUpdatedAt(standard.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <select
                        aria-label="활성 상태"
                        value={statusValue}
                        onChange={(event) => {
                          const nextStatusValue = event.currentTarget.value;

                          setRowStatusValues((current) => ({
                            ...current,
                            [standard.id]: nextStatusValue,
                          }));
                          setRowErrors((current) => {
                            const next = { ...current };
                            delete next[standard.id];
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
                        onClick={() => void handleRowStatusSave(standard)}
                        disabled={
                          rowSavingId === standard.id || !isRowStatusChanged
                        }
                      >
                        상태 적용
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(standard)}
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
            {standards.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 매입 기준이 없습니다.
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
              {dialogState?.mode === "edit"
                ? "매입 기준 수정"
                : "매입 기준 추가"}
            </DialogTitle>
            <DialogDescription>
              품목별 기준 단가 또는 참고 정보를 관리합니다.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleDialogSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field data-invalid={Boolean(productIdError)}>
              <FieldLabel htmlFor="purchase-standard-product">품목</FieldLabel>
              <select
                ref={productInputRef}
                id="purchase-standard-product"
                value={productId}
                onChange={(event) => setProductId(event.currentTarget.value)}
                aria-invalid={Boolean(productIdError)}
                aria-describedby={
                  productIdError ? "purchase-standard-product-error" : undefined
                }
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="">품목 선택</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              {productIdError ? (
                <FieldError id="purchase-standard-product-error">
                  {productIdError}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(priceError)}>
              <FieldLabel htmlFor="purchase-standard-price">
                기준 단가
              </FieldLabel>
              <Input
                ref={priceInputRef}
                id="purchase-standard-price"
                inputMode="numeric"
                value={standardUnitPrice}
                onChange={(event) =>
                  setStandardUnitPrice(event.currentTarget.value)
                }
                aria-invalid={Boolean(priceError)}
                aria-describedby={
                  priceError ? "purchase-standard-price-error" : undefined
                }
              />
              {priceError ? (
                <FieldError id="purchase-standard-price-error">
                  {priceError}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(referenceError)}>
              <FieldLabel htmlFor="purchase-standard-reference">
                참조 정보
              </FieldLabel>
              <Input
                ref={referenceInputRef}
                id="purchase-standard-reference"
                value={referenceInfo}
                onChange={(event) =>
                  setReferenceInfo(event.currentTarget.value)
                }
                aria-invalid={Boolean(referenceError)}
                aria-describedby={
                  referenceError
                    ? "purchase-standard-reference-error"
                    : undefined
                }
              />
              {referenceError ? (
                <FieldError id="purchase-standard-reference-error">
                  {referenceError}
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
