"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { DailyLedgerStatus, Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  requireHeadquartersLedgerScope,
  requireLedgerHqCloseAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "./conflicts";
import {
  buildHqLedgerClosePreflightInTx,
  type HqLedgerClosePreflightResult,
} from "./hq-close-preflight";
import { ledgerSelect, toLedgerAuditPayload } from "./queries";

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
  exceptionReason: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(500, "마감 예외 사유는 500자 이하여야 합니다."))
    .optional(),
});

const closePreflightInputSchema = z.object({
  ledgerId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부를 확인해 주세요.")),
});

type LedgerCloseInput = z.infer<typeof closeLedgerInputSchema>;
type LedgerClosePreflightInput = z.infer<typeof closePreflightInputSchema>;

const closeLedgerAuditSelect = {
  ...ledgerSelect,
} as const;

function parseCloseLedgerInput(input: unknown): ActionResult<LedgerCloseInput> {
  const parsed = closeLedgerInputSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.");
  }

  return actionOk(parsed.data);
}

function parseClosePreflightInput(
  input: unknown,
): ActionResult<LedgerClosePreflightInput> {
  const parsed = closePreflightInputSchema.safeParse(input);

  if (!parsed.success) {
    return actionError("VALIDATION_ERROR", "장부를 확인해 주세요.");
  }

  return actionOk(parsed.data);
}

function revalidateHqLedgerPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
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

function preflightBlockedError(): ActionResult<never> {
  return actionError(
    "LEDGER_CLOSE_PREFLIGHT_BLOCKED",
    "마감 전 점검에서 보완이 필요한 항목이 확인됐습니다.",
    undefined,
  );
}

function exceptionReasonRequiredError(): ActionResult<never> {
  return actionError("VALIDATION_ERROR", "마감 예외 사유를 입력해 주세요.", {
    reason: ["마감 예외 사유를 입력해 주세요."],
  });
}

function toCloseAuditPayload(
  ledger: Parameters<typeof toLedgerAuditPayload>[0],
  preflight: HqLedgerClosePreflightResult,
  exceptionReason?: string,
) {
  return {
    ...toLedgerAuditPayload(ledger),
    preflight: {
      summary: preflight.summary,
      items: preflight.items.map((item) => ({
        id: item.id,
        label: item.label,
        severity: item.severity,
        statusLabel: item.statusLabel,
        source: item.source,
      })),
      executedBy: preflight.executedBy,
      executedAt: preflight.executedAt,
      ledgerUpdatedAt: preflight.ledgerUpdatedAt,
      beforeStatus: ledger.status,
      blockingCount: preflight.summary.blockingCount,
      warningCount: preflight.summary.warningCount,
      exceptionAllowedCount: preflight.summary.exceptionAllowedCount,
      exceptionReason: exceptionReason ?? null,
    },
  };
}

async function closeConflictError<T = never>(
  tx: Prisma.TransactionClient,
  input: LedgerCloseInput,
): Promise<ActionResult<T>> {
  const [current, meta] = await Promise.all([
    tx.dailyLedger.findUnique({
      where: { id: input.ledgerId },
      select: { status: true, updatedAt: true },
    }),
    getLedgerConflictMetaInTx(tx, input.ledgerId),
  ]);

  return ledgerConflictErrorFromMeta<T>({
    meta,
    ledgerId: input.ledgerId,
    section: "hq-close",
    clientToken: input.ledgerUpdatedAt,
    serverToken: current?.updatedAt.toISOString() ?? "unknown",
    clientValues: { 요청: "본사마감" },
    serverValues: { 현재상태: current?.status ?? null },
    lastModifiedAt: current?.updatedAt.toISOString(),
    reloadRequired: true,
    hqEditing: true,
  });
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

export async function runHqLedgerClosePreflight(
  input: unknown,
): Promise<ActionResult<HqLedgerClosePreflightResult>> {
  const parsed = parseClosePreflightInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = { user: await requireLedgerHqCloseAccess() };
  const { ledgerId } = parsed.data;
  await requireHeadquartersLedgerScope(ledgerId);

  const preflight = await db.$transaction((tx) =>
    buildHqLedgerClosePreflightInTx(tx, {
      ledgerId,
      actor: {
        id: actor.user.id,
        name: actor.user.name ?? null,
        email: actor.user.email ?? null,
      },
    }),
  );

  if (!preflight) {
    return notFoundError();
  }

  return actionOk(preflight);
}

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
    return await db.$transaction((tx) => closeConflictError(tx, parsed.data));
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

        if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return await closeConflictError(tx, parsed.data);
        }

        const preflight = await buildHqLedgerClosePreflightInTx(tx, {
          ledgerId: before.id,
          actor: {
            id: actor.user.id,
            name: actor.user.name ?? null,
            email: actor.user.email ?? null,
          },
        });

        if (!preflight) {
          return notFoundError();
        }

        if (preflight.summary.blockingCount > 0) {
          return preflightBlockedError();
        }

        const exceptionReason = parsed.data.exceptionReason;
        const requiresExceptionReason =
          preflight.summary.exceptionAllowedCount > 0;

        if (requiresExceptionReason && !exceptionReason) {
          return exceptionReasonRequiredError();
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

          return await closeConflictError(tx, parsed.data);
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
          before: toCloseAuditPayload(before, preflight, exceptionReason),
          after: toCloseAuditPayload(after, preflight, exceptionReason),
          reason: exceptionReason,
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
