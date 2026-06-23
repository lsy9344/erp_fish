"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateStoreEntryPaths } from "~/server/revalidation";
import {
  ledgerInputCodeStoreAliasSchema,
  toLedgerInputCodeFieldErrors,
  type LedgerInputCodeStoreAliasInput,
} from "./code-schemas";

// 미팅 결정(2026-06-21): 코드 등록/수정은 본사 전용([[code-actions]]).
// 지점장은 자기 지점 화면에 보이는 표시명만 덮어쓸 수 있다.
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

  // 지점장이 자기 지점에 대해서만 표시명을 바꿀 수 있도록 강제한다.
  const access = await requireStoreManagerLedgerEditAccess(parsed.data.storeId);
  const { storeId, displayName } = parsed.data;
  const actorId = access.user.id;

  const result = await db.$transaction(async (tx) => {
    const code = await tx.ledgerInputCode.findUnique({
      where: { id: codeId },
      select: { id: true, name: true },
    });

    if (!code) {
      return { status: "missing" as const };
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

  if (result.status !== "noop") {
    revalidateStoreEntryPaths(["root", "losses"]);
  }

  return actionOk({
    ledgerInputCodeId: codeId,
    storeId,
    displayName: displayName.length === 0 ? null : displayName,
  });
}
