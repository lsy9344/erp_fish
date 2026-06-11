import { InventoryCarryoverSource } from "../../../generated/prisma";
import type { Prisma } from "../../../generated/prisma";

import { calculateInventoryAmount } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  ledgerSelect,
  getTodayStoreLedgerInTx,
} from "~/features/ledger/queries";
import { getStoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { requireHeadquartersLedgerScope, requireReportAccess } from "~/server/authz";
import { type InventoryStepData, type InventoryStepLine } from "./types";

const inventoryItemSelect = {
  id: true,
  productId: true,
  productName: true,
  productCategory: true,
  productSpec: true,
  unitPrice: true,
  previousQuantity: true,
  purchasedQuantity: true,
  currentQuantity: true,
  quantity: true,
  inventoryAmount: true,
  isModified: true,
  carryoverSource: true,
  carryoverLedgerId: true,
} as const;

const inventoryAdjustmentSelect = {
  id: true,
  dailyLedgerId: true,
  productId: true,
  beforeQuantity: true,
  beforeAmount: true,
  afterQuantity: true,
  afterAmount: true,
  differenceQuantity: true,
  differenceAmount: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

type InventoryItemPayload = Prisma.LedgerInventoryItemGetPayload<{
  select: typeof inventoryItemSelect;
}>;

type InventoryAdjustmentPayload = Prisma.LedgerInventoryAdjustmentGetPayload<{
  select: typeof inventoryAdjustmentSelect;
}>;

type InventoryLedgerPayload = Awaited<
  ReturnType<typeof getTodayStoreLedgerInTx>
>;

type PurchasePayload = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

type PurchaseAggregate = {
  quantity: number;
  amount: number;
  base: ProductInventoryBase;
};

type LossPayload = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

type LossAggregate = {
  quantity: number;
  amount: number;
  base: ProductInventoryBase;
};

type ProductInventoryBase = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  previousQuantity: number;
  carryoverSource: InventoryCarryoverSource;
  carryoverLedgerId: string | null;
};

function getYearMonth(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function getMonthStart(date: Date) {
  const [year, month] = getYearMonth(date).split("-");

  return new Date(Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0));
}

function aggregatePurchases(purchases: PurchasePayload[]) {
  const aggregates = new Map<string, PurchaseAggregate>();

  for (const purchase of purchases) {
    const current = aggregates.get(purchase.productId);

    if (current) {
      current.quantity += purchase.quantity;
      current.amount += purchase.amount;
      continue;
    }

    aggregates.set(purchase.productId, {
      quantity: purchase.quantity,
      amount: purchase.amount,
      base: {
        productId: purchase.productId,
        productName: purchase.productName,
        productCategory: purchase.productCategory,
        productSpec: purchase.productSpec,
        unitPrice: purchase.unitPrice,
        previousQuantity: 0,
        carryoverSource: InventoryCarryoverSource.MANUAL,
        carryoverLedgerId: null,
      },
    });
  }

  return aggregates;
}

function aggregateLosses(losses: LossPayload[]) {
  const aggregates = new Map<string, LossAggregate>();

  for (const loss of losses) {
    const current = aggregates.get(loss.productId);

    if (current) {
      current.quantity += loss.quantity;
      current.amount += loss.amount;
      continue;
    }

    aggregates.set(loss.productId, {
      quantity: loss.quantity,
      amount: loss.amount,
      base: {
        productId: loss.productId,
        productName: loss.productName,
        productCategory: loss.productCategory,
        productSpec: loss.productSpec,
        unitPrice: loss.unitPrice,
        previousQuantity: 0,
        carryoverSource: InventoryCarryoverSource.MANUAL,
        carryoverLedgerId: null,
      },
    });
  }

  return aggregates;
}

function toInventoryLine(
  base: ProductInventoryBase,
  purchasedQuantity: number,
  loss: LossAggregate | undefined,
): InventoryStepLine {
  const currentQuantity = base.previousQuantity;
  const quantity = base.previousQuantity;

  return {
    id: base.productId,
    productId: base.productId,
    productName: base.productName,
    productCategory: base.productCategory,
    productSpec: base.productSpec,
    unitPrice: base.unitPrice,
    previousQuantity: base.previousQuantity,
    purchasedQuantity,
    purchaseAmount: 0,
    lossQuantity: loss?.quantity ?? 0,
    lossAmount: loss?.amount ?? 0,
    currentQuantity,
    quantity,
    inventoryAmount: calculateInventoryAmount(quantity, base.unitPrice),
    carryoverSource: base.carryoverSource,
    carryoverLedgerId: base.carryoverLedgerId,
    isModified: false,
    adjustment: null,
  };
}

function toAdjustmentView(adjustment: InventoryAdjustmentPayload | undefined) {
  if (!adjustment) {
    return null;
  }

  return {
    id: adjustment.id,
    beforeQuantity: adjustment.beforeQuantity,
    beforeAmount: adjustment.beforeAmount,
    afterQuantity: adjustment.afterQuantity,
    afterAmount: adjustment.afterAmount,
    differenceQuantity: adjustment.differenceQuantity,
    differenceAmount: adjustment.differenceAmount,
    reason: adjustment.reason,
    createdByName: adjustment.createdBy.name ?? adjustment.createdBy.email,
    createdAt: adjustment.createdAt.toISOString(),
    updatedAt: adjustment.updatedAt.toISOString(),
  };
}

function toExistingInventoryLine(
  item: InventoryItemPayload,
  purchase: PurchaseAggregate | undefined,
  loss: LossAggregate | undefined,
  adjustment: InventoryAdjustmentPayload | undefined,
): InventoryStepLine {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    previousQuantity: item.previousQuantity,
    purchasedQuantity: purchase?.quantity ?? item.purchasedQuantity,
    purchaseAmount: purchase?.amount ?? 0,
    lossQuantity: loss?.quantity ?? 0,
    lossAmount: loss?.amount ?? 0,
    currentQuantity: item.currentQuantity,
    quantity: item.quantity,
    inventoryAmount: item.inventoryAmount,
    carryoverSource: item.carryoverSource,
    carryoverLedgerId: item.carryoverLedgerId,
    isModified: item.isModified,
    adjustment: toAdjustmentView(adjustment),
  };
}

