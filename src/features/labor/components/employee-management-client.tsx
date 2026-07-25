"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
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
  // WO-D(2026-06-22): 직원 마스터 쓰기 권한(SETTINGS_MANAGE) 여부.
  // 권한이 없으면 추가/수정/비활성화 폼과 버튼을 숨긴다.
  canManage: boolean;
};

type FormState = {
  name: string;
  hireDate: string;
  dailyWage: string;
  desiredInsuranceAmount: string;
  desiredCashAmount: string;
};

const emptyForm: FormState = {
  name: "",
  hireDate: "",
  dailyWage: "",
  desiredInsuranceAmount: "",
  desiredCashAmount: "",
};

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function formatOptionalKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
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

  function handleEdit(employee: EmployeeListItem) {
    setEditingId(employee.id);
    setForm({
      name: employee.name,
      hireDate: employee.hireDate,
      dailyWage: employee.dailyWage === null ? "" : String(employee.dailyWage),
      desiredInsuranceAmount:
        employee.desiredInsuranceAmount === null
          ? ""
          : String(employee.desiredInsuranceAmount),
      desiredCashAmount:
        employee.desiredCashAmount === null
          ? ""
          : String(employee.desiredCashAmount),
    });
    setFieldErrors({});
  }

  function handleCancel() {
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors({});
  }

  function parseOptionalAmount(value: string): number | null {
    return value === "" ? null : Number(value);
  }

  async function handleSave() {
    setIsSaving(true);
    setFieldErrors({});

    const result = editingId
      ? await updateEmployee(editingId, { ...form, isActive: true })
      : await createEmployee({ ...form, isActive: true });

    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error(result.error.message ?? "저장에 실패했습니다.");
      return;
    }

    const detailFields = {
      dailyWage: parseOptionalAmount(form.dailyWage),
      desiredInsuranceAmount: parseOptionalAmount(form.desiredInsuranceAmount),
      desiredCashAmount: parseOptionalAmount(form.desiredCashAmount),
    };

    if (editingId) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingId
            ? {
                ...emp,
                name: form.name,
                hireDate: form.hireDate,
                ...detailFields,
              }
            : emp,
        ),
      );
    } else {
      setEmployees((prev) => [
        ...prev,
        {
          id: result.data.id,
          name: result.data.name,
          hireDate: form.hireDate,
          isActive: true,
          ...detailFields,
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

  if (!canManage) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          직원 정보는 조회만 가능합니다. 추가/수정/비활성화는 설정 관리
          권한(SETTINGS_MANAGE)이 필요합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-3 pb-2 font-normal">이름</th>
                <th className="pr-3 pb-2 font-normal">입사일</th>
                <th className="pr-3 pb-2 text-right font-normal">
                  하루 인건비
                </th>
                <th className="pr-3 pb-2 text-right font-normal">
                  희망 4대보험
                </th>
                <th className="pr-3 pb-2 text-right font-normal">희망 현금</th>
                <th className="pr-3 pb-2 font-normal">상태</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{emp.name}</td>
                  <td className="text-muted-foreground py-2 pr-3">
                    {emp.hireDate}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatOptionalKrw(emp.dailyWage)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatOptionalKrw(emp.desiredInsuranceAmount)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatOptionalKrw(emp.desiredCashAmount)}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-md border p-4">
        <h3 className="text-sm font-medium">
          {editingId ? "직원 정보 수정" : "직원 추가"}
        </h3>
        <div className="flex gap-3">
          <Field className="flex-1">
            <FieldLabel htmlFor="employee-name">이름</FieldLabel>
            <Input
              id="employee-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="이름"
              disabled={isSaving}
            />
            <FieldError
              errors={fieldErrors.name?.map((msg) => ({ message: msg }))}
            />
          </Field>
          <Field className="flex-1">
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
        {/* WO-25(2026-07-25) #6/#8: 등록 상세 — 하루 인건비 · 월 희망 수령액(4대보험/현금). */}
        <div className="flex gap-3">
          <Field className="flex-1">
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
              placeholder="원"
              disabled={isSaving}
            />
            <FieldError
              errors={fieldErrors.dailyWage?.map((msg) => ({ message: msg }))}
            />
          </Field>
          <Field className="flex-1">
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
              placeholder="원"
              disabled={isSaving}
            />
            <FieldError
              errors={fieldErrors.desiredInsuranceAmount?.map((msg) => ({
                message: msg,
              }))}
            />
          </Field>
          <Field className="flex-1">
            <FieldLabel htmlFor="employee-cash-amount">
              희망 현금 금액
            </FieldLabel>
            <Input
              id="employee-cash-amount"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.desiredCashAmount}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  desiredCashAmount: e.target.value,
                }))
              }
              placeholder="원"
              disabled={isSaving}
            />
            <FieldError
              errors={fieldErrors.desiredCashAmount?.map((msg) => ({
                message: msg,
              }))}
            />
          </Field>
          <div className="flex items-end gap-2">
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="pr-3 pb-2 font-normal">이름</th>
              <th className="pr-3 pb-2 font-normal">입사일</th>
              <th className="pr-3 pb-2 text-right font-normal">하루 인건비</th>
              <th className="pr-3 pb-2 text-right font-normal">희망 4대보험</th>
              <th className="pr-3 pb-2 text-right font-normal">희망 현금</th>
              <th className="pr-3 pb-2 font-normal">상태</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b last:border-0">
                <td className="py-2 pr-3">{emp.name}</td>
                <td className="text-muted-foreground py-2 pr-3">
                  {emp.hireDate}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatOptionalKrw(emp.dailyWage)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatOptionalKrw(emp.desiredInsuranceAmount)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatOptionalKrw(emp.desiredCashAmount)}
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
