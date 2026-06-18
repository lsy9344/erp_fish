"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveLedgerWorkInfo } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { HqEditReasonField } from "~/features/ledger/components/hq-edit-reason-field";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import {
  notifyLedgerUpdated,
  useLedgerUpdatedAtSync,
} from "~/features/ledger/components/ledger-updated-at-sync";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import type {
  LedgerCostStepData,
  StoreManagerLedgerCostStepData,
} from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

type WorkLedgerData = StoreManagerLedgerCostStepData | LedgerCostStepData;

type WorkStepClientProps = {
  storeName: string;
  initialLedger: WorkLedgerData;
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<WorkLedgerData>>;
  showStepNavigation?: boolean;
  showSensitiveAccountingMetrics?: boolean;
  ledgerLabel?: string;
  hqEditReasonRequired?: boolean;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
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

function hasSensitiveAccountingMetrics(
  data: WorkLedgerData,
): data is LedgerCostStepData {
  return "grossProfit" in data && "productivity" in data;
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
  showSensitiveAccountingMetrics = false,
  ledgerLabel = "오늘 장부",
  hqEditReasonRequired = false,
}: WorkStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const workerCountInputRef = useRef<HTMLInputElement>(null);
  const workMemoInputRef = useRef<HTMLTextAreaElement>(null);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);

  const [ledger, setLedger] = useState(initialLedger);
  const [workerCount, setWorkerCount] = useState(
    initialLedger.workerCount === null ? "" : String(initialLedger.workerCount),
  );
  const [workMemo, setWorkMemo] = useState(initialLedger.workMemo ?? "");
  const [hqEditReason, setHqEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saveConflict = useSaveConflictDialog();
  const workerCountError = fieldErrors.workerCount?.[0];
  const workMemoError = fieldErrors.workMemo?.[0];
  const hqEditReasonError = fieldErrors.reason?.[0];
  const isDirty =
    workerCount !==
      (ledger.workerCount === null ? "" : String(ledger.workerCount)) ||
    workMemo !== (ledger.workMemo ?? "");
  const previousInitialLedgerRef = useRef(initialLedger);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    const previousInitialLedger = previousInitialLedgerRef.current;
    const previousWorkerCount =
      previousInitialLedger.workerCount === null
        ? ""
        : String(previousInitialLedger.workerCount);

    setLedger(initialLedger);
    setWorkerCount((current) =>
      current === previousWorkerCount
        ? initialLedger.workerCount === null
          ? ""
          : String(initialLedger.workerCount)
        : current,
    );
    setWorkMemo((current) =>
      current === (previousInitialLedger.workMemo ?? "")
        ? (initialLedger.workMemo ?? "")
        : current,
    );
    previousInitialLedgerRef.current = initialLedger;
  }, [initialLedger]);

  useEffect(() => {
    if (
      isSaving ||
      (!workerCountError && !workMemoError && !hqEditReasonError)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (workerCountError) {
        workerCountInputRef.current?.focus();
        return;
      }

      if (workMemoError) {
        workMemoInputRef.current?.focus();
        return;
      }

      if (hqEditReasonError) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isSaving, workerCountError, workMemoError, hqEditReasonError]);

  function fillLedger(next: WorkLedgerData) {
    setLedger(next);
    setWorkerCount(next.workerCount === null ? "" : String(next.workerCount));
    setWorkMemo(next.workMemo ?? "");
    notifyLedgerUpdated(next.id, next.updatedAt);
    setResultMessage("저장됐습니다.");
    toast.success("근무인원 정보를 저장했습니다.");
  }

  async function saveCurrentDraft() {
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
        workerCount: workerCountInputRef.current?.value ?? workerCount,
        workMemo: workMemoInputRef.current?.value ?? workMemo,
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

  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";
  const canShowSensitiveAccountingMetrics =
    showSensitiveAccountingMetrics && hasSensitiveAccountingMetrics(ledger);
  const nextStepHref = stepHref(ledger.storeId, ledger.closingDate, "review");
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
        stepLabel="6단계 근무인원/특이사항"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={["근무인원", "특이사항 메모"]}
        onRetry={handleRetry}
        retryDisabled={isSaving || isOriginalEditBlocked}
      />

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
              onChange={(event) => setWorkerCount(event.currentTarget.value)}
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

          {hqEditReasonRequired ? (
            <HqEditReasonField
              id="work-hq-edit-reason"
              value={hqEditReason}
              error={hqEditReasonError}
              disabled={isSaving || isOriginalEditBlocked}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          ) : null}

          <div className="bg-muted/40 rounded-md p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">비용 합계</span>
              <span className="font-semibold tabular-nums">
                {formatKrw(ledger.expenseTotal)}
              </span>
            </div>
            {canShowSensitiveAccountingMetrics ? (
              <>
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
              </>
            ) : null}
          </div>

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
                disabled={isSaving || isOriginalEditBlocked}
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
        </form>
      </section>
    </div>
  );
}
