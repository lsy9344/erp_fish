"use server";

import { revalidatePath } from "next/cache";
import { PermissionAction } from "../../../generated/prisma";
import type { ZodError } from "zod";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  hasActionPermission,
  requireEmployeeManageAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { employeeFormSchema } from "./employees-schemas";
import {
  linkExistingLaborItemsInTx,
  lockEmployeeNamesInTx,
} from "./employee-labor-linking";
import {
  getEmployeeProductivityAnalysis,
  getHistoricalEmployeeDetail,
  type EmployeeProductivityAnalysis,
  type HistoricalEmployeeDetail,
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
    storeId: data.storeId ?? null,
  };
}

export type EmployeeSaveResult = {
  id: string;
  name: string;
  linkedLaborItemCount?: number;
  filledLinkedZeroAmountCount?: number;
};

function revalidateEmployeeLaborPaths() {
  revalidatePath("/app/labor/employees");
  revalidatePath("/app/reports/labor");
  revalidatePath("/app/reports/monthly");
  revalidatePath("/app/dashboard");
}

function employeeAuditFields(data: ReturnType<typeof toEmployeeWriteData>) {
  return Object.entries(data)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key]) => key)
    .sort();
}

function employeeChangedFields(
  before: Record<string, unknown>,
  after: ReturnType<typeof toEmployeeWriteData>,
) {
  return Object.entries(after)
    .filter(([key, value]) => {
      const previous = before[key];
      if (previous instanceof Date && value instanceof Date) {
        return previous.getTime() !== value.getTime();
      }
      return previous !== value;
    })
    .map(([key]) => key)
    .sort();
}

function toFieldErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const key = path || "_form";
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return errors;
}

async function validateEmployeeStore(
  storeId: string | null | undefined,
): Promise<ActionResult<null>> {
  if (!storeId) return actionOk(null);

  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });

  return store
    ? actionOk(null)
    : actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
        storeId: ["선택한 근무매장을 찾을 수 없습니다."],
      });
}

export async function createEmployee(
  input: unknown,
): Promise<ActionResult<EmployeeSaveResult>> {
  const actor = await requireEmployeeManageAccess();
  const canEditLedgers = await hasActionPermission(
    actor.id,
    PermissionAction.LEDGER_EDIT,
  );

  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...toFieldErrors(parsed.error),
    });
  }

  const storeValidation = await validateEmployeeStore(parsed.data.storeId);
  if (!storeValidation.ok) return storeValidation;

  const writeData = toEmployeeWriteData(parsed.data);
  const employee = await db.$transaction(async (tx) => {
    await lockEmployeeNamesInTx(tx, [writeData.name]);
    const created = await tx.employee.create({
      data: writeData,
      select: {
        id: true,
        name: true,
        hireDate: true,
        isActive: true,
        dailyWage: true,
      },
    });
    const linkResult = await linkExistingLaborItemsInTx({
      tx,
      employee: created,
      actorId: actor.id,
      canEditLedgers,
      auditReason: "직원 등록 후 기존 근무기록 자동 연결",
    });
    await writeAuditLog(tx, {
      action: "employee.created",
      targetType: "Employee",
      targetId: created.id,
      actorId: actor.id,
      before: null,
      // 이름·연락처·주소·계좌·금액 값은 감사 로그에 복제하지 않는다.
      after: {
        changedFields: employeeAuditFields(writeData),
        linkedLaborItemCount: linkResult.linkedLaborItemCount,
        filledLinkedZeroAmountCount: linkResult.filledLinkedZeroAmountCount,
        linkedDailyLedgerCount: linkResult.linkedDailyLedgerCount,
      },
    });
    return {
      id: created.id,
      name: created.name,
      linkedLaborItemCount: linkResult.linkedLaborItemCount,
      filledLinkedZeroAmountCount: linkResult.filledLinkedZeroAmountCount,
    };
  });

  revalidateEmployeeLaborPaths();
  return actionOk(employee);
}

