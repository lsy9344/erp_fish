"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerExpenses } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
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
import type {
  LedgerCostStepData,
  StoreManagerLedgerCostStepData,
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

type ExpenseLedgerData = StoreManagerLedgerCostStepData | LedgerCostStepData;

type ExpenseStepClientProps = {
  storeName: string;
  initialLedger: ExpenseLedgerData;
  expenseCodeOptions: ExpenseCodeOption[];
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<ExpenseLedgerData>>;
  showStepNavigation?: boolean;
  showSensitiveAccountingMetrics?: boolean;
  ledgerLabel?: string;
};

const DEFAULT_EXPENSE_CODE_OPTION: ExpenseCodeOption = {
  id: "__default_expense_other__",
  name: "기타",
};
const FALLBACK_EXPENSE_LINE_ID = "fallback-expense-line";

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function parseAmount(value: string) {
  return parseKrwInputValue(value);
}

function getDraftExpenseTotal(lines: ExpenseLine[]) {
  return lines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
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

function createExpenseLineId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createLineState(
  option?: ExpenseCodeOption,
  id = createExpenseLineId(),
): ExpenseLine {
  return {
    id,
    ledgerInputCodeId: option?.id ?? "",
    ledgerInputCodeName: option?.name ?? "",
    amount: "",
    memo: "",
  };
}

function toExpenseLines(items: StoreManagerLedgerCostStepData["expenseItems"]) {
  return items.map<ExpenseLine>((item) => ({
    id: item.id,
    ledgerInputCodeId: item.ledgerInputCodeId,
    ledgerInputCodeName: item.ledgerInputCodeName,
    amount: formatKrwInput(String(item.amount)),
    memo: item.memo ?? "",
  }));
}

function createFallbackExpenseLines(
  items: StoreManagerLedgerCostStepData["expenseItems"],
) {
  const lines = toExpenseLines(items);

  return lines.length > 0
    ? lines
    : [createLineState(DEFAULT_EXPENSE_CODE_OPTION, FALLBACK_EXPENSE_LINE_ID)];
}

function areExpenseLinesEqual(left: ExpenseLine[], right: ExpenseLine[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ExpenseStepClient({
  storeName,
  initialLedger,
  expenseCodeOptions,
  currentStep = "cost",
  saveAction = saveLedgerExpenses,
  showStepNavigation = true,
  showSensitiveAccountingMetrics = false,
  ledgerLabel = "오늘 장부",
}: ExpenseStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const lineCodeRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const lineAmountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lineMemoRefs = useRef<(HTMLInputElement | null)[]>([]);

  const hasRegisteredExpenseCodeOptions = expenseCodeOptions.length > 0;
  const expenseOptions = hasRegisteredExpenseCodeOptions
    ? expenseCodeOptions
    : [DEFAULT_EXPENSE_CODE_OPTION];
  const [ledger, setLedger] = useState(initialLedger);
  const [expenseItems, setExpenseItems] = useState(() =>
    hasRegisteredExpenseCodeOptions
      ? toExpenseLines(initialLedger.expenseItems)
      : createFallbackExpenseLines(initialLedger.expenseItems),
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
    setExpenseItems(
      hasRegisteredExpenseCodeOptions
        ? toExpenseLines(initialLedger.expenseItems)
        : createFallbackExpenseLines(initialLedger.expenseItems),
    );
  }, [hasRegisteredExpenseCodeOptions, initialLedger]);

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
    }, 50);
  }

  function fillLedger(next: ExpenseLedgerData) {
    setLedger(next);
    setExpenseItems(toExpenseLines(next.expenseItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    const savedCount = next.expenseItems.length;
    const message =
      savedCount > 0
        ? `비용 항목 ${savedCount}건을 저장했습니다.`
        : "저장됐습니다.";
    setResultMessage(message);
    toast.success(message);
  }

  function clearRowErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  async function saveCurrentDraft() {
    if (!hasRegisteredExpenseCodeOptions) {
      setFormError("비용 항목 코드가 등록된 뒤 저장할 수 있습니다.");
      setResultMessage(null);
      toast.error("비용 항목 코드가 등록된 뒤 저장할 수 있습니다.");
      return false;
    }

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
        expenses: expenseItems.map((line, index) => ({
          ledgerInputCodeId:
            lineCodeRefs.current[index]?.value ?? line.ledgerInputCodeId,
          amount: toRawKrwInputValue(
            lineAmountRefs.current[index]?.value ?? line.amount,
          ),
          memo: lineMemoRefs.current[index]?.value ?? line.memo,
        })),
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
        setIsSaving(false);
        focusFirstError(nextErrors);
        toast.error(result.error.message);
        return false;
      }

      fillLedger(result.data);
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
  const draftExpenseTotal = getDraftExpenseTotal(expenseItems);
  const draftGrossProfit = ledger.totalSalesAmount - draftExpenseTotal;
  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";
  const nextStepHref = stepHref(ledger.storeId, ledger.closingDate, "purchase");
  const isDirty = !areExpenseLinesEqual(
    expenseItems,
    toExpenseLines(ledger.expenseItems),
  );
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
        stepLabel="2단계 비용"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isFormSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={["비용 항목", "비용 금액", "메모"]}
        onRetry={handleRetry}
        retryDisabled={
          isFormSaving ||
          isOriginalEditBlocked ||
          !hasRegisteredExpenseCodeOptions
        }
      />

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">비용 항목</p>
          <Button
            type="button"
            variant="outline"
            onClick={addExpenseLine}
            disabled={
              isFormSaving ||
              isOriginalEditBlocked ||
              !hasRegisteredExpenseCodeOptions
            }
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
              const selectedCode = expenseOptions.find(
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
                      disabled={
                        isFormSaving ||
                        isOriginalEditBlocked ||
                        !hasRegisteredExpenseCodeOptions
                      }
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
                      disabled={
                        isFormSaving ||
                        isOriginalEditBlocked ||
                        !hasRegisteredExpenseCodeOptions
                      }
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
                      {expenseOptions.map((option) => (
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
                      disabled={
                        isFormSaving ||
                        isOriginalEditBlocked ||
                        !hasRegisteredExpenseCodeOptions
                      }
                      onChange={(event) =>
                        updateExpenseLine(line.id, {
                          amount: formatKrwInput(event.currentTarget.value),
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
                      표시: {formatKrw(parseKrwInputValue(line.amount))}
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
                      disabled={
                        isFormSaving ||
                        isOriginalEditBlocked ||
                        !hasRegisteredExpenseCodeOptions
                      }
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

        {!hasRegisteredExpenseCodeOptions ? (
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
          {showSensitiveAccountingMetrics ? (
            <div className="mt-2 flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">영업이익</span>
              <span className="font-semibold tabular-nums">
                {formatKrw(draftGrossProfit)}
              </span>
            </div>
          ) : null}
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
              disabled={
                isFormSaving ||
                isOriginalEditBlocked ||
                !hasRegisteredExpenseCodeOptions
              }
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
            disabled={
              isFormSaving ||
              isOriginalEditBlocked ||
              !hasRegisteredExpenseCodeOptions
            }
          >
            {isFormSaving ? "저장 중..." : "저장"}
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
