"use server";

import {
  EcountPurchaseImportError,
  parseEcountPurchaseWorkbook,
  type EcountPurchaseImportLine,
} from "~/features/ledger/ecount-purchase-import";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateMasterDataPaths } from "~/server/revalidation";

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
const duplicateImportPurchaseStandardCode =
  "DUPLICATE_IMPORT_PURCHASE_STANDARD";

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
  revalidateMasterDataPaths("purchase-standards");
}

function getImportedPurchaseKey(purchase: EcountPurchaseImportLine) {
  return [
    purchase.productName,
    purchase.productCategory,
    purchase.productSpec,
  ].join("\u001f");
}

function findDuplicateImportedPurchaseConflict(
  purchases: EcountPurchaseImportLine[],
) {
  const firstByKey = new Map<string, EcountPurchaseImportLine>();

  for (const purchase of purchases) {
    const key = getImportedPurchaseKey(purchase);
    const first = firstByKey.get(key);

    if (!first) {
      firstByKey.set(key, purchase);
      continue;
    }

    if (
      first.unitPrice !== purchase.unitPrice ||
      first.referenceUnitPrice !== purchase.referenceUnitPrice
    ) {
      return {
        productName: purchase.productName,
        productCategory: purchase.productCategory,
        productSpec: purchase.productSpec,
      };
    }
  }

  return null;
}

function toUniqueImportedPurchases(purchases: EcountPurchaseImportLine[]) {
  const unique = new Map<string, EcountPurchaseImportLine>();

  for (const purchase of purchases) {
    const key = getImportedPurchaseKey(purchase);

    if (!unique.has(key)) {
      unique.set(key, purchase);
    }
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

/**
 * @deprecated WO(2026-06-24): 이카운트 정책 전환으로 사용 중단됨. 이카운트 엑셀은 더 이상
 * PurchaseStandard 생성 파일이 아니다. 본사 이카운트 업로드(`previewEcountSupplyUpload` /
 * `commitEcountSupplyImport`)를 사용한다. UI에서 호출 경로는 제거되었으며, 이 함수는
 * 하위 호환/이력 목적으로만 남는다.
 */
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
      validateLedgerScope: false,
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

  const duplicateConflict = findDuplicateImportedPurchaseConflict(
    imported.purchases,
  );

  if (duplicateConflict) {
    return actionError(
      "VALIDATION_ERROR",
      "업로드 파일에 같은 품목의 서로 다른 매입 기준이 있습니다.",
      {
        file: [
          `${duplicateImportPurchaseStandardCode}: ${duplicateConflict.productName} (${duplicateConflict.productCategory}, ${duplicateConflict.productSpec})의 단가가 서로 다릅니다.`,
        ],
      },
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

        const existingStandard = await tx.purchaseStandard.findUnique({
          where: { productId: product.id },
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
