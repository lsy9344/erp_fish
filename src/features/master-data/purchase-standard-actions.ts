"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  purchaseStandardFormSchema,
  purchaseStandardStatusSchema,
  toPurchaseStandardFieldErrors,
  type PurchaseStandardFormInput,
  type PurchaseStandardStatusInput,
} from "./purchase-standard-schemas";

type PurchaseStandardActionData = {
  id: string;
  productId: string;
  productName: string;
  standardUnitPrice: number | null;
  referenceInfo: string | null;
  isActive: boolean;
};

type PurchaseStandardRecord = {
  id: string;
  productId: string;
  standardUnitPrice: number | null;
  referenceInfo: string | null;
  isActive: boolean;
  product: {
    id: string;
    name: string;
    isActive: boolean;
  };
};

const purchaseStandardSelect = {
  id: true,
  productId: true,
  standardUnitPrice: true,
  referenceInfo: true,
  isActive: true,
  product: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
} as const;

function revalidatePurchaseStandardPaths() {
  revalidatePath("/app/master-data/purchase-standards");
  revalidatePath("/app/master-data/products");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
}

function parsePurchaseStandardInput(
  input: unknown,
): ActionResult<PurchaseStandardFormInput> {
  const parsed = purchaseStandardFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toPurchaseStandardFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parsePurchaseStandardStatusInput(
  input: unknown,
): ActionResult<PurchaseStandardStatusInput> {
  const parsed = purchaseStandardStatusSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toPurchaseStandardFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function invalidProductError<T>(): ActionResult<T> {
  return actionError(
    "INVALID_PRODUCT",
    "활성 품목을 선택해 주세요.",
    {
      productId: ["활성 품목을 선택해 주세요."],
    },
  );
}

function inactiveProductActivationError<T>(): ActionResult<T> {
  return actionError(
    "INACTIVE_PRODUCT_STANDARD_ACTIVATION",
    "비활성 품목의 매입 기준은 활성화할 수 없습니다.",
  );
}

function missingPurchaseStandardError<T>(): ActionResult<T> {
  return actionError(
    "PURCHASE_STANDARD_NOT_FOUND",
    "매입 기준을 찾을 수 없습니다.",
  );
}

function getPurchaseStandardAuditAction(
  before: PurchaseStandardRecord,
  after: PurchaseStandardRecord,
) {
  if (before.isActive !== after.isActive) {
    return after.isActive
      ? "purchase_standard.activated"
      : "purchase_standard.deactivated";
  }

  return "purchase_standard.updated";
}

function toPurchaseStandardActionData(
  standard: PurchaseStandardRecord,
): PurchaseStandardActionData {
  return {
    id: standard.id,
    productId: standard.productId,
    productName: standard.product.name,
    standardUnitPrice: standard.standardUnitPrice,
    referenceInfo: standard.referenceInfo,
    isActive: standard.isActive,
  };
}

function toPurchaseStandardAuditValue(standard: PurchaseStandardRecord) {
  return {
    productId: standard.productId,
    productName: standard.product.name,
    standardUnitPrice: standard.standardUnitPrice,
    referenceInfo: standard.referenceInfo,
    isActive: standard.isActive,
  };
}

function isSamePurchaseStandard(
  standard: PurchaseStandardRecord,
  input: PurchaseStandardFormInput,
) {
  return (
    standard.productId === input.productId &&
    standard.standardUnitPrice === input.standardUnitPrice &&
    standard.referenceInfo === input.referenceInfo
  );
}

async function getProductActiveState(
  tx: Prisma.TransactionClient,
  productId: string,
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, isActive: true },
  });

  return product?.isActive ?? null;
}

