"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerPurchases } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { HqEditReasonField } from "~/features/ledger/components/hq-edit-reason-field";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import { isLedgerReadOnly } from "~/features/ledger/status-policy";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import type { StoreManagerLedgerCostStepData } from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";
import { cn } from "~/lib/utils";

type ProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
  // 선택적 참고 단가. 단가 없이 등록한 품목은 null이다(본사 매입가 아님).
  defaultUnitPrice: number | null;
};

type PurchaseLine = {
  id: string;
  productId: string;
  purchaseStandardId: string;
  sourceType: "MANUAL" | "ECOUNT_UPLOAD";
  productName: string;
  productCategory: string;
  productSpec: string;
  // 품목 마스터의 참고 단가(선택). 없으면 null이며, 장부 적용 단가(unitPrice)는
  // 직접 입력해야 한다.
  referenceUnitPrice: number | null;
  unitPrice: string;
  quantity: string;
  referenceInfo: string;
  // 3단계 매입 화면에 통합한 "오늘 팔 가격(예상)". 빈 문자열은 "계획 없음"이다.
  // 품목이 없는 자유 입력 행은 저장 대상이 아니라 항상 빈 값으로 둔다.
  plannedUnitPrice: string;
};

type PurchaseStepClientProps = {
  storeName: string;
  initialLedger: StoreManagerLedgerCostStepData;
  productOptions: ProductOption[];
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (
    input: unknown,
  ) => Promise<ActionResult<StoreManagerLedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
  hqEditReasonRequired?: boolean;
  // 판매 예정가("오늘 팔 가격") 입력은 지점장 매입 화면 전용이다. 본사 검토 장부 탭에서는
  // 끈다(본사 저장 경로는 판매가 계획을 쓰지 않는다).
  showSalesPricePlan?: boolean;
};

function formatKrw(value: number | null) {
  if (value === null) {
    return "참고 단가 없음";
  }

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
    sourceType: "MANUAL",
    productName: "",
    productCategory: "",
    productSpec: "",
    referenceUnitPrice: null,
    unitPrice: "",
    quantity: "",
    referenceInfo: "",
    plannedUnitPrice: "",
  };
}

function toPurchaseLines(
  items: StoreManagerLedgerCostStepData["purchaseItems"],
) {
  return items.map<PurchaseLine>((item) => ({
    id: item.id,
    productId: item.productId ?? "",
    purchaseStandardId: item.purchaseStandardId ?? "",
    sourceType: item.sourceType,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    referenceUnitPrice: item.unitPrice,
    unitPrice: String(item.unitPrice),
    quantity: String(item.quantity),
    referenceInfo: item.referenceInfo ?? "",
    plannedUnitPrice:
      item.plannedUnitPrice === null ? "" : String(item.plannedUnitPrice),
  }));
}

function getLineAmount(line: PurchaseLine) {
  return parseAmount(line.unitPrice) * parseAmount(line.quantity);
}

function getDraftPurchaseTotal(lines: PurchaseLine[]) {
  return lines.reduce((sum, line) => sum + getLineAmount(line), 0);
}

function isUploadedLineLocked(line: PurchaseLine) {
  return line.sourceType === "ECOUNT_UPLOAD";
}

