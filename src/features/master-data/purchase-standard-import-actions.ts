"use server";

import { revalidatePath } from "next/cache";

import {
  EcountPurchaseImportError,
  parseEcountPurchaseWorkbook,
  type EcountPurchaseImportLine,
} from "~/features/ledger/ecount-purchase-import";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";

type PurchaseStandardImportResult = {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  productCreatedCount: number;
  matchedRowCount: number;
};

type ProductAuditValue = {
  name: string;
  category: string;
  spec: string;
  defaultUnitPrice: number;
  isActive: boolean;
};

type PurchaseStandardAuditValue = {
  productId: string;
  productName: string;
  standardUnitPrice: number | null;
  referenceInfo: string | null;
  isActive: boolean;
};

const maxUploadBytes = 5 * 1024 * 1024;

const productSelect = {
  id: true,
  name: true,
  category: true,
  spec: true,
  defaultUnitPrice: true,
  isActive: true,
} as const;

const purchaseStandardSelect = {
  id: true,
  productId: true,
  standardUnitPrice: true,
  referenceInfo: true,
  isActive: true,
  product: {
    select: {
      name: true,
    },
  },
} as const;

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function revalidatePurchaseStandardImportPaths() {
  revalidatePath("/app/master-data/purchase-standards");
  revalidatePath("/app/master-data/products");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
}

function toUniqueImportedPurchases(purchases: EcountPurchaseImportLine[]) {
  const unique = new Map<string, EcountPurchaseImportLine>();

  for (const purchase of purchases) {
    unique.set(
      [
        purchase.productName,
        purchase.productCategory,
        purchase.productSpec,
      ].join("\u001f"),
      purchase,
    );
  }

  return [...unique.values()];
}

function toProductAuditValue(product: ProductAuditValue) {
  return {
    name: product.name,
    category: product.category,
    spec: product.spec,
    defaultUnitPrice: product.defaultUnitPrice,
    isActive: product.isActive,
  };
}

function toPurchaseStandardAuditValue(
  standard: PurchaseStandardAuditValue,
): PurchaseStandardAuditValue {
  return {
    productId: standard.productId,
    productName: standard.productName,
    standardUnitPrice: standard.standardUnitPrice,
    referenceInfo: standard.referenceInfo,
    isActive: standard.isActive,
  };
}

function isSameImportedStandard(
  standard: PurchaseStandardAuditValue,
  next: PurchaseStandardAuditValue,
) {
  return (
    standard.standardUnitPrice === next.standardUnitPrice &&
    standard.referenceInfo === next.referenceInfo &&
    standard.isActive === next.isActive
  );
}