export async function createPurchaseStandard(
  input: unknown,
): Promise<ActionResult<PurchaseStandardActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parsePurchaseStandardInput({
    ...(typeof input === "object" && input ? input : {}),
    isActive: true,
  });

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    if ((await getProductActiveState(tx, parsed.data.productId)) !== true) {
      return { status: "invalid-product" as const };
    }

    const created = await tx.purchaseStandard.create({
      data: {
        productId: parsed.data.productId,
        standardUnitPrice: parsed.data.standardUnitPrice,
        referenceInfo: parsed.data.referenceInfo,
        isActive: true,
        updatedById: actor.id,
      },
      select: purchaseStandardSelect,
    });

    await writeAuditLog(tx, {
      action: "purchase_standard.created",
      targetType: "PurchaseStandard",
      targetId: created.id,
      actorId: actor.id,
      before: null,
      after: toPurchaseStandardAuditValue(created),
    });

    return {
      status: "created" as const,
      standard: created,
    };
  });

  if (result.status === "invalid-product") {
    return invalidProductError();
  }

  revalidatePurchaseStandardPaths();

  return actionOk(toPurchaseStandardActionData(result.standard));
}

export async function updatePurchaseStandard(
  purchaseStandardId: string,
  input: unknown,
): Promise<ActionResult<PurchaseStandardActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parsePurchaseStandardInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.purchaseStandard.findUnique({
      where: { id: purchaseStandardId },
      select: purchaseStandardSelect,
    });

    if (!existing) {
      return { status: "missing" as const };
    }

    if (isSamePurchaseStandard(existing, parsed.data)) {
      return { status: "unchanged" as const, standard: existing };
    }

    const productIsActive =
      existing.productId === parsed.data.productId
        ? existing.product.isActive
        : await getProductActiveState(tx, parsed.data.productId);

    if (productIsActive !== true && existing.productId !== parsed.data.productId) {
      return { status: "invalid-product" as const };
    }

    const updated = await tx.purchaseStandard.update({
      where: { id: purchaseStandardId },
      data: {
        productId: parsed.data.productId,
        standardUnitPrice: parsed.data.standardUnitPrice,
        referenceInfo: parsed.data.referenceInfo,
        updatedById: actor.id,
      },
      select: purchaseStandardSelect,
    });

    await writeAuditLog(tx, {
      action: getPurchaseStandardAuditAction(existing, updated),
      targetType: "PurchaseStandard",
      targetId: updated.id,
      actorId: actor.id,
      before: toPurchaseStandardAuditValue(existing),
      after: toPurchaseStandardAuditValue(updated),
    });

    return {
      status: "updated" as const,
      standard: updated,
    };
  });

  if (result.status === "missing") {
    return missingPurchaseStandardError();
  }

  if (result.status === "invalid-product") {
    return invalidProductError();
  }

  if (result.status === "updated") {
    revalidatePurchaseStandardPaths();
  }

  return actionOk(toPurchaseStandardActionData(result.standard));
}

export async function updatePurchaseStandardStatus(
  purchaseStandardId: string,
  input: unknown,
): Promise<ActionResult<PurchaseStandardActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parsePurchaseStandardStatusInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.purchaseStandard.findUnique({
      where: { id: purchaseStandardId },
      select: purchaseStandardSelect,
    });

    if (!existing) {
      return { status: "missing" as const };
    }

    if (existing.isActive === parsed.data.isActive) {
      return { status: "unchanged" as const, standard: existing };
    }

    if (parsed.data.isActive && !existing.product.isActive) {
      return { status: "inactive-product-activation" as const };
    }

    const updated = await tx.purchaseStandard.update({
      where: { id: purchaseStandardId },
      data: {
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      select: purchaseStandardSelect,
    });

    await writeAuditLog(tx, {
      action: getPurchaseStandardAuditAction(existing, updated),
      targetType: "PurchaseStandard",
      targetId: updated.id,
      actorId: actor.id,
      before: toPurchaseStandardAuditValue(existing),
      after: toPurchaseStandardAuditValue(updated),
    });

    return {
      status: "updated" as const,
      standard: updated,
    };
  });

  if (result.status === "missing") {
    return missingPurchaseStandardError();
  }

  if (result.status === "inactive-product-activation") {
    return inactiveProductActivationError();
  }

  if (result.status === "updated") {
    revalidatePurchaseStandardPaths();
  }

  return actionOk(toPurchaseStandardActionData(result.standard));
}
