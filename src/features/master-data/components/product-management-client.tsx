"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import {
  createProduct,
  updateProduct,
  updateProductStatus,
} from "~/features/master-data/product-actions";
import type {
  ProductCategory,
  ProductCategoryFilter,
  ProductListItem,
  ProductStatusFilter,
} from "~/features/master-data/product-queries";
import { PRODUCT_CATEGORY_VALUES } from "~/features/master-data/product-schemas";
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

type ProductManagementClientProps = {
  products: ProductListItem[];
  filters: {
    q: string;
    category: ProductCategoryFilter;
    status: ProductStatusFilter;
  };
};

type EditingState =
  | {
      mode: "create";
      product?: never;
    }
  | {
      mode: "edit";
      product: ProductListItem;
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

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function getStatusValue(isActive: boolean) {
  return isActive ? "active" : "inactive";
}

export function ProductManagementClient({
  products,
  filters,
}: ProductManagementClientProps) {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLSelectElement>(null);
  const specInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<EditingState | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("냉동");
  const [spec, setSpec] = useState("");
  const [defaultUnitPrice, setDefaultUnitPrice] = useState("");
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
    category?: ProductCategoryFilter;
    status?: ProductStatusFilter;
  }) {
    const params = new URLSearchParams();

    if (next.q) {
      params.set("q", next.q);
    }

    if (next.category && next.category !== "all") {
      params.set("category", next.category);
    }

    if (next.status && next.status !== "all") {
      params.set("status", next.status);
    }

    router.push(
      `/app/master-data/products${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.name?.length) {
        nameInputRef.current?.focus();
        return;
      }

      if (errors.category?.length) {
        categoryInputRef.current?.focus();
        return;
      }

      if (errors.spec?.length) {
        specInputRef.current?.focus();
        return;
      }

      if (errors.defaultUnitPrice?.length) {
        priceInputRef.current?.focus();
      }
    }, 0);
  }

  function openCreateDialog() {
    setDialogState({ mode: "create" });
    setName("");
    setCategory("냉동");
    setSpec("");
    setDefaultUnitPrice("");
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function openEditDialog(product: ProductListItem) {
    setDialogState({ mode: "edit", product });
    setName(product.name);
    setCategory(product.category);
    setSpec(product.spec);
    setDefaultUnitPrice(String(product.defaultUnitPrice));
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

    pushFilters({ q, category: filters.category, status: filters.status });
  }

  async function handleCategoryFilterChange(value: string) {
    const nextCategory = PRODUCT_CATEGORY_VALUES.includes(
      value as ProductCategory,
    )
      ? (value as ProductCategory)
      : "all";

    pushFilters({
      q: filters.q,
      category: nextCategory,
      status: filters.status,
    });
  }

  async function handleStatusFilterChange(value: string) {
    const nextStatus =
      value === "active" || value === "inactive" ? value : "all";

    pushFilters({
      q: filters.q,
      category: filters.category,
      status: nextStatus,
    });
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const payload = {
        name,
        category,
        spec,
        defaultUnitPrice,
      };
      const result =
        dialogState?.mode === "edit"
          ? await updateProduct(dialogState.product.id, payload)
          : await createProduct(payload);

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

  async function handleRowStatusSave(product: ProductListItem) {
    const statusValue =
      rowStatusValues[product.id] ?? getStatusValue(product.isActive);
    const nextIsActive = statusValue === "active";

    if (nextIsActive === product.isActive) {
      return;
    }

    setRowSavingId(product.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });

    try {
      const result = await updateProductStatus(product.id, {
        isActive: nextIsActive,
      });

      if (!result.ok) {
        setRowErrors((current) => ({
          ...current,
          [product.id]: result.error.message,
        }));
        return;
      }

      router.refresh();
    } catch {
      setRowErrors((current) => ({
        ...current,
        [product.id]: "상태 변경 중 오류가 발생했습니다.",
      }));
    } finally {
      setRowSavingId(null);
    }
  }

  const nameError = fieldErrors.name?.[0];
  const categoryError = fieldErrors.category?.[0];
  const specError = fieldErrors.spec?.[0];
  const priceError = fieldErrors.defaultUnitPrice?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Field className="sm:min-w-64">
            <FieldLabel htmlFor="product-search">품목 검색</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="product-search"
                name="q"
                defaultValue={filters.q}
                placeholder="품목명 검색"
              />
              <Button type="submit" variant="outline">
                <SearchIcon data-icon="inline-start" />
                검색
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="product-category-filter">구분 필터</FieldLabel>
            <select
              id="product-category-filter"
              value={filters.category}
              onChange={(event) =>
                void handleCategoryFilterChange(event.currentTarget.value)
              }
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="all">전체</option>
              {PRODUCT_CATEGORY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="product-status-filter">상태 필터</FieldLabel>
            <select
              id="product-status-filter"
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
          품목 추가
        </Button>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>품목명</TableHead>
              <TableHead>구분</TableHead>
              <TableHead>규격</TableHead>
              <TableHead>기본 단가</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 수정 시각</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const statusValue =
                rowStatusValues[product.id] ?? getStatusValue(product.isActive);
              const isRowStatusChanged =
                statusValue !== getStatusValue(product.isActive);
              const rowError = rowErrors[product.id];

              return (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.spec}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatKrw(product.defaultUnitPrice)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? "secondary" : "outline"}>
                      {product.isActive
                        ? statusLabels.active
                        : statusLabels.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUpdatedAt(product.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <select
                        aria-label="활성 상태"
                        value={statusValue}
                        onChange={(event) => {
                          const nextStatusValue = event.currentTarget.value;

                          setRowStatusValues((current) => ({
                            ...current,
                            [product.id]: nextStatusValue,
                          }));
                          setRowErrors((current) => {
                            const next = { ...current };
                            delete next[product.id];
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
                        onClick={() => void handleRowStatusSave(product)}
                        disabled={
                          rowSavingId === product.id || !isRowStatusChanged
                        }
                      >
                        상태 적용
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(product)}
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
            {products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 품목이 없습니다.
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
              {dialogState?.mode === "edit" ? "품목 정보 수정" : "품목 추가"}
            </DialogTitle>
            <DialogDescription>
              장부 입력에서 참조할 품목 기준 정보를 관리합니다.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleDialogSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="product-name">품목명</FieldLabel>
              <Input
                ref={nameInputRef}
                id="product-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "product-name-error" : undefined}
              />
              {nameError ? (
                <FieldError id="product-name-error">{nameError}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(categoryError)}>
              <FieldLabel htmlFor="product-category">구분</FieldLabel>
              <select
                ref={categoryInputRef}
                id="product-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.currentTarget.value as ProductCategory)
                }
                aria-invalid={Boolean(categoryError)}
                aria-describedby={
                  categoryError ? "product-category-error" : undefined
                }
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {PRODUCT_CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              {categoryError ? (
                <FieldError id="product-category-error">
                  {categoryError}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(specError)}>
              <FieldLabel htmlFor="product-spec">규격</FieldLabel>
              <Input
                ref={specInputRef}
                id="product-spec"
                value={spec}
                onChange={(event) => setSpec(event.currentTarget.value)}
                aria-invalid={Boolean(specError)}
                aria-describedby={specError ? "product-spec-error" : undefined}
              />
              {specError ? (
                <FieldError id="product-spec-error">{specError}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(priceError)}>
              <FieldLabel htmlFor="product-default-unit-price">
                기본 단가
              </FieldLabel>
              <Input
                ref={priceInputRef}
                id="product-default-unit-price"
                inputMode="numeric"
                value={defaultUnitPrice}
                onChange={(event) =>
                  setDefaultUnitPrice(event.currentTarget.value)
                }
                aria-invalid={Boolean(priceError)}
                aria-describedby={
                  priceError ? "product-default-unit-price-error" : undefined
                }
              />
              {priceError ? (
                <FieldError id="product-default-unit-price-error">
                  {priceError}
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
