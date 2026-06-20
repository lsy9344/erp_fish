"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerSalesPayment } from "~/features/ledger/actions";
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
import {
  formatKrwInput,
  parseKrwInputValue,
  toRawKrwInputValue,
} from "~/features/ledger/components/krw-input-format";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import type { StoreManagerLedgerCostStepData } from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function calculatePaymentDifference(
  totalSalesAmount: number,
  cashAmount: number,
  cardAmount: number,
  otherPaymentAmount: number,
) {
  return totalSalesAmount - (cashAmount + cardAmount + otherPaymentAmount);
}

function stepHref(
  storeId: string,
  closingDate: string,
  step: "sales" | "cost" | "purchase" | "work" | "review",
) {
  const params = new URLSearchParams({
    storeId,
    date: getKstLedgerDateParam(closingDate),
    step,
  });

  return `/app/store-entry?${params.toString()}`;
}

type SalesPaymentStepClientProps = {
  storeName: string;
  initialLedger: StoreManagerLedgerCostStepData;
  currentStep?: "sales" | "cost" | "purchase" | "work";
  saveAction?: (
    input: unknown,
  ) => Promise<ActionResult<StoreManagerLedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
  hqEditReasonRequired?: boolean;
};

export function SalesPaymentStepClient({
  storeName,
  initialLedger,
  currentStep = "sales",
  saveAction = saveLedgerSalesPayment,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
  hqEditReasonRequired = false,
}: SalesPaymentStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const authorDisplayNameInputRef = useRef<HTMLInputElement>(null);
  const totalSalesInputRef = useRef<HTMLInputElement>(null);
  const cashAmountInputRef = useRef<HTMLInputElement>(null);
  const cardAmountInputRef = useRef<HTMLInputElement>(null);
  const otherPaymentInputRef = useRef<HTMLInputElement>(null);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);

  const [ledger, setLedger] = useState(initialLedger);
  const [authorDisplayName, setAuthorDisplayName] = useState(
    initialLedger.authorDisplayName ?? "",
  );
  const [totalSalesAmount, setTotalSalesAmount] = useState(
    formatKrwInput(String(initialLedger.totalSalesAmount)),
  );
  const [cashAmount, setCashAmount] = useState(
    formatKrwInput(String(initialLedger.cashAmount)),
  );
  const [cardAmount, setCardAmount] = useState(
    formatKrwInput(String(initialLedger.cardAmount)),
  );
  const [otherPaymentAmount, setOtherPaymentAmount] = useState(
    formatKrwInput(String(initialLedger.otherPaymentAmount)),
  );
  const [hqEditReason, setHqEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saveConflict = useSaveConflictDialog();

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const totalSalesAmountValue = parseKrwInputValue(totalSalesAmount);
  const cashAmountValue = parseKrwInputValue(cashAmount);
  const cardAmountValue = parseKrwInputValue(cardAmount);
  const otherPaymentAmountValue = parseKrwInputValue(otherPaymentAmount);
  const paymentDifference = calculatePaymentDifference(
    totalSalesAmountValue,
    cashAmountValue,
    cardAmountValue,
    otherPaymentAmountValue,
  );
  const hasPaymentDifference = paymentDifference !== 0;
  const isOriginalEditBlocked = isLedgerReadOnly(ledger.status);
  const nextStepHref = stepHref(ledger.storeId, ledger.closingDate, "cost");
  const isDirty =
    authorDisplayName.trim() !== (ledger.authorDisplayName ?? "") ||
    totalSalesAmountValue !== ledger.totalSalesAmount ||
    cashAmountValue !== ledger.cashAmount ||
    cardAmountValue !== ledger.cardAmount ||
    otherPaymentAmountValue !== ledger.otherPaymentAmount;

  function fillLedger(data: StoreManagerLedgerCostStepData) {
    setLedger(data);
    setAuthorDisplayName(data.authorDisplayName ?? "");
    setTotalSalesAmount(formatKrwInput(String(data.totalSalesAmount)));
    setCashAmount(formatKrwInput(String(data.cashAmount)));
    setCardAmount(formatKrwInput(String(data.cardAmount)));
    setOtherPaymentAmount(formatKrwInput(String(data.otherPaymentAmount)));
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.authorDisplayName?.length) {
        authorDisplayNameInputRef.current?.focus();
        return;
      }

      if (errors.totalSalesAmount?.length) {
        totalSalesInputRef.current?.focus();
        return;
      }

      if (errors.cashAmount?.length) {
        cashAmountInputRef.current?.focus();
        return;
      }

      if (errors.cardAmount?.length) {
        cardAmountInputRef.current?.focus();
        return;
      }

      if (errors.otherPaymentAmount?.length) {
        otherPaymentInputRef.current?.focus();
        return;
      }

      if (errors.reason?.length) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 0);
  }

  async function saveCurrentDraft() {
    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const payload = {
        ledgerId: ledger.id,
        storeId: ledger.storeId,
        closingDate: getKstLedgerDateParam(ledger.closingDate),
        version: ledger.version,
        ledgerUpdatedAt: ledger.updatedAt,
        authorDisplayName:
          authorDisplayNameInputRef.current?.value ?? authorDisplayName,
        totalSalesAmount: toRawKrwInputValue(
          totalSalesInputRef.current?.value ?? totalSalesAmount,
        ),
        cashAmount: toRawKrwInputValue(
          cashAmountInputRef.current?.value ?? cashAmount,
        ),
        cardAmount: toRawKrwInputValue(
          cardAmountInputRef.current?.value ?? cardAmount,
        ),
        otherPaymentAmount: toRawKrwInputValue(
          otherPaymentInputRef.current?.value ?? otherPaymentAmount,
        ),
        ...(hqEditReasonRequired ? { reason: hqEditReason } : {}),
      };

      const result = await saveAction(payload);

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

      fillLedger(result.data);
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      setResultMessage("저장됐습니다.");
      toast.success("매출/결제 정보를 저장했습니다.");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentDraft();
  }

  const guard = useUnsavedStepGuard({
    isDirty,
    onSave: saveCurrentDraft,
  });

  function handleRetry() {
    if (!formRef.current || isSaving) {
      return;
    }

    formRef.current.requestSubmit();
  }

  const totalSalesError = fieldErrors.totalSalesAmount?.[0];
  const cashAmountError = fieldErrors.cashAmount?.[0];
  const cardAmountError = fieldErrors.cardAmount?.[0];
  const otherPaymentAmountError = fieldErrors.otherPaymentAmount?.[0];
  const authorDisplayNameError = fieldErrors.authorDisplayName?.[0];
  const hqEditReasonError = fieldErrors.reason?.[0];

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
        stepLabel="1단계 매출/결제"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={[
          "작성자 표시명",
          "총매출",
          "현금",
          "카드",
          "기타 결제수단",
        ]}
        onRetry={handleRetry}
        retryDisabled={!isHydrated || isSaving || isOriginalEditBlocked}
      />

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field data-invalid={Boolean(authorDisplayNameError)}>
            <FieldLabel htmlFor="author-display-name">작성자 표시명</FieldLabel>
            <Input
              ref={authorDisplayNameInputRef}
              id="author-display-name"
              name="authorDisplayName"
              autoComplete="name"
              maxLength={50}
              value={authorDisplayName}
              disabled={!isHydrated || isOriginalEditBlocked}
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
              감사 실행 계정과 별도로 장부 화면에 표시되는 이름입니다.
            </p>
            {authorDisplayNameError ? (
              <FieldError id="author-display-name-error">
                {authorDisplayNameError}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(totalSalesError)}>
            <FieldLabel htmlFor="total-sales-amount">총매출</FieldLabel>
            <Input
              ref={totalSalesInputRef}
              id="total-sales-amount"
              name="totalSalesAmount"
              inputMode="numeric"
              autoComplete="off"
              value={totalSalesAmount}
              disabled={!isHydrated || isOriginalEditBlocked}
              onChange={(event) =>
                setTotalSalesAmount(formatKrwInput(event.currentTarget.value))
              }
              className="min-h-11 tabular-nums"
              aria-invalid={Boolean(totalSalesError)}
              aria-describedby={
                totalSalesError
                  ? "total-sales-amount-error"
                  : "total-sales-amount-preview"
              }
            />
            <p
              id="total-sales-amount-preview"
              className="text-muted-foreground mt-1 text-xs tabular-nums"
            >
              표시: {formatKrw(totalSalesAmountValue)}
            </p>
            {totalSalesError ? (
              <FieldError id="total-sales-amount-error">
                {totalSalesError}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(cashAmountError)}>
            <FieldLabel htmlFor="cash-amount">현금</FieldLabel>
            <Input
              ref={cashAmountInputRef}
              id="cash-amount"
              name="cashAmount"
              inputMode="numeric"
              autoComplete="off"
              value={cashAmount}
              disabled={!isHydrated || isOriginalEditBlocked}
              onChange={(event) =>
                setCashAmount(formatKrwInput(event.currentTarget.value))
              }
              className="min-h-11 tabular-nums"
              aria-invalid={Boolean(cashAmountError)}
              aria-describedby={
                cashAmountError ? "cash-amount-error" : "cash-amount-preview"
              }
            />
            <p
              id="cash-amount-preview"
              className="text-muted-foreground mt-1 text-xs tabular-nums"
            >
              표시: {formatKrw(cashAmountValue)}
            </p>
            {cashAmountError ? (
              <FieldError id="cash-amount-error">{cashAmountError}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(cardAmountError)}>
            <FieldLabel htmlFor="card-amount">카드</FieldLabel>
            <Input
              ref={cardAmountInputRef}
              id="card-amount"
              name="cardAmount"
              inputMode="numeric"
              autoComplete="off"
              value={cardAmount}
              disabled={!isHydrated || isOriginalEditBlocked}
              onChange={(event) =>
                setCardAmount(formatKrwInput(event.currentTarget.value))
              }
              className="min-h-11 tabular-nums"
              aria-invalid={Boolean(cardAmountError)}
              aria-describedby={
                cardAmountError ? "card-amount-error" : "card-amount-preview"
              }
            />
            <p
              id="card-amount-preview"
              className="text-muted-foreground mt-1 text-xs tabular-nums"
            >
              표시: {formatKrw(cardAmountValue)}
            </p>
            {cardAmountError ? (
              <FieldError id="card-amount-error">{cardAmountError}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(otherPaymentAmountError)}>
            <FieldLabel htmlFor="other-payment-amount">
              기타 결제수단
            </FieldLabel>
            <Input
              ref={otherPaymentInputRef}
              id="other-payment-amount"
              name="otherPaymentAmount"
              inputMode="numeric"
              autoComplete="off"
              value={otherPaymentAmount}
              disabled={!isHydrated || isOriginalEditBlocked}
              onChange={(event) =>
                setOtherPaymentAmount(formatKrwInput(event.currentTarget.value))
              }
              className="min-h-11 tabular-nums"
              aria-invalid={Boolean(otherPaymentAmountError)}
              aria-describedby={
                otherPaymentAmountError
                  ? "other-payment-amount-error"
                  : "other-payment-amount-preview"
              }
            />
            <p
              id="other-payment-amount-preview"
              className="text-muted-foreground mt-1 text-xs tabular-nums"
            >
              표시: {formatKrw(otherPaymentAmountValue)}
            </p>
            {otherPaymentAmountError ? (
              <FieldError id="other-payment-amount-error">
                {otherPaymentAmountError}
              </FieldError>
            ) : null}
          </Field>

          <div
            className={`rounded-md px-3 py-2 text-sm ${
              hasPaymentDifference
                ? "border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "text-muted-foreground border border-transparent"
            }`}
            role={hasPaymentDifference ? "status" : undefined}
          >
            {hasPaymentDifference ? (
              <p>
                결제 합계 차액{" "}
                <strong className="tabular-nums">
                  {formatKrw(paymentDifference)}
                </strong>{" "}
                (총매출 - 결제 합계)
              </p>
            ) : (
              <p className="text-muted-foreground">결제 합계 차액 0원</p>
            )}
          </div>

          {hqEditReasonRequired ? (
            <HqEditReasonField
              id="sales-hq-edit-reason"
              value={hqEditReason}
              error={hqEditReasonError}
              disabled={!isHydrated || isOriginalEditBlocked || isSaving}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          ) : null}

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
                disabled={!isHydrated || isSaving || isOriginalEditBlocked}
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
              disabled={!isHydrated || isSaving || isOriginalEditBlocked}
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
        </form>
      </section>
    </div>
  );
}
