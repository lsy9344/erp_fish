"use server";

import { revalidatePath } from "next/cache";

import { PermissionAction, Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  withAuditActorContext,
  writeAuditLog,
  type AuditActorContext,
} from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  storeFormSchema,
  storeStatusSchema,
  toFieldErrors,
  type StoreFormInput,
  type StoreStatusInput,
} from "./schemas";

type StoreActionData = {
  id: string;
  name: string;
  isActive: boolean;
};

const storeSelect = {
  id: true,
  name: true,
  isActive: true,
} as const;

function revalidateStorePaths() {
  revalidatePath("/app/master-data/stores");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/monthly");
}

function parseStoreInput(input: unknown): ActionResult<StoreFormInput> {
  const parsed = storeFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseStoreStatusInput(input: unknown): ActionResult<StoreStatusInput> {
  const parsed = storeStatusSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function duplicateStoreNameError<T>(): ActionResult<T> {
  return actionError(
    "DUPLICATE_STORE_NAME",
    "이미 같은 이름의 지점이 있습니다.",
    {
      name: ["이미 같은 이름의 지점이 있습니다."],
    },
  );
}

function getStoreAuditAction(before: StoreActionData, after: StoreActionData) {
  if (before.isActive !== after.isActive) {
    return after.isActive ? "store.activated" : "store.deactivated";
  }

  return "store.updated";
}

function toSettingsAuditContext(actorRole: string): AuditActorContext {
  return {
    actorRole,
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  };
}

function toAuditStoreSnapshot(
  store: Pick<StoreActionData, "name" | "isActive">,
  actorContext: AuditActorContext,
) {
  return withAuditActorContext(
    {
      name: store.name,
      isActive: store.isActive,
    },
    actorContext,
  );
}

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createStore(
  input: unknown,
): Promise<ActionResult<StoreActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseStoreInput({
    ...(typeof input === "object" && input ? input : {}),
    isActive: true,
  });

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const duplicate = await tx.store.findFirst({
        where: { name: parsed.data.name },
        select: { id: true },
      });

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const created = await tx.store.create({
        data: {
          name: parsed.data.name,
          isActive: true,
          updatedById: actor.id,
        },
        select: storeSelect,
      });

      await writeAuditLog(tx, {
        action: "store.created",
        targetType: "Store",
        targetId: created.id,
        actorId: actor.id,
        before: null,
        after: toAuditStoreSnapshot(
          created,
          toSettingsAuditContext(actor.role),
        ),
      });

      return {
        status: "created" as const,
        store: created,
      };
    });

    if (result.status === "duplicate") {
      return duplicateStoreNameError();
    }

    revalidateStorePaths();

    return actionOk(result.store);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateStoreNameError();
    }

    throw error;
  }
}

export async function updateStore(
  storeId: string,
  input: unknown,
): Promise<ActionResult<StoreActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseStoreInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.store.findUnique({
        where: { id: storeId },
        select: storeSelect,
      });

      if (!existing) {
        return { status: "missing" as const };
      }

      if (
        existing.name === parsed.data.name &&
        existing.isActive === parsed.data.isActive
      ) {
        return { status: "unchanged" as const, store: existing };
      }

      const duplicate = await tx.store.findFirst({
        where: { name: parsed.data.name },
        select: { id: true },
      });

      if (duplicate && duplicate.id !== storeId) {
        return { status: "duplicate" as const };
      }

      const updated = await tx.store.update({
        where: { id: storeId },
        data: {
          name: parsed.data.name,
          isActive: parsed.data.isActive,
          updatedById: actor.id,
        },
        select: storeSelect,
      });

      await writeAuditLog(tx, {
        action: getStoreAuditAction(existing, updated),
        targetType: "Store",
        targetId: updated.id,
        actorId: actor.id,
        before: toAuditStoreSnapshot(
          existing,
          toSettingsAuditContext(actor.role),
        ),
        after: toAuditStoreSnapshot(
          updated,
          toSettingsAuditContext(actor.role),
        ),
      });

      return {
        status: "updated" as const,
        store: updated,
      };
    });

    if (result.status === "missing") {
      return actionError("STORE_NOT_FOUND", "지점을 찾을 수 없습니다.");
    }

    if (result.status === "duplicate") {
      return duplicateStoreNameError();
    }

    if (result.status === "updated") {
      revalidateStorePaths();
    }

    return actionOk(result.store);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateStoreNameError();
    }

    throw error;
  }
}

export async function updateStoreStatus(
  storeId: string,
  input: unknown,
): Promise<ActionResult<StoreActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseStoreStatusInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.store.findUnique({
      where: { id: storeId },
      select: storeSelect,
    });

    if (!existing) {
      return { status: "missing" as const };
    }

    if (existing.isActive === parsed.data.isActive) {
      return { status: "unchanged" as const, store: existing };
    }

    const updated = await tx.store.update({
      where: { id: storeId },
      data: {
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      select: storeSelect,
    });

    await writeAuditLog(tx, {
      action: getStoreAuditAction(existing, updated),
      targetType: "Store",
      targetId: updated.id,
      actorId: actor.id,
      before: toAuditStoreSnapshot(
        existing,
        toSettingsAuditContext(actor.role),
      ),
      after: toAuditStoreSnapshot(updated, toSettingsAuditContext(actor.role)),
    });

    return {
      status: "updated" as const,
      store: updated,
    };
  });

  if (result.status === "missing") {
    return actionError("STORE_NOT_FOUND", "지점을 찾을 수 없습니다.");
  }

  if (result.status === "updated") {
    revalidateStorePaths();
  }

  return actionOk(result.store);
}