export async function updateEmployee(
  id: string,
  input: unknown,
): Promise<ActionResult<EmployeeSaveResult>> {
  const actor = await requireEmployeeManageAccess();
  const canEditLedgers = await hasActionPermission(
    actor.id,
    PermissionAction.LEDGER_EDIT,
  );

  const parsed = employeeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...toFieldErrors(parsed.error),
    });
  }

  const storeValidation = await validateEmployeeStore(parsed.data.storeId);
  if (!storeValidation.ok) return storeValidation;

  const writeData = toEmployeeWriteData(parsed.data);
  const employee = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.employee.findUnique({ where: { id } });
    if (!existing) return null;
    await lockEmployeeNamesInTx(tx, [existing.name, writeData.name]);
    // 활성 상태는 별도 activate/deactivate 액션으로만 바꾼다. 특히 비활성 직원
    // 편집이 실수로 다시 활성화되지 않도록 항상 현재 상태를 유지한다.
    const safeWriteData = { ...writeData, isActive: existing.isActive };
    const changedFields = employeeChangedFields(existing, safeWriteData);
    const updated = await tx.employee.update({
      where: { id },
      data: safeWriteData,
      select: {
        id: true,
        name: true,
        hireDate: true,
        isActive: true,
        dailyWage: true,
      },
    });
    const linkResult = await linkExistingLaborItemsInTx({
      tx,
      employee: updated,
      actorId: actor.id,
      canEditLedgers,
      fillLinkedZeroAmounts:
        (existing.dailyWage ?? 0) === 0 && (updated.dailyWage ?? 0) > 0,
      auditReason: "직원 정보 수정 후 기존 근무기록 자동 연결",
    });
    await writeAuditLog(tx, {
      action: "employee.updated",
      targetType: "Employee",
      targetId: id,
      actorId: actor.id,
      before: { changedFields: [] },
      after: {
        changedFields,
        linkedLaborItemCount: linkResult.linkedLaborItemCount,
        filledLinkedZeroAmountCount: linkResult.filledLinkedZeroAmountCount,
        linkedDailyLedgerCount: linkResult.linkedDailyLedgerCount,
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      linkedLaborItemCount: linkResult.linkedLaborItemCount,
      filledLinkedZeroAmountCount: linkResult.filledLinkedZeroAmountCount,
    };
  });

  if (!employee) {
    return actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
  }
  revalidateEmployeeLaborPaths();
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

// 현재/과거 디렉터리에서 과거 직원 1명을 선택했을 때만 일별 역할을 가져온다.
// active batch 조건과 LABOR_VIEW 게이트는 query 내부에서 다시 확인한다.
export async function getHistoricalEmployeeDetailAction(
  id: string,
): Promise<HistoricalEmployeeDetail | null> {
  return getHistoricalEmployeeDetail(id);
}

export async function deactivateEmployee(
  id: string,
): Promise<ActionResult<EmployeeSaveResult>> {
  const actor = await requireEmployeeManageAccess();

  const employee = await db.$transaction(async (tx) => {
    const existing = await tx.employee.findUnique({ where: { id } });
    if (!existing) return null;
    const updated = await tx.employee.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true },
    });
    await writeAuditLog(tx, {
      action: "employee.deactivated",
      targetType: "Employee",
      targetId: id,
      actorId: actor.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });
    return updated;
  });

  if (!employee) {
    return actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
  }
  return actionOk(employee);
}

export async function activateEmployee(
  id: string,
): Promise<ActionResult<EmployeeSaveResult>> {
  const actor = await requireEmployeeManageAccess();
  const employee = await db.$transaction(async (tx) => {
    const existing = await tx.employee.findUnique({ where: { id } });
    if (!existing) return null;
    const updated = await tx.employee.update({
      where: { id },
      data: { isActive: true },
      select: { id: true, name: true },
    });
    await writeAuditLog(tx, {
      action: "employee.activated",
      targetType: "Employee",
      targetId: id,
      actorId: actor.id,
      before: { isActive: existing.isActive },
      after: { isActive: true },
    });
    return updated;
  });
  return employee
    ? actionOk(employee)
    : actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
}

// 근무 기록이 있는 직원은 이력 보존을 위해 비활성화만 허용한다.
export async function deleteEmployee(
  id: string,
): Promise<ActionResult<EmployeeSaveResult>> {
  const actor = await requireEmployeeManageAccess();
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.employee.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
    if (!existing) return { kind: "missing" as const };
    const laborCount = await tx.ledgerLaborItem.count({
      where: { employeeId: id },
    });
    if (laborCount > 0) {
      await writeAuditLog(tx, {
        action: "employee.delete_blocked",
        targetType: "Employee",
        targetId: id,
        actorId: actor.id,
        before: { isActive: existing.isActive, laborCount },
        after: { isActive: existing.isActive, laborCount },
      });
      return { kind: "linked" as const, employee: existing };
    }
    await tx.employee.delete({ where: { id } });
    await writeAuditLog(tx, {
      action: "employee.deleted",
      targetType: "Employee",
      targetId: id,
      actorId: actor.id,
      before: { isActive: existing.isActive, laborCount: 0 },
      after: null,
    });
    return { kind: "deleted" as const, employee: existing };
  });
  if (result.kind === "missing")
    return actionError("NOT_FOUND", "직원 정보를 찾을 수 없습니다.");
  if (result.kind === "linked")
    return actionError(
      "CONFLICT",
      "근무 기록이 있어 삭제할 수 없습니다. 퇴사·사용중지로 바꿔 주세요.",
    );
  return actionOk(result.employee);
}
