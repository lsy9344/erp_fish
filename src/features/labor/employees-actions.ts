"use server";

import type { ZodError } from "zod";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { requireEmployeeManageAccess } from "~/server/authz";
import { db } from "~/server/db";
import { employeeFormSchema } from "./employees-schemas";
import {
  getEmployeeMonthlyPayroll,
  getEmployeeProductivityAnalysis,
  type EmployeeMonthlyPayroll,
  type EmployeeProductivityAnalysis,
} from "./employees-queries";

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
    data: {
      name: parsed.data.name,
      hireDate: new Date(parsed.data.hireDate + "T00:00:00.000Z"),
      isActive: parsed.data.isActive,
    },
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
    data: {
      name: parsed.data.name,
      hireDate: new Date(parsed.data.hireDate + "T00:00:00.000Z"),
      isActive: parsed.data.isActive,
    },
    select: { id: true, name: true },
  });

  return actionOk(employee);
}

// WO-05(2026-06-22): 직원 관리 화면의 월간 급여 롤업 조회용 서버 액션.
// 권한 게이트는 getEmployeeMonthlyPayroll 내부의 requireReportAccess가 담당한다.
export async function getEmployeeMonthlyPayrollAction(
  yearMonth: string,
): Promise<EmployeeMonthlyPayroll> {
  const normalized = typeof yearMonth === "string" ? yearMonth.trim() : "";

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return { rows: [], unlinked: { rowCount: 0, payrollTotal: 0 } };
  }

  return getEmployeeMonthlyPayroll(normalized);
}

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석 조회용 서버 액션.
// 권한 게이트는 getEmployeeProductivityAnalysis 내부의 requireReportAccess가 담당한다.
export async function getEmployeeProductivityAnalysisAction(
  yearMonth: string,
): Promise<EmployeeProductivityAnalysis> {
  const normalized = typeof yearMonth === "string" ? yearMonth.trim() : "";

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return {
      month: normalized,
      employees: [],
      byHeadcount: [],
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
