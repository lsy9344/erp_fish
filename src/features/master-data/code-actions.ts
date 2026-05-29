"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireHeadquartersUser } from "~/server/authz";
import { db } from "~/server/db";
import {
  ledgerInputCodeFormSchema,
  ledgerInputCodeStatusSchema,
  toLedgerInputCodeFieldErrors,
  type LedgerInputCodeFormInput,
  type LedgerInputCodeGroupValue,
  type LedgerInputCodeStatusInput,
} from "./code-schemas";

type LedgerInputCodeActionData = {
  id: string;
  group: LedgerInputCodeGroupValue;
  name: string;
  displayOrder: number;
  isActive: boolean;
};

const ledgerInputCodeSelect = {
  id: true,
  group: true,
  name: true,
  displayOrder: true,
  isActive: true,
} as const;

const MAX_LEDGER_INPUT_CODE_DISPLAY_ORDER = 2_147_483_647;
const LEDGER_INPUT_CODE_DISPLAY_ORDER_STEP = 10;

function revalidateLedgerInputCodePaths() {
  revalidatePath("/app/master-data/codes");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
}

function normalizeLedgerInputCode(code: {
  id: string;
  group: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}): LedgerInputCodeActionData {
  return {
    ...code,
    group: code.group as LedgerInputCodeGroupValue,
  };
}

function parseLedgerInputCodeInput(
  input: unknown,
): ActionResult<LedgerInputCodeFormInput> {
  const parsed = ledgerInputCodeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toLedgerInputCodeFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data as LedgerInputCodeFormInput);
}

function parseLedgerInputCodeStatusInput(
  input: unknown,
): ActionResult<LedgerInputCodeStatusInput> {
  const parsed = ledgerInputCodeStatusSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toLedgerInputCodeFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function duplicateLedgerInputCodeError<T>(): ActionResult<T> {
  return actionError(
    "DUPLICATE_LEDGER_INPUT_CODE",
    "이미 같은 그룹에 같은 코드명이 있습니다.",
    {
      name: ["이미 같은 그룹에 같은 코드명이 있습니다."],
    },
  );
}

function missingLedgerInputCodeError<T>(): ActionResult<T> {
  return actionError("LEDGER_INPUT_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.");
}

function autoDisplayOrderLimitError<T>(): ActionResult<T> {
  return actionError(
    "AUTO_DISPLAY_ORDER_LIMIT_EXCEEDED",
    "표시 순서를 직접 입력해 주세요.",
    {
      displayOrder: [
        "자동 표시 순서를 만들 수 없습니다. 표시 순서를 직접 입력해 주세요.",
      ],
    },
  );
}

function getLedgerInputCodeAuditAction(
  before: LedgerInputCodeActionData,
  after: LedgerInputCodeActionData,
) {
  if (before.isActive !== after.isActive) {
    return after.isActive
      ? "ledger_input_code.activated"
      : "ledger_input_code.deactivated";
  }

  const groupChanged = before.group !== after.group;
  const nameChanged = before.name !== after.name;
  const displayOrderChanged = before.displayOrder !== after.displayOrder;

  if (displayOrderChanged && !groupChanged && !nameChanged) {
    return "ledger_input_code.reordered";
  }

  return "ledger_input_code.updated";
}

function toLedgerInputCodeAuditValue(code: LedgerInputCodeActionData) {
  return {
    group: code.group,
    name: code.name,
    displayOrder: code.displayOrder,
    isActive: code.isActive,
  };
}

function isSameLedgerInputCode(
  code: LedgerInputCodeActionData,
  input: LedgerInputCodeFormInput,
) {
  return (
    code.group === input.group &&
    code.name === input.name &&
    (input.displayOrder === null || code.displayOrder === input.displayOrder)
  );
}

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findDuplicateLedgerInputCode(
  tx: Prisma.TransactionClient,
  input: LedgerInputCodeFormInput,
  currentCodeId?: string,
) {
  const duplicate = await tx.ledgerInputCode.findFirst({
    where: {
      group: input.group,
      name: input.name,
    },
    select: { id: true },
  });

  return duplicate && duplicate.id !== currentCodeId ? duplicate : null;
}

async function resolveLedgerInputCodeDisplayOrder(
  tx: Prisma.TransactionClient,
  input: LedgerInputCodeFormInput,
  existingDisplayOrder?: number,
) {
  if (input.displayOrder !== null) {
    return input.displayOrder;
  }

  if (existingDisplayOrder !== undefined) {
    return existingDisplayOrder;
  }

  const lastCode = await tx.ledgerInputCode.findFirst({
    where: { group: input.group },
    orderBy: [{ displayOrder: "desc" }, { name: "desc" }, { id: "desc" }],
    select: { displayOrder: true },
  });
  const nextDisplayOrder =
    (lastCode?.displayOrder ?? 0) + LEDGER_INPUT_CODE_DISPLAY_ORDER_STEP;

  if (nextDisplayOrder > MAX_LEDGER_INPUT_CODE_DISPLAY_ORDER) {
    return null;
  }

  return nextDisplayOrder;
}

export async function createLedgerInputCode(
  input: unknown,
): Promise<ActionResult<LedgerInputCodeActionData>> {
  const actor = await requireHeadquartersUser();
  const parsed = parseLedgerInputCodeInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const duplicate = await findDuplicateLedgerInputCode(tx, parsed.data);

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const displayOrder = await resolveLedgerInputCodeDisplayOrder(
        tx,
        parsed.data,
      );

      if (displayOrder === null) {
        return { status: "display-order-limit" as const };
      }

      const created = await tx.ledgerInputCode.create({
        data: {
          group: parsed.data.group,
          name: parsed.data.name,
          displayOrder,
          isActive: true,
          updatedById: actor.id,
        },
        select: ledgerInputCodeSelect,
      });
      const normalized = normalizeLedgerInputCode(created);

      await writeAuditLog(tx, {
        action: "ledger_input_code.created",
        targetType: "LedgerInputCode",
        targetId: normalized.id,
        actorId: actor.id,
        before: null,
        after: toLedgerInputCodeAuditValue(normalized),
      });

      return {
        status: "created" as const,
        code: normalized,
      };
    });

    if (result.status === "duplicate") {
      return duplicateLedgerInputCodeError();
    }

    if (result.status === "display-order-limit") {
      return autoDisplayOrderLimitError();
    }

    revalidateLedgerInputCodePaths();

    return actionOk(result.code);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateLedgerInputCodeError();
    }

    throw error;
  }
}

