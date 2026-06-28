// WO(2026-06-24): 이카운트 출고/입고 업로드 batch 조회. 목록/상세 화면과 서버 액션이 함께 쓴다.

import {
  ECOUNT_BATCH_STATUS_LABELS,
  getEcountLineStatusLabel,
  type EcountBatchStatus,
  type EcountLineStatus,
} from "~/features/ledger/ecount-supply-mapping";
import { db } from "~/server/db";

export type EcountImportBatchListItem = {
  id: string;
  fileName: string;
  sheetName: string;
  status: EcountBatchStatus;
  statusLabel: string;
  businessDate: string | null;
  lineCount: number;
  totalSupplyAmount: number;
  uploadedByName: string | null;
  createdAt: string;
  committedAt: string | null;
};

export type EcountImportLineDetail = {
  id: string;
  rowNumber: number;
  dateNo: string;
  rawStoreName: string;
  storeId: string | null;
  storeName: string | null;
  rawProductName: string;
  productId: string | null;
  productName: string;
  productCategory: string;
  productSpec: string;
  quantity: number;
  unitPrice: number;
  supplyAmount: number;
  totalAmount: number;
  // WO-01(2026-06-28): 라인 상태는 배치 상태 타입을 재사용하지 않고 라인 상태 타입을 쓴다.
  status: EcountLineStatus;
  statusLabel: string;
  errorMessage: string | null;
  ledgerPurchaseItemId: string | null;
};

export type EcountStoreGroupDetail = {
  rawStoreName: string;
  storeId: string | null;
  storeName: string | null;
  lineCount: number;
  totalQuantity: number;
  totalSupplyAmount: number;
  lines: EcountImportLineDetail[];
};

export type EcountUnmappedStore = {
  rawStoreName: string;
  lineCount: number;
};

export type EcountUnmappedProduct = {
  rawProductName: string;
  productSpec: string;
  productName: string;
  productCategory: string;
  lineCount: number;
};

export type EcountImportBatchDetail = {
  id: string;
  fileName: string;
  fileHash: string;
  sheetName: string;
  status: EcountBatchStatus;
  statusLabel: string;
  businessDate: string | null;
  uploadedByName: string | null;
  createdAt: string;
  committedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  errorMessage: string | null;
  lineCount: number;
  totalQuantity: number;
  totalSupplyAmount: number;
  storeGroups: EcountStoreGroupDetail[];
  unmappedStores: EcountUnmappedStore[];
  unmappedProducts: EcountUnmappedProduct[];
  amountMismatchLines: EcountImportLineDetail[];
  canCommit: boolean;
  canVoid: boolean;
};

function toStatusLabel(status: string): string {
  return ECOUNT_BATCH_STATUS_LABELS[status as EcountBatchStatus] ?? status;
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function listEcountImportBatches(
  limit = 50,
): Promise<EcountImportBatchListItem[]> {
  const batches = await db.ecountImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { lines: true } },
      lines: { select: { supplyAmount: true } },
    },
  });

  return batches.map((batch) => ({
    id: batch.id,
    fileName: batch.fileName,
    sheetName: batch.sheetName,
    status: batch.status as EcountBatchStatus,
    statusLabel: toStatusLabel(batch.status),
    businessDate: toDateString(batch.businessDate),
    lineCount: batch._count.lines,
    totalSupplyAmount: batch.lines.reduce(
      (sum, line) => sum + line.supplyAmount,
      0,
    ),
    uploadedByName: batch.uploadedBy?.name ?? null,
    createdAt: batch.createdAt.toISOString(),
    committedAt: toDateString(batch.committedAt),
  }));
}