function arePurchaseLinesEqual(left: PurchaseLine[], right: PurchaseLine[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function PurchaseStepClient({
  storeName,
  initialLedger,
  productOptions,
  currentStep = "purchase",
  saveAction = saveLedgerPurchases,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
  hqEditReasonRequired = false,
  showSalesPricePlan = true,
}: PurchaseStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const productRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const productNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const productCategoryRefs = useRef<(HTMLInputElement | null)[]>([]);
  const productSpecRefs = useRef<(HTMLInputElement | null)[]>([]);
  const unitPriceRefs = useRef<(HTMLInputElement | null)[]>([]);
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const plannedUnitPriceRefs = useRef<(HTMLInputElement | null)[]>([]);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const nextDraftLineNumberRef = useRef(0);

  const [ledger, setLedger] = useState(initialLedger);
  const [purchaseItems, setPurchaseItems] = useState(() =>
    toPurchaseLines(initialLedger.purchaseItems),
  );
  const [hqEditReason, setHqEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saveConflict = useSaveConflictDialog();
  const isDirty = !arePurchaseLinesEqual(
    purchaseItems,
    toPurchaseLines(ledger.purchaseItems),
  );
  const previousInitialLedgerRef = useRef(initialLedger);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    const previousInitialLedger = previousInitialLedgerRef.current;
    const previousPurchaseItems = toPurchaseLines(
      previousInitialLedger.purchaseItems,
    );
    const nextPurchaseItems = toPurchaseLines(initialLedger.purchaseItems);

    setLedger(initialLedger);
    setPurchaseItems((current) =>
      arePurchaseLinesEqual(current, previousPurchaseItems)
        ? nextPurchaseItems
        : current,
    );
    previousInitialLedgerRef.current = initialLedger;
  }, [initialLedger]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < purchaseItems.length; index += 1) {
        if (errors[`purchases.${index}.productId`]?.length) {
          productRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.productName`]?.length) {
          productNameRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.productCategory`]?.length) {
          productCategoryRefs.current[index]?.focus();
          return;
        }

        if (errors[`purchases.${index}.productSpec`]?.length) {
          productSpecRefs.current[index]?.focus();
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

        if (errors[`purchases.${index}.plannedUnitPrice`]?.length) {
          plannedUnitPriceRefs.current[index]?.focus();
          return;
        }
      }

      if (errors.reason?.length) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 50);
  }

  function fillLedger(next: StoreManagerLedgerCostStepData, message?: string) {
    setLedger(next);
    setPurchaseItems(toPurchaseLines(next.purchaseItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    const savedCount = next.purchaseItems.length;
    const nextMessage =
      message ??
      (savedCount > 0
        ? `매입 항목 ${savedCount}건을 저장했습니다.`
        : "저장됐습니다.");
    setResultMessage(nextMessage);
    toast.success(nextMessage);
  }

  function clearRowErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  function getCurrentPurchaseLines() {
    return purchaseItems.map((line, index) => ({
      ...line,
      productId: productRefs.current[index]?.value ?? line.productId,
      purchaseStandardId: "",
      productName: productNameRefs.current[index]?.value ?? line.productName,
      productCategory:
        productCategoryRefs.current[index]?.value ?? line.productCategory,
      productSpec: productSpecRefs.current[index]?.value ?? line.productSpec,
      unitPrice: unitPriceRefs.current[index]?.value ?? line.unitPrice,
      quantity: quantityRefs.current[index]?.value ?? line.quantity,
      plannedUnitPrice:
        plannedUnitPriceRefs.current[index]?.value ?? line.plannedUnitPrice,
    }));
  }

  async function persistPurchaseLines(
    lines: PurchaseLine[],
    options: { successMessage?: string; reasonFallback?: string } = {},
  ) {
    const hqEditReasonValue = hqEditReason.trim();

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
        ledgerUpdatedAt: ledger.updatedAt,
        purchases: lines.map((line) => ({
          id: line.id,
          sourceType: line.sourceType,
          productId: line.productId,
          purchaseStandardId: line.purchaseStandardId,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          referenceInfo: line.referenceInfo,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          // 판매 예정가는 지점장 매입 화면 전용이고 품목 행만 저장 대상이다.
          ...(showSalesPricePlan
            ? { plannedUnitPrice: line.productId ? line.plannedUnitPrice : "" }
            : {}),
        })),
        ...(hqEditReasonRequired
          ? {
              reason:
                hqEditReasonValue.length > 0
                  ? hqEditReasonValue
                  : (options.reasonFallback ?? ""),
            }
          : {}),
      });

      if (!result.ok) {
        if (saveConflict.captureConflict(result)) {
          setFormError(result.error.message);
          toast.error(result.error.message);
          return false;
        }

        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        setIsSaving(false);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return false;
      }

      fillLedger(result.data, options.successMessage);
      setFormError(null);
      return true;
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      setResultMessage(null);
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCurrentDraft() {
    return persistPurchaseLines(getCurrentPurchaseLines());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentDraft();
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
    // 품목 마스터의 참고 단가는 본사 매입가가 아니다. 값이 있으면 편의상 장부 적용
    // 단가 칸을 미리 채우되, 없으면(null) 0을 박지 않고 비워 직접 입력하게 한다.
    const referenceUnitPrice = product?.defaultUnitPrice ?? null;

    clearRowErrors();
    setResultMessage(null);
    setPurchaseItems((current) => {
      // Task 4: 품목을 바꾸면 직전 품목의 판매 예정가가 따라오지 않게 새 품목 기준으로 다시
      // 채운다. 같은 품목이 다른 행에 이미 있으면(하루 1개 값) 그 값을 가져와 일관성을 맞춘다.
      const siblingPlanned = productId
        ? (current.find(
            (line) =>
              line.id !== lineId &&
              line.productId === productId &&
              line.plannedUnitPrice !== "",
          )?.plannedUnitPrice ?? "")
        : "";

      return current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              productId,
              purchaseStandardId: "",
              productName: product?.name ?? "",
              productCategory: product?.category ?? "",
              productSpec: product?.spec ?? "",
              referenceUnitPrice,
              unitPrice:
                referenceUnitPrice === null ? "" : String(referenceUnitPrice),
              plannedUnitPrice: siblingPlanned,
            }
          : line,
      );
    });
  }

  const isFormSaving = isSaving;
  const draftPurchaseTotal = getDraftPurchaseTotal(purchaseItems);
  const hqEditReasonError = fieldErrors.reason?.[0];
  const isOriginalEditBlocked = isLedgerReadOnly(ledger.status);
  const nextStepHref = `/app/store-entry/inventory?${new URLSearchParams({
    storeId: ledger.storeId,
    date: getKstLedgerDateParam(ledger.closingDate),
  }).toString()}`;
  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <UnsavedChangeDialog
        open={guard.isDialogOpen}
        isSaving={isFormSaving}
        onOpenChange={guard.setIsDialogOpen}
        onSave={guard.saveAndContinue}
        onDiscard={guard.discard}
        onKeepEditing={guard.keepEditing}
      />
      <SaveConflictDialog
        open={saveConflict.isOpen}
        conflict={saveConflict.conflict}
        onOpenChange={saveConflict.setIsOpen}
        onReload={saveConflict.reloadLatest}
        onKeepEditing={saveConflict.keepEditing}
      />

      <LedgerContextHeader
        ledgerLabel={ledgerLabel}
        title={storeName}
        storeId={ledger.storeId}
        closingDate={ledger.closingDate}
        authorDisplayName={ledger.authorDisplayName}
        status={ledger.status}
        step={currentStep}
      />

      {showStepNavigation ? (
        <StoreEntryStepNavigation
          storeId={ledger.storeId}
          closingDate={ledger.closingDate}
          currentStep={currentStep}
          stepCompletion={ledger.stepCompletion}
          onNavigateAttempt={guard.requestNavigation}
        />
      ) : null}

      <LedgerSaveStatus
        stepLabel="3단계 매입"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isFormSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={["매입 품목", "단가", "수량"]}
        onRetry={handleRetry}
        retryDisabled={isFormSaving || isOriginalEditBlocked}
      />

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">매입 항목</p>
          <Button
            type="button"
            variant="outline"
            onClick={addPurchaseLine}
            disabled={isFormSaving || isOriginalEditBlocked}
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
              const productNameError =
                fieldErrors[`purchases.${index}.productName`]?.[0];
              const productCategoryError =
                fieldErrors[`purchases.${index}.productCategory`]?.[0];
              const productSpecError =
                fieldErrors[`purchases.${index}.productSpec`]?.[0];
              const unitPriceError =
                fieldErrors[`purchases.${index}.unitPrice`]?.[0];
              const quantityError =
                fieldErrors[`purchases.${index}.quantity`]?.[0];
              const plannedUnitPriceError =
                fieldErrors[`purchases.${index}.plannedUnitPrice`]?.[0];
              const helperProduct = line.productName
                ? {
                    name: line.productName,
                    category: line.productCategory,
                    spec: line.productSpec,
                    defaultUnitPrice: line.referenceUnitPrice,
                  }
                : undefined;
              const isLineEditBlocked =
                isFormSaving ||
                isOriginalEditBlocked ||
                isUploadedLineLocked(line);
              // WO(2026-06-24) Task 14: 이카운트 업로드 행이라도 "장부 적용 단가(unitPrice)"는
              // 본사와 지점장 모두 수정할 수 있다. 원본 정보(품목/구분/규격/수량/삭제)는 업로드 행
              // 식별을 보존하기 위해 양쪽 모두 계속 잠근다. 서버 정책(getStoreEcountPurchaseEditErrors,
              // HQ 보정)도 unitPrice만 허용하므로 UI 잠금과 서버 정책을 일치시킨다.
              const isUnitPriceEditBlocked =
                isFormSaving || isOriginalEditBlocked;

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
                      disabled={isLineEditBlocked}
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
                      disabled={isLineEditBlocked}
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
                      {!productOptions.some(
                        (option) => option.id === line.productId,
                      ) && line.productId ? (
                        <option value={line.productId}>
                          {line.productName || line.productId}
                        </option>
                      ) : null}
                      {productOptions.map((option) => (
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

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field data-invalid={Boolean(productNameError)}>
                      <FieldLabel htmlFor={`purchase-product-name-${line.id}`}>
                        원문명
                      </FieldLabel>
                      <Input
                        id={`purchase-product-name-${line.id}`}
                        ref={(node) => {
                          productNameRefs.current[index] = node;
                        }}
                        autoComplete="off"
                        value={line.productName}
                        disabled={isLineEditBlocked}
                        onChange={(event) =>
                          updatePurchaseLine(line.id, {
                            productName: event.currentTarget.value,
                          })
                        }
                        className="min-h-11"
                        aria-invalid={Boolean(productNameError)}
                        aria-describedby={
                          productNameError
                            ? `purchase-product-name-${line.id}-error`
                            : undefined
                        }
                      />
                      {productNameError ? (
                        <FieldError
                          id={`purchase-product-name-${line.id}-error`}
                        >
                          {productNameError}
                        </FieldError>
                      ) : null}
                    </Field>

                    <Field data-invalid={Boolean(productCategoryError)}>
                      <FieldLabel
                        htmlFor={`purchase-product-category-${line.id}`}
                      >
                        구분
                      </FieldLabel>
                      <Input
                        id={`purchase-product-category-${line.id}`}
                        ref={(node) => {
                          productCategoryRefs.current[index] = node;
                        }}
                        autoComplete="off"
                        value={line.productCategory}
                        disabled={isLineEditBlocked}
                        onChange={(event) =>
                          updatePurchaseLine(line.id, {
                            productCategory: event.currentTarget.value,
                          })
                        }
                        className="min-h-11"
                        aria-invalid={Boolean(productCategoryError)}
                        aria-describedby={
                          productCategoryError
                            ? `purchase-product-category-${line.id}-error`
                            : undefined
                        }
                      />
                      {productCategoryError ? (
                        <FieldError
                          id={`purchase-product-category-${line.id}-error`}
                        >
                          {productCategoryError}
                        </FieldError>
                      ) : null}
                    </Field>

                    <Field data-invalid={Boolean(productSpecError)}>
                      <FieldLabel htmlFor={`purchase-product-spec-${line.id}`}>
                        규격
                      </FieldLabel>
                      <Input
                        id={`purchase-product-spec-${line.id}`}
                        ref={(node) => {
                          productSpecRefs.current[index] = node;
                        }}
                        autoComplete="off"
                        value={line.productSpec}
                        disabled={isLineEditBlocked}
                        onChange={(event) =>
                          updatePurchaseLine(line.id, {
                            productSpec: event.currentTarget.value,
                          })
                        }
                        className="min-h-11"
                        aria-invalid={Boolean(productSpecError)}
                        aria-describedby={
                          productSpecError
                            ? `purchase-product-spec-${line.id}-error`
                            : undefined
                        }
                      />
                      {productSpecError ? (
                        <FieldError
                          id={`purchase-product-spec-${line.id}-error`}
                        >
                          {productSpecError}
                        </FieldError>
                      ) : null}
                    </Field>
                  </div>

                  <div className="bg-muted/40 text-muted-foreground rounded-md p-3 text-xs">
                    <p>
                      품목명: {helperProduct?.name ?? "선택 전"} · 구분:{" "}
                      {helperProduct?.category ?? "-"} · 규격:{" "}
                      {helperProduct?.spec ?? "-"}
                    </p>
                    <p className="mt-1">
                      참고 단가:{" "}
                      {formatKrw(helperProduct?.defaultUnitPrice ?? null)}
                      {line.referenceInfo
                        ? ` · 참조: ${line.referenceInfo}`
                        : ""}
                    </p>
                  </div>

                  {/* 매입 단가 / 수량 / 오늘 팔 가격(예상)을 같은 줄에서 본다.
                      모바일(<sm)에서는 세로로 쌓여 겹치거나 가로 overflow가 없다. */}
                  <div
                    className={cn(
                      "grid gap-2",
                      showSalesPricePlan ? "sm:grid-cols-3" : "sm:grid-cols-2",
                    )}
                  >
                    <Field data-invalid={Boolean(unitPriceError)}>
                      <FieldLabel htmlFor={`purchase-unit-price-${line.id}`}>
                        매입 단가
                      </FieldLabel>
                      <Input
                        id={`purchase-unit-price-${line.id}`}
                        ref={(node) => {
                          unitPriceRefs.current[index] = node;
                        }}
                        inputMode="numeric"
                        autoComplete="off"
                        value={line.unitPrice}
                        disabled={isUnitPriceEditBlocked}
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
                      {isUploadedLineLocked(line) && !isUnitPriceEditBlocked ? (
                        <p className="text-muted-foreground text-xs">
                          이카운트 출고/입고 라인입니다. 원본 정보는 잠겨 있고
                          장부 적용 단가만 수정할 수 있습니다.
                        </p>
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
                        disabled={isLineEditBlocked}
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

                    {showSalesPricePlan ? (
                      <Field data-invalid={Boolean(plannedUnitPriceError)}>
                        <FieldLabel
                          htmlFor={`purchase-planned-price-${line.id}`}
                        >
                          오늘 팔 가격(예상)
                        </FieldLabel>
                        <Input
                          id={`purchase-planned-price-${line.id}`}
                          ref={(node) => {
                            plannedUnitPriceRefs.current[index] = node;
                          }}
                          inputMode="numeric"
                          autoComplete="off"
                          value={line.plannedUnitPrice}
                          // 이카운트 업로드 행이라도 판매 예정가는 지점장 판매 판단값이므로
                          // 수정할 수 있다. 품목이 없는 자유 입력 행은 저장 대상이 아니라 잠근다.
                          disabled={
                            isFormSaving ||
                            isOriginalEditBlocked ||
                            !line.productId
                          }
                          onChange={(event) =>
                            updatePurchaseLine(line.id, {
                              plannedUnitPrice: event.currentTarget.value,
                            })
                          }
                          className="min-h-11 tabular-nums"
                          aria-invalid={Boolean(plannedUnitPriceError)}
                          aria-describedby={`purchase-planned-price-${line.id}-help`}
                        />
                        <p
                          id={`purchase-planned-price-${line.id}-help`}
                          className="text-muted-foreground text-xs"
                        >
                          {line.productId
                            ? "7단계 추정 매출에 쓰는 판매 예정가입니다."
                            : "품목을 선택하면 입력할 수 있습니다."}
                        </p>
                        {plannedUnitPriceError ? (
                          <FieldError
                            id={`purchase-planned-price-${line.id}-error`}
                          >
                            {plannedUnitPriceError}
                          </FieldError>
                        ) : null}
                      </Field>
                    ) : null}
                  </div>

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

        {productOptions.length === 0 ? (
          <p className="text-muted-foreground mb-3 text-sm">
            선택 가능한 active 품목이 없어도 수동 입력할 수 있습니다.
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

        {hqEditReasonRequired ? (
          <div className="mt-3">
            <HqEditReasonField
              id="purchase-hq-edit-reason"
              value={hqEditReason}
              error={hqEditReasonError}
              disabled={isFormSaving || isOriginalEditBlocked}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          </div>
        ) : null}
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
            {isFormSaving ? "처리 중..." : "저장"}
          </Button>
          {resultMessage ? (
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              onClick={(event) =>
                guard.requestNavigation(nextStepHref, event.currentTarget)
              }
            >
              다음 단계로 →
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
