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
import {
  parseStockQuantityDraft,
  toStockQuantitySaveInput,
} from "~/lib/decimal";
import { formatQuantityValue } from "~/lib/format";
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
  storedQuantity: number | null;
  referenceInfo: string;
  // 3단계 매입 화면에 통합한 "오늘 팔 가격(예상)". 빈 문자열은 "계획 없음"이다.
  // 품목이 없는 자유 입력 행은 저장 대상이 아니라 항상 빈 값으로 둔다.
  plannedUnitPrice: string;
  // "carryover" = 전일 이월돼 오늘 팔린 품목. 매입 행이 아니라 판매 예정가만 받는다.
  kind: "purchase" | "carryover";
  // carryover 행에 "전일재고 N"으로 표시할 전일 재고 수량.
  previousQuantity: number;
  // WO-12(2026-06-28): 본사 화면에서 원본 이카운트 단가를 적용 단가와 나란히 표시(읽기 전용).
  sourceUnitPrice: number | null;
  unitPriceOverridden: boolean;
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

function parseQuantity(
  value: string,
  storedQuantity: number | null | undefined,
) {
  return parseStockQuantityDraft(value, storedQuantity) ?? 0;
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
    storedQuantity: null,
    referenceInfo: "",
    plannedUnitPrice: "",
    kind: "purchase",
    previousQuantity: 0,
    sourceUnitPrice: null,
    unitPriceOverridden: false,
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
    storedQuantity: item.quantity,
    referenceInfo: item.referenceInfo ?? "",
    plannedUnitPrice:
      item.plannedUnitPrice === null ? "" : String(item.plannedUnitPrice),
    kind: item.kind,
    previousQuantity: item.previousQuantity,
    sourceUnitPrice: item.sourceUnitPrice ?? null,
    unitPriceOverridden: item.unitPriceOverridden ?? false,
  }));
}

