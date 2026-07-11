"use server";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import type { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { decimalToNumber } from "~/lib/decimal";
import { writeAuditLog } from "~/server/audit";
import { requireEcountUploadCommitAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  getNextInventoryLedgerDate,
  InventoryOpeningImportError,
  parseInventoryOpeningWorkbook,
  type InventoryOpeningImportRow,
} from "./opening-import";

const maxUploadBytes = 5 * 1024 * 1024;
const xlsxMimeType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type InventoryOpeningUploadResult = {
  fileName: string;
  sheetName: string;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  yearMonths: string[];
  storeCount: number;
  totalQuantity: number;
  totalInventoryAmount: number;
  existingLedgerCount: number;
  existingLedgerStoreNames: string[];
};

type MatchedInventoryOpeningRow = InventoryOpeningImportRow & {
  storeId: string;
  productId: string;
  productSnapshotName: string;
  productSnapshotCategory: string;
  productSnapshotSpec: string;
};

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function uploadKey(
  row: Pick<MatchedInventoryOpeningRow, "storeId" | "yearMonth" | "productId">,
) {
  return [row.storeId, row.yearMonth, row.productId].join("\u001f");
}

function productKey(name: string, category: string, spec: string) {
  return [name.trim(), category.trim(), spec.trim()].join("\u001f");
}

function snapshotChanged(
  existing: {
    productName: string;
    productCategory: string;
    productSpec: string;
    unitPrice: number;
    quantity: Prisma.Decimal;
  },
  row: MatchedInventoryOpeningRow,
) {
  return (
    existing.productName !== row.productSnapshotName ||
    existing.productCategory !== row.productSnapshotCategory ||
    existing.productSpec !== row.productSnapshotSpec ||
    existing.unitPrice !== row.unitPrice ||
    decimalToNumber(existing.quantity) !== row.quantity
  );
}

function toSnapshotData(row: MatchedInventoryOpeningRow) {
  return {
    storeId: row.storeId,
    yearMonth: row.yearMonth,
    productId: row.productId,
    productName: row.productSnapshotName,
    productCategory: row.productSnapshotCategory,
    productSpec: row.productSnapshotSpec,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
  };
}

async function matchRows(
  tx: Prisma.TransactionClient,
  rows: InventoryOpeningImportRow[],
) {
  const [stores, products] = await Promise.all([
    tx.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    tx.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        spec: true,
      },
    }),
  ]);
  const storeByName = new Map(stores.map((store) => [store.name, store]));
  const productByKey = new Map(
    products.map((product) => [
      productKey(product.name, product.category, product.spec),
      product,
    ]),
  );
  const matchedRows: MatchedInventoryOpeningRow[] = [];
  const errors: string[] = [];
  const seenRows = new Map<string, number>();

  for (const row of rows) {
    const store = storeByName.get(row.storeName);
    const product = productByKey.get(
      productKey(row.productName, row.productCategory, row.productSpec),
    );

    if (!store) {
      errors.push(`${row.rowNumber}행 지점명 "${row.storeName}"을 찾을 수 없습니다.`);
      continue;
    }

    if (!product) {
      errors.push(
        `${row.rowNumber}행 품목 "${row.productName}" / "${row.productCategory}" / "${row.productSpec}"을 찾을 수 없습니다.`,
      );
      continue;
    }

    const matchedRow: MatchedInventoryOpeningRow = {
      ...row,
      storeId: store.id,
      productId: product.id,
      productSnapshotName: product.name,
      productSnapshotCategory: product.category,
      productSnapshotSpec: product.spec,
    };
    const key = uploadKey(matchedRow);
    const firstRowNumber = seenRows.get(key);

    if (firstRowNumber) {
      errors.push(
        `${row.rowNumber}행이 ${firstRowNumber}행과 같은 기준월/지점/품목입니다.`,
      );
      continue;
    }

    seenRows.set(key, row.rowNumber);
    matchedRows.push(matchedRow);
  }

  return { matchedRows, errors };
}

