"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerWorkInfo } from "~/features/ledger/actions";
import type {
  LedgerCostStepData,
  LedgerSalesStepData,
} from "~/features/ledger/types";
import type { FieldErrors } from "~/lib/action-result";

type WorkStepClientProps = {
  storeName: string;
  initialLedger: LedgerCostStepData;
  currentStep: "sales" | "cost" | "purchase" | "work";
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
    setResultMessage("저장됐습니다.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setResultMessage(null);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await saveLedgerWorkInfo({
        storeId: ledger.storeId,
        workerCount,
        workMemo,
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

  const workerCountError = fieldErrors.workerCount?.[0];
  const workMemoError = fieldErrors.workMemo?.[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="bg-card text-card-foreground rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">오늘 장부</p>
        <h1 className="text-2xl font-semibold tracking-normal">{storeName}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          영업일: {formatClosingDate(ledger.closingDate)} · 상태:{" "}
          <span className="text-foreground font-medium">
            {normalizeStatusLabel(ledger.status)}
          </span>
        </p>
      </header>

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
              aria-current={currentStep === "work" ? "step" : undefined}
              className="block rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
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
                disabled={isSaving}
                className="min-h-11 w-full"
              >
                다시 시도
              </Button>
            </div>
          ) : null}

          <Button type="submit" className="min-h-11" disabled={isSaving}>
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </form>
      </section>
    </div>
  );
}
