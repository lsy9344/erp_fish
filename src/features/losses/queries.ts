import type { Prisma } from "../../../generated/prisma";

import {
  getLossSignalCandidates,
  summarizeLossItems,
  type LossSignalThresholds,
} from "~/server/calculations/inventory";
import {
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { getStoreLedgerInTx } from "~/features/ledger/queries";
import { getStoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { type LossStepData, type StoreManagerLossStepData } from "./types";

const lossItemSelect = {
  id: true,
  productId: true,
  ledgerInputCodeId: true,
  productName: true,
  productCategory: true,
  productSpec: true,
  unitPrice: true,
  lossTypeName: true,
  quantity: true,
  amount: true,
  reason: true,
} as const;

const defaultLossSignalThresholds: LossSignalThresholds = {
  quantity: 0,
  amount: 0,
};

const lossLedgerSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  updatedAt: true,
  version: true,
  authorDisplayName: true,
  status: true,
  totalSalesAmount: true,
  workerCount: true,
  ledgerExpenses: {
    select: {
      id: true,
    },
  },
  ledgerPurchaseItems: {
    select: {
      id: true,
    },
  },
} as const;

type LossLedgerPayload = Prisma.DailyLedgerGetPayload<{
  select: typeof lossLedgerSelect;
}>;

async function getLossStepDataForLedgerInTx(
  tx: Prisma.TransactionClient,
  ledger: LossLedgerPayload,
  thresholds: LossSignalThresholds = defaultLossSignalThresholds,
): Promise<LossStepData> {
  const [productOptions, lossTypeOptions, lossItems, inventoryItemCount] =
    await Promise.all([
      tx.product.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          spec: true,
          defaultUnitPrice: true,
        },
      }),
      tx.ledgerInputCode.findMany({
        where: { isActive: true, group: "LOSS_TYPE" },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          displayOrder: true,
        },
      }),
      tx.ledgerLossItem.findMany({
        where: { dailyLedgerId: ledger.id },
        select: lossItemSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      tx.ledgerInventoryItem.count({
        where: { dailyLedgerId: ledger.id },
      }),
    ]);
  const summary = summarizeLossItems(lossItems);

  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName ?? null,
    status: ledger.status,
    stepCompletion: getStoreEntryStepCompletion({
      ...ledger,
      inventoryItemCount,
      lossItemCount: lossItems.length,
    }),
    productOptions,
    lossTypeOptions,
    lossItems,
    summary,
    signalCandidates: getLossSignalCandidates(summary.byProduct, thresholds),
  };
}

export async function getLossStepDataInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDate: string | Date,
  actorId: string,
  thresholds: LossSignalThresholds = defaultLossSignalThresholds,
): Promise<LossStepData> {
  const ledger = await getStoreLedgerInTx(tx, storeId, closingDate, actorId);

  return getLossStepDataForLedgerInTx(tx, ledger, thresholds);
}

export async function getLossStepDataByLedgerIdInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  thresholds: LossSignalThresholds = defaultLossSignalThresholds,
): Promise<LossStepData | null> {
  const ledger = await tx.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: lossLedgerSelect,
  });

  if (!ledger) {
    return null;
  }

  return getLossStepDataForLedgerInTx(tx, ledger, thresholds);
}

export async function getLossStepData(
  storeId: string,
  closingDate: string | Date,
  actorId: string,
): Promise<StoreManagerLossStepData> {
  const data = await db.$transaction((tx) =>
    getLossStepDataInTx(tx, storeId, closingDate, actorId),
  );

  return toStoreManagerLossStepData(data);
}

export async function getLossStepDataByLedgerId(
  ledgerId: string,
): Promise<LossStepData | null> {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction((tx) => getLossStepDataByLedgerIdInTx(tx, ledgerId));
}

export function toStoreManagerLossStepData(
  data: LossStepData,
): StoreManagerLossStepData {
  return {
    ...data,
    productOptions: data.productOptions.map(
      ({ defaultUnitPrice, ...option }) => {
        void defaultUnitPrice;

        return option;
      },
    ),
    lossItems: data.lossItems.map(({ unitPrice, ...item }) => {
      void unitPrice;

      return item;
    }),
    summary: {
      totalQuantity: data.summary.totalQuantity,
      byProduct: data.summary.byProduct.map(({ amount, ...item }) => {
        void amount;

        return item;
      }),
    },
    signalCandidates: data.signalCandidates.map(
      ({ amount, exceededAmount, ...item }) => {
        void amount;
        void exceededAmount;

        return item;
      },
    ),
  };
}
