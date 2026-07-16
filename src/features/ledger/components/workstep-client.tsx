"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  saveLedgerLaborInfo,
  saveLedgerWorkInfo,
} from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { HqEditReasonField } from "~/features/ledger/components/hq-edit-reason-field";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import {
  formatKrwInput,
  parseKrwInputValue,
  toRawKrwInputValue,
} from "~/features/ledger/components/krw-input-format";
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
import type {
  LedgerCostStepData,
  StoreManagerLedgerCostStepData,
} from "~/features/ledger/types";
import type { ActionResult, FieldErrors } from "~/lib/action-result";

type WorkLedgerData = StoreManagerLedgerCostStepData | LedgerCostStepData;

type LaborLine = {
  id: string;
  employeeId: string;
  workerName: string;
  amount: string;
  lateMemo: string;
  earlyLeaveMemo: string;
  specialMemo: string;
};

export type WorkStepEmployeeOption = {
  id: string;
  name: string;
};

type WorkStepClientProps = {
  storeName: string;
  initialLedger: WorkLedgerData;
  currentStep: "sales" | "cost" | "purchase" | "work";
  saveAction?: (input: unknown) => Promise<ActionResult<WorkLedgerData>>;
  laborSaveAction?: (input: unknown) => Promise<ActionResult<WorkLedgerData>>;
  employeeOptions?: WorkStepEmployeeOption[];
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

function createLaborLineId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createLaborLine(): LaborLine {
  return {
    id: createLaborLineId(),
    employeeId: "",
    workerName: "",
    amount: "",
    lateMemo: "",
    earlyLeaveMemo: "",
    specialMemo: "",
  };
}

function toLaborLines(items: WorkLedgerData["laborItems"]): LaborLine[] {
  // WO-10(2026-06-28): 급여액은 본사 전용이라 지점장 응답 라인에는 amount가 없다.
  // 본사(LedgerCostStepData)일 때만 amount를 채우고, 지점장은 빈 문자열로 둔다.
  return items.map<LaborLine>((item) => ({
    id: item.id,
    employeeId: item.employeeId ?? "",
    workerName: item.workerName,
    amount: "amount" in item ? formatKrwInput(String(item.amount)) : "",
    lateMemo: item.lateMemo ?? "",
    earlyLeaveMemo: item.earlyLeaveMemo ?? "",
    specialMemo: item.specialMemo ?? "",
  }));
}

function areLaborLinesEqual(left: LaborLine[], right: LaborLine[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getDraftPayrollTotal(lines: LaborLine[]) {
  return lines.reduce((sum, line) => sum + parseKrwInputValue(line.amount), 0);
}

// 급여 행 기준 참고 인원: 직원이 연결된 행은 employeeId, 그 외에는 trim한 이름으로
// 중복 제거한다. 권위 있는 값이 아니라 사용자 확인을 돕는 표시값이다.
function getDraftLaborHeadcount(lines: LaborLine[]) {
  const keys = new Set<string>();

  for (const line of lines) {
    const employeeId = line.employeeId.trim();
    const workerName = line.workerName.trim();

    if (employeeId.length > 0) {
      keys.add(`employee:${employeeId}`);
      continue;
    }

    if (workerName.length > 0) {
      keys.add(`name:${workerName}`);
    }
  }

  return keys.size;
}

export function WorkStepClient({
  storeName,
  initialLedger,
  currentStep = "work",
  saveAction = saveLedgerWorkInfo,
  laborSaveAction = saveLedgerLaborInfo,
  employeeOptions = [],
  showStepNavigation = true,
  showSensitiveAccountingMetrics = false,
  ledgerLabel = "오늘 장부",
  hqEditReasonRequired = false,
}: WorkStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const workerCountInputRef = useRef<HTMLInputElement>(null);
  const workMemoInputRef = useRef<HTMLTextAreaElement>(null);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const laborHqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);

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

  const [laborItems, setLaborItems] = useState(() =>
    toLaborLines(initialLedger.laborItems),
  );
  const [laborHqEditReason, setLaborHqEditReason] = useState("");
  const [isLaborSaving, setIsLaborSaving] = useState(false);
  const [laborResultMessage, setLaborResultMessage] = useState<string | null>(
    null,
  );
  const [laborFieldErrors, setLaborFieldErrors] = useState<FieldErrors>({});
  const [laborFormError, setLaborFormError] = useState<string | null>(null);

  const saveConflict = useSaveConflictDialog();
  const workerCountError = fieldErrors.workerCount?.[0];
  const workMemoError = fieldErrors.workMemo?.[0];
  const hqEditReasonError = fieldErrors.reason?.[0];
  const laborHqEditReasonError = laborFieldErrors.reason?.[0];
  const isDirty =
    workerCount !==
      (ledger.workerCount === null ? "" : String(ledger.workerCount)) ||
    workMemo !== (ledger.workMemo ?? "");
  const isLaborDirty = !areLaborLinesEqual(
    laborItems,
    toLaborLines(ledger.laborItems),
  );
  const previousInitialLedgerRef = useRef(initialLedger);

  useLedgerUpdatedAtSync(ledger.id, (updatedAt) => {
    setLedger((current) => ({ ...current, updatedAt }));
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const previousInitialLedger = previousInitialLedgerRef.current;
    const previousWorkerCount =
      previousInitialLedger.workerCount === null
        ? ""
        : String(previousInitialLedger.workerCount);
    const previousLaborItems = toLaborLines(previousInitialLedger.laborItems);
    const nextLaborItems = toLaborLines(initialLedger.laborItems);

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
    setLaborItems((current) =>
      areLaborLinesEqual(current, previousLaborItems)
        ? nextLaborItems
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

  function fillLaborLedger(next: WorkLedgerData) {
    setLedger(next);
    setLaborItems(toLaborLines(next.laborItems));
    notifyLedgerUpdated(next.id, next.updatedAt);
    const savedCount = next.laborItems.length;
    const message =
      savedCount > 0
        ? showSensitiveAccountingMetrics
          ? `급여 항목 ${savedCount}건을 저장했습니다.`
          : `근무자 ${savedCount}명을 저장했습니다.`
        : showSensitiveAccountingMetrics
          ? "급여 항목을 저장했습니다."
          : "근무자를 저장했습니다.";
    setLaborResultMessage(message);
    toast.success(message);
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

  async function saveCurrentLaborDraft() {
    setIsLaborSaving(true);
    setLaborResultMessage(null);
    setLaborFormError(null);
    setLaborFieldErrors({});

    try {
      const result = await laborSaveAction({
        ledgerId: ledger.id,
        storeId: ledger.storeId,
        closingDate: getKstLedgerDateParam(ledger.closingDate),
        version: ledger.version,
        ledgerUpdatedAt: ledger.updatedAt,
        // WO-10(2026-06-28): 급여액은 본사만 입력한다. 지점장 저장 payload에는 amount를
        // 넣지 않는다(서버 스키마가 amount 키를 거부하고 기존 금액을 이월한다).
        labor: laborItems.map((line) => ({
          employeeId: line.employeeId || null,
          workerName: line.workerName,
          ...(showSensitiveAccountingMetrics
            ? { amount: toRawKrwInputValue(line.amount) }
            : {}),
          lateMemo: line.lateMemo,
          earlyLeaveMemo: line.earlyLeaveMemo,
          specialMemo: line.specialMemo,
        })),
        ...(hqEditReasonRequired ? { reason: laborHqEditReason } : {}),
      });

      if (!result.ok) {
        if (saveConflict.captureConflict(result)) {
          setLaborFormError(result.error.message);
          toast.error(result.error.message);
          return false;
        }

        const nextErrors = result.error.fieldErrors ?? {};

        setLaborFieldErrors(nextErrors);
        setLaborFormError(result.error.message);
        toast.error(result.error.message);
        return false;
      }

      fillLaborLedger(result.data);
      setLaborFormError(null);
      return true;
    } catch {
      setLaborFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      setLaborResultMessage(null);
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsLaborSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentDraft();
  }

  async function handleLaborSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentLaborDraft();
  }

  function handleRetry() {
    if (!isHydrated || !formRef.current || isSaving) {
      return;
    }

    formRef.current.requestSubmit();
  }

  function clearLaborRowState() {
    setLaborFieldErrors({});
    setLaborFormError(null);
    setLaborResultMessage(null);
  }

  function addLaborLine() {
    clearLaborRowState();
    setLaborItems((current) => [...current, createLaborLine()]);
  }

  function removeLaborLine(lineId: string) {
    clearLaborRowState();
    setLaborItems((current) => current.filter((line) => line.id !== lineId));
  }

  function updateLaborLine(lineId: string, next: Partial<LaborLine>) {
    clearLaborRowState();
    setLaborItems((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...next } : line)),
    );
  }

  const isOriginalEditBlocked = isLedgerReadOnly(ledger.status);
  const canShowSensitiveAccountingMetrics =
    showSensitiveAccountingMetrics && hasSensitiveAccountingMetrics(ledger);
  const draftPayrollTotal = getDraftPayrollTotal(laborItems);
  const draftLaborHeadcount = getDraftLaborHeadcount(laborItems);
  const parsedWorkerCount = /^\d+$/.test(workerCount.trim())
    ? Number(workerCount.trim())
    : null;
  const showLaborHeadcountHint =
    parsedWorkerCount !== null &&
    parsedWorkerCount > 0 &&
    draftLaborHeadcount > 0 &&
    parsedWorkerCount !== draftLaborHeadcount;
  const nextStepHref = stepHref(ledger.storeId, ledger.closingDate, "sales");
  const guard = useUnsavedStepGuard({
    isDirty: isDirty || isLaborDirty,
    onSave: async () => {
      const workSaved = isDirty ? await saveCurrentDraft() : true;
      const laborSaved = isLaborDirty ? await saveCurrentLaborDraft() : true;

      return workSaved && laborSaved;
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <UnsavedChangeDialog
        open={guard.isDialogOpen}
        isSaving={isSaving || isLaborSaving}
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
        stepLabel="5단계: 근무인원/이름"
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={["근무인원", "특이사항 메모"]}
        onRetry={handleRetry}
        retryDisabled={!isHydrated || isSaving || isOriginalEditBlocked}
      />

      <section className="bg-card text-card-foreground rounded-lg border p-4">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">근무 요약</p>
            <p className="text-muted-foreground text-sm">
              근무자 명단에 없는 사람도 포함해 실제 근무한 인원을 입력합니다.
            </p>
          </div>

          <Field data-invalid={Boolean(workerCountError)}>
            <FieldLabel htmlFor="worker-count">근무인원</FieldLabel>
            <Input
              ref={workerCountInputRef}
              id="worker-count"
              inputMode="numeric"
              autoComplete="off"
              value={workerCount}
              disabled={!isHydrated || isSaving || isOriginalEditBlocked}
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
              disabled={!isHydrated || isSaving || isOriginalEditBlocked}
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
              disabled={!isHydrated || isSaving || isOriginalEditBlocked}
              inputRef={hqEditReasonInputRef}
              onChange={(value) => {
                setHqEditReason(value);
                setResultMessage(null);
              }}
            />
          ) : null}

          <div className="bg-muted/40 rounded-md p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">지출 합계</span>
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
          </div>
        </form>
        <form
          onSubmit={handleLaborSubmit}
          className="mt-4 flex flex-col gap-3 border-t pt-4"
          noValidate
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {showSensitiveAccountingMetrics ? "급여 / 인건비" : "근무자"}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={addLaborLine}
              disabled={!isHydrated || isLaborSaving || isOriginalEditBlocked}
              className="min-h-11 gap-2"
            >
              <PlusIcon data-icon="inline-start" />
              직원 추가
            </Button>
          </div>

          {laborItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {showSensitiveAccountingMetrics
                ? "등록된 급여 항목이 없습니다. 직원을 추가해 주세요."
                : "등록된 근무자가 없습니다. 직원을 추가해 주세요."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {laborItems.map((line, index) => {
                const nameError =
                  laborFieldErrors[`labor.${index}.workerName`]?.[0];
                const amountError =
                  laborFieldErrors[`labor.${index}.amount`]?.[0];
                const lateError =
                  laborFieldErrors[`labor.${index}.lateMemo`]?.[0];
                const earlyError =
                  laborFieldErrors[`labor.${index}.earlyLeaveMemo`]?.[0];
                const specialError =
                  laborFieldErrors[`labor.${index}.specialMemo`]?.[0];
                const nameErrorId = `labor-name-${line.id}-error`;
                const amountErrorId = `labor-amount-${line.id}-error`;
                const lateErrorId = `labor-late-${line.id}-error`;
                const earlyErrorId = `labor-early-${line.id}-error`;
                const specialErrorId = `labor-special-${line.id}-error`;

                return (
                  <div
                    key={line.id}
                    className="grid gap-2 rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-xs font-medium">
                        직원 {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeLaborLine(line.id)}
                        disabled={
                          !isHydrated || isLaborSaving || isOriginalEditBlocked
                        }
                        className="min-h-11 gap-2"
                      >
                        <Trash2Icon data-icon="inline-start" />
                        삭제
                      </Button>
                    </div>

                    {employeeOptions.length > 0 ? (
                      <Field>
                        <FieldLabel htmlFor={`labor-employee-${line.id}`}>
                          직원 연결 (선택)
                        </FieldLabel>
                        <select
                          id={`labor-employee-${line.id}`}
                          value={line.employeeId}
                          disabled={
                            !isHydrated ||
                            isLaborSaving ||
                            isOriginalEditBlocked
                          }
                          onChange={(event) => {
                            const employeeId = event.currentTarget.value;
                            const selected = employeeOptions.find(
                              (option) => option.id === employeeId,
                            );

                            updateLaborLine(line.id, {
                              employeeId,
                              // 직원을 선택하면 이름을 자동 채우되, 자유 텍스트 수정은 그대로 허용한다.
                              ...(selected
                                ? { workerName: selected.name }
                                : {}),
                            });
                          }}
                          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                        >
                          <option value="">연결 안 함 (자유 입력)</option>
                          {employeeOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        {showSensitiveAccountingMetrics ? (
                          <p className="text-muted-foreground mt-1 text-xs">
                            직원을 연결하면 월간 직원별 급여 롤업에 합산됩니다.
                            연결하지 않으면 “미연결” 합계로만 집계되어 직원별
                            분석에서 빠집니다.
                          </p>
                        ) : null}
                      </Field>
                    ) : null}

                    <Field data-invalid={Boolean(nameError)}>
                      <FieldLabel htmlFor={`labor-name-${line.id}`}>
                        직원명
                      </FieldLabel>
                      <Input
                        id={`labor-name-${line.id}`}
                        inputMode="text"
                        autoComplete="off"
                        maxLength={50}
                        value={line.workerName}
                        disabled={
                          !isHydrated || isLaborSaving || isOriginalEditBlocked
                        }
                        onChange={(event) =>
                          updateLaborLine(line.id, {
                            workerName: event.currentTarget.value,
                          })
                        }
                        className="min-h-11"
                        aria-invalid={Boolean(nameError)}
                        aria-describedby={nameError ? nameErrorId : undefined}
                      />
                      {nameError ? (
                        <FieldError id={nameErrorId}>{nameError}</FieldError>
                      ) : null}
                    </Field>

                    {/* WO-10(2026-06-28): 급여 금액 입력/표시는 본사 전용이다. */}
                    {showSensitiveAccountingMetrics ? (
                      <Field data-invalid={Boolean(amountError)}>
                        <FieldLabel htmlFor={`labor-amount-${line.id}`}>
                          급여 금액
                        </FieldLabel>
                        <Input
                          id={`labor-amount-${line.id}`}
                          inputMode="numeric"
                          autoComplete="off"
                          value={line.amount}
                          disabled={
                            !isHydrated ||
                            isLaborSaving ||
                            isOriginalEditBlocked
                          }
                          onChange={(event) =>
                            updateLaborLine(line.id, {
                              amount: formatKrwInput(event.currentTarget.value),
                            })
                          }
                          className="min-h-11 tabular-nums"
                          aria-invalid={Boolean(amountError)}
                          aria-describedby={
                            amountError ? amountErrorId : undefined
                          }
                        />
                        <p
                          id={`labor-amount-${line.id}-preview`}
                          className="text-muted-foreground mt-1 text-xs tabular-nums"
                        >
                          표시: {formatKrw(parseKrwInputValue(line.amount))}
                        </p>
                        {amountError ? (
                          <FieldError id={amountErrorId}>
                            {amountError}
                          </FieldError>
                        ) : null}
                      </Field>
                    ) : null}

                    <Field data-invalid={Boolean(lateError)}>
                      <FieldLabel htmlFor={`labor-late-${line.id}`}>
                        지각 (선택)
                      </FieldLabel>
                      <Input
                        id={`labor-late-${line.id}`}
                        inputMode="text"
                        maxLength={500}
                        value={line.lateMemo}
                        disabled={
                          !isHydrated || isLaborSaving || isOriginalEditBlocked
                        }
                        onChange={(event) =>
                          updateLaborLine(line.id, {
                            lateMemo: event.currentTarget.value,
                          })
                        }
                        aria-invalid={Boolean(lateError)}
                        aria-describedby={lateError ? lateErrorId : undefined}
                      />
                      {lateError ? (
                        <FieldError id={lateErrorId}>{lateError}</FieldError>
                      ) : null}
                    </Field>

                    <Field data-invalid={Boolean(earlyError)}>
                      <FieldLabel htmlFor={`labor-early-${line.id}`}>
                        조퇴 (선택)
                      </FieldLabel>
                      <Input
                        id={`labor-early-${line.id}`}
                        inputMode="text"
                        maxLength={500}
                        value={line.earlyLeaveMemo}
                        disabled={
                          !isHydrated || isLaborSaving || isOriginalEditBlocked
                        }
                        onChange={(event) =>
                          updateLaborLine(line.id, {
                            earlyLeaveMemo: event.currentTarget.value,
                          })
                        }
                        aria-invalid={Boolean(earlyError)}
                        aria-describedby={earlyError ? earlyErrorId : undefined}
                      />
                      {earlyError ? (
                        <FieldError id={earlyErrorId}>{earlyError}</FieldError>
                      ) : null}
                    </Field>

                    <Field data-invalid={Boolean(specialError)}>
                      <FieldLabel htmlFor={`labor-special-${line.id}`}>
                        특이사항 (선택)
                      </FieldLabel>
                      <Input
                        id={`labor-special-${line.id}`}
                        inputMode="text"
                        maxLength={500}
                        value={line.specialMemo}
                        disabled={
                          !isHydrated || isLaborSaving || isOriginalEditBlocked
                        }
                        onChange={(event) =>
                          updateLaborLine(line.id, {
                            specialMemo: event.currentTarget.value,
                          })
                        }
                        aria-invalid={Boolean(specialError)}
                        aria-describedby={
                          specialError ? specialErrorId : undefined
                        }
                      />
                      {specialError ? (
                        <FieldError id={specialErrorId}>
                          {specialError}
                        </FieldError>
                      ) : null}
                    </Field>
                  </div>
                );
              })}
            </div>
          )}

          {showSensitiveAccountingMetrics ? (
            <div className="bg-muted/40 rounded-md p-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">입력 중 급여 합계</span>
                <span className="font-semibold tabular-nums">
                  {formatKrw(draftPayrollTotal)}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  마지막 서버 저장 급여 합계
                </span>
                <span className="font-semibold tabular-nums">
                  {formatKrw(
                    "payrollTotal" in ledger ? ledger.payrollTotal : 0,
                  )}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  급여 행 기준 참고 인원
                </span>
                <span className="font-semibold tabular-nums">
                  {draftLaborHeadcount}명
                </span>
              </div>
              {showLaborHeadcountHint ? (
                <p className="text-muted-foreground mt-2 text-sm">
                  근무인원과 급여 행 기준 참고 인원이 다릅니다. 급여 미등록
                  근무자가 있으면 그대로 저장할 수 있습니다.
                </p>
              ) : null}
            </div>
          ) : null}

          {hqEditReasonRequired ? (
            <HqEditReasonField
              id="labor-hq-edit-reason"
              value={laborHqEditReason}
              error={laborHqEditReasonError}
              disabled={!isHydrated || isLaborSaving || isOriginalEditBlocked}
              inputRef={laborHqEditReasonInputRef}
              onChange={(value) => {
                setLaborHqEditReason(value);
                setLaborResultMessage(null);
              }}
            />
          ) : null}

          {laborResultMessage ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
              <p
                className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                role="status"
                aria-live="polite"
              >
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                {laborResultMessage}
              </p>
            </div>
          ) : null}

          {laborFormError ? (
            <p className="text-destructive text-sm" role="alert">
              {laborFormError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="submit"
              variant={laborResultMessage ? "outline" : "default"}
              className="min-h-11 w-full sm:w-auto"
              disabled={!isHydrated || isLaborSaving || isOriginalEditBlocked}
            >
              {isLaborSaving
                ? "저장 중..."
                : showSensitiveAccountingMetrics
                  ? "급여 저장"
                  : "근무자 저장"}
            </Button>
            {resultMessage || laborResultMessage ? (
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                disabled={!isHydrated}
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
