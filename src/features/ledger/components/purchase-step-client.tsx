"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerPurchases } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import type { StoreManagerLedgerCostStepData } from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

type ProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
  defaultUnitPrice: number;
};

type PurchaseStandardOption = {
  id: string;
  standardUnitPrice: number | null;
  referenceInfo: string | null;
  product: ProductOption;
};

type PurchaseLine = {
  id: string;
  productId: string;
  purchaseStandardId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  referenceUnitPrice: number;
  unitPrice: string;
  quantity: string;
  referenceInfo: string;
};

type PurchaseStepClientProps = {
  storeName: string;
  initialLedger: StoreManagerLedgerCostStepData;
  productOptions: ProductOption[];
  purchaseStandardOptions: PurchaseStandardOption[];
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (
    input: unknown,
  ) => Promise<ActionResult<StoreManagerLedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function parseAmount(value: string) {
  if (value.trim() === "") {
    return 0;
  }

  if (!/^\d+$/.test(value.trim())) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function createLineState(id: string): PurchaseLine {
  return {
    id,
    productId: "",
    purchaseStandardId: "",
    productName: "",
    productCategory: "",
    productSpec: "",
    referenceUnitPrice: 0,
    unitPrice: "",
    quantity: "",
    referenceInfo: "",
  };
}

function toPurchaseLines(
  items: StoreManagerLedgerCostStepData["purchaseItems"],
) {
  return items.map<PurchaseLine>((item) => ({
    id: item.id,
    productId: item.productId,
    purchaseStandardId: item.purchaseStandardId ?? "",
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    referenceUnitPrice: item.unitPrice,
    unitPrice: String(item.unitPrice),
    quantity: String(item.quantity),
    referenceInfo: item.referenceInfo ?? "",
  }));
}

function getLineAmount(line: PurchaseLine) {
  return parseAmount(line.unitPrice) * parseAmount(line.quantity);
}

function getDraftPurchaseTotal(lines: PurchaseLine[]) {
  return lines.reduce((sum, line) => sum + getLineAmount(line), 0);
}

export function PurchaseStepClient({
  storeName,
  initialLedger,
  productOptions,
  purchaseStandardOptions,
  currentStep = "purchase",
  saveAction = saveLedgerPurchases,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
}: PurchaseStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const productRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const standardRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const unitPriceRefs = useRef<(HTMLInputElement | null)[]>([]);
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nextDraftLineNumberRef = useRef(0);

  const [ledger, setLedger] = useState(initialLedger);
  const [purchaseItems, setPurchaseItems] = useState(() =>
    toPurchaseLines(initialLedger.purchaseItems),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setLedger(initialLedger);
    setPurchaseItems(toPurchaseLines(initialLedger.purchaseItems));
  }, [initialLedger]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < purchaseItems.length; index += 1) {
        if (errors[`purchases.${index}.productId`]?.length) {
          productRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.purchaseStandardId`]?.length) {
          standardRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.unitPrice`]?.length) {
          unitPriceRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.quantity`]?.length) {
          quantityRefs.current[index]?.focus();
          return;
        }
      }
    }, 50);
  }

  function fillLedger(next: StoreManagerLedgerCostStepData) {
    setLedger(next);
    setPurchaseItems(toPurchaseLines(next.purchaseItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    const savedCount = next.purchaseItems.length;
    setResultMessage(
      savedCount > 0
        ? `매입 항목 ${savedCount}건을 저장했습니다.`
        : "저장됐습니다.",
    );
    toast.success(
      savedCount > 0
        ? `매입 항목 ${savedCount}건을 저장했습니다.`
        : "저장됐습니다.",
    );
  }

  function clearRowErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await saveAction({
        ledgerId: ledger.id,
        storeId: ledger.storeId,
        closingDate: getKstLedgerDateParam(ledger.closingDate),
        version: ledger.version,
        purchases: purchaseItems.map((line, index) => ({
          id: line.id,
          productId: productRefs.current[index]?.value ?? line.productId,
          purchaseStandardId:
            standardRefs.current[index]?.value ?? line.purchaseStandardId,
          unitPrice: unitPriceRefs.current[index]?.value ?? line.unitPrice,
          quantity: quantityRefs.current[index]?.value ?? line.quantity,
        })),
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        setIsSaving(false);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return;
      }

      fillLedger(result.data);
      setFormError(null);
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      setResultMessage(null);
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleRetry() {
    if (!formRef.current || isSaving) {
      return;
    }

    formRef.current.requestSubmit();
  }

  function addPurchaseLine() {
    clearRowErrors();
    setResultMessage(null);
    nextDraftLineNumberRef.current += 1;
    setPurchaseItems((current) => [
      ...current,
      createLineState(`draft-purchase-line-${nextDraftLineNumberRef.current}`),
    ]);
  }

  function removePurchaseLine(lineId: string) {
    clearRowErrors();
    setResultMessage(null);
    setPurchaseItems((current) => current.filter((line) => line.id !== lineId));
  }

  function updatePurchaseLine(lineId: string, next: Partial<PurchaseLine>) {
    clearRowErrors();
    setResultMessage(null);
    setPurchaseItems((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...next } : line)),
    );
  }

  function applyProduct(lineId: string, productId: string) {
    const product = productOptions.find((option) => option.id === productId);
    const standard = purchaseStandardOptions.find(
      (option) => option.product.id === productId,
    );

    updatePurchaseLine(lineId, {
      productId,
      purchaseStandardId: standard?.id ?? "",
      productName: product?.name ?? "",
      productCategory: product?.category ?? "",
      productSpec: product?.spec ?? "",
      referenceUnitPrice:
        standard?.standardUnitPrice ?? product?.defaultUnitPrice ?? 0,
      unitPrice: String(
        standard?.standardUnitPrice ?? product?.defaultUnitPrice ?? 0,
      ),
      referenceInfo: standard?.referenceInfo ?? "",
    });
  }

  function applyStandard(lineId: string, standardId: string) {
    const standard = purchaseStandardOptions.find(
      (option) => option.id === standardId,
    );

    if (!standard) {
      updatePurchaseLine(lineId, { purchaseStandardId: standardId });
      return;
    }

    updatePurchaseLine(lineId, {
      productId: standard.product.id,
      purchaseStandardId: standard.id,
      productName: standard.product.name,
      productCategory: standard.product.category,
      productSpec: standard.product.spec,
      referenceUnitPrice:
        standard.standardUnitPrice ?? standard.product.defaultUnitPrice,
      unitPrice: String(
        standard.standardUnitPrice ?? standard.product.defaultUnitPrice,
      ),
      referenceInfo: standard.referenceInfo ?? "",
    });
  }

  const selectableProductOptions = productOptions.filter((product) =>
    purchaseStandardOptions.some(
      (standard) => standard.product.id === product.id,
    ),
  );
  const hasOptions =
    selectableProductOptions.length > 0 && purchaseStandardOptions.length > 0;
  const isFormSaving = isSaving;
  const draftPurchaseTotal = getDraftPurchaseTotal(purchaseItems);
  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";
  const nextStepHref = `/app/store-entry/inventory?${new URLSearchParams({
    storeId: ledger.storeId,
    date: getKstLedgerDateParam(ledger.closingDate),
  }).toString()}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <LedgerContextHeader
        ledgerLabel={ledgerLabel}
        title={storeName}
        storeId={ledger.storeId}
        closingDate={ledger.closingDate}
        status={ledger.status}
        step={currentStep}
      />

      {showStepNavigation ? (
        <StoreEntryStepNavigation
          storeId={ledger.storeId}
          closingDate={ledger.closingDate}
          currentStep={currentStep}
          stepCompletion={ledger.stepCompletion}
        />
      ) : null}

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">매입 항목</p>
          <Button
            type="button"
            variant="outline"
            onClick={addPurchaseLine}
            disabled={isFormSaving || isOriginalEditBlocked || !hasOptions}
            className="min-h-11 gap-2"
          >
            <PlusIcon data-icon="inline-start" />
            항목 추가
          </Button>
        </div>

        {purchaseItems.length === 0 ? (
          <p className="text-muted-foreground mb-3 text-sm">
            항목이 없습니다. 새 항목을 추가해 주세요.
          </p>
        ) : (
          <div className="mb-3 space-y-3">
            {purchaseItems.map((line, index) => {
              const productError =
                fieldErrors[`purchases.${index}.productId`]?.[0];
              const standardError =
                fieldErrors[`purchases.${index}.purchaseStandardId`]?.[0];
              const unitPriceError =
                fieldErrors[`purchases.${index}.unitPrice`]?.[0];
              const quantityError =
                fieldErrors[`purchases.${index}.quantity`]?.[0];
              const lineStandards = purchaseStandardOptions.filter(
                (option) => option.product.id === line.productId,
              );
              const selectedStandard = purchaseStandardOptions.find(
                (option) => option.id === line.purchaseStandardId,
              );
              const helperProduct = line.productName
                ? {
                    name: line.productName,
                    category: line.productCategory,
                    spec: line.productSpec,
                    defaultUnitPrice: line.referenceUnitPrice,
                  }
                : selectedStandard?.product;

              return (
                <div key={line.id} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      항목 {index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removePurchaseLine(line.id)}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      className="min-h-11 gap-2"
                    >
                      <Trash2Icon data-icon="inline-start" />
                      삭제
                    </Button>
                  </div>

                  <Field data-invalid={Boolean(productError)}>
                    <FieldLabel htmlFor={`purchase-product-${line.id}`}>
                      품목
                    </FieldLabel>
                    <select
                      id={`purchase-product-${line.id}`}
                      ref={(node) => {
                        productRefs.current[index] = node;
                      }}
                      value={line.productId}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        applyProduct(line.id, event.currentTarget.value)
                      }
                      aria-invalid={Boolean(productError)}
                      aria-describedby={
                        productError
                          ? `purchase-product-${line.id}-error`
                          : undefined
                      }
                      className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                    >
                      <option value="">품목 선택</option>
                      {!selectableProductOptions.some(
                        (option) => option.id === line.productId,
                      ) && line.productId ? (
                        <option value={line.productId}>
                          {line.productName || line.productId}
                        </option>
                      ) : null}
                      {selectableProductOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} / {option.spec}
                        </option>
                      ))}
                    </select>
                    {productError ? (
                      <FieldError id={`purchase-product-${line.id}-error`}>
                        {productError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <Field data-invalid={Boolean(standardError)}>
                    <FieldLabel htmlFor={`purchase-standard-${line.id}`}>
                      매입 기준
                    </FieldLabel>
                    <select
                      id={`purchase-standard-${line.id}`}
                      ref={(node) => {
                        standardRefs.current[index] = node;
                      }}
                      value={line.purchaseStandardId}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        applyStandard(line.id, event.currentTarget.value)
                      }
                      aria-invalid={Boolean(standardError)}
                      aria-describedby={
                        standardError
                          ? `purchase-standard-${line.id}-error`
                          : undefined
                      }
                      className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                    >
                      <option value="">매입 기준 선택</option>
                      {!purchaseStandardOptions.some(
                        (option) => option.id === line.purchaseStandardId,
                      ) && line.purchaseStandardId ? (
                        <option value={line.purchaseStandardId}>
                          저장된 매입 기준
                        </option>
                      ) : null}
                      {(line.productId
                        ? lineStandards
                        : purchaseStandardOptions
                      ).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.product.name} /{" "}
                          {formatKrw(
                            option.standardUnitPrice ??
                              option.product.defaultUnitPrice,
                          )}
                        </option>
                      ))}
                    </select>
                    {standardError ? (
                      <FieldError id={`purchase-standard-${line.id}-error`}>
                        {standardError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <div className="bg-muted/40 text-muted-foreground rounded-md p-3 text-xs">
                    <p>
                      품목명: {helperProduct?.name ?? "선택 전"} · 구분:{" "}
                      {helperProduct?.category ?? "-"} · 규격:{" "}
                      {helperProduct?.spec ?? "-"}
                    </p>
                    <p className="mt-1">
                      기본 단가:{" "}
                      {formatKrw(helperProduct?.defaultUnitPrice ?? 0)}
                      {line.referenceInfo
                        ? ` · 참조: ${line.referenceInfo}`
                        : ""}
                    </p>
                  </div>

                  <Field data-invalid={Boolean(unitPriceError)}>
                    <FieldLabel htmlFor={`purchase-unit-price-${line.id}`}>
                      단가
                    </FieldLabel>
                    <Input
                      id={`purchase-unit-price-${line.id}`}
                      ref={(node) => {
                        unitPriceRefs.current[index] = node;
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      value={line.unitPrice}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        updatePurchaseLine(line.id, {
                          unitPrice: event.currentTarget.value,
                        })
                      }
                      className="min-h-11 tabular-nums"
                      aria-invalid={Boolean(unitPriceError)}
                      aria-describedby={
                        unitPriceError
                          ? `purchase-unit-price-${line.id}-error`
                          : undefined
                      }
                    />
                    {unitPriceError ? (
                      <FieldError id={`purchase-unit-price-${line.id}-error`}>
                        {unitPriceError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <Field data-invalid={Boolean(quantityError)}>
                    <FieldLabel htmlFor={`purchase-quantity-${line.id}`}>
                      수량
                    </FieldLabel>
                    <Input
                      id={`purchase-quantity-${line.id}`}
                      ref={(node) => {
                        quantityRefs.current[index] = node;
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      value={line.quantity}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        updatePurchaseLine(line.id, {
                          quantity: event.currentTarget.value,
                        })
                      }
                      className="min-h-11 tabular-nums"
                      aria-invalid={Boolean(quantityError)}
                      aria-describedby={
                        quantityError
                          ? `purchase-quantity-${line.id}-error`
                          : undefined
                      }
                    />
                    {quantityError ? (
                      <FieldError id={`purchase-quantity-${line.id}-error`}>
                        {quantityError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <div className="bg-muted/40 rounded-md p-3">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">매입금액</span>
                      <span className="font-semibold tabular-nums">
                        {formatKrw(getLineAmount(line))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!hasOptions ? (
          <p className="text-destructive mb-3 text-sm">
            선택 가능한 active 품목 또는 매입 기준이 없습니다.
          </p>
        ) : null}

        <div className="bg-muted/40 rounded-md p-3">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">매입 합계</span>
            <span className="font-semibold tabular-nums">
              {formatKrw(draftPurchaseTotal)}
            </span>
          </div>
        </div>
      </section>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2"
        noValidate
      >
        {resultMessage ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
            <p
              className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
              {resultMessage}
            </p>
          </div>
        ) : null}

        {formError ? (
          <div className="flex flex-col gap-2">
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleRetry}
              disabled={isFormSaving || isOriginalEditBlocked}
              className="min-h-11 w-full"
            >
              다시 시도
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="submit"
            variant={resultMessage ? "outline" : "default"}
            className="min-h-11 w-full sm:w-auto"
            disabled={isFormSaving || isOriginalEditBlocked}
          >
            {isFormSaving ? "저장 중..." : "저장"}
          </Button>
          {resultMessage ? (
            <Button asChild className="min-h-11 w-full sm:w-auto">
              <a href={nextStepHref}>다음 단계로 →</a>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
