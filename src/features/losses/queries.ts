import type { Prisma } from "../../../generated/prisma";

import {
  getLossSignalCandidates,
  summarizeLossItems,
  type LossSignalThresholds,
} from "~/server/calculations/inventory";
import { requireHeadquartersLedgerScope, requireReportAccess } from "~/server/authz";
import { db } from "~/server/db";
import { getTodayStoreLedgerInTx } from "~/features/ledger/queries";
import { getStoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { type LossStepData } from "./types";

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
  actorId: string,
  thresholds: LossSignalThresholds = defaultLossSignalThresholds,
): Promise<LossStepData> {
  const ledger = await getTodayStoreLedgerInTx(tx, storeId, actorId);

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
  actorId: string,
): Promise<LossStepData> {
  return db.$transaction((tx) => getLossStepDataInTx(tx, storeId, actorId));
}

export async function getLossStepDataByLedgerId(
  ledgerId: string,
): Promise<LossStepData | null> {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction((tx) => getLossStepDataByLedgerIdInTx(tx, ledgerId));
}
