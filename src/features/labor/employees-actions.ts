"use server";

import type { ZodError } from "zod";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { requireEmployeeManageAccess } from "~/server/authz";
import { db } from "~/server/db";
import { employeeFormSchema } from "./employees-schemas";
import {
  getEmployeeProductivityAnalysis,
  type EmployeeProductivityAnalysis,
} from "./employees-queries";
import type { EmployeeFormData } from "./employees-schemas";

// WO-0806 #1-5: 희망 현금(desiredCashAmount)은 더 이상 입력받지 않는다.
// 인건비 리포트에서 `월 인건비 합계 − 희망 4대보험`으로 자동계산하며,
// 기존 저장값은 롤백을 위해 컴럼에 그대로 남겨 둔다.
function toEmployeeWriteData(data: EmployeeFormData) {
  return {
    name: data.name,
    hireDate: new Date(data.hireDate + "T00:00:00.000Z"),
    isActive: data.isActive,
    dailyWage: data.dailyWage,
    desiredInsuranceAmount: data.desiredInsuranceAmount,
    phone: data.phone,
    bankAccount: data.bankAccount,
    address: data.address,
    position: data.position,
  };
}

export type EmployeeSaveResult = {
  id: string;
  name: string;
};

function toFieldErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const key = path || "_form";
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return errors;
}

export async function createEmployee(
  input: unknown,
): Promise<ActionResult<EmployeeSaveResult>> {
  await requireEmployeeManageAccess();

  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...toFieldErrors(parsed.error),
    });
  }

  const employee = await db.employee.create({
    data: toEmployeeWriteData(parsed.data),
    select: { id: true, name: true },
  });

  return actionOk(employee);
}

export async function updateEmployee(
  id: string,
  input: unknown,
): Promise<ActionResult<EmployeeSaveResult>> {
  await requireEmployeeManageAccess();

  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...toFieldErrors(parsed.error),
    });
  }

  const existing = await db.employee.findUnique({ where: { id } });

  if (!existing) {
    return actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
  }

  const employee = await db.employee.update({
    where: { id },
    data: toEmployeeWriteData(parsed.data),
    select: { id: true, name: true },
  });

  return actionOk(employee);
}

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석 조회용 서버 액션.
// 권한 게이트는 getEmployeeProductivityAnalysis 내부의 requireLaborViewAccess가 담당한다.
export async function getEmployeeProductivityAnalysisAction(
  yearMonth: string,
): Promise<EmployeeProductivityAnalysis> {
  const normalized = typeof yearMonth === "string" ? yearMonth.trim() : "";

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return {
      month: normalized,
      employees: [],
      unlinkedPayrollRowCount: 0,
    };
  }

  return getEmployeeProductivityAnalysis(normalized);
}

export async function deactivateEmployee(
  id: string,
): Promise<ActionResult<EmployeeSaveResult>> {
  await requireEmployeeManageAccess();

  const existing = await db.employee.findUnique({ where: { id } });

  if (!existing) {
    return actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
  }

  const employee = await db.employee.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true },
  });

  return actionOk(employee);
}
