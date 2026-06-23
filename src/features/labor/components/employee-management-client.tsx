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
};

const emptyForm: FormState = { name: "", hireDate: "" };

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
    setForm({ name: employee.name, hireDate: employee.hireDate });
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

    const result = editingId
      ? await updateEmployee(editingId, { ...form, isActive: true })
      : await createEmployee({ ...form, isActive: true });

    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error(result.error.message ?? "저장에 실패했습니다.");
      return;
    }

    if (editingId) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingId
            ? { ...emp, name: form.name, hireDate: form.hireDate }
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="pr-3 pb-2 font-normal">이름</th>
              <th className="pr-3 pb-2 font-normal">입사일</th>
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

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="pr-3 pb-2 font-normal">이름</th>
            <th className="pr-3 pb-2 font-normal">입사일</th>
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
  );
}
