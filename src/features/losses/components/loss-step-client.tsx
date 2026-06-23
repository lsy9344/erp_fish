"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import { HqEditReasonField } from "~/features/ledger/components/hq-edit-reason-field";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import { isLedgerReadOnly } from "~/features/ledger/status-policy";
import { saveLedgerLosses } from "~/features/losses/actions";
import { lossTerms } from "~/features/losses/terms";
import {
  type LossStepData,
  type StoreManagerLossStepData,
} from "~/features/losses/types";
import { type ActionResult, type FieldErrors } from "~/lib/action-result";

type LossLineState = {
  clientKey: string;
  id: string;
  productId: string;
  ledgerInputCodeId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice?: number;
  lossTypeName: string;
  quantity: string;
  recoveredAmount: string;
  amount?: string;
  reason: string;
};

type LossDisplayData = LossStepData | StoreManagerLossStepData;

type LossStepClientProps = {
  storeName: string;
  initialData: LossDisplayData;
  saveAction?: (input: unknown) => Promise<ActionResult<LossDisplayData>>;
  ledgerLabel?: string;
  showStepNavigation?: boolean;
  hqEditReasonRequired?: boolean;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function createLineState(clientKey: string): LossLineState {
  return {
    clientKey,
    id: "",
    productId: "",
    ledgerInputCodeId: "",
    productName: "",
    productCategory: "",
    productSpec: "",
    lossTypeName: "",
    quantity: "",
    recoveredAmount: "",
    reason: "",
  };
}

function toLineState(data: LossDisplayData): LossLineState[] {
  return data.lossItems.map((item) => ({
    clientKey: item.id,
    id: item.id,
    productId: item.productId,
    ledgerInputCodeId: item.ledgerInputCodeId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: "unitPrice" in item ? item.unitPrice : undefined,
    lossTypeName: item.lossTypeName,
    quantity: String(item.quantity),
    recoveredAmount:
      "recoveredAmount" in item ? String(item.recoveredAmount) : "",
    amount: "amount" in item ? String(item.amount) : undefined,
    reason: item.reason,
  }));
}

function parseNumber(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return 0;
  }

  const parsed = Number(trimmed);

  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function areLossLinesEqual(left: LossLineState[], right: LossLineState[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function LossStepClient({
  storeName,
  initialData,
  saveAction = saveLedgerLosses,
  ledgerLabel = "오늘 장부",
  showStepNavigation = true,
  hqEditReasonRequired = false,
}: LossStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const productRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const lossTypeRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recoveredAmountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const reasonRefs = useRef<(HTMLInputElement | null)[]>([]);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const nextDraftLineNumberRef = useRef(0);

  const [data, setData] = useState(initialData);
  const [items, setItems] = useState(() => toLineState(initialData));
  const [hqEditReason, setHqEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const saveConflict = useSaveConflictDialog();
  const isDirty = !areLossLinesEqual(items, toLineState(data));
  const previousInitialDataRef = useRef(initialData);

  useLedgerUpdatedAtSync(data.id, (updatedAt) => {
    setData((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    const previousInitialData = previousInitialDataRef.current;
    const previousItems = toLineState(previousInitialData);
    const nextItems = toLineState(initialData);

    setData(initialData);
    setItems((current) =>
      areLossLinesEqual(current, previousItems) ? nextItems : current,
    );
    previousInitialDataRef.current = initialData;
  }, [initialData]);

  function clearFeedback() {
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < items.length; index += 1) {
        if (errors[`losses.${index}.productId`]?.length) {
          productRefs.current[index]?.focus();
          return;
        }

        if (errors[`losses.${index}.ledgerInputCodeId`]?.length) {
          lossTypeRefs.current[index]?.focus();
          return;
        }

        if (errors[`losses.${index}.quantity`]?.length) {
          quantityRefs.current[index]?.focus();
          return;
        }

        if (errors[`losses.${index}.recoveredAmount`]?.length) {
          recoveredAmountRefs.current[index]?.focus();
          return;
        }

        if (errors[`losses.${index}.reason`]?.length) {
          reasonRefs.current[index]?.focus();
          return;
        }
      }

      if (errors.reason?.length) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 50);
  }

  function addLine() {
    clearFeedback();
    nextDraftLineNumberRef.current += 1;
    setItems((current) => [
      ...current,
      createLineState(`draft-loss-line-${nextDraftLineNumberRef.current}`),
    ]);
  }

  function removeLine(lineKey: string) {
    clearFeedback();
    setItems((current) => current.filter((line) => line.clientKey !== lineKey));
  }

  function updateLine(lineKey: string, next: Partial<LossLineState>) {
    clearFeedback();
    setItems((current) =>
      current.map((line) =>
        line.clientKey === lineKey ? { ...line, ...next } : line,
      ),
    );
  }

  function applyProduct(lineKey: string, productId: string) {
    const product = data.productOptions.find(
      (option) => option.id === productId,
    );

    updateLine(lineKey, {
      productId,
      productName: product?.name ?? "",
      productCategory: product?.category ?? "",
      productSpec: product?.spec ?? "",
      unitPrice: undefined,
    });
  }

  function applyLossType(lineKey: string, ledgerInputCodeId: string) {
    const lossType = data.lossTypeOptions.find(
      (option) => option.id === ledgerInputCodeId,
    );

    updateLine(lineKey, {
      ledgerInputCodeId,
      lossTypeName: lossType?.name ?? "",
    });
  }

  async function saveCurrentDraft() {
    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await saveAction({
        ledgerId: data.id,
        storeId: data.storeId,
        closingDate: getKstLedgerDateParam(data.closingDate),
        version: data.version,
        ledgerUpdatedAt: data.updatedAt,
        losses: items.map((item, index) => ({
          id: item.id || undefined,
          productId: productRefs.current[index]?.value ?? item.productId,
          ledgerInputCodeId:
            lossTypeRefs.current[index]?.value ?? item.ledgerInputCodeId,
          quantity: quantityRefs.current[index]?.value ?? item.quantity,
          recoveredAmount:
            recoveredAmountRefs.current[index]?.value ?? item.recoveredAmount,
          reason: reasonRefs.current[index]?.value ?? item.reason,
        })),
        ...(hqEditReasonRequired ? { reason: hqEditReason } : {}),
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
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return false;
      }

      setData(result.data);
      setItems(toLineState(result.data));
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      const savedCount = result.data.lossItems.length;
      const message =
        savedCount > 0
          ? `손실/폐기 항목 ${savedCount}건을 저장했습니다.`
          : "저장됐습니다.";
      setResultMessage(message);
      toast.success(message);
      return true;
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSaving(false);
    }
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

  const draftTotalQuantity = items.reduce(
    (sum, item) => sum + parseNumber(item.quantity),
    0,
  );
  const draftTotalAmount = items.reduce(
    (sum, item) => sum + parseNumber(item.amount ?? "0"),
    0,
  );
  const isOriginalEditBlocked = isLedgerReadOnly(data.status);
  const hasOptions =
    data.productOptions.length > 0 && data.lossTypeOptions.length > 0;
  const nextStepHref = `/app/store-entry?${new URLSearchParams({
    storeId: data.storeId,
    date: getKstLedgerDateParam(data.closingDate),
    step: "work",
  }).toString()}`;
  const showsSensitiveLossAmounts = "totalAmount" in data.summary;
  const hqEditReasonError = fieldErrors.reason?.[0];
  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <UnsavedChangeDialog
        open={guard.isDialogOpen}
        isSaving={isSaving}
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
        title="손실/폐기/떨이 입력"
        storeName={storeName}
        storeId={data.storeId}
        closingDate={data.closingDate}
        authorDisplayName={data.authorDisplayName}
        status={data.status}
      />

      {showStepNavigation ? (
        <StoreEntryStepNavigation
          storeId={data.storeId}
          closingDate={data.closingDate}
          currentStep="losses"
          stepCompletion={data.stepCompletion}
          onNavigateAttempt={guard.requestNavigation}
        />
      ) : null}

      <LedgerSaveStatus
        stepLabel="5단계 손실/폐기/떨이"
        authorDisplayName={data.authorDisplayName}
        updatedAt={data.updatedAt}
        isSaving={isSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={[
          "손실 품목",
          "손실 유형",
          "수량",
          "실제 판매/회수액",
          "사유",
        ]}
        onRetry={handleRetry}
        retryDisabled={isSaving || isOriginalEditBlocked || !hasOptions}
      />

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-muted/40 rounded-md p-3">
            <p className="text-muted-foreground text-sm">
              {lossTerms.totalLossQuantity}
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {draftTotalQuantity}
            </p>
          </div>
          {showsSensitiveLossAmounts ? (
            <div className="bg-muted/40 rounded-md p-3">
              <p className="text-muted-foreground text-sm">
                {lossTerms.totalLossAmount}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {formatKrw(draftTotalAmount)}
              </p>
            </div>
          ) : null}
        </div>

        {data.summary.byProduct.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {data.summary.byProduct.map((summary) => (
              <div
                key={summary.productId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>{summary.productName}</span>
                <span className="tabular-nums">
                  {summary.quantity}
                  {"amount" in summary ? ` · ${formatKrw(summary.amount)}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {data.signalCandidates.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.signalCandidates.map((candidate) => (
              <Badge key={candidate.productId} variant="secondary">
                기준 초과 {candidate.productName} {candidate.quantity} ·{" "}
                {"amount" in candidate ? formatKrw(candidate.amount) : "수량"}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <section className="bg-card text-card-foreground rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">손실 항목</p>
            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              disabled={isSaving || isOriginalEditBlocked || !hasOptions}
              className="min-h-11 gap-2"
            >
              <PlusIcon data-icon="inline-start" />
              항목 추가
            </Button>
          </div>

          {!hasOptions ? (
            <p className="text-destructive mb-3 text-sm">
              {lossTerms.noOptions}
            </p>
          ) : null}

          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              항목이 없습니다. 새 항목을 추가해 주세요.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const productError =
                  fieldErrors[`losses.${index}.productId`]?.[0];
                const lossTypeError =
                  fieldErrors[`losses.${index}.ledgerInputCodeId`]?.[0];
                const quantityError =
                  fieldErrors[`losses.${index}.quantity`]?.[0];
                const recoveredAmountError =
                  fieldErrors[`losses.${index}.recoveredAmount`]?.[0];
                const reasonError = fieldErrors[`losses.${index}.reason`]?.[0];
                const recoveredAmountDescriptionId = `loss-recovered-${item.clientKey}-description`;
                const productActive = data.productOptions.some(
                  (option) => option.id === item.productId,
                );
                const lossTypeActive = data.lossTypeOptions.some(
                  (option) => option.id === item.ledgerInputCodeId,
                );

                return (
                  <div
                    key={item.clientKey}
                    className="grid gap-3 rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-xs font-medium">
                        항목 {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeLine(item.clientKey)}
                        disabled={isSaving || isOriginalEditBlocked}
                        className="min-h-11 gap-2"
                      >
                        <Trash2Icon data-icon="inline-start" />
                        삭제
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={Boolean(productError)}>
                        <FieldLabel htmlFor={`loss-product-${item.clientKey}`}>
                          {lossTerms.product}
                        </FieldLabel>
                        <select
                          id={`loss-product-${item.clientKey}`}
                          ref={(node) => {
                            productRefs.current[index] = node;
                          }}
                          value={item.productId}
                          onChange={(event) =>
                            applyProduct(
                              item.clientKey,
                              event.currentTarget.value,
                            )
                          }
                          disabled={isSaving || isOriginalEditBlocked}
                          aria-invalid={Boolean(productError)}
                          aria-describedby={
                            productError
                              ? `loss-product-${item.clientKey}-error`
                              : undefined
                          }
                          className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        >
                          <option value="">품목 선택</option>
                          {!productActive && item.productId ? (
                            <option value={item.productId}>
                              {item.productName || item.productId}
                            </option>
                          ) : null}
                          {data.productOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} / {option.spec}
                            </option>
                          ))}
                        </select>
                        {productError ? (
                          <FieldError
                            id={`loss-product-${item.clientKey}-error`}
                          >
                            {productError}
                          </FieldError>
                        ) : null}
                      </Field>

                      <Field data-invalid={Boolean(lossTypeError)}>
                        <FieldLabel htmlFor={`loss-type-${item.clientKey}`}>
                          {lossTerms.lossType}
                        </FieldLabel>
                        <select
                          id={`loss-type-${item.clientKey}`}
                          ref={(node) => {
                            lossTypeRefs.current[index] = node;
                          }}
                          value={item.ledgerInputCodeId}
                          onChange={(event) =>
                            applyLossType(
                              item.clientKey,
                              event.currentTarget.value,
                            )
                          }
                          disabled={isSaving || isOriginalEditBlocked}
                          aria-invalid={Boolean(lossTypeError)}
                          aria-describedby={
                            lossTypeError
                              ? `loss-type-${item.clientKey}-error`
                              : undefined
                          }
                          className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        >
                          <option value="">유형 선택</option>
                          {!lossTypeActive && item.ledgerInputCodeId ? (
                            <option value={item.ledgerInputCodeId}>
                              {item.lossTypeName || item.ledgerInputCodeId}
                            </option>
                          ) : null}
                          {data.lossTypeOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        {lossTypeError ? (
                          <FieldError id={`loss-type-${item.clientKey}-error`}>
                            {lossTypeError}
                          </FieldError>
                        ) : null}
                      </Field>
                    </div>

                    <div className="bg-muted/40 text-muted-foreground rounded-md p-3 text-xs">
                      품목명: {item.productName || "선택 전"} · 구분:{" "}
                      {item.productCategory || "-"} · 규격:{" "}
                      {item.productSpec || "-"}
                      {item.unitPrice !== undefined
                        ? ` · 손실액 산정 기준 단가: ${formatKrw(item.unitPrice)}`
                        : " · 저장 시 개점 전 판매가 계획으로 손실액 자동 산정"}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={Boolean(quantityError)}>
                        <FieldLabel htmlFor={`loss-quantity-${item.clientKey}`}>
                          {lossTerms.quantity}
                        </FieldLabel>
                        <Input
                          id={`loss-quantity-${item.clientKey}`}
                          ref={(node) => {
                            quantityRefs.current[index] = node;
                          }}
                          inputMode="numeric"
                          autoComplete="off"
                          value={item.quantity}
                          onChange={(event) =>
                            updateLine(item.clientKey, {
                              quantity: event.currentTarget.value,
                            })
                          }
                          disabled={isSaving || isOriginalEditBlocked}
                          className="min-h-11 tabular-nums"
                          aria-invalid={Boolean(quantityError)}
                          aria-describedby={
                            quantityError
                              ? `loss-quantity-${item.clientKey}-error`
                              : undefined
                          }
                        />
                        {quantityError ? (
                          <FieldError
                            id={`loss-quantity-${item.clientKey}-error`}
                          >
                            {quantityError}
                          </FieldError>
                        ) : null}
                      </Field>

                      <Field data-invalid={Boolean(recoveredAmountError)}>
                        <FieldLabel
                          htmlFor={`loss-recovered-${item.clientKey}`}
                        >
                          {lossTerms.recoveredAmount}
                        </FieldLabel>
                        <Input
                          id={`loss-recovered-${item.clientKey}`}
                          ref={(node) => {
                            recoveredAmountRefs.current[index] = node;
                          }}
                          inputMode="numeric"
                          autoComplete="off"
                          value={item.recoveredAmount}
                          onChange={(event) =>
                            updateLine(item.clientKey, {
                              recoveredAmount: event.currentTarget.value,
                            })
                          }
                          disabled={isSaving || isOriginalEditBlocked}
                          className="min-h-11 tabular-nums"
                          aria-invalid={Boolean(recoveredAmountError)}
                          aria-describedby={[
                            recoveredAmountDescriptionId,
                            recoveredAmountError
                              ? `loss-recovered-${item.clientKey}-error`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        />
                        <FieldDescription id={recoveredAmountDescriptionId}>
                          {lossTerms.recoveredAmountHelp}
                        </FieldDescription>
                        {recoveredAmountError ? (
                          <FieldError
                            id={`loss-recovered-${item.clientKey}-error`}
                          >
                            {recoveredAmountError}
                          </FieldError>
                        ) : null}
                      </Field>
                    </div>

                    <Field data-invalid={Boolean(reasonError)}>
                      <FieldLabel htmlFor={`loss-reason-${item.clientKey}`}>
                        {lossTerms.reason}
                      </FieldLabel>
                      <Input
                        id={`loss-reason-${item.clientKey}`}
                        ref={(node) => {
                          reasonRefs.current[index] = node;
                        }}
                        autoComplete="off"
                        value={item.reason}
                        onChange={(event) =>
                          updateLine(item.clientKey, {
                            reason: event.currentTarget.value,
                          })
                        }
                        disabled={isSaving || isOriginalEditBlocked}
                        className="min-h-11"
                        aria-invalid={Boolean(reasonError)}
                        aria-describedby={
                          reasonError
                            ? `loss-reason-${item.clientKey}-error`
                            : undefined
                        }
                      />
                      {reasonError ? (
                        <FieldError id={`loss-reason-${item.clientKey}-error`}>
                          {reasonError}
                        </FieldError>
                      ) : null}
                    </Field>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {hqEditReasonRequired ? (
          <section className="bg-card text-card-foreground rounded-lg border p-4">
            <HqEditReasonField
              id="loss-hq-edit-reason"
              value={hqEditReason}
              error={hqEditReasonError}
              disabled={isSaving || isOriginalEditBlocked}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
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
                disabled={isSaving}
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
              disabled={isSaving || isOriginalEditBlocked}
            >
              {isSaving ? "저장 중..." : "저장"}
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
        </div>
      </form>
    </div>
  );
}
