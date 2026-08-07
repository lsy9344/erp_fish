"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import {
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} from "~/features/labor/employees-actions";
import type { EmployeeListItem } from "~/features/labor/employees-queries";

type EmployeeManagementClientProps = {
  initialEmployees: EmployeeListItem[];
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

export function EmployeeManagementClient({
  initialEmployees,
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

  // WO-0806 #1-7: 직원 수가 수십 명 규모라 서버 왕복 없이 클라이언트에서 거른다.
  const visibleEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return employees.filter((emp) => {
      if (!showInactive && !emp.isActive) {
        return false;
      }

      return keyword === "" || emp.name.toLowerCase().includes(keyword);
    });
  }, [employees, search, showInactive]);

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
        { id: result.data.id, isActive: true, ...savedFields },
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
        <span className="text-muted-foreground h-9 text-sm leading-9">
          {visibleEmployees.length}명 / 전체 {employees.length}명
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
              <th className="pr-3 pb-2 font-normal">직급</th>
              <th className="pr-3 pb-2 font-normal">입사일</th>
              <th className="pr-3 pb-2 font-normal">연락처</th>
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
              visibleEmployees.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{emp.name}</td>
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
                        onClick={() => setDetail(emp)}
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
              ))
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
    </div>
  );
}