export async function uploadInventoryOpeningSnapshots(
  formData: FormData,
): Promise<ActionResult<InventoryOpeningUploadResult>> {
  const actor = await requireEcountUploadCommitAccess();
  const file = formData.get("inventoryFile");

  if (!isUploadFile(file)) {
    return actionError("VALIDATION_ERROR", "재고 엑셀 파일을 선택해 주세요.", {
      file: ["재고 엑셀 파일을 선택해 주세요."],
    });
  }

  const browserFileName =
    "name" in file && typeof file.name === "string" ? file.name : "";
  const clientFileNameValue = formData.get("inventoryFileName");
  const clientFileName =
    typeof clientFileNameValue === "string" ? clientFileNameValue.trim() : "";
  const fileName = browserFileName.toLowerCase().endsWith(".xlsx")
    ? browserFileName
    : clientFileName || browserFileName;
  const fileType =
    "type" in file && typeof file.type === "string"
      ? file.type.toLowerCase()
      : "";

  if (!fileName.toLowerCase().endsWith(".xlsx") && fileType !== xlsxMimeType) {
    return actionError("VALIDATION_ERROR", "xlsx 파일만 업로드할 수 있습니다.", {
      file: ["xlsx 파일만 업로드할 수 있습니다."],
    });
  }

  const bytes = await file.arrayBuffer();

  if (bytes.byteLength > maxUploadBytes) {
    return actionError("VALIDATION_ERROR", "엑셀 파일 용량을 확인해 주세요.", {
      file: ["5MB 이하의 xlsx 파일만 업로드할 수 있습니다."],
    });
  }

  let parsed;

  try {
    parsed = parseInventoryOpeningWorkbook(bytes);
  } catch (error) {
    if (error instanceof InventoryOpeningImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError("VALIDATION_ERROR", "재고 엑셀 파일을 읽을 수 없습니다.", {
      file: ["재고 엑셀 파일을 읽을 수 없습니다."],
    });
  }

  const fileHash = createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");

  try {
    const result = await db.$transaction(async (tx) => {
      const { matchedRows, errors } = await matchRows(tx, parsed.rows);

      if (errors.length > 0) {
        throw new InventoryOpeningImportError(
          "재고 파일 내용을 확인해 주세요.",
          { file: errors },
        );
      }

      const ledgerTargets = [
        ...new Map(
          matchedRows.map((row) => {
            const nextDate = getNextInventoryLedgerDate(row.inventoryDate);

            return [
              `${row.storeId}\u001f${nextDate}`,
              {
                storeId: row.storeId,
                closingDate: new Date(`${nextDate}T00:00:00.000Z`),
              },
            ] as const;
          }),
        ).values(),
      ];
      const existingLedgers = await tx.dailyLedger.findMany({
        where: {
          OR: ledgerTargets,
          ledgerInventoryItems: { some: {} },
        },
        select: { store: { select: { name: true } } },
      });
      const existingLedgerStoreNames = [
        ...new Set(existingLedgers.map((ledger) => ledger.store.name)),
      ];

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const row of matchedRows) {
        const where = {
          storeId_yearMonth_productId: {
            storeId: row.storeId,
            yearMonth: row.yearMonth,
            productId: row.productId,
          },
        };
        const existing = await tx.inventoryOpeningSnapshot.findUnique({
          where,
          select: {
            productName: true,
            productCategory: true,
            productSpec: true,
            unitPrice: true,
            quantity: true,
          },
        });
        const data = toSnapshotData(row);

        if (!existing) {
          createdCount += 1;
        } else if (snapshotChanged(existing, row)) {
          updatedCount += 1;
        } else {
          unchangedCount += 1;
        }

        await tx.inventoryOpeningSnapshot.upsert({
          where,
          create: data,
          update: {
            productName: data.productName,
            productCategory: data.productCategory,
            productSpec: data.productSpec,
            unitPrice: data.unitPrice,
            quantity: data.quantity,
          },
        });
      }

      const summary: InventoryOpeningUploadResult = {
        fileName,
        sheetName: parsed.sheetName,
        importedCount: matchedRows.length,
        createdCount,
        updatedCount,
        unchangedCount,
        yearMonths: parsed.yearMonths,
        storeCount: new Set(matchedRows.map((row) => row.storeId)).size,
        totalQuantity: parsed.totalQuantity,
        totalInventoryAmount: parsed.totalInventoryAmount,
        existingLedgerCount: existingLedgerStoreNames.length,
        existingLedgerStoreNames,
      };

      await writeAuditLog(tx, {
        action: "inventory_opening_snapshot.imported",
        targetType: "InventoryOpeningSnapshot",
        targetId: fileHash,
        actorId: actor.id,
        before: null,
        after: summary,
      });

      return summary;
    });

    revalidatePath("/app/ecount-imports");
    revalidatePath("/app/store-entry/inventory");

    return actionOk(result);
  } catch (error) {
    if (error instanceof InventoryOpeningImportError) {
      return actionError("VALIDATION_ERROR", error.message, error.fieldErrors);
    }

    return actionError("UNKNOWN", "재고 파일 업로드 중 오류가 발생했습니다.");
  }
}
