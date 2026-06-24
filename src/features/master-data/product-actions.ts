"use server";

import { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateMasterDataPaths } from "~/server/revalidation";
import {
  productFormSchema,
  productStatusSchema,
  toProductFieldErrors,
  type ProductFormInput,
  type ProductStatusInput,
} from "./product-schemas";

type ProductActionData = {
  id: string;
  name: string;
  category: string;
  spec: string;
  defaultUnitPrice: number | null;
  isActive: boolean;
};

const productSelect = {
  id: true,
  name: true,
  category: true,
  spec: true,
  defaultUnitPrice: true,
  isActive: true,
} as const;

function revalidateProductPaths() {
  revalidateMasterDataPaths("products");
}

function parseProductInput(input: unknown): ActionResult<ProductFormInput> {
  const parsed = productFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toProductFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseProductStatusInput(
  input: unknown,
): ActionResult<ProductStatusInput> {
  const parsed = productStatusSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toProductFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function duplicateProductError<T>(): ActionResult<T> {
  return actionError(
    "DUPLICATE_PRODUCT",
    "이미 같은 품목명, 구분, 규격의 품목이 있습니다.",
    {
      name: ["이미 같은 품목명, 구분, 규격의 품목이 있습니다."],
    },
  );
}

function missingProductError<T>(): ActionResult<T> {
  return actionError("PRODUCT_NOT_FOUND", "품목을 찾을 수 없습니다.");
}

function getProductAuditAction(
  before: ProductActionData,
  after: ProductActionData,
) {
  if (before.isActive !== after.isActive) {
    return after.isActive ? "product.activated" : "product.deactivated";
  }

  return "product.updated";
}

function toProductAuditValue(product: ProductActionData) {
  return {
    name: product.name,
    category: product.category,
    spec: product.spec,
    defaultUnitPrice: product.defaultUnitPrice,
    isActive: product.isActive,
  };
}

function isSameProduct(product: ProductActionData, input: ProductFormInput) {
  return (
    product.name === input.name &&
    product.category === input.category &&
    product.spec === input.spec &&
    product.defaultUnitPrice === input.defaultUnitPrice
  );
}

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findDuplicateProduct(
  tx: Prisma.TransactionClient,
  input: ProductFormInput,
  currentProductId?: string,
) {
  const duplicate = await tx.product.findFirst({
    where: {
      name: input.name,
      category: input.category,
      spec: input.spec,
    },
    select: { id: true },
  });

  return duplicate && duplicate.id !== currentProductId ? duplicate : null;
}

export async function createProduct(
  input: unknown,
): Promise<ActionResult<ProductActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseProductInput({
    ...(typeof input === "object" && input ? input : {}),
    isActive: true,
  });

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const duplicate = await findDuplicateProduct(tx, parsed.data);

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const created = await tx.product.create({
        data: {
          name: parsed.data.name,
          category: parsed.data.category,
          spec: parsed.data.spec,
          defaultUnitPrice: parsed.data.defaultUnitPrice,
          isActive: true,
          updatedById: actor.id,
        },
        select: productSelect,
      });

      await writeAuditLog(tx, {
        action: "product.created",
        targetType: "Product",
        targetId: created.id,
        actorId: actor.id,
        before: null,
        after: toProductAuditValue(created),
      });

      return {
        status: "created" as const,
        product: created,
      };
    });

    if (result.status === "duplicate") {
      return duplicateProductError();
    }

    revalidateProductPaths();

    return actionOk(result.product);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateProductError();
    }

    throw error;
  }
}

export async function updateProduct(
  productId: string,
  input: unknown,
): Promise<ActionResult<ProductActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseProductInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: productId },
        select: productSelect,
      });

      if (!existing) {
        return { status: "missing" as const };
      }

      if (isSameProduct(existing, parsed.data)) {
        return { status: "unchanged" as const, product: existing };
      }

      const duplicate = await findDuplicateProduct(tx, parsed.data, productId);

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          name: parsed.data.name,
          category: parsed.data.category,
          spec: parsed.data.spec,
          defaultUnitPrice: parsed.data.defaultUnitPrice,
          updatedById: actor.id,
        },
        select: productSelect,
      });

      await writeAuditLog(tx, {
        action: getProductAuditAction(existing, updated),
        targetType: "Product",
        targetId: updated.id,
        actorId: actor.id,
        before: toProductAuditValue(existing),
        after: toProductAuditValue(updated),
      });

      return {
        status: "updated" as const,
        product: updated,
      };
    });

    if (result.status === "missing") {
      return missingProductError();
    }

    if (result.status === "duplicate") {
      return duplicateProductError();
    }

    if (result.status === "updated") {
      revalidateProductPaths();
    }

    return actionOk(result.product);
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateProductError();
    }

    throw error;
  }
}

export async function updateProductStatus(
  productId: string,
  input: unknown,
): Promise<ActionResult<ProductActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseProductStatusInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({
      where: { id: productId },
      select: productSelect,
    });

    if (!existing) {
      return { status: "missing" as const };
    }

    if (existing.isActive === parsed.data.isActive) {
      return { status: "unchanged" as const, product: existing };
    }

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      select: productSelect,
    });

    await writeAuditLog(tx, {
      action: getProductAuditAction(existing, updated),
      targetType: "Product",
      targetId: updated.id,
      actorId: actor.id,
      before: toProductAuditValue(existing),
      after: toProductAuditValue(updated),
    });

    return {
      status: "updated" as const,
      product: updated,
    };
  });

  if (result.status === "missing") {
    return missingProductError();
  }

  if (result.status === "updated") {
    revalidateProductPaths();
  }

  return actionOk(result.product);
}
