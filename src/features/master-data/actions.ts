"use server";

import { PermissionAction, Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  withAuditActorContext,
  writeAuditLog,
  type AuditActorContext,
} from "~/server/audit";
import {
  requireMasterDataDeleteAccess,
  requireSettingsAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { revalidateMasterDataPaths } from "~/server/revalidation";
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
  revalidateMasterDataPaths("stores");
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

// 삭제는 SETTINGS_MANAGE가 아니라 전용 action으로 통과한다. 감사 로그에도 그대로 남긴다.
function toDeleteAuditContext(actorRole: string): AuditActorContext {
  return {
    actorRole,
    requiredAction: PermissionAction.MASTER_DATA_DELETE,
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

function isPrismaForeignKeyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

// 삭제를 막을 관계. 장부·기초재고·과거 Excel은 스키마가 이미 Restrict로 막지만,
// 본사 지출과 이카운트 라인은 SetNull이라 그냥 지우면 소리 없이 주인을 잃는다.
// 그래서 먼저 건수를 세어 사유와 함께 막고, DB Restrict는 마지막 안전망으로 둔다.
const STORE_DELETE_BLOCKERS = [
  ["dailyLedgers", "일일 장부"],
  ["inventoryOpeningSnapshots", "기초 재고"],
  ["salesPricePlans", "판매가 계획"],
  ["headquartersExpenses", "본사 지출"],
  ["ecountImportLines", "이카운트 업로드 라인"],
  ["historicalDailyFacts", "과거 Excel 실적"],
  ["historicalEmployeeDailyRoles", "과거 Excel 근무 기록"],
] as const;

function storeInUseError<T>(reason: string): ActionResult<T> {
  return actionError(
    "STORE_IN_USE",
    `${reason} 삭제할 수 없습니다. 대신 비활성으로 바꿔 주세요.`,
  );
}

// WO(2026-08-14): 안 쓰거나 잘못 만든 지점 정리용. 되돌릴 수 없어
// 기준정보 수정과 분리한 MASTER_DATA_DELETE 권한이 있어야 한다.
export async function deleteStore(
  storeId: string,
): Promise<ActionResult<StoreActionData>> {
  const actor = await requireMasterDataDeleteAccess();

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.store.findUnique({
        where: { id: storeId },
        select: {
          ...storeSelect,
          _count: {
            select: {
              dailyLedgers: true,
              inventoryOpeningSnapshots: true,
              salesPricePlans: true,
              headquartersExpenses: true,
              ecountImportLines: true,
              historicalDailyFacts: true,
              historicalEmployeeDailyRoles: true,
            },
          },
        },
      });

      if (!existing) {
        return { status: "missing" as const };
      }

      const blockers = STORE_DELETE_BLOCKERS.filter(
        ([key]) => existing._count[key] > 0,
      ).map(([, label]) => label);

      if (blockers.length > 0) {
        return { status: "in-use" as const, blockers };
      }

      const store: StoreActionData = {
        id: existing.id,
        name: existing.name,
        isActive: existing.isActive,
      };

      await writeAuditLog(tx, {
        action: "store.deleted",
        targetType: "Store",
        targetId: store.id,
        actorId: actor.id,
        before: toAuditStoreSnapshot(store, toDeleteAuditContext(actor.role)),
        after: null,
      });

      // 지점장 배정과 코드/외부 별칭은 Cascade라 함께 사라진다(설정값뿐이다).
      await tx.store.delete({ where: { id: storeId } });

      return { status: "deleted" as const, store };
    });

    if (result.status === "missing") {
      return actionError("STORE_NOT_FOUND", "지점을 찾을 수 없습니다.");
    }

    if (result.status === "in-use") {
      return storeInUseError(`${result.blockers.join(", ")} 기록이 있어`);
    }

    revalidateStorePaths();

    return actionOk(result.store);
  } catch (error) {
    if (isPrismaForeignKeyError(error)) {
      return storeInUseError("이 지점을 참조하는 기록이 있어");
    }

    throw error;
  }
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
