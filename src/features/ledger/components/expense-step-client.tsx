"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerExpenses } from "~/features/ledger/actions";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import type {
  LedgerCostStepData,
  LedgerSalesStepData,
} from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

type ExpenseCodeOption = {
  id: string;
  name: string;
};

type ExpenseLine = {
  id: string;
  ledgerInputCodeId: string;
  ledgerInputCodeName: string;
  amount: string;
  memo: string;
};

type ExpenseStepClientProps = {
  storeName: string;
  initialLedger: LedgerCostStepData;
  expenseCodeOptions: ExpenseCodeOption[];
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<LedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function sanitizeAmount(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseAmount(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    return 0;
  }

  return Number.parseInt(value, 10);
}

function getDraftExpenseTotal(lines: ExpenseLine[]) {
  return lines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
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

function formatClosingDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function stepHref(
  storeId: string,
  step: "sales" | "cost" | "purchase" | "work" | "review",
) {
  return `/app/store-entry?storeId=${storeId}&step=${step}`;
}

function createLineState(): ExpenseLine {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ledgerInputCodeId: "",
    ledgerInputCodeName: "",
    amount: "",
    memo: "",
  };
}

function toExpenseLines(items: LedgerCostStepData["expenseItems"]) {
  return items.map<ExpenseLine>((item) => ({
    id: item.id,
    ledgerInputCodeId: item.ledgerInputCodeId,
    ledgerInputCodeName: item.ledgerInputCodeName,
    amount: String(item.amount),
    memo: item.memo ?? "",
  }));
}

export function ExpenseStepClient({
  storeName,
  initialLedger,
  expenseCodeOptions,
  currentStep = "cost",
  saveAction = saveLedgerExpenses,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
}: ExpenseStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const lineCodeRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const lineAmountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lineMemoRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [ledger, setLedger] = useState(initialLedger);
  const [expenseItems, setExpenseItems] = useState(() =>
    toExpenseLines(initialLedger.expenseItems),
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
    setExpenseItems(toExpenseLines(initialLedger.expenseItems));
  }, [initialLedger]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      for (let index = 0; index < expenseItems.length; index += 1) {
        if (errors[`expenses.${index}.ledgerInputCodeId`]?.length) {
          lineCodeRefs.current[index]?.focus();
          return;
        }

        if (errors[`expenses.${index}.amount`]?.length) {
          lineAmountRefs.current[index]?.focus();
          return;
        }

        if (errors[`expenses.${index}.memo`]?.length) {
          lineMemoRefs.current[index]?.focus();
          return;
        }
      }
    }, 0);
  }

  function fillLedger(next: LedgerCostStepData) {
    setLedger(next);
    setExpenseItems(toExpenseLines(next.expenseItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    setResultMessage("저장됐습니다.");
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
        ledgerUpdatedAt: ledger.updatedAt,
        storeId: ledger.storeId,
        expenses: expenseItems.map((line, index) => ({
          ledgerInputCodeId:
            lineCodeRefs.current[index]?.value ?? line.ledgerInputCodeId,
          amount: lineAmountRefs.current[index]?.value ?? line.amount,
          memo: lineMemoRefs.current[index]?.value ?? line.memo,
        })),
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        focusFirstError(nextErrors);
        return;
      }

      fillLedger(result.data);
      setFormError(null);
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

  function addExpenseLine() {
    clearRowErrors();
    setResultMessage(null);
    setExpenseItems((current) => [...current, createLineState()]);
  }

  function removeExpenseLine(lineId: string) {
    clearRowErrors();
    setResultMessage(null);
    setExpenseItems((current) => current.filter((line) => line.id !== lineId));
  }

  function updateExpenseLine(lineId: string, next: Partial<ExpenseLine>) {
    clearRowErrors();
    setResultMessage(null);
    setExpenseItems((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...next } : line)),
    );
  }

  const isFormSaving = isSaving;
  const expenseCodeIdErrors = expenseItems.map((_, index) => ({
    code: fieldErrors[`expenses.${index}.ledgerInputCodeId`]?.[0],
    amount: fieldErrors[`expenses.${index}.amount`]?.[0],
    memo: fieldErrors[`expenses.${index}.memo`]?.[0],
  }));
  const hasExpenseItems = expenseCodeOptions.length > 0;
  const draftExpenseTotal = getDraftExpenseTotal(expenseItems);
  const draftGrossProfit = ledger.totalSalesAmount - draftExpenseTotal;
  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";

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
        aria-label="비용 단계"
        className="bg-card text-card-foreground rounded-lg border p-4"
      >
        <p className="mb-3 text-sm font-medium">현재 단계</p>
        <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={stepHref(ledger.storeId, "sales")}
            >
              1단계: 매출/결제
            </a>
          </li>
          <li>
            <a
              aria-current={currentStep === "cost" ? "step" : undefined}
              className="block rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">비용 항목</p>
          <Button
            type="button"
            variant="outline"
            onClick={addExpenseLine}
            disabled={isFormSaving || isOriginalEditBlocked}
            className="min-h-11 gap-2"
          >
            <PlusIcon data-icon="inline-start" />
            항목 추가
          </Button>
        </div>

        {expenseItems.length === 0 ? (
          <p className="text-muted-foreground mb-3 text-sm">
            항목이 없습니다. 새 항목을 추가해 주세요.
          </p>
        ) : (
          <div className="mb-3 space-y-3">
            {expenseItems.map((line, index) => {
              const lineCodeError = expenseCodeIdErrors[index]?.code;
              const lineAmountError = expenseCodeIdErrors[index]?.amount;
              const lineMemoError = expenseCodeIdErrors[index]?.memo;
              const lineCodeErrorId = `expense-code-${line.id}-error`;
              const lineAmountErrorId = `expense-amount-${line.id}-error`;
              const lineMemoErrorId = `expense-memo-${line.id}-error`;
              const selectedCode = expenseCodeOptions.find(
                (option) => option.id === line.ledgerInputCodeId,
              );

              return (
                <div key={line.id} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      항목 {index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeExpenseLine(line.id)}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      className="min-h-11 gap-2"
                    >
                      <Trash2Icon data-icon="inline-start" />
                      삭제
                    </Button>
                  </div>

                  <Field data-invalid={Boolean(lineCodeError)}>
                    <FieldLabel htmlFor={`expense-code-${line.id}`}>
                      비용 항목
                    </FieldLabel>
                    <select
                      id={`expense-code-${line.id}`}
                      ref={(node) => {
                        lineCodeRefs.current[index] = node;
                      }}
                      value={line.ledgerInputCodeId}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        updateExpenseLine(line.id, {
                          ledgerInputCodeId: event.currentTarget.value,
                        })
                      }
                      aria-invalid={Boolean(lineCodeError)}
                      aria-describedby={
                        lineCodeError ? lineCodeErrorId : undefined
                      }
                      className="h-11 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                    >
                      <option value="">비용 항목 선택</option>
                      {!selectedCode && line.ledgerInputCodeId ? (
                        <option value={line.ledgerInputCodeId}>
                          {line.ledgerInputCodeName || line.ledgerInputCodeId}
                        </option>
                      ) : null}
                      {expenseCodeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {lineCodeError ? (
                      <FieldError id={lineCodeErrorId}>
                        {lineCodeError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <Field data-invalid={Boolean(lineAmountError)}>
                    <FieldLabel htmlFor={`expense-amount-${line.id}`}>
                      금액
                    </FieldLabel>
                    <Input
                      id={`expense-amount-${line.id}`}
                      ref={(node) => {
                        lineAmountRefs.current[index] = node;
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      value={line.amount}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        updateExpenseLine(line.id, {
                          amount: sanitizeAmount(event.currentTarget.value),
                        })
                      }
                      className="min-h-11 tabular-nums"
                      aria-invalid={Boolean(lineAmountError)}
                      aria-describedby={
                        lineAmountError ? lineAmountErrorId : undefined
                      }
                    />
                    <p
                      id={`expense-amount-${line.id}-preview`}
                      className="text-muted-foreground mt-1 text-xs tabular-nums"
                    >
                      표시: {formatKrw(Number(line.amount || 0))}
                    </p>
                    {lineAmountError ? (
                      <FieldError id={lineAmountErrorId}>
                        {lineAmountError}
                      </FieldError>
                    ) : null}
                  </Field>

                  <Field data-invalid={Boolean(lineMemoError)}>
                    <FieldLabel htmlFor={`expense-memo-${line.id}`}>
                      메모 (선택)
                    </FieldLabel>
                    <Input
                      id={`expense-memo-${line.id}`}
                      ref={(node) => {
                        lineMemoRefs.current[index] = node;
                      }}
                      inputMode="text"
                      maxLength={500}
                      value={line.memo}
                      disabled={isFormSaving || isOriginalEditBlocked}
                      onChange={(event) =>
                        updateExpenseLine(line.id, {
                          memo: event.currentTarget.value,
                        })
                      }
                      aria-invalid={Boolean(lineMemoError)}
                      aria-describedby={
                        lineMemoError ? lineMemoErrorId : undefined
                      }
                    />
                    {lineMemoError ? (
                      <FieldError id={lineMemoErrorId}>
                        {lineMemoError}
                      </FieldError>
                    ) : null}
                  </Field>
                </div>
              );
            })}
          </div>
        )}

        {!hasExpenseItems ? (
          <p className="text-destructive mb-3 text-sm">
            비용 항목 코드가 없습니다. 본사에서 비용 항목 코드가 등록되어야
            합니다.
          </p>
        ) : null}

        <div className="bg-muted/40 rounded-md p-3">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">비용 합계</span>
            <span className="font-semibold tabular-nums">
              {formatKrw(draftExpenseTotal)}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">영업이익</span>
            <span className="font-semibold tabular-nums">
              {formatKrw(draftGrossProfit)}
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
              disabled={isFormSaving || isOriginalEditBlocked}
              className="min-h-11 w-full"
            >
              다시 시도
            </Button>
          </div>
        ) : null}

        <Button
          type="submit"
          className="min-h-11"
          disabled={isFormSaving || isOriginalEditBlocked}
        >
          {isFormSaving ? "저장 중..." : "저장"}
        </Button>
      </form>
    </div>
  );
}