function getLineAmount(line: PurchaseLine) {
  return Math.round(
    parseAmount(line.unitPrice) *
      parseQuantity(line.quantity, line.storedQuantity),
  );
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
  const authorDisplayNameInputRef = useRef<HTMLInputElement>(null);
  const nextDraftLineNumberRef = useRef(0);

  const [ledger, setLedger] = useState(initialLedger);
  // 단계 순서 변경(2026-07-02): 작성자 표시명 입력을 1단계 매입 화면에서 받는다.
  // 본사 매입 편집 화면(hqEditReasonRequired)에서는 작성자 입력을 노출하지 않는다.
  const showAuthorDisplayName = !hqEditReasonRequired;
  const [authorDisplayName, setAuthorDisplayName] = useState(
    initialLedger.authorDisplayName ?? "",
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState(() =>
    toPurchaseLines(initialLedger.purchaseItems),
  );
  // 2026-06-28: 적용 단가 수정은 본사 전용. 지점장(=hqEditReasonRequired false)은 기존 행의
  // 단가를 못 바꾼다. 신규 수동 행(여기 없는 id)의 최초 단가 입력은 허용한다.
  const existingPurchaseLineIds = useRef(
    new Set(initialLedger.purchaseItems.map((item) => item.id)),
  );
  const [hqEditReason, setHqEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [carryoverWarning, setCarryoverWarning] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saveConflict = useSaveConflictDialog();
  // WO-B(2026-06-22): 최초 작성자 표시명은 한 번 기록되면 보존한다.
  // 이미 작성자가 있는 장부는 작성자 입력을 읽기 전용으로 표시한다.
  const isAuthorLocked = Boolean(
    ledger.authorDisplayName && ledger.authorDisplayName.trim().length > 0,
  );
  const isAuthorDirty =
    showAuthorDisplayName &&
    !isAuthorLocked &&
    authorDisplayName.trim() !== (ledger.authorDisplayName ?? "");
  const isDirty =
    !arePurchaseLinesEqual(
      purchaseItems,
      toPurchaseLines(ledger.purchaseItems),
    ) || isAuthorDirty;
  const previousInitialLedgerRef = useRef(initialLedger);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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
    // 장부 컨텍스트(지점/영업일)가 바뀌면 작성자 입력도 새 장부 값으로 맞춘다.
    if (previousInitialLedger.id !== initialLedger.id) {
      setAuthorDisplayName(initialLedger.authorDisplayName ?? "");
    }
    previousInitialLedgerRef.current = initialLedger;
  }, [initialLedger]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.authorDisplayName?.length) {
        authorDisplayNameInputRef.current?.focus();
        return;
      }

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
    setAuthorDisplayName(next.authorDisplayName ?? "");
    setPurchaseItems(toPurchaseLines(next.purchaseItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    const savedCount = next.purchaseItems.filter(
      (item) => item.kind !== "carryover",
    ).length;
    const nextMessage =
      message ??
      (savedCount > 0
        ? `매입 항목 ${savedCount}건을 저장했습니다.`
        : "저장됐습니다.");
    setResultMessage(nextMessage);
    toast.success(nextMessage);

    // 저장은 됐지만 이월 품목 판매가가 비어 있으면 경고 배너로 알린다(차단은 안 함).
    const blankCarryover = next.purchaseItems.filter(
      (item) => item.kind === "carryover" && item.plannedUnitPrice === null,
    ).length;
    setCarryoverWarning(
      blankCarryover > 0
        ? `전일 이월 품목 ${blankCarryover}개의 오늘 판매가가 비어 있습니다. 입력하지 않으면 7단계 추정 매출이 “데이터 부족”으로 표시됩니다.`
        : null,
    );
  }

  function clearRowErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  function getCurrentPurchaseLines() {
    return purchaseItems.map((line, index) => ({
      ...line,
      productId: productRefs.current[index]?.value ?? line.productId,
      purchaseStandardId: line.purchaseStandardId,
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
    setCarryoverWarning(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await saveAction({
        ledgerId: ledger.id,
        storeId: ledger.storeId,
        closingDate: getKstLedgerDateParam(ledger.closingDate),
        version: ledger.version,
        ledgerUpdatedAt: ledger.updatedAt,
        // 작성자 표시명은 지점장 매입 화면에서만 보낸다(본사 경로는 미노출/미전송).
        ...(showAuthorDisplayName
          ? {
              authorDisplayName:
                authorDisplayNameInputRef.current?.value ?? authorDisplayName,
            }
          : {}),
        purchases: lines.map((line) => ({
          id: line.id,
          kind: line.kind,
          sourceType: line.sourceType,
          productId: line.productId,
          purchaseStandardId: line.purchaseStandardId,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          referenceInfo: line.referenceInfo,
          unitPrice: line.unitPrice,
          quantity: toStockQuantitySaveInput(
            line.quantity,
            line.storedQuantity,
          ),
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
    setCarryoverWarning(null);
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
  // 전일 이월 품목(carryover) 행은 매입 합계에 잡히지 않고(0/0), 매입 항목 목록과 분리해
  // 별도 섹션에 노출한다. carryover 행은 서버가 항상 일반 매입 행 뒤에 붙여 보내므로
  // purchaseItems 내 index가 서버의 purchases.${index} 필드 오류 인덱스와 그대로 맞는다.
  const hasPurchaseRows = purchaseItems.some(
    (line) => line.kind !== "carryover",
  );
  const carryoverLines = purchaseItems.filter(
    (line) => line.kind === "carryover",
  );
  const hqEditReasonError = fieldErrors.reason?.[0];
  const authorDisplayNameError = fieldErrors.authorDisplayName?.[0];
  const isOriginalEditBlocked = isLedgerReadOnly(ledger.status);
  const nextStepHref = `/app/store-entry/losses?${new URLSearchParams({
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
        stepLabel="1단계 매입"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isFormSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={
          showAuthorDisplayName
            ? ["작성자 표시명", "매입 품목", "단가", "수량"]
            : ["매입 품목", "단가", "수량"]
        }
        onRetry={handleRetry}
        retryDisabled={isFormSaving || isOriginalEditBlocked}
      />

      {showAuthorDisplayName ? (
        <section className="bg-card text-card-foreground rounded-lg border p-4">
          <Field data-invalid={Boolean(authorDisplayNameError)}>
            <FieldLabel htmlFor="author-display-name">작성자 표시명</FieldLabel>
            <Input
              ref={authorDisplayNameInputRef}
              id="author-display-name"
              name="authorDisplayName"
              autoComplete="name"
              maxLength={50}
              value={authorDisplayName}
              disabled={!isHydrated || isOriginalEditBlocked || isAuthorLocked}
              readOnly={isAuthorLocked}
              onChange={(event) => {
                setAuthorDisplayName(event.currentTarget.value);
                setResultMessage(null);
              }}
              className="min-h-11"
              aria-invalid={Boolean(authorDisplayNameError)}
              aria-describedby={
                authorDisplayNameError
                  ? "author-display-name-error"
                  : "author-display-name-help"
              }
            />
            <p
              id="author-display-name-help"
              className="text-muted-foreground mt-1 text-xs"
            >
              {isAuthorLocked
                ? "최초 작성자 표시명은 보존되며 수정할 수 없습니다. 수정 이력은 감사 로그로 추적됩니다."
                : "장부를 작성하는 사람 이름입니다. 매입 저장 시 함께 기록됩니다."}
            </p>
            {authorDisplayNameError ? (
              <FieldError id="author-display-name-error">
                {authorDisplayNameError}
              </FieldError>
            ) : null}
          </Field>
        </section>
      ) : null}

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

        {!hasPurchaseRows ? (
          <p className="text-muted-foreground mb-3 text-sm">
            항목이 없습니다. 새 항목을 추가해 주세요.
          </p>
        ) : (
          <div className="mb-3 space-y-2">
            {purchaseItems.map((line, index) => {
              // 이월 품목 행은 아래 전용 섹션에서 렌더한다(여기선 인덱스만 보존).
              if (line.kind === "carryover") {
                return null;
              }
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
              // 정책 반전(2026-06-28): 적용 단가(unitPrice) 수정 권한은 본사 전용이다. 지점장은
              // 기존 매입 행(이카운트/수동 무관)의 단가를 수정할 수 없고, 신규 수동 행의 최초 단가만
              // 입력한다. 본사(hqEditReasonRequired)는 종전대로 적용 단가를 수정할 수 있다. 서버
              // 정책(getStoreEcountPurchaseEditErrors)도 동일하게 막으므로 UI/서버를 일치시킨다.
              const isStoreManagerExistingLine =
                !hqEditReasonRequired &&
                existingPurchaseLineIds.current.has(line.id);
              const isUnitPriceEditBlocked =
                isFormSaving ||
                isOriginalEditBlocked ||
                isStoreManagerExistingLine;
              const productSnapshotFields = (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field data-invalid={Boolean(productNameError)}>
                    <FieldLabel
                      htmlFor={`purchase-product-name-${line.id}`}
                    >
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
                    <FieldLabel
                      htmlFor={`purchase-product-spec-${line.id}`}
                    >
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
              );

              return (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-md border p-3 sm:p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      항목 {index + 1}
                    </p>
                    {/* 간소화(2026-07-02): 삭제는 보조 조작이라 아이콘 크기로 줄인다. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePurchaseLine(line.id)}
                      disabled={isLineEditBlocked}
                      aria-label={`항목 ${index + 1} 삭제`}
                      className="text-muted-foreground hover:text-destructive h-8 gap-1 px-2"
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

                  {/* 본사 보정 화면에서만 원문 스냅샷을 수정한다. 지점 화면은 품목 선택 시
                      채운 내부 스냅샷을 그대로 저장한다. */}
                  {!showSalesPricePlan ? (
                    <details
                    className="group rounded-md border"
                    open={
                      !line.productId ||
                      Boolean(productNameError) ||
                      Boolean(productCategoryError) ||
                      Boolean(productSpecError)
                    }
                  >
                    <summary className="text-muted-foreground flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium">
                      <span className="truncate">
                        상세: {line.productName || "원문명 미입력"}
                        {line.productCategory
                          ? ` · ${line.productCategory}`
                          : ""}
                        {line.productSpec ? ` · ${line.productSpec}` : ""}
                        {" · 참고 단가 "}
                        {formatKrw(line.referenceUnitPrice)}
                      </span>
                      <span className="shrink-0 group-open:hidden">펼치기</span>
                      <span className="hidden shrink-0 group-open:inline">
                        접기
                      </span>
                    </summary>
                    <div className="border-t p-3">
                      {productSnapshotFields}

                      {helperProduct || line.referenceInfo ? (
                        <p className="bg-muted/40 text-muted-foreground mt-2 rounded-md px-3 py-2 text-xs">
                          참고 단가:{" "}
                          {formatKrw(helperProduct?.defaultUnitPrice ?? null)}
                          {line.referenceInfo
                            ? ` · 참조: ${line.referenceInfo}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    </details>
                  ) : !line.productId ? (
                    productSnapshotFields
                  ) : null}

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
                      {isStoreManagerExistingLine ? (
                        <p className="text-muted-foreground text-xs">
                          장부 적용 단가는 본사에서만 수정할 수 있습니다.
                        </p>
                      ) : isUploadedLineLocked(line) &&
                        !isUnitPriceEditBlocked ? (
                        <p className="text-muted-foreground text-xs">
                          이카운트 출고/입고 라인입니다. 원본 정보는 잠겨 있고
                          장부 적용 단가만 수정할 수 있습니다.
                        </p>
                      ) : null}
                      {/* WO-12(2026-06-28): 본사 화면에서 원본 이카운트 단가를 적용 단가와
                          나란히 보여준다. 지점장 응답에는 sourceUnitPrice가 없어 표시되지 않는다. */}
                      {line.sourceUnitPrice !== null ? (
                        <p className="text-muted-foreground text-xs tabular-nums">
                          원본 이카운트 단가 {formatKrw(line.sourceUnitPrice)}
                          {line.unitPriceOverridden ? (
                            <span className="text-warning ml-1 font-medium">
                              · 적용 단가 보정됨
                            </span>
                          ) : null}
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
                        inputMode="decimal"
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

                  <div className="flex items-center justify-between gap-2 px-1 text-sm">
                    <span className="text-muted-foreground">매입금액</span>
                    <span className="font-semibold tabular-nums">
                      {formatKrw(getLineAmount(line))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 전일 이월돼 오늘 팔린 품목: 매입은 없고 판매 예정가만 받는다.
            매입 화면에 행이 없던 근본 원인을 메워 7단계 "데이터 부족"을 없앤다. */}
        {showSalesPricePlan && carryoverLines.length > 0 ? (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="mb-2">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                전일 이월 품목 — 오늘 판매가만 입력하세요
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                어제 남아 오늘 팔린 품목입니다. 매입은 없으니 팔 가격만
                넣으세요. 비워두면 7단계 추정 매출이 “데이터 부족”으로
                표시됩니다.
              </p>
            </div>
            <div className="space-y-2">
              {purchaseItems.map((line, index) => {
                if (line.kind !== "carryover") {
                  return null;
                }
                const plannedUnitPriceError =
                  fieldErrors[`purchases.${index}.plannedUnitPrice`]?.[0];
                const isBlank = line.plannedUnitPrice.trim() === "";

                return (
                  <div
                    key={line.id}
                    className="bg-background grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {line.productName}
                        {line.productSpec ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            / {line.productSpec}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        전일재고 {formatQuantityValue(line.previousQuantity)} ·
                        오늘 매입 없음
                      </p>
                    </div>
                    <Field
                      data-invalid={Boolean(plannedUnitPriceError)}
                      className="sm:w-44"
                    >
                      <FieldLabel
                        htmlFor={`carryover-planned-price-${line.id}`}
                      >
                        오늘 팔 가격(예상) · 이월
                      </FieldLabel>
                      <Input
                        id={`carryover-planned-price-${line.id}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={line.plannedUnitPrice}
                        disabled={isFormSaving || isOriginalEditBlocked}
                        onChange={(event) =>
                          updatePurchaseLine(line.id, {
                            plannedUnitPrice: event.currentTarget.value,
                          })
                        }
                        className={cn(
                          "min-h-11 tabular-nums",
                          isBlank
                            ? "border-amber-500/60 focus-visible:ring-amber-500/40"
                            : "",
                        )}
                        aria-invalid={Boolean(plannedUnitPriceError)}
                        aria-describedby={`carryover-planned-price-${line.id}-help`}
                        placeholder="판매가 입력"
                      />
                      <p
                        id={`carryover-planned-price-${line.id}-help`}
                        className="text-muted-foreground text-xs"
                      >
                        {isBlank
                          ? "← 팔 가격을 입력하세요"
                          : "7단계 추정 매출에 반영됩니다."}
                      </p>
                      {plannedUnitPriceError ? (
                        <FieldError
                          id={`carryover-planned-price-${line.id}-error`}
                        >
                          {plannedUnitPriceError}
                        </FieldError>
                      ) : null}
                    </Field>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

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

        {carryoverWarning ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
            <p
              className="text-sm font-medium text-amber-800 dark:text-amber-200"
              role="status"
              aria-live="polite"
            >
              {carryoverWarning}
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