export async function getEcountSupplyImportDetail(
  batchId: string,
): Promise<EcountImportBatchDetail | null> {
  const batch = await db.ecountImportBatch.findUnique({
    where: { id: batchId },
    include: {
      uploadedBy: { select: { name: true } },
      lines: {
        orderBy: { rowNumber: "asc" },
        include: {
          store: { select: { name: true } },
        },
      },
    },
  });

  if (!batch) {
    return null;
  }

  const lines: EcountImportLineDetail[] = batch.lines.map((line) => ({
    id: line.id,
    rowNumber: line.rowNumber,
    dateNo: line.dateNo,
    rawStoreName: line.rawStoreName,
    storeId: line.storeId,
    storeName: line.store?.name ?? null,
    rawProductName: line.rawProductName,
    productId: line.productId,
    productName: line.productName,
    productCategory: line.productCategory,
    productSpec: line.productSpec,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    supplyAmount: line.supplyAmount,
    totalAmount: line.totalAmount,
    status: line.status as EcountLineStatus,
    statusLabel: getEcountLineStatusLabel(line.status as EcountLineStatus),
    errorMessage: line.errorMessage,
    ledgerPurchaseItemId: line.ledgerPurchaseItemId,
  }));

  const storeGroupMap = new Map<string, EcountStoreGroupDetail>();

  for (const line of lines) {
    const existing = storeGroupMap.get(line.rawStoreName);

    if (existing) {
      existing.lineCount += 1;
      existing.totalQuantity += line.quantity;
      existing.totalSupplyAmount += line.supplyAmount;
      existing.lines.push(line);

      if (!existing.storeId && line.storeId) {
        existing.storeId = line.storeId;
        existing.storeName = line.storeName;
      }
    } else {
      storeGroupMap.set(line.rawStoreName, {
        rawStoreName: line.rawStoreName,
        storeId: line.storeId,
        storeName: line.storeName,
        lineCount: 1,
        totalQuantity: line.quantity,
        totalSupplyAmount: line.supplyAmount,
        lines: [line],
      });
    }
  }

  const storeGroups = [...storeGroupMap.values()].sort((left, right) =>
    left.rawStoreName.localeCompare(right.rawStoreName, "ko"),
  );

  const unmappedStoreMap = new Map<string, EcountUnmappedStore>();
  const unmappedProductMap = new Map<string, EcountUnmappedProduct>();

  for (const line of lines) {
    if (!line.storeId) {
      const existing = unmappedStoreMap.get(line.rawStoreName);
      if (existing) {
        existing.lineCount += 1;
      } else {
        unmappedStoreMap.set(line.rawStoreName, {
          rawStoreName: line.rawStoreName,
          lineCount: 1,
        });
      }
    }

    if (!line.productId) {
      const key = `${line.rawProductName}${line.productSpec}`;
      const existing = unmappedProductMap.get(key);
      if (existing) {
        existing.lineCount += 1;
      } else {
        unmappedProductMap.set(key, {
          rawProductName: line.rawProductName,
          productSpec: line.productSpec,
          productName: line.productName,
          productCategory: line.productCategory,
          lineCount: 1,
        });
      }
    }
  }

  const status = batch.status as EcountBatchStatus;

  return {
    id: batch.id,
    fileName: batch.fileName,
    fileHash: batch.fileHash,
    sheetName: batch.sheetName,
    status,
    statusLabel: toStatusLabel(batch.status),
    businessDate: toDateString(batch.businessDate),
    uploadedByName: batch.uploadedBy?.name ?? null,
    createdAt: batch.createdAt.toISOString(),
    committedAt: toDateString(batch.committedAt),
    voidedAt: toDateString(batch.voidedAt),
    voidReason: batch.voidReason,
    errorMessage: batch.errorMessage,
    lineCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalSupplyAmount: lines.reduce((sum, line) => sum + line.supplyAmount, 0),
    storeGroups,
    unmappedStores: [...unmappedStoreMap.values()],
    unmappedProducts: [...unmappedProductMap.values()],
    amountMismatchLines: lines.filter((line) => line.errorMessage),
    canCommit: status === "READY",
    canVoid: status !== "COMMITTED" && status !== "VOIDED",
  };
}
