import type { Prisma } from "../../../generated/prisma";

import {
  getLossSignalCandidates,
  summarizeLossItems,
  type LossSignalThresholds,
} from "~/server/calculations/inventory";
import { db } from "~/server/db";
import { getTodayStoreLedgerInTx } from "~/features/ledger/queries";
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

export async function getLossStepDataInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  actorId: string,
  thresholds: LossSignalThresholds = defaultLossSignalThresholds,
): Promise<LossStepData> {
  const ledger = await getTodayStoreLedgerInTx(tx, storeId, actorId);
  const [productOptions, lossTypeOptions, lossItems] = await Promise.all([
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
  ]);
  const summary = summarizeLossItems(lossItems);

  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    status: ledger.status,
    productOptions,
    lossTypeOptions,
    lossItems,
    summary,
    signalCandidates: getLossSignalCandidates(summary.byProduct, thresholds),
  };
}

export async function getLossStepData(
  storeId: string,
  actorId: string,
): Promise<LossStepData> {
  return db.$transaction((tx) => getLossStepDataInTx(tx, storeId, actorId));
}
