"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerSalesPayment } from "~/features/ledger/actions";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import type {
  LedgerCostStepData,
  LedgerSalesStepData,
} from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function parseAmount(value: string) {
  if (value.trim() === "") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatClosingDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function calculatePaymentDifference(
  totalSalesAmount: number,
  cashAmount: number,
  cardAmount: number,
  otherPaymentAmount: number,
) {
  return totalSalesAmount - (cashAmount + cardAmount + otherPaymentAmount);
}

function sanitizeAmountInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeStatusLabel(status: LedgerSalesStepData["status"]) {
  if (status === "IN_PROGRESS") {
    return "입력중";
  }

  if (status === "IN_REVIEW") {
    return "검토대기";
  }

  if (status === "HEADQUARTERS_CLOSED") {
    return "본사마감";
  }

  return "휴무";
}

function stepHref(
  storeId: string,
  step: "sales" | "cost" | "purchase" | "work" | "review",
) {
  return `/app/store-entry?storeId=${storeId}&step=${step}`;
}

type SalesPaymentStepClientProps = {
  storeName: string;
  initialLedger: LedgerCostStepData;
  currentStep?: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<LedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
};

export function SalesPaymentStepClient({
  storeName,
  initialLedger,
  currentStep = "sales",
  saveAction = saveLedgerSalesPayment,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
}: SalesPaymentStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const totalSalesInputRef = useRef<HTMLInputElement>(null);
  const cashAmountInputRef = useRef<HTMLInputElement>(null);
  const cardAmountInputRef = useRef<HTMLInputElement>(null);
  const otherPaymentInputRef = useRef<HTMLInputElement>(null);

  const [ledger, setLedger] = useState(initialLedger);
  const [totalSalesAmount, setTotalSalesAmount] = useState(
    String(initialLedger.totalSalesAmount),
  );
  const [cashAmount, setCashAmount] = useState(
    String(initialLedger.cashAmount),
  );
  const [cardAmount, setCardAmount] = useState(
    String(initialLedger.cardAmount),
  );
  const [otherPaymentAmount, setOtherPaymentAmount] = useState(
    String(initialLedger.otherPaymentAmount),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const totalSalesAmountValue = parseAmount(totalSalesAmount);
  const cashAmountValue = parseAmount(cashAmount);
  const cardAmountValue = parseAmount(cardAmount);
  const otherPaymentAmountValue = parseAmount(otherPaymentAmount);
  const paymentDifference = calculatePaymentDifference(
    totalSalesAmountValue,
    cashAmountValue,
    cardAmountValue,
    otherPaymentAmountValue,
  );
  const hasPaymentDifference = paymentDifference !== 0;
  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";

  function fillLedger(data: LedgerCostStepData) {
    setLedger(data);
    setTotalSalesAmount(String(data.totalSalesAmount));
    setCashAmount(String(data.cashAmount));
    setCardAmount(String(data.cardAmount));
    setOtherPaymentAmount(String(data.otherPaymentAmount));
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
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
      }
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const payload = {
        ledgerId: ledger.id,
        ledgerUpdatedAt: ledger.updatedAt,
        storeId: ledger.storeId,
        totalSalesAmount: totalSalesInputRef.current?.value ?? totalSalesAmount,
        cashAmount: cashAmountInputRef.current?.value ?? cashAmount,
        cardAmount: cardAmountInputRef.current?.value ?? cardAmount,
        otherPaymentAmount:
          otherPaymentInputRef.current?.value ?? otherPaymentAmount,
      };

      const result = await saveAction(payload);

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        return;
      }

      fillLedger(result.data);
      notifyLedgerUpdated(result.data.id, result.data.updatedAt);
      setResultMessage("저장됐습니다.");
    } catch {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      setResultMessage(null);
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

  const totalSalesError = fieldErrors.totalSalesAmount?.[0];
  const cashAmountError = fieldErrors.cashAmount?.[0];
  const cardAmountError = fieldErrors.cardAmount?.[0];
  const otherPaymentAmountError = fieldErrors.otherPaymentAmount?.[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="bg-card text-card-foreground rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">{ledgerLabel}</p>
        <h1 className="text-2xl font-semibold tracking-normal">{storeName}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          영업일: {formatClosingDate(ledger.closingDate)} · 상태:{" "}
          <span className="text-foreground font-medium">
            {normalizeStatusLabel(ledger.status)}
          </span>
        </p>
      </header>

      {showStepNavigation ? (
        <section
          aria-label="매출/결제 단계"
          className="bg-card text-card-foreground rounded-lg border p-4"
        >
          <p className="mb-3 text-sm font-medium">현재 단계</p>
          <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            <li>
              <a
                aria-current={currentStep === "sales" ? "step" : undefined}
                className="block rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                href={stepHref(ledger.storeId, "sales")}
              >
                1단계: 매출/결제
              </a>
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "cost")}
              >
                2단계: 비용
              </a>
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "purchase")}
              >
                3단계: 매입
              </a>
            </li>
            <li className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
              4단계: 재고
            </li>
            <li className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
              5단계: 손실/폐기
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "work")}
              >
                6단계: 근무인원
              </a>
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "review")}
              >
                7단계: 검토/제출
              </a>
            </li>
          </ol>
        </section>
      ) : null}

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
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
                setTotalSalesAmount(
                  sanitizeAmountInput(event.currentTarget.value),
                )
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
                setCashAmount(sanitizeAmountInput(event.currentTarget.value))
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
                setCardAmount(sanitizeAmountInput(event.currentTarget.value))
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
                setOtherPaymentAmount(
                  sanitizeAmountInput(event.currentTarget.value),
                )
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

          {resultMessage ? (
            <p
              className="text-sm text-emerald-700 dark:text-emerald-300"
              role="status"
            >
              {resultMessage}
            </p>
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

          <Button
            type="submit"
            className="min-h-11"
            disabled={!isHydrated || isSaving || isOriginalEditBlocked}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </form>
      </section>
    </div>
  );
}
