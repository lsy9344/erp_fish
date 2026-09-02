"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
} from "~/features/ledger/components/krw-input-format";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { UnsavedChangeDialog } from "~/features/ledger/components/unsaved-change-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { useUnsavedStepGuard } from "~/features/ledger/components/use-unsaved-step-guard";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import {
  closedEditSaveSuccessMessage,
  isLedgerEditableForActor,
} from "~/features/ledger/status-policy";
import {
  notifyLedgerUpdated,
  useLedgerSync,
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
  label: string;
  isActive: boolean;
  position?: string | null;
};

// 2026-09-02 요청: 근무 단계에서도 직원을 매니저 / 팀원으로 나눠 고른다.
// 직원 카드에 직급이 없으면 마지막 그룹으로 모은다.
const EMPLOYEE_POSITION_GROUPS = ["매니저", "팀원"] as const;

function groupEmployeeOptions(options: WorkStepEmployeeOption[]) {
  const groups: { label: string; options: WorkStepEmployeeOption[] }[] = [
    ...EMPLOYEE_POSITION_GROUPS.map((label) => ({
      label,
      options: options.filter((option) => option.position === label),
    })),
    {
      label: "직급 미지정",
      options: options.filter(
        (option) =>
          !EMPLOYEE_POSITION_GROUPS.includes(
            option.position as (typeof EMPLOYEE_POSITION_GROUPS)[number],
          ),
      ),
    },
  ];

  return groups.filter((group) => group.options.length > 0);
}

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
  // DESIGN.md D5: 서버가 판정한 마감 편집 허용 여부. 표시 제어만 하며 기본 false.
  closedEditAllowed?: boolean;
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
  closedEditAllowed = false,
}: WorkStepClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const workMemoInputRef = useRef<HTMLTextAreaElement>(null);
  const hqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const laborHqEditReasonInputRef = useRef<HTMLInputElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const [ledger, setLedger] = useState(initialLedger);
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
  const workMemoError = fieldErrors.workMemo?.[0];
  const hqEditReasonError = fieldErrors.reason?.[0];
  const laborHqEditReasonError = laborFieldErrors.reason?.[0];
  const isDirty = workMemo !== (ledger.workMemo ?? "");
  const isLaborDirty = !areLaborLinesEqual(
    laborItems,
    toLaborLines(ledger.laborItems),
  );
  const previousInitialLedgerRef = useRef(initialLedger);

  useLedgerSync(ledger.id, (snapshot) => {
    setLedger((current) =>
      snapshot.version < current.version
        ? current
        : {
            ...current,
            updatedAt: snapshot.updatedAt,
            version: snapshot.version,
            expenseTotal: snapshot.expenseTotal ?? current.expenseTotal,
          },
    );
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const previousInitialLedger = previousInitialLedgerRef.current;
    const previousLaborItems = toLaborLines(previousInitialLedger.laborItems);
    const nextLaborItems = toLaborLines(initialLedger.laborItems);

    setLedger(initialLedger);
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
    if (isSaving || (!workMemoError && !hqEditReasonError)) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (workMemoError) {
        workMemoInputRef.current?.focus();
        return;
      }

      if (hqEditReasonError) {
        hqEditReasonInputRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isSaving, workMemoError, hqEditReasonError]);

  function fillLedger(next: WorkLedgerData) {
    setLedger(next);
    setWorkMemo(next.workMemo ?? "");
    notifyLedgerUpdated(next);
    setResultMessage("저장됐습니다.");
    toast.success("특이사항 메모를 저장했습니다.");
  }

  function fillLaborLedger(next: WorkLedgerData) {
    setLedger(next);
    setLaborItems(toLaborLines(next.laborItems));
    notifyLedgerUpdated(next);
    const savedCount = next.laborItems.length;
    const baseMessage =
      savedCount > 0
        ? showSensitiveAccountingMetrics
          ? `급여 항목 ${savedCount}건을 저장했습니다.`
          : `근무자 ${savedCount}명을 저장했습니다.`
        : showSensitiveAccountingMetrics
          ? "저장됐습니다."
          : "근무자를 저장했습니다.";
    // DESIGN.md D7: 급여 저장도 마감 유지 성공 문구를 동일하게 보여준다.
    const message = closedEditAllowed
      ? `${baseMessage} ${closedEditSaveSuccessMessage}`
      : baseMessage;
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
        // 2026-09-02 요청: 급여 금액 입력 칸을 없앴다. 금액은 서버가 직원 카드의
        // 하루 인건비를 스냅샷하거나 기존 금액을 이월해서 정한다.
        labor: laborItems.map((line) => ({
          employeeId: line.employeeId || null,
          workerName: line.workerName,
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

  const isOriginalEditBlocked = !isLedgerEditableForActor(ledger.status, {
    closedEditAllowed,
  });
  const canShowSensitiveAccountingMetrics =
    showSensitiveAccountingMetrics && hasSensitiveAccountingMetrics(ledger);
  const draftPayrollTotal = getDraftPayrollTotal(laborItems);
  // 2026-09-02 요청: 근무인원은 직접 쓰지 않고 직원 연결을 마친 급여 행 수로 정한다.
  const draftWorkerCount = laborItems.length;
  const employeeOptionGroups = groupEmployeeOptions(employeeOptions);
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
        stepLabel={
          showSensitiveAccountingMetrics
            ? "5단계 근무/인건비"
            : "5단계: 근무인원/이름"
        }
        authorDisplayName={ledger.authorDisplayName}
        updatedAt={ledger.updatedAt}
        isSaving={isSaving}
        errorMessage={formError}
        successMessage={resultMessage}
        unsavedFields={["특이사항 메모"]}
        onRetry={handleRetry}
        retryDisabled={!isHydrated || isSaving || isOriginalEditBlocked}
        closedEditRetained={closedEditAllowed}
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
              근무인원은 아래 직원 연결을 저장하면 자동으로 정해집니다.
            </p>
          </div>

          <div className="bg-muted/40 flex justify-between gap-2 rounded-md p-3 text-sm">
            <span className="text-muted-foreground">총 근무인원</span>
            <span className="font-semibold tabular-nums">
              {ledger.workerCount === null ? "0명" : `${ledger.workerCount}명`}
            </span>
          </div>

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
                const lateError =
                  laborFieldErrors[`labor.${index}.lateMemo`]?.[0];
                const earlyError =
                  laborFieldErrors[`labor.${index}.earlyLeaveMemo`]?.[0];
                const specialError =
                  laborFieldErrors[`labor.${index}.specialMemo`]?.[0];
                const nameErrorId = `labor-name-${line.id}-error`;
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
                      <Field data-invalid={Boolean(nameError)}>
                        <FieldLabel htmlFor={`labor-employee-${line.id}`}>
                          직원 (매니저 / 팀원)
                        </FieldLabel>
                        <Select
                          value={line.employeeId}
                          disabled={
                            !isHydrated ||
                            isLaborSaving ||
                            isOriginalEditBlocked
                          }
                          onValueChange={(employeeId) => {
                            const selected = employeeOptions.find(
                              (option) => option.id === employeeId,
                            );

                            // 직원명 입력 칸을 없앴으므로 이름은 선택한 직원 카드에서만 온다.
                            updateLaborLine(line.id, {
                              employeeId,
                              workerName: selected?.name ?? "",
                            });
                          }}
                        >
                          <SelectTrigger
                            id={`labor-employee-${line.id}`}
                            className="min-h-11 w-full"
                          >
                            <SelectValue placeholder="직원을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {employeeOptionGroups.map((group) => (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {group.options.map((option) => (
                                  <SelectItem
                                    key={option.id}
                                    value={option.id}
                                    disabled={!option.isActive}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          직원명과 급여 금액은 인사관리에 등록된 직원 카드에서
                          자동으로 가져옵니다. 바꾸려면 해당 직원을 삭제한 뒤
                          다시 추가하세요.
                        </FieldDescription>
                        {nameError ? (
                          <FieldError id={nameErrorId}>
                            직원을 선택해 주세요.
                          </FieldError>
                        ) : null}
                      </Field>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        인사관리에 등록된 직원이 없습니다. 먼저 직원을 등록해
                        주세요.
                      </p>
                    )}

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

          <div className="bg-muted/40 rounded-md p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                저장하면 반영될 총 근무인원
              </span>
              <span className="font-semibold tabular-nums">
                {draftWorkerCount}명
              </span>
            </div>
            {showSensitiveAccountingMetrics ? (
              <>
                <div className="mt-2 flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    직원 카드 기준 급여 합계
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatKrw(draftPayrollTotal)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    마지막 서버 저장 합계
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatKrw(
                      "payrollTotal" in ledger ? ledger.payrollTotal : 0,
                    )}
                  </span>
                </div>
              </>
            ) : null}
          </div>

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