export async function updateLedgerInputCode(
  codeId: string,
  input: unknown,
): Promise<ActionResult<LedgerInputCodeActionData>> {
  const actor = await requireHeadquartersUser();
  const parsed = parseLedgerInputCodeInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existingRaw = await tx.ledgerInputCode.findUnique({
        where: { id: codeId },
        select: ledgerInputCodeSelect,
      });

      if (!existingRaw) {
        return { status: "missing" as const };
      }

      const existing = normalizeLedgerInputCode(existingRaw);

      if (isSameLedgerInputCode(existing, parsed.data)) {
        return { status: "unchanged" as const, code: existing };
      }

      const duplicate = await findDuplicateLedgerInputCode(
        tx,
        parsed.data,
        codeId,
      );

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const displayOrder = await resolveLedgerInputCodeDisplayOrder(
        tx,
        parsed.data,
        existing.displayOrder,
      );

      if (displayOrder === null) {
        return { status: "display-order-limit" as const };
      }

      const updated = await tx.ledgerInputCode.update({
        where: { id: codeId },
        data: {
          group: parsed.data.group,
          name: parsed.data.name,
          displayOrder,
          updatedById: actor.id,
        },
        select: ledgerInputCodeSelect,
      });
      const normalized = normalizeLedgerInputCode(updated);

      await writeAuditLog(tx, {
        action: getLedgerInputCodeAuditAction(existing, normalized),
        targetType: "LedgerInputCode",
        targetId: normalized.id,
        actorId: actor.id,
        before: toLedgerInputCodeAuditValue(existing),
        after: toLedgerInputCodeAuditValue(normalized),
      });

      return {
        status: "updated" as const,
        code: normalized,
      };
    });

    if (result.status === "missing") {
      return missingLedgerInputCodeError();
    }

    if (result.status === "duplicate") {
      return duplicateLedgerInputCodeError();
    }

    if (result.status === "display-order-limit") {
      return autoDisplayOrderLimitError();
    }

    if (result.status === "updated") {
      revalidateLedgerInputCodePaths();
    }

    return actionOk(result.code);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateLedgerInputCodeError();
    }

    throw error;
  }
}

export async function updateLedgerInputCodeStatus(
  codeId: string,
  input: unknown,
): Promise<ActionResult<LedgerInputCodeActionData>> {
  const actor = await requireHeadquartersUser();
  const parsed = parseLedgerInputCodeStatusInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    const existingRaw = await tx.ledgerInputCode.findUnique({
      where: { id: codeId },
      select: ledgerInputCodeSelect,
    });

    if (!existingRaw) {
      return { status: "missing" as const };
    }

    const existing = normalizeLedgerInputCode(existingRaw);

    if (existing.isActive === parsed.data.isActive) {
      return { status: "unchanged" as const, code: existing };
    }

    const updated = await tx.ledgerInputCode.update({
      where: { id: codeId },
      data: {
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      select: ledgerInputCodeSelect,
    });
    const normalized = normalizeLedgerInputCode(updated);

    await writeAuditLog(tx, {
      action: getLedgerInputCodeAuditAction(existing, normalized),
      targetType: "LedgerInputCode",
      targetId: normalized.id,
      actorId: actor.id,
      before: toLedgerInputCodeAuditValue(existing),
      after: toLedgerInputCodeAuditValue(normalized),
    });

    return {
      status: "updated" as const,
      code: normalized,
    };
  });

  if (result.status === "missing") {
    return missingLedgerInputCodeError();
  }

  if (result.status === "updated") {
    revalidateLedgerInputCodePaths();
  }

  return actionOk(result.code);
}
