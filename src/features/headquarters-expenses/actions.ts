"use server";

import type { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  getHeadquartersStoreScope,
  requireSettingsAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { revalidateDashboardAndReports } from "~/server/revalidation";
import { revalidatePath } from "next/cache";
import {
  headquartersExpenseCreateSchema,
  headquartersExpenseUpdateSchema,
  toFieldErrors,
  type HeadquartersExpenseCreateInput,
  type HeadquartersExpenseUpdateInput,
} from "./schemas";

const headquartersExpenseSelect = {
  id: true,
  expenseDate: true,
  storeId: true,
  category: true,
  amount: true,
  adjustmentReason: true,
  memo: true,
} as const;

type HeadquartersExpenseRecord = Prisma.HeadquartersExpenseGetPayload<{
  select: typeof headquartersExpenseSelect;
}>;

export type HeadquartersExpenseActionData = {
  id: string;
};

function parseExpenseDate(expenseDate: string) {
  return new Date(`${expenseDate}T00:00:00.000Z`);
}

function toExpenseAuditValue(expense: HeadquartersExpenseRecord) {
  return {
    targetName: "본사 지출",
    expenseDate: expense.expenseDate.toISOString(),
    storeId: expense.storeId,
    category: expense.category,
    amount: expense.amount,
    adjustmentReason: expense.adjustmentReason,
    memo: expense.memo,
  };
}

async function assertStoreInScope(
  storeId: string | null,
): Promise<ActionResult<HeadquartersExpenseActionData> | null> {
  if (!storeId) {
    return null;
  }

  const scope = await getHeadquartersStoreScope();

  if (!scope.storeIds.includes(storeId)) {
    return actionError<HeadquartersExpenseActionData>(
      "STORE_OUT_OF_SCOPE",
      "권한 범위에 없는 지점입니다. 권한 있는 지점을 선택해 주세요.",
      { storeId: ["권한 범위에 없는 지점입니다."] },
    );
  }

  return null;
}

function revalidateHeadquartersExpensePaths() {
  revalidatePath("/app/headquarters-expenses");
  revalidateDashboardAndReports();
}

export async function createHeadquartersExpense(
  input: unknown,
): Promise<ActionResult<HeadquartersExpenseActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = headquartersExpenseCreateSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  const data: HeadquartersExpenseCreateInput = parsed.data;
  const storeScopeError = await assertStoreInScope(data.storeId);

  if (storeScopeError) {
    return storeScopeError;
  }

  const adjustmentReason =
    data.category === "본사조정" ? data.adjustmentReason : null;

  const created = await db.$transaction(async (tx) => {
    const expense = await tx.headquartersExpense.create({
      data: {
        expenseDate: parseExpenseDate(data.expenseDate),
        storeId: data.storeId,
        category: data.category,
        amount: data.amount,
        adjustmentReason,
        memo: data.memo,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: headquartersExpenseSelect,
    });

    await writeAuditLog(tx, {
      action: "headquarters-expense.created",
      targetType: "HeadquartersExpense",
      targetId: expense.id,
      actorId: actor.id,
      before: null,
      after: toExpenseAuditValue(expense),
    });

    return expense;
  });

  revalidateHeadquartersExpensePaths();

  return actionOk({ id: created.id });
}

export async function updateHeadquartersExpense(
  input: unknown,
): Promise<ActionResult<HeadquartersExpenseActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = headquartersExpenseUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  const data: HeadquartersExpenseUpdateInput = parsed.data;
  const storeScopeError = await assertStoreInScope(data.storeId);

  if (storeScopeError) {
    return storeScopeError;
  }

  const adjustmentReason =
    data.category === "본사조정" ? data.adjustmentReason : null;

  const result = await db.$transaction(
    async (tx): Promise<ActionResult<HeadquartersExpenseActionData>> => {
      const existing = await tx.headquartersExpense.findUnique({
        where: { id: data.id },
        select: headquartersExpenseSelect,
      });

      if (!existing) {
        return actionError(
          "NOT_FOUND",
          "본사 지출 항목을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
        );
      }

      const existingScopeError = await assertStoreInScope(existing.storeId);

      if (existingScopeError) {
        return actionError(
          "FORBIDDEN",
          "권한 범위에 없는 본사 지출 항목입니다.",
        );
      }

      const updated = await tx.headquartersExpense.update({
        where: { id: data.id },
        data: {
          expenseDate: parseExpenseDate(data.expenseDate),
          storeId: data.storeId,
          category: data.category,
          amount: data.amount,
          adjustmentReason,
          memo: data.memo,
          updatedById: actor.id,
        },
        select: headquartersExpenseSelect,
      });

      await writeAuditLog(tx, {
        action: "headquarters-expense.updated",
        targetType: "HeadquartersExpense",
        targetId: updated.id,
        actorId: actor.id,
        before: toExpenseAuditValue(existing),
        after: toExpenseAuditValue(updated),
      });

      return actionOk({ id: updated.id });
    },
  );

  if (result.ok) {
    revalidateHeadquartersExpensePaths();
  }

  return result;
}