function withPurchaseAggregate(
  line: InventoryStepLine,
  purchase: PurchaseAggregate | undefined,
  loss: LossAggregate | undefined,
): InventoryStepLine {
  return {
    ...line,
    purchasedQuantity: purchase?.quantity ?? line.purchasedQuantity,
    purchaseAmount: purchase?.amount ?? line.purchaseAmount,
    lossQuantity: loss?.quantity ?? line.lossQuantity,
    lossAmount: loss?.amount ?? line.lossAmount,
  };
}

function mergeActivityBases(
  bases: ProductInventoryBase[],
  purchases: Map<string, PurchaseAggregate>,
  losses: Map<string, LossAggregate>,
) {
  const knownProductIds = new Set(bases.map((base) => base.productId));
  const merged = [...bases];

  for (const [productId, purchase] of purchases) {
    if (!knownProductIds.has(productId)) {
      merged.push(purchase.base);
      knownProductIds.add(productId);
    }
  }

  for (const [productId, loss] of losses) {
    if (!knownProductIds.has(productId)) {
      merged.push(loss.base);
      knownProductIds.add(productId);
    }
  }

  return merged;
}

async function mergeExistingInventoryLines(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  existingItems: InventoryItemPayload[],
  purchases: Map<string, PurchaseAggregate>,
  losses: Map<string, LossAggregate>,
) {
  const existingProductIds = new Set(
    existingItems.map((item) => item.productId),
  );
  const adjustments = await tx.ledgerInventoryAdjustment.findMany({
    where: {
      dailyLedgerId,
    },
    select: inventoryAdjustmentSelect,
  });
  const adjustmentByProductId = new Map(
    adjustments.map((adjustment) => [adjustment.productId, adjustment]),
  );
  const lines = existingItems.map((item) =>
    toExistingInventoryLine(
      item,
      purchases.get(item.productId),
      losses.get(item.productId),
      adjustmentByProductId.get(item.productId),
    ),
  );
  const activeProductBases = await getActiveProductBases(tx);

  for (const base of mergeActivityBases(
    activeProductBases,
    purchases,
    losses,
  )) {
    if (!existingProductIds.has(base.productId)) {
      lines.push(
        withPurchaseAggregate(
          toInventoryLine(
            base,
            purchases.get(base.productId)?.quantity ?? 0,
            losses.get(base.productId),
          ),
          purchases.get(base.productId),
          losses.get(base.productId),
        ),
      );
    }
  }

  return lines;
}