export async function importPurchaseStandardsFromEcount(
  formData: FormData,
): Promise<ActionResult<PurchaseStandardImportResult>> {
  const actor = await requireSettingsAccess();
  const file = formData.get("file");

  if (!isUploadFile(file)) {
    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 선택해 주세요.",
      {
        file: ["이카운트 엑셀 파일을 선택해 주세요."],
      },
    );
  }

  const fileName = "name" in file ? String(file.name) : "";

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return actionError(
      "VALIDATION_ERROR",
      "xlsx 파일만 업로드할 수 있습니다.",
      {
        file: ["xlsx 파일만 업로드할 수 있습니다."],
      },
    );
  }

  const bytes = await file.arrayBuffer();

  if (bytes.byteLength > maxUploadBytes) {
    return actionError("VALIDATION_ERROR", "엑셀 파일 용량을 확인해 주세요.", {
      file: ["5MB 이하의 xlsx 파일만 업로드할 수 있습니다."],
    });
  }

  let imported;

  try {
    imported = parseEcountPurchaseWorkbook(bytes, {
      storeName: "",
      closingDate: "",
    });
  } catch (error) {
    if (error instanceof EcountPurchaseImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError(
      "VALIDATION_ERROR",
      "이카운트 엑셀 파일을 읽을 수 없습니다.",
      { file: ["이카운트 엑셀 파일을 읽을 수 없습니다."] },
    );
  }

  try {
    const result = await db.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let productCreatedCount = 0;
      const purchases = toUniqueImportedPurchases(imported.purchases);

      for (const purchase of purchases) {
        const unitPrice = Number(purchase.unitPrice);
        const productWhere = {
          name_category_spec: {
            name: purchase.productName,
            category: purchase.productCategory,
            spec: purchase.productSpec,
          },
        };
        const existingProduct = await tx.product.findUnique({
          where: productWhere,
          select: productSelect,
        });
        const product = await tx.product.upsert({
          where: productWhere,
          create: {
            name: purchase.productName,
            category: purchase.productCategory,
            spec: purchase.productSpec,
            defaultUnitPrice: unitPrice,
            isActive: true,
            updatedById: actor.id,
          },
          update: {},
          select: productSelect,
        });

        if (!existingProduct) {
          productCreatedCount += 1;
          await writeAuditLog(tx, {
            action: "product.created",
            targetType: "Product",
            targetId: product.id,
            actorId: actor.id,
            before: null,
            after: toProductAuditValue(product),
            reason: "매입 기준 화면 이카운트 엑셀 업로드",
          });
        }

        const existingStandard = await tx.purchaseStandard.findFirst({
          where: { productId: product.id },
          orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
          select: purchaseStandardSelect,
        });
        const nextStandard = {
          productId: product.id,
          productName: product.name,
          standardUnitPrice: unitPrice,
          referenceInfo: purchase.referenceInfo,
          isActive: product.isActive,
        };

        if (!existingStandard) {
          const created = await tx.purchaseStandard.create({
            data: {
              productId: product.id,
              standardUnitPrice: unitPrice,
              referenceInfo: purchase.referenceInfo,
              isActive: product.isActive,
              updatedById: actor.id,
            },
            select: purchaseStandardSelect,
          });

          createdCount += 1;
          await writeAuditLog(tx, {
            action: "purchase_standard.ecount_import.created",
            targetType: "PurchaseStandard",
            targetId: created.id,
            actorId: actor.id,
            before: null,
            after: toPurchaseStandardAuditValue({
              productId: created.productId,
              productName: created.product.name,
              standardUnitPrice: created.standardUnitPrice,
              referenceInfo: created.referenceInfo,
              isActive: created.isActive,
            }),
            reason: "매입 기준 화면 이카운트 엑셀 업로드",
          });
          continue;
        }

        const beforeStandard = {
          productId: existingStandard.productId,
          productName: existingStandard.product.name,
          standardUnitPrice: existingStandard.standardUnitPrice,
          referenceInfo: existingStandard.referenceInfo,
          isActive: existingStandard.isActive,
        };

        if (isSameImportedStandard(beforeStandard, nextStandard)) {
          unchangedCount += 1;
          continue;
        }

        const updated = await tx.purchaseStandard.update({
          where: { id: existingStandard.id },
          data: {
            standardUnitPrice: unitPrice,
            referenceInfo: purchase.referenceInfo,
            isActive: product.isActive,
            updatedById: actor.id,
          },
          select: purchaseStandardSelect,
        });

        updatedCount += 1;
        await writeAuditLog(tx, {
          action: "purchase_standard.ecount_import.updated",
          targetType: "PurchaseStandard",
          targetId: updated.id,
          actorId: actor.id,
          before: toPurchaseStandardAuditValue(beforeStandard),
          after: toPurchaseStandardAuditValue({
            productId: updated.productId,
            productName: updated.product.name,
            standardUnitPrice: updated.standardUnitPrice,
            referenceInfo: updated.referenceInfo,
            isActive: updated.isActive,
          }),
          reason: "매입 기준 화면 이카운트 엑셀 업로드",
        });
      }

      return actionOk({
        importedCount: purchases.length,
        createdCount,
        updatedCount,
        unchangedCount,
        productCreatedCount,
        matchedRowCount: imported.matchedRowCount,
      });
    });

    if (result.ok) {
      revalidatePurchaseStandardImportPaths();
    }

    return result;
  } catch {
    return actionError(
      "PURCHASE_STANDARD_IMPORT_FAILED",
      "저장에 실패했습니다. 다시 시도해 주세요.",
    );
  }
}
