"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { cn } from "~/lib/utils";
import {
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  getHistoricalEmployeeDetailAction,
} from "~/features/labor/employees-actions";
import type {
  EmployeeListItem,
  HistoricalEmployeeDetail,
  HistoricalEmployeeListItem,
} from "~/features/labor/employees-queries";

type EmployeeManagementClientProps = {
  initialEmployees: EmployeeListItem[];
  initialHistoricalEmployees: HistoricalEmployeeListItem[];
  // 상세 카드의 최근 근무 요약 기준 월.
  summaryMonth: string;
  // WO-D(2026-06-22): 직원 마스터 쓰기 권한 여부.
  // 권한이 없으면 추가/수정/비활성화 폼과 버튼을 숨긴다.
  canManage: boolean;
};

type FormState = {
  name: string;
  position: string;
  hireDate: string;
  phone: string;
  address: string;
  bankAccount: string;
  dailyWage: string;
  desiredInsuranceAmount: string;
};

const emptyForm: FormState = {
  name: "",
  position: "",
  hireDate: "",
  phone: "",
  address: "",
  bankAccount: "",
  dailyWage: "",
  desiredInsuranceAmount: "",
};

// WO-0806 #1-9: 데이터 포맷 예시는 별도 안내 박스 없이 placeholder로만 보여준다.
const PLACEHOLDERS = {
  name: "홍길동",
  position: "팀장 / 팀원",
  phone: "010-1234-5678",
  address: "서울시 강남구 테헤란로 123, 401호",
  bankAccount: "국민 123456-01-234567",
  amount: "원 (숫자만)",
} as const;

// WO-0806 #1-11: 실데이터상 직급은 사실상 팀장/팀원 2값이라 datalist로 좁히고
// 예외 직급은 직접 입력할 수 있게 둔다.
const POSITION_OPTIONS = ["팀장", "팀원"] as const;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function formatOptionalKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
}

function formatOptionalText(value: string | null) {
  return value === null || value === "" ? "-" : value;
}

function toFormState(employee: EmployeeListItem): FormState {
  return {
    name: employee.name,
    position: employee.position ?? "",
    hireDate: employee.hireDate,
    phone: employee.phone ?? "",
    address: employee.address ?? "",
    bankAccount: employee.bankAccount ?? "",
    dailyWage: employee.dailyWage === null ? "" : String(employee.dailyWage),
    desiredInsuranceAmount:
      employee.desiredInsuranceAmount === null
        ? ""
        : String(employee.desiredInsuranceAmount),
  };
}

