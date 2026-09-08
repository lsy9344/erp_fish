"use server";

import { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  requireAppUser,
  requireSettingsAccess,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { revalidateStoreEntryPaths } from "~/server/revalidation";
import {
  ledgerInputCodeStoreAliasSchema,
  toLedgerInputCodeFieldErrors,
  type LedgerInputCodeStoreAliasInput,
} from "./code-schemas";

// 코드 등록/수정은 본사 전용이다. 지출 항목 별칭은 지점장 정책을 유지하되,
// 손실 유형 별칭은 손실 입력의 의미가 바뀌므로 본사만 수정할 수 있다.
export type LedgerInputCodeStoreAliasData = {
  ledgerInputCodeId: string;
  storeId: string;
  displayName: string | null;
};

function parseAliasInput(
  input: unknown,
): ActionResult<LedgerInputCodeStoreAliasInput> {
  const parsed = ledgerInputCodeStoreAliasSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toLedgerInputCodeFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

export async function setLedgerInputCodeStoreAlias(
  codeId: string,
  input: unknown,
): Promise<ActionResult<LedgerInputCodeStoreAliasData>> {
  const parsed = parseAliasInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  // 코드 존재 여부도 로그인 전에는 알려주지 않는다.
  await requireAppUser();
  const authorizedCode = await db.ledgerInputCode.findUnique({
    where: { id: codeId },
    select: { group: true },
  });

  if (!authorizedCode) {
    return actionError(
      "LEDGER_INPUT_CODE_NOT_FOUND",
      "코드를 찾을 수 없습니다.",
    );
  }

  // 손실 유형은 지점장 직접 호출도 막고, 다른 별칭 정책은 그대로 둔다.
  const access =
    authorizedCode.group === "LOSS_TYPE"
      ? await requireSettingsAccess()
      : await requireStoreManagerLedgerEditAccess(parsed.data.storeId);
  const { storeId, displayName } = parsed.data;
  const actorId = "user" in access ? access.user.id : access.id;

  const result = await db.$transaction(async (tx) => {
    const [code] = await tx.$queryRaw<
      Array<{ id: string; name: string; group: string }>
    >(Prisma.sql`
      SELECT "id", "name", "group"::text AS "group"
      FROM "LedgerInputCode"
      WHERE "id" = ${codeId}
      FOR UPDATE
    `);

    if (!code) {
      return { status: "missing" as const };
    }

    if (code.group !== authorizedCode.group) {
      return { status: "group-changed" as const };
    }

    const existing = await tx.ledgerInputCodeStoreAlias.findUnique({
      where: {
        ledgerInputCodeId_storeId: {
          ledgerInputCodeId: codeId,
          storeId,
        },
      },
      select: { id: true, displayName: true },
    });

    // 빈 표시명이면 alias 삭제(본사 등록명으로 복귀).
    if (displayName.length === 0) {
      if (!existing) {
        return { status: "noop" as const };
      }

      await tx.ledgerInputCodeStoreAlias.delete({
        where: { id: existing.id },
      });

      await writeAuditLog(tx, {
        action: "ledger_input_code_store_alias.cleared",
        targetType: "LedgerInputCodeStoreAlias",
        targetId: existing.id,
        actorId,
        before: {
          ledgerInputCodeId: codeId,
          storeId,
          displayName: existing.displayName,
        },
        after: null,
      });

      return { status: "cleared" as const };
    }

    if (existing?.displayName === displayName) {
      return { status: "noop" as const };
    }

    const upserted = await tx.ledgerInputCodeStoreAlias.upsert({
      where: {
        ledgerInputCodeId_storeId: {
          ledgerInputCodeId: codeId,
          storeId,
        },
      },
      create: {
        ledgerInputCodeId: codeId,
        storeId,
        displayName,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {
        displayName,
        updatedById: actorId,
      },
      select: { id: true },
    });

    await writeAuditLog(tx, {
      action: existing
        ? "ledger_input_code_store_alias.updated"
        : "ledger_input_code_store_alias.created",
      targetType: "LedgerInputCodeStoreAlias",
      targetId: upserted.id,
      actorId,
      before: existing
        ? {
            ledgerInputCodeId: codeId,
            storeId,
            displayName: existing.displayName,
          }
        : null,
      after: {
        ledgerInputCodeId: codeId,
        storeId,
        displayName,
      },
    });

    return { status: "saved" as const };
  });

  if (result.status === "missing") {
    return actionError(
      "LEDGER_INPUT_CODE_NOT_FOUND",
      "코드를 찾을 수 없습니다.",
    );
  }

  if (result.status === "group-changed") {
    return actionError(
      "LEDGER_INPUT_CODE_CHANGED",
      "코드 종류가 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
    );
  }

  if (result.status !== "noop") {
    revalidateStoreEntryPaths(["root", "losses"]);
  }

  return actionOk({
    ledgerInputCodeId: codeId,
    storeId,
    displayName: displayName.length === 0 ? null : displayName,
  });
}
