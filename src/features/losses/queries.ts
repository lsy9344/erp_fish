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
import { getInventoryPlanGateForLedgerInTx } from "~/features/ledger/inventory-plan-gate";
import { getLossInventoryAvailabilityLinesInTx } from "~/features/inventory/queries";
import { type LossStepData, type StoreManagerLossStepData } from "./types";
import { decimalToNumber } from "~/lib/decimal";
import { getAvailableLossProductIds } from "./availability";

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
  recoveredAmount: true,
  amount: true,
  usedPlannedPrice: true,
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
  carryoverSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  lossReviewedAt: true,
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
  const [productOptions, lossTypeOptions, lossItems, inventoryGate] =
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
      getInventoryPlanGateForLedgerInTx(tx, ledger),
    ]);
  // 미팅 결정(2026-06-21): 코드 표시명은 지점별 덮어쓰기(alias)가 있으면
  // 해당 지점 화면에서 우선 적용한다. 코드 자체는 본사 등록값을 유지한다.
  const lossTypeAliases = await tx.ledgerInputCodeStoreAlias.findMany({
    where: {
      storeId: ledger.storeId,
      ledgerInputCode: { group: "LOSS_TYPE" },
    },
    select: { ledgerInputCodeId: true, displayName: true },
  });
  const lossTypeAliasByCodeId = new Map(
    lossTypeAliases.map((alias) => [
      alias.ledgerInputCodeId,
      alias.displayName,
    ]),
  );
  const lossTypeOptionsWithAlias = lossTypeOptions.map((option) => ({
    ...option,
    name: lossTypeAliasByCodeId.get(option.id) ?? option.name,
  }));
  const mappedLossItems = lossItems.map((item) => ({
    ...item,
    quantity: decimalToNumber(item.quantity),
  }));
  const summary = summarizeLossItems(mappedLossItems);
  // 2026-09-02 요청: 손실 품목은 그 지점에 재고가 있는 품목에서만 고른다.
  // 재고에 없는 품목은 당일 판매한 가격도 없어 손실 단가가 0으로 잡힌다.
  // (본사 편집 화면도 같은 목록을 쓴다. 이미 저장된 행은 폼이 따로 살려 둔다.)
  const availableProductIds = getAvailableLossProductIds(
    await getLossInventoryAvailabilityLinesInTx(tx, {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
    }),
  );

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
      inventoryComplete: inventoryGate.complete,
      lossItemCount: mappedLossItems.length,
    }),
    productOptions: productOptions.filter((option) =>
      availableProductIds.has(option.id),
    ),
    lossTypeOptions: lossTypeOptionsWithAlias,
    lossItems: mappedLossItems,
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
  availableProductIds?: ReadonlySet<string>,
): StoreManagerLossStepData {
  return {
    ...data,
    productOptions: data.productOptions
      .filter(
        (option) =>
          availableProductIds === undefined ||
          availableProductIds.has(option.id),
      )
      .map(({ defaultUnitPrice, ...option }) => {
        void defaultUnitPrice;

        return option;
      }),
    lossItems: data.lossItems.map(({ unitPrice, amount, ...item }) => {
      void unitPrice;
      void amount;

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