function toOptionalText(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function toOptionalAmount(value: string): number | null {
  return value === "" ? null : Number(value);
}

type DirectoryEntry =
  | { source: "current"; employee: EmployeeListItem }
  | { source: "historical"; employee: HistoricalEmployeeListItem };

function directoryEntryKey(entry: DirectoryEntry) {
  return `${entry.source}:${entry.employee.id}`;
}

function directoryEntryLabel(entry: DirectoryEntry) {
  return entry.source === "current"
    ? `${entry.employee.name} · 현재${entry.employee.isActive ? "" : " · 비활성"}`
    : `${entry.employee.originalName} · 과거 Excel · ${entry.employee.firstSeenWorkDate}~${entry.employee.lastSeenWorkDate}`;
}

export function EmployeeManagementClient({
  initialEmployees,
  initialHistoricalEmployees,
  summaryMonth,
  canManage,
}: EmployeeManagementClientProps) {
  const [employees, setEmployees] =
    useState<EmployeeListItem[]>(initialEmployees);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [detail, setDetail] = useState<EmployeeListItem | null>(null);
  const [historicalDetail, setHistoricalDetail] =
    useState<HistoricalEmployeeDetail | null>(null);
  const [loadingHistoricalId, setLoadingHistoricalId] = useState<string | null>(
    null,
  );
  const [selectedDirectoryKey, setSelectedDirectoryKey] = useState("");
  const historicalRequestSequence = useRef(0);

  // 현재/과거를 한 검색 결과로 보여 주되 source badge와 별도 identity를 유지한다.
  // 이름이 같아도 하나로 합치지 않으며 상세 선택은 한 번에 1명뿐이다.
  const visibleEmployees = useMemo<DirectoryEntry[]>(() => {
    const keyword = search.trim().toLowerCase();
    const current: DirectoryEntry[] = employees
      .filter((emp) => showInactive || emp.isActive)
      .map((employee) => ({ source: "current", employee }));
    const historical: DirectoryEntry[] = initialHistoricalEmployees.map(
      (employee) => ({ source: "historical", employee }),
    );

    return [...current, ...historical].filter((entry) => {
      const name =
        entry.source === "current"
          ? entry.employee.name
          : entry.employee.originalName;
      return keyword === "" || name.toLowerCase().includes(keyword);
    });
  }, [employees, initialHistoricalEmployees, search, showInactive]);

  function openCurrentDetail(employee: EmployeeListItem) {
    historicalRequestSequence.current += 1;
    setLoadingHistoricalId(null);
    setSelectedDirectoryKey(`current:${employee.id}`);
    setHistoricalDetail(null);
    setDetail(employee);
  }

  async function openHistoricalDetail(employee: HistoricalEmployeeListItem) {
    const requestSequence = historicalRequestSequence.current + 1;
    historicalRequestSequence.current = requestSequence;
    setSelectedDirectoryKey(`historical:${employee.id}`);
    setDetail(null);
    setHistoricalDetail(null);
    setLoadingHistoricalId(employee.id);

    try {
      const loaded = await getHistoricalEmployeeDetailAction(employee.id);
      if (historicalRequestSequence.current !== requestSequence) return;
      if (!loaded) {
        setSelectedDirectoryKey("");
        toast.error("과거 직원 상세를 찾을 수 없습니다.");
        return;
      }
      setHistoricalDetail(loaded);
    } catch {
      if (historicalRequestSequence.current !== requestSequence) return;
      setSelectedDirectoryKey("");
      toast.error("과거 직원 상세를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (historicalRequestSequence.current === requestSequence) {
        setLoadingHistoricalId(null);
      }
    }
  }

  function handleDirectorySelection(key: string) {
    setSelectedDirectoryKey(key);
    if (!key) {
      historicalRequestSequence.current += 1;
      setLoadingHistoricalId(null);
      setDetail(null);
      setHistoricalDetail(null);
      return;
    }

    const selected = visibleEmployees.find(
      (entry) => directoryEntryKey(entry) === key,
    );
    if (!selected) return;
    if (selected.source === "current") openCurrentDetail(selected.employee);
    else void openHistoricalDetail(selected.employee);
  }

  function handleEdit(employee: EmployeeListItem) {
    setEditingId(employee.id);
    setForm(toFormState(employee));
    setFieldErrors({});
  }

  function handleCancel() {
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors({});
  }

  async function handleSave() {
    setIsSaving(true);
    setFieldErrors({});

    const payload = { ...form, isActive: true };
    const result = editingId
      ? await updateEmployee(editingId, payload)
      : await createEmployee(payload);

    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error(result.error.message ?? "저장에 실패했습니다.");
      return;
    }

    const savedFields = {
      name: form.name.trim(),
      hireDate: form.hireDate,
      position: toOptionalText(form.position),
      phone: toOptionalText(form.phone),
      address: toOptionalText(form.address),
      bankAccount: toOptionalText(form.bankAccount),
      dailyWage: toOptionalAmount(form.dailyWage),
      desiredInsuranceAmount: toOptionalAmount(form.desiredInsuranceAmount),
    };

    if (editingId) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingId ? { ...emp, ...savedFields } : emp,
        ),
      );
    } else {
      setEmployees((prev) => [
        ...prev,
        {
          id: result.data.id,
          isActive: true,
          currentMonthWorkdayCount: 0,
          currentMonthLaborAmount: 0,
          ...savedFields,
        },
      ]);
    }

    toast.success(
      editingId ? "직원 정보를 수정했습니다." : "직원을 추가했습니다.",
    );
    handleCancel();
  }

  async function handleDeactivate(id: string) {
    const result = await deactivateEmployee(id);

    if (!result.ok) {
      toast.error(result.error.message ?? "비활성화에 실패했습니다.");
      return;
    }

    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, isActive: false } : emp)),
    );

    toast.success("직원을 비활성화했습니다.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor="employee-search">직원 검색</FieldLabel>
          <Input
            id="employee-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름으로 검색"
          />
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 직원 포함
        </label>
        <Field className="w-full sm:w-80">
          <FieldLabel htmlFor="employee-directory-select">직원 선택</FieldLabel>
          <select
            id="employee-directory-select"
            className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedDirectoryKey}
            onChange={(event) => handleDirectorySelection(event.target.value)}
            disabled={loadingHistoricalId !== null}
          >
            <option value="">검색 결과에서 직원을 선택하세요</option>
            {visibleEmployees.map((entry) => (
              <option
                key={directoryEntryKey(entry)}
                value={directoryEntryKey(entry)}
              >
                {directoryEntryLabel(entry)}
              </option>
            ))}
          </select>
        </Field>
        <span className="text-muted-foreground h-9 text-sm leading-9">
          {visibleEmployees.length}명 / 전체{" "}
          {employees.length + initialHistoricalEmployees.length}명
        </span>
      </div>

      {!canManage ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          직원 정보는 조회만 가능합니다. 추가/수정/비활성화는 인건비 열람
          권한(LABOR_VIEW)이 필요합니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4 rounded-md border p-4">
          <h3 className="text-sm font-medium">
            {editingId ? "인사관리 카드 수정" : "인사관리 카드 등록"}
          </h3>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="employee-name">이름</FieldLabel>
              <Input
                id="employee-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={PLACEHOLDERS.name}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.name?.map((msg) => ({ message: msg }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-position">직급</FieldLabel>
              <Input
                id="employee-position"
                list="employee-position-options"
                value={form.position}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, position: e.target.value }))
                }
                placeholder={PLACEHOLDERS.position}
                disabled={isSaving}
              />
              <datalist id="employee-position-options">
                {POSITION_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <FieldError
                errors={fieldErrors.position?.map((msg) => ({ message: msg }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-hire-date">입사일</FieldLabel>
              <Input
                id="employee-hire-date"
                type="date"
                value={form.hireDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, hireDate: e.target.value }))
                }
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.hireDate?.map((msg) => ({ message: msg }))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="employee-phone">연락처</FieldLabel>
              <Input
                id="employee-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder={PLACEHOLDERS.phone}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.phone?.map((msg) => ({ message: msg }))}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="employee-address">주소</FieldLabel>
              <Input
                id="employee-address"
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder={PLACEHOLDERS.address}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.address?.map((msg) => ({ message: msg }))}
              />
            </Field>
          </div>

          {/* WO-0806 #1-5: 희망 현금은 인건비 리포트에서 자동계산하므로 입력란이 없다. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="employee-bank-account">계좌번호</FieldLabel>
              <Input
                id="employee-bank-account"
                value={form.bankAccount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bankAccount: e.target.value }))
                }
                placeholder={PLACEHOLDERS.bankAccount}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.bankAccount?.map((msg) => ({
                  message: msg,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-daily-wage">하루 인건비</FieldLabel>
              <Input
                id="employee-daily-wage"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.dailyWage}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dailyWage: e.target.value }))
                }
                placeholder={PLACEHOLDERS.amount}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.dailyWage?.map((msg) => ({ message: msg }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-insurance-amount">
                희망 4대보험 금액
              </FieldLabel>
              <Input
                id="employee-insurance-amount"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.desiredInsuranceAmount}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    desiredInsuranceAmount: e.target.value,
                  }))
                }
                placeholder={PLACEHOLDERS.amount}
                disabled={isSaving}
              />
              <FieldError
                errors={fieldErrors.desiredInsuranceAmount?.map((msg) => ({
                  message: msg,
                }))}
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "저장 중…" : "저장"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                취소
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        {/* WO-0806 #1: 계좌번호·주소는 목록에 노출하지 않고 상세에서만 보여준다. */}
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="pr-3 pb-2 font-normal">이름</th>
              <th className="pr-3 pb-2 font-normal">직급 / 일별 역할</th>
              <th className="pr-3 pb-2 font-normal">
                입사일 / 최초 확인 근무일
              </th>
              <th className="pr-3 pb-2 font-normal">연락처 / 근무 지점</th>
              <th className="pr-3 pb-2 text-right font-normal">하루 인건비</th>
              <th className="pr-3 pb-2 text-right font-normal">희망 4대보험</th>
              <th className="pr-3 pb-2 font-normal">상태</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-muted-foreground py-6 text-center"
                >
                  조건에 맞는 직원이 없습니다.
                </td>
              </tr>
            ) : (
              visibleEmployees.map((entry) => {
                if (entry.source === "historical") {
                  const emp = entry.employee;
                  return (
                    <tr
                      key={`historical:${emp.id}`}
                      className={cn(
                        "border-b last:border-0",
                        selectedDirectoryKey === `historical:${emp.id}` &&
                          "bg-muted/50",
                      )}
                    >
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{emp.originalName}</span>
                          <Badge variant="outline">과거 Excel 이름</Badge>
                          {selectedDirectoryKey === `historical:${emp.id}` ? (
                            <Badge>선택됨</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3">일별 역할</td>
                      <td className="text-muted-foreground py-2 pr-3">
                        <span className="block">최초 확인 근무일</span>
                        {emp.firstSeenWorkDate}
                      </td>
                      <td className="py-2 pr-3">
                        {emp.storeNames.join(", ") || "-"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">-</td>
                      <td className="py-2 pr-3 text-right tabular-nums">-</td>
                      <td className="py-2 pr-3">
                        {emp.reviewStatus === "REVIEW_REQUIRED"
                          ? "검토 필요"
                          : "과거"}
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={loadingHistoricalId === emp.id}
                          onClick={() => openHistoricalDetail(emp)}
                        >
                          {loadingHistoricalId === emp.id
                            ? "불러오는 중…"
                            : "상세"}
                        </Button>
                      </td>
                    </tr>
                  );
                }

                const emp = entry.employee;
                return (
                  <tr
                    key={`current:${emp.id}`}
                    className={cn(
                      "border-b last:border-0",
                      selectedDirectoryKey === `current:${emp.id}` &&
                        "bg-muted/50",
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{emp.name}</span>
                        <Badge>현재</Badge>
                        {selectedDirectoryKey === `current:${emp.id}` ? (
                          <Badge variant="outline">선택됨</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {formatOptionalText(emp.position)}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {emp.hireDate}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {formatOptionalText(emp.phone)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatOptionalKrw(emp.dailyWage)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatOptionalKrw(emp.desiredInsuranceAmount)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          emp.isActive
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {emp.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openCurrentDetail(emp)}
                        >
                          상세
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(emp)}
                            >
                              수정
                            </Button>
                            {emp.isActive && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivate(emp.id)}
                              >
                                비활성화
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name} 인사관리 카드</DialogTitle>
            <DialogDescription>
              희망 현금은 인건비 리포트에서 월 인건비 합계로 자동계산합니다.
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {(
                [
                  ["직급", formatOptionalText(detail.position)],
                  ["입사일", detail.hireDate],
                  ["연락처", formatOptionalText(detail.phone)],
                  ["주소", formatOptionalText(detail.address)],
                  ["계좌번호", formatOptionalText(detail.bankAccount)],
                  ["하루 인건비", formatOptionalKrw(detail.dailyWage)],
                  [
                    "희망 4대보험",
                    formatOptionalKrw(detail.desiredInsuranceAmount),
                  ],
                  [
                    `${summaryMonth} 근무일수`,
                    `${detail.currentMonthWorkdayCount.toLocaleString("ko-KR")}일`,
                  ],
                  [
                    `${summaryMonth} 급여 합계`,
                    formatOptionalKrw(detail.currentMonthLaborAmount),
                  ],
                  ["상태", detail.isActive ? "활성" : "비활성"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={historicalDetail !== null}
        onOpenChange={(open) => !open && setHistoricalDetail(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {historicalDetail?.originalName} 과거 이름 그룹 상세
            </DialogTitle>
            <DialogDescription>
              같은 원본 이름의 기록을 묶은 과거 Excel 자료이며 한 사람으로
              확정한 정보가 아닙니다. 최초 날짜는 입사일이 아니라 최초 확인
              근무일입니다.
            </DialogDescription>
          </DialogHeader>
          {historicalDetail ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">원본 이름</dt>
                <dd>{historicalDetail.originalName}</dd>
                <dt className="text-muted-foreground">상태</dt>
                <dd>
                  {historicalDetail.reviewStatus === "REVIEW_REQUIRED"
                    ? "검토 필요"
                    : "현재 직원과 미연결"}
                </dd>
                <dt className="text-muted-foreground">최초 확인 근무일</dt>
                <dd>{historicalDetail.firstSeenWorkDate}</dd>
                <dt className="text-muted-foreground">마지막 확인 근무일</dt>
                <dd>{historicalDetail.lastSeenWorkDate}</dd>
                <dt className="text-muted-foreground">근무 지점</dt>
                <dd>{historicalDetail.storeNames.join(", ") || "-"}</dd>
                <dt className="text-muted-foreground">역할 기록</dt>
                <dd>
                  팀장 {historicalDetail.leadRoleCount.toLocaleString("ko-KR")}
                  건 · 팀원{" "}
                  {historicalDetail.memberRoleCount.toLocaleString("ko-KR")}건
                </dd>
              </dl>

              <div>
                <h4 className="mb-2 text-sm font-medium">날짜별 역할 이력</h4>
                <div className="max-h-96 overflow-auto rounded-md border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-card sticky top-0">
                      <tr className="border-b text-left">
                        <th className="px-3 py-2 font-normal">근무일</th>
                        <th className="px-3 py-2 font-normal">지점</th>
                        <th className="px-3 py-2 font-normal">역할</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalDetail.roleHistory.map((role) => (
                        <tr key={role.id} className="border-b last:border-0">
                          <td className="px-3 py-2 tabular-nums">
                            {role.businessDate}
                          </td>
                          <td className="px-3 py-2">{role.storeName}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline">{role.role}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
