"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { DailyLedgerStatus } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireHeadquartersLedgerScope, requireLedgerHqCloseAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  ledgerSelect,
  toLedgerAuditPayload,
} from "./queries";

const editableLedgerStatuses = ["IN_PROGRESS", "IN_REVIEW"] as const;

const closeLedgerInputSchema = z.object({
  ledgerId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부를 확인해 주세요.")),
  ledgerUpdatedAt: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "마감할 장부가 확인되지 않습니다.")),
});

type LedgerCloseInput = z.infer<typeof closeLedgerInputSchema>;

const closeLedgerAuditSelect = {
  ...ledgerSelect,
} as const;

function parseCloseLedgerInput(
  input: unknown,
): ActionResult<LedgerCloseInput> {
  const parsed = closeLedgerInputSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.");
  }

  return actionOk(parsed.data);
}

function revalidateHqLedgerPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/monthly");
}

function revalidateHqLedgerPathsBestEffort(ledgerId: string) {
  try {
    revalidateHqLedgerPaths(ledgerId);
  } catch {
    // The ledger is already committed; do not report a false close failure.
  }
}

function mapCloseActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_CLOSE_FAILED",
    "마감에 실패했습니다. 다시 시도해 주세요.",
  );
}

function notFoundError(): ActionResult<never> {
  return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
}

function notEditableError(): ActionResult<never> {
  return actionError(
    "LEDGER_NOT_EDITABLE",
    "휴무 장부는 본사 마감할 수 없습니다.",
  );
}

function alreadyClosedError(): ActionResult<never> {
  return actionError("LEDGER_ALREADY_CLOSED", "이미 마감된 장부입니다.");
}

function conflictError(): ActionResult<never> {
  return actionError(
    "LEDGER_CONFLICT",
    "장부가 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
  );
}

function parseExpectedUpdatedAt(value: string): Date | null {
  const expectedUpdatedAt = new Date(value);

  return Number.isNaN(expectedUpdatedAt.getTime()) ? null : expectedUpdatedAt;
}

export type HqCloseLedgerResult = {
  id: string;
  status: DailyLedgerStatus;
  closedAt: string;
};

export async function closeHqLedger(
  input: unknown,
): Promise<ActionResult<HqCloseLedgerResult>> {
  const parsed = parseCloseLedgerInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = { user: await requireLedgerHqCloseAccess() };
  const { ledgerId, ledgerUpdatedAt } = parsed.data;
  await requireHeadquartersLedgerScope(ledgerId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
  }

  let result: ActionResult<HqCloseLedgerResult>;

  try {
    result = await db.$transaction<ActionResult<HqCloseLedgerResult>>(
      async (tx) => {
        const before = await tx.dailyLedger.findUnique({
          where: { id: ledgerId },
          select: closeLedgerAuditSelect,
        });

        if (!before) {
          return notFoundError();
        }

        if (before.status === "HEADQUARTERS_CLOSED") {
          return alreadyClosedError();
        }

        if (before.status === "HOLIDAY") {
          return notEditableError();
        }

        const closedAt = new Date();
        const updated = await tx.dailyLedger.updateMany({
          where: {
            id: before.id,
            status: { in: [...editableLedgerStatuses] },
            updatedAt: expectedUpdatedAt,
          },
          data: {
            status: "HEADQUARTERS_CLOSED",
            closedById: actor.user.id,
            closedAt,
            updatedById: actor.user.id,
          },
        });

        if (updated.count !== 1) {
          const current = await tx.dailyLedger.findUnique({
            where: { id: before.id },
            select: { status: true },
          });

          if (current?.status === "HEADQUARTERS_CLOSED") {
            return alreadyClosedError();
          }

          return conflictError();
        }

        const after = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: before.id },
          select: closeLedgerAuditSelect,
        });

        await writeAuditLog(tx, {
          action: "ledger.hq.closed",
          targetType: "DailyLedger",
          targetId: after.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(before),
          after: toLedgerAuditPayload(after),
        });

        return actionOk({
          id: after.id,
          status: after.status,
          closedAt: closedAt.toISOString(),
        });
      },
    );

  } catch {
    return mapCloseActionError();
  }

  if (result.ok) {
    revalidateHqLedgerPathsBestEffort(ledgerId);
  }

  return result;
}