async function getCarryoverBases(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDate: Date,
) {
  const yearMonth = getYearMonth(closingDate);
  const monthStart = getMonthStart(closingDate);

  const priorLedger = await tx.dailyLedger.findFirst({
    where: {
      storeId,
      status: "HEADQUARTERS_CLOSED",
      closingDate: {
        lt: closingDate,
        gte: monthStart,
      },
      ledgerInventoryItems: {
        some: {},
      },
    },
    orderBy: {
      closingDate: "desc",
    },
    select: {
      id: true,
      status: true,
      ledgerInventoryItems: {
        select: inventoryItemSelect,
        orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
      },
    },
  });

  if (priorLedger) {
    return {
      status: "loaded" as const,
      source: InventoryCarryoverSource.PREVIOUS_CLOSED_LEDGER,
      message: "전일 재고를 불러왔습니다. 변경된 품목만 수정하세요.",
      bases: priorLedger.ledgerInventoryItems.map<ProductInventoryBase>(
        (item) => ({
          productId: item.productId,
          productName: item.productName,
          productCategory: item.productCategory,
          productSpec: item.productSpec,
          unitPrice: item.unitPrice,
          previousQuantity: item.currentQuantity ?? item.quantity ?? 0,
          carryoverSource: InventoryCarryoverSource.PREVIOUS_CLOSED_LEDGER,
          carryoverLedgerId: priorLedger.id,
        }),
      ),
    };
  }

  const anyPriorLedger = await tx.dailyLedger.findFirst({
    where: {
      storeId,
      closingDate: {
        lt: closingDate,
        gte: monthStart,
      },
    },
    select: {
      id: true,
    },
  });

  if (anyPriorLedger) {
    return {
      status: "manual" as const,
      source: InventoryCarryoverSource.MANUAL,
      message:
        "전일 장부가 마감되지 않아 자동 이월이 불가합니다. 직접 입력하거나 본사에 문의해 주세요.",
      bases: await getActiveProductBases(tx),
    };
  }

  const snapshots = await tx.inventoryOpeningSnapshot.findMany({
    where: {
      storeId,
      yearMonth,
    },
    orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
    select: {
      productId: true,
      productName: true,
      productCategory: true,
      productSpec: true,
      unitPrice: true,
      quantity: true,
    },
  });

  if (snapshots.length > 0) {
    return {
      status: "loaded" as const,
      source: InventoryCarryoverSource.OPENING_SNAPSHOT,
      message: "전일 재고를 불러왔습니다. 변경된 품목만 수정하세요.",
      bases: snapshots.map<ProductInventoryBase>((snapshot) => ({
        productId: snapshot.productId,
        productName: snapshot.productName,
        productCategory: snapshot.productCategory,
        productSpec: snapshot.productSpec,
        unitPrice: snapshot.unitPrice,
        previousQuantity: snapshot.quantity,
        carryoverSource: InventoryCarryoverSource.OPENING_SNAPSHOT,
        carryoverLedgerId: null,
      })),
    };
  }

  return {
    status: "manual" as const,
    source: InventoryCarryoverSource.MANUAL,
    message:
      "전일 장부가 마감되지 않아 자동 이월이 불가합니다. 직접 입력하거나 본사에 문의해 주세요.",
    bases: await getActiveProductBases(tx),
  };
}

