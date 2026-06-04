"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerWorkInfo } from "~/features/ledger/actions";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import type {
  LedgerCostStepData,
  LedgerSalesStepData,
} from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

type WorkStepClientProps = {
  storeName: string;
  initialLedger: LedgerCostStepData;
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<LedgerCostStepData>>;
  showStepNavigation?: boolean;
  ledgerLabel?: string;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
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

function sanitizeAmount(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatProductivity(value: number | null) {
  if (value == null) {
    return "계산 불가";
  }

  return formatKrw(value);
}

export function WorkStepClient({
  storeName,
  initialLedger,
  currentStep = "work",
  saveAction = saveLedgerWorkInfo,
  showStepNavigation = true,
  ledgerLabel = "오늘 장부",
}: WorkStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const workerCountInputRef = useRef<HTMLInputElement>(null);
  const workMemoInputRef = useRef<HTMLTextAreaElement>(null);

  const [ledger, setLedger] = useState(initialLedger);
  const [workerCount, setWorkerCount] = useState(
    initialLedger.workerCount === null ? "" : String(initialLedger.workerCount),
  );
  const [workMemo, setWorkMemo] = useState(initialLedger.workMemo ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setLedger(initialLedger);
    setWorkerCount(
      initialLedger.workerCount === null
        ? ""
        : String(initialLedger.workerCount),
    );
    setWorkMemo(initialLedger.workMemo ?? "");
  }, [initialLedger]);

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.workerCount?.length) {
        workerCountInputRef.current?.focus();
        return;
      }

      if (errors.workMemo?.length) {
        workMemoInputRef.current?.focus();
      }
    }, 0);
  }

  function fillLedger(next: LedgerCostStepData) {
    setLedger(next);
    setWorkerCount(next.workerCount === null ? "" : String(next.workerCount));
    setWorkMemo(next.workMemo ?? "");
    notifyLedgerUpdated(next.id, next.updatedAt);
    setResultMessage("저장됐습니다.");
    toast.success("근무인원 정보를 저장했습니다.");
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
        workerCount: workerCountInputRef.current?.value ?? workerCount,
        workMemo: workMemoInputRef.current?.value ?? workMemo,
      });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};

        setFieldErrors(nextErrors);
        setFormError(result.error.message);
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

  const workerCountError = fieldErrors.workerCount?.[0];
  const workMemoError = fieldErrors.workMemo?.[0];
  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";
  const isSalesSaved = ledger.totalSalesAmount > 0;
  const isExpenseSaved = ledger.expenseItems.length > 0;
  const isPurchaseSaved = ledger.purchaseItems.length > 0;
  const isWorkSaved = ledger.workerCount !== null;
  const nextStepHref = stepHref(ledger.storeId, "review");

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
          aria-label="근무인원 단계"
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
                {isSalesSaved ? (
                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    저장됨
                  </span>
                ) : null}
              </a>
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "cost")}
              >
                2단계: 비용
                {isExpenseSaved ? (
                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    저장됨
                  </span>
                ) : null}
              </a>
            </li>
            <li>
              <a
                className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
                href={stepHref(ledger.storeId, "purchase")}
              >
                3단계: 매입
                {isPurchaseSaved ? (
                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                    저장됨
                  </span>
                ) : null}
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
                aria-current={currentStep === "work" ? "step" : undefined}
                className="block rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                href={stepHref(ledger.storeId, "work")}
              >
                6단계: 근무인원
                {isWorkSaved ? (
                  <span className="ml-1 text-xs font-normal opacity-75">
                    저장됨
                  </span>
                ) : null}
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
          className="flex flex-col gap-3"
          noValidate
        >
          <Field data-invalid={Boolean(workerCountError)}>
            <FieldLabel htmlFor="worker-count">근무인원</FieldLabel>
            <Input
              ref={workerCountInputRef}
              id="worker-count"
              inputMode="numeric"
              autoComplete="off"
              value={workerCount}
              disabled={isSaving || isOriginalEditBlocked}
              onChange={(event) =>
                setWorkerCount(sanitizeAmount(event.currentTarget.value))
              }
              className="min-h-11 tabular-nums"
              aria-invalid={Boolean(workerCountError)}
              aria-describedby={
                workerCountError ? "worker-count-error" : undefined
              }
            />
            {workerCountError ? (
              <FieldError id="worker-count-error">
                {workerCountError}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(workMemoError)}>
            <FieldLabel htmlFor="work-memo">특이사항 메모</FieldLabel>
            <textarea
              ref={workMemoInputRef}
              id="work-memo"
              maxLength={500}
              value={workMemo}
              disabled={isSaving || isOriginalEditBlocked}
              onChange={(event) => setWorkMemo(event.currentTarget.value)}
              rows={3}
              className="min-h-11 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm"
              aria-invalid={Boolean(workMemoError)}
              aria-describedby={workMemoError ? "work-memo-error" : undefined}
            />
            {workMemoError ? (
              <FieldError id="work-memo-error">{workMemoError}</FieldError>
            ) : null}
          </Field>

          <div className="bg-muted/40 rounded-md p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">비용 합계</span>
              <span className="font-semibold tabular-nums">
                {formatKrw(ledger.expenseTotal)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">영업이익</span>
              <span className="font-semibold tabular-nums">
                {formatKrw(ledger.grossProfit)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">인당생산성</span>
              <span className="font-semibold tabular-nums">
                {formatProductivity(ledger.productivity)}
              </span>
            </div>
          </div>

          {resultMessage ? (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p
                className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                role="status"
                aria-live="polite"
              >
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                {resultMessage}
              </p>
              <Button asChild>
                <a href={nextStepHref}>다음 단계로 →</a>
              </Button>
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
                disabled={isSaving || isOriginalEditBlocked}
                className="min-h-11 w-full"
              >
                다시 시도
              </Button>
            </div>
          ) : null}

          <Button
            type="submit"
            className="min-h-11"
            disabled={isSaving || isOriginalEditBlocked}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </form>
      </section>
    </div>
  );
}
