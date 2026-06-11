import {
  InventoryCarryoverSource,
  InventoryCarryoverStatus,
} from "../../../generated/prisma";
import type { Prisma } from "../../../generated/prisma";

import { calculateInventoryAmount } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import { ledgerSelect, getStoreLedgerInTx } from "~/features/ledger/queries";
import { getStoreEntryStepCompletion } from "~/features/ledger/step-completion";
import {
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "~/server/authz";
import {
  type InventoryStepData,
  type InventoryStepLine,
  type StoreManagerInventoryStepData,
} from "./types";

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
  carryoverStatus: true,
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

type InventoryLedgerPayload = Awaited<ReturnType<typeof getStoreLedgerInTx>>;

type PurchasePayload = {
  productId: string | null;
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
  carryoverStatus: InventoryCarryoverStatus;
  carryoverLedgerId: string | null;
};

type ExistingCarryoverBasis = {
  productId: string;
  currentQuantity: number | null;
  quantity: number | null;
};

function getYearMonth(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function aggregatePurchases(purchases: PurchasePayload[]) {
  const aggregates = new Map<string, PurchaseAggregate>();

  for (const purchase of purchases) {
    if (!purchase.productId) {
      continue;
    }

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
        carryoverStatus: InventoryCarryoverStatus.DATA_INSUFFICIENT,
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
        carryoverStatus: InventoryCarryoverStatus.DATA_INSUFFICIENT,
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
    carryoverStatus: base.carryoverStatus,
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
  carryoverStatus: InventoryCarryoverStatus,
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
    carryoverStatus,
    carryoverLedgerId: item.carryoverLedgerId,
    isModified: item.isModified,
    adjustment: toAdjustmentView(adjustment),
  };
}

function isPreviousCalendarDate(closingDate: Date, priorDate: Date) {
  const previous = new Date(closingDate);
  previous.setUTCDate(previous.getUTCDate() - 1);

  return (
    previous.toISOString().slice(0, 10) === priorDate.toISOString().slice(0, 10)
  );
}

function toPreviousQuantity(item: ExistingCarryoverBasis) {
  return item.currentQuantity ?? item.quantity ?? 0;
}

function getCarryoverStatusRank(status: InventoryCarryoverStatus) {
  switch (status) {
    case InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED:
      return 0;
    case InventoryCarryoverStatus.REVIEW_REQUIRED:
      return 1;
    case InventoryCarryoverStatus.CARRYOVER_EMPTY:
      return 2;
    case InventoryCarryoverStatus.DATA_INSUFFICIENT:
    case InventoryCarryoverStatus.POLICY_UNCONFIRMED:
      return 3;
    case InventoryCarryoverStatus.OPENING_CARRYOVER:
      return 4;
    case InventoryCarryoverStatus.PREVIOUS_CARRYOVER:
      return 5;
  }
}

function getPrimaryCarryoverStatus(lines: InventoryStepLine[]) {
  return lines
    .map((line) => line.carryoverStatus)
    .sort(
      (left, right) =>
        getCarryoverStatusRank(left) - getCarryoverStatusRank(right),
    )[0];
}

function toCarryoverMessage(status: InventoryCarryoverStatus | undefined) {
  switch (status) {
    case InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED:
      return "이월 기준이 바뀔 수 있어 이월 재확인 필요 상태입니다. 기존 입력값은 자동으로 덮어쓰지 않습니다.";
    case InventoryCarryoverStatus.REVIEW_REQUIRED:
      return "직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 검토 필요 상태로 확인해 주세요.";
    case InventoryCarryoverStatus.CARRYOVER_EMPTY:
      return "전일 장부나 이월 근거가 부족해 이월 공백 상태입니다. 0이 아니라 근거 부족으로 확인해 주세요.";
    case InventoryCarryoverStatus.DATA_INSUFFICIENT:
      return "일부 품목은 이월 근거가 부족해 데이터 부족 상태입니다.";
    case InventoryCarryoverStatus.POLICY_UNCONFIRMED:
      return "일부 품목은 기준 확인 필요 상태입니다.";
    case InventoryCarryoverStatus.OPENING_CARRYOVER:
      return "월초 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요.";
    case InventoryCarryoverStatus.PREVIOUS_CARRYOVER:
    default:
      return "전일 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요.";
  }
}

function toCarryoverLoadStatus(status: InventoryCarryoverStatus | undefined) {
  return status === InventoryCarryoverStatus.CARRYOVER_EMPTY ||
    status === InventoryCarryoverStatus.DATA_INSUFFICIENT ||
    status === InventoryCarryoverStatus.POLICY_UNCONFIRMED
    ? "manual"
    : "loaded";
}

function resolveExistingCarryoverStatus(
  item: InventoryItemPayload,
  carryoverLedger:
    | {
        status: string;
        ledgerInventoryItems: ExistingCarryoverBasis[];
      }
    | undefined,
) {
  if (!carryoverLedger) {
    return item.carryoverStatus;
  }

  if (
    item.carryoverStatus === InventoryCarryoverStatus.REVIEW_REQUIRED &&
    carryoverLedger.status === "HEADQUARTERS_CLOSED"
  ) {
    return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
  }

  const basis = carryoverLedger.ledgerInventoryItems.find(
    (candidate) => candidate.productId === item.productId,
  );

  if (basis && toPreviousQuantity(basis) !== item.previousQuantity) {
    return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
  }

  return item.carryoverStatus;
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
  const carryoverLedgerIds = [
    ...new Set(
      existingItems
        .map((item) => item.carryoverLedgerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const carryoverLedgers =
    carryoverLedgerIds.length === 0
      ? []
      : await tx.dailyLedger.findMany({
          where: { id: { in: carryoverLedgerIds } },
          select: {
            id: true,
            status: true,
            ledgerInventoryItems: {
              select: {
                productId: true,
                currentQuantity: true,
                quantity: true,
              },
            },
          },
        });
  const carryoverLedgerById = new Map(
    carryoverLedgers.map((ledger) => [ledger.id, ledger]),
  );
  const lines = existingItems.map((item) =>
    toExistingInventoryLine(
      item,
      purchases.get(item.productId),
      losses.get(item.productId),
      adjustmentByProductId.get(item.productId),
      resolveExistingCarryoverStatus(
        item,
        item.carryoverLedgerId
          ? carryoverLedgerById.get(item.carryoverLedgerId)
          : undefined,
      ),
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

  const priorLedger = await tx.dailyLedger.findFirst({
    where: {
      storeId,
      closingDate: {
        lt: closingDate,
      },
      status: { not: "HOLIDAY" },
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
      closingDate: true,
      ledgerInventoryItems: {
        select: inventoryItemSelect,
        orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
      },
    },
  });

  if (priorLedger && getYearMonth(priorLedger.closingDate) === yearMonth) {
    const isDirectPrevious = isPreviousCalendarDate(
      closingDate,
      priorLedger.closingDate,
    );
    const isHeadquartersClosed = priorLedger.status === "HEADQUARTERS_CLOSED";
    const source = isHeadquartersClosed
      ? InventoryCarryoverSource.PREVIOUS_CLOSED_LEDGER
      : InventoryCarryoverSource.PREVIOUS_SAVED_LEDGER;
    const status = isDirectPrevious
      ? isHeadquartersClosed
        ? InventoryCarryoverStatus.PREVIOUS_CARRYOVER
        : InventoryCarryoverStatus.REVIEW_REQUIRED
      : InventoryCarryoverStatus.CARRYOVER_EMPTY;

    return {
      status:
        status === InventoryCarryoverStatus.CARRYOVER_EMPTY
          ? ("manual" as const)
          : ("loaded" as const),
      source,
      message: isDirectPrevious
        ? isHeadquartersClosed
          ? "전일 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요."
          : "직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 검토 필요 상태로 확인해 주세요."
        : "전일 장부가 없어 가장 최근 저장 장부의 당일재고 후보만 표시합니다. 누락 기간은 이월 공백 상태로 본사 확인이 필요합니다.",
      bases: priorLedger.ledgerInventoryItems.map<ProductInventoryBase>(
        (item) => ({
          productId: item.productId,
          productName: item.productName,
          productCategory: item.productCategory,
          productSpec: item.productSpec,
          unitPrice: item.unitPrice,
          previousQuantity: toPreviousQuantity(item),
          carryoverSource: source,
          carryoverStatus: status,
          carryoverLedgerId: priorLedger.id,
        }),
      ),
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
    const activeProductBases = await getActiveProductBases(tx);
    const snapshotProductIds = new Set(
      snapshots.map((snapshot) => snapshot.productId),
    );
    const missingSnapshotBases = activeProductBases
      .filter((base) => !snapshotProductIds.has(base.productId))
      .map<ProductInventoryBase>((base) => ({
        ...base,
        carryoverStatus: InventoryCarryoverStatus.DATA_INSUFFICIENT,
      }));

    return {
      status: "loaded" as const,
      source: InventoryCarryoverSource.OPENING_SNAPSHOT,
      message:
        missingSnapshotBases.length > 0
          ? "월초 이월 재고를 불러왔습니다. 스냅샷이 없는 품목은 데이터 부족 상태로 표시됩니다."
          : "월초 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요.",
      bases: [
        ...snapshots.map<ProductInventoryBase>((snapshot) => ({
          productId: snapshot.productId,
          productName: snapshot.productName,
          productCategory: snapshot.productCategory,
          productSpec: snapshot.productSpec,
          unitPrice: snapshot.unitPrice,
          previousQuantity: snapshot.quantity,
          carryoverSource: InventoryCarryoverSource.OPENING_SNAPSHOT,
          carryoverStatus: InventoryCarryoverStatus.OPENING_CARRYOVER,
          carryoverLedgerId: null,
        })),
        ...missingSnapshotBases,
      ],
    };
  }

  if (priorLedger) {
    const isHeadquartersClosed = priorLedger.status === "HEADQUARTERS_CLOSED";
    const source = isHeadquartersClosed
      ? InventoryCarryoverSource.PREVIOUS_CLOSED_LEDGER
      : InventoryCarryoverSource.PREVIOUS_SAVED_LEDGER;

    return {
      status: "manual" as const,
      source,
      message:
        "월초 스냅샷이나 전일 장부가 없어 가장 최근 저장 장부의 당일재고 후보만 표시합니다. 누락 기간은 이월 공백 상태로 본사 확인이 필요합니다.",
      bases: priorLedger.ledgerInventoryItems.map<ProductInventoryBase>(
        (item) => ({
          productId: item.productId,
          productName: item.productName,
          productCategory: item.productCategory,
          productSpec: item.productSpec,
          unitPrice: item.unitPrice,
          previousQuantity: toPreviousQuantity(item),
          carryoverSource: source,
          carryoverStatus: InventoryCarryoverStatus.CARRYOVER_EMPTY,
          carryoverLedgerId: priorLedger.id,
        }),
      ),
    };
  }

  return {
    status: "manual" as const,
    source: InventoryCarryoverSource.MANUAL,
    message:
      "전일 장부나 월초 스냅샷이 없어 이월 공백 상태입니다. 0이 아니라 근거 부족으로 보고 직접 확인해 주세요.",
    bases: await getActiveProductBases(tx, {
      carryoverStatus: InventoryCarryoverStatus.CARRYOVER_EMPTY,
    }),
  };
}

async function getActiveProductBases(
  tx: Prisma.TransactionClient,
  options: {
    carryoverStatus?: InventoryCarryoverStatus;
  } = {},
) {
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
    carryoverStatus:
      options.carryoverStatus ?? InventoryCarryoverStatus.DATA_INSUFFICIENT,
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
    const items = await mergeExistingInventoryLines(
      tx,
      ledger.id,
      existingItems,
      purchases,
      losses,
    );
    const carryoverStatus = getPrimaryCarryoverStatus(items);

    return {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
      version: ledger.version,
      authorDisplayName: ledger.authorDisplayName ?? null,
      status: ledger.status,
      stepCompletion,
      items,
      carryover: {
        status: toCarryoverLoadStatus(carryoverStatus),
        source,
        message: toCarryoverMessage(carryoverStatus),
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
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName ?? null,
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
  closingDate: string | Date,
  actorId: string,
): Promise<InventoryStepData> {
  const ledger = await getStoreLedgerInTx(tx, storeId, closingDate, actorId);

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
  closingDate: string | Date,
  actorId: string,
): Promise<StoreManagerInventoryStepData> {
  const data = await db.$transaction((tx) =>
    getInventoryStepDataInTx(tx, storeId, closingDate, actorId),
  );

  return toStoreManagerInventoryStepData(data);
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

export function toStoreManagerInventoryStepData(
  data: InventoryStepData,
): StoreManagerInventoryStepData {
  return {
    ...data,
    items: data.items.map(
      ({
        unitPrice,
        purchaseAmount,
        lossAmount,
        inventoryAmount,
        adjustment,
        ...item
      }) => {
        void unitPrice;
        void purchaseAmount;
        void lossAmount;
        void inventoryAmount;

        return {
          ...item,
          adjustment: adjustment
            ? {
                id: adjustment.id,
                beforeQuantity: adjustment.beforeQuantity,
                afterQuantity: adjustment.afterQuantity,
                differenceQuantity: adjustment.differenceQuantity,
                reason: adjustment.reason,
                createdByName: adjustment.createdByName,
                createdAt: adjustment.createdAt,
                updatedAt: adjustment.updatedAt,
              }
            : null,
        };
      },
    ),
  };
}