async function getActiveProductBases(tx: Prisma.TransactionClient) {
  const products = await tx.product.findMany({
    where: {
      isActive: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
      defaultUnitPrice: true,
    },
  });

  return products.map<ProductInventoryBase>((product) => ({
    productId: product.id,
    productName: product.name,
    productCategory: product.category,
    productSpec: product.spec,
    unitPrice: product.defaultUnitPrice,
    previousQuantity: 0,
    carryoverSource: InventoryCarryoverSource.MANUAL,
    carryoverLedgerId: null,
  }));
}

async function getInventoryStepDataForLedgerInTx(
  tx: Prisma.TransactionClient,
  ledger: InventoryLedgerPayload,
): Promise<InventoryStepData> {
  const purchases = aggregatePurchases(ledger.ledgerPurchaseItems);
  const lossItems = await tx.ledgerLossItem.findMany({
    where: { dailyLedgerId: ledger.id },
    select: {
      productId: true,
      productName: true,
      productCategory: true,
      productSpec: true,
      unitPrice: true,
      quantity: true,
      amount: true,
    },
  });
  const losses = aggregateLosses(lossItems);
  const existingItems = await tx.ledgerInventoryItem.findMany({
    where: {
      dailyLedgerId: ledger.id,
    },
    select: inventoryItemSelect,
    orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
  });
  const stepCompletion = getStoreEntryStepCompletion({
    ...ledger,
    inventoryItemCount: existingItems.length,
    lossItemCount: lossItems.length,
  });

  if (existingItems.length > 0) {
    const source =
      existingItems[0]?.carryoverSource ?? InventoryCarryoverSource.MANUAL;

    return {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
      status: ledger.status,
      stepCompletion,
      items: await mergeExistingInventoryLines(
        tx,
        ledger.id,
        existingItems,
        purchases,
        losses,
      ),
      carryover: {
        status:
          source === InventoryCarryoverSource.MANUAL ? "manual" : "loaded",
        source,
        message:
          source === InventoryCarryoverSource.MANUAL
            ? "전일 장부가 마감되지 않아 자동 이월이 불가합니다. 직접 입력하거나 본사에 문의해 주세요."
            : "전일 재고를 불러왔습니다. 변경된 품목만 수정하세요.",
      },
    };
  }

  const carryover = await getCarryoverBases(
    tx,
    ledger.storeId,
    ledger.closingDate,
  );
  const bases = mergeActivityBases(carryover.bases, purchases, losses);

  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    status: ledger.status,
    stepCompletion,
    items: bases.map((base) =>
      withPurchaseAggregate(
        toInventoryLine(
          base,
          purchases.get(base.productId)?.quantity ?? 0,
          losses.get(base.productId),
        ),
        purchases.get(base.productId),
        losses.get(base.productId),
      ),
    ),
    carryover: {
      status: carryover.status,
      source: carryover.source,
      message: carryover.message,
    },
  };
}

export async function getInventoryStepDataInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  actorId: string,
): Promise<InventoryStepData> {
  const ledger = await getTodayStoreLedgerInTx(tx, storeId, actorId);

  return getInventoryStepDataForLedgerInTx(tx, ledger);
}

export async function getInventoryStepDataByLedgerIdInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
): Promise<InventoryStepData | null> {
  const ledger = await tx.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: ledgerSelect,
  });

  if (!ledger) {
    return null;
  }

  return getInventoryStepDataForLedgerInTx(tx, ledger);
}

export async function getInventoryStepData(
  storeId: string,
  actorId: string,
): Promise<InventoryStepData> {
  return db.$transaction((tx) =>
    getInventoryStepDataInTx(tx, storeId, actorId),
  );
}

export async function getInventoryStepDataByLedgerId(
  ledgerId: string,
): Promise<InventoryStepData | null> {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction((tx) =>
    getInventoryStepDataByLedgerIdInTx(tx, ledgerId),
  );
}
