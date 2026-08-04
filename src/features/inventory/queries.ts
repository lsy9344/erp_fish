import {
  InventoryCarryoverSource,
  InventoryCarryoverStatus,
} from "../../../generated/prisma";
import type { Prisma } from "../../../generated/prisma";

import { calculateInventoryAmount } from "~/server/calculations/inventory";
import {
  compareCarryoverCostBasis,
  resolveCarryoverRecheckStatus,
  toCarryoverLotSignature,
} from "~/features/inventory/carryover-cost-recheck";
import { getLedgerInventoryFifoLotsByProductId } from "~/features/inventory/fifo-lots";
import {
  resolveInventoryCarryoverWeightedAveragePrices,
  resolveInventoryPurchasePrices,
} from "~/features/inventory/purchase-price";
import { SALES_PRICE_CARRYOVER_LEDGER_STATUSES } from "~/features/inventory/sales-price-carryover.ts";
import { resolveInventoryPreviousQuantitySource } from "~/features/inventory/inventory-previous-quantity-source.ts";
import { db } from "~/server/db";
import { ledgerSelect, getStoreLedgerInTx } from "~/features/ledger/queries";
import { getStoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { getInventoryPlanGateForLedgerInTx } from "~/features/ledger/inventory-plan-gate";
import {
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "~/server/authz";
import {
  type InventoryStepData,
  type InventoryCarryoverDetailView,
  type InventoryCarryoverHistoryRow,
  type InventoryManualProductOption,
  type InventoryPurchasePrice,
  type InventoryStepLine,
  type StoreManagerInventoryStepData,
} from "./types";
import {
  decimalToNumber,
  nullableDecimalToNumber,
  type DecimalNumber,
} from "~/lib/decimal";
import {
  buildLossInventoryAvailabilityLines,
  type LossInventoryAvailabilityLine,
} from "~/features/losses/availability";
import { applyInventoryFormDisplayPolicy } from "./inventory-zero-stock-display.ts";
import { shapeStoreManagerInventoryStepData } from "./response-shaping";

export const inventoryCarryoverDetailSelect = {
  source: true,
  status: true,
  resolvedQuantity: true,
  sourceLedgerId: true,
  sourceLedgerClosingDate: true,
  sourceLedgerStatus: true,
  sourceYearMonth: true,
  sourceSnapshotId: true,
  sourcePreviousQuantity: true,
  sourcePurchasedQuantity: true,
  sourceLossQuantity: true,
  sourceCurrentQuantity: true,
  sourceQuantity: true,
  message: true,
} as const;

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
  carryoverDetail: {
    select: inventoryCarryoverDetailSelect,
  },
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
  amountStatus: true,
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

type InventoryCarryoverDetailPayload =
  Prisma.LedgerInventoryCarryoverDetailGetPayload<{
    select: typeof inventoryCarryoverDetailSelect;
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
  quantity: DecimalNumber;
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
  quantity: DecimalNumber;
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
  previousQuantityDetail: InventoryCarryoverDetailView;
};

type ExistingCarryoverBasis = {
  productId: string;
  previousQuantity: DecimalNumber;
  purchasedQuantity: DecimalNumber;
  currentQuantity: DecimalNumber | null;
  quantity: DecimalNumber | null;
};

const historyLimit = 30;

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

    const quantity = decimalToNumber(purchase.quantity);
    const current = aggregates.get(purchase.productId);

    if (current) {
      current.quantity += quantity;
      current.amount += purchase.amount;
      continue;
    }

    aggregates.set(purchase.productId, {
      quantity,
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
        previousQuantityDetail: buildCarryoverDetail({
          source: InventoryCarryoverSource.MANUAL,
          status: InventoryCarryoverStatus.DATA_INSUFFICIENT,
          resolvedQuantity: 0,
        }),
      },
    });
  }

  return aggregates;
}

function aggregateLosses(losses: LossPayload[]) {
  const aggregates = new Map<string, LossAggregate>();

  for (const loss of losses) {
    const quantity = decimalToNumber(loss.quantity);
    const current = aggregates.get(loss.productId);

    if (current) {
      current.quantity += quantity;
      current.amount += loss.amount;
      continue;
    }

    aggregates.set(loss.productId, {
      quantity,
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
        previousQuantityDetail: buildCarryoverDetail({
          source: InventoryCarryoverSource.MANUAL,
          status: InventoryCarryoverStatus.DATA_INSUFFICIENT,
          resolvedQuantity: 0,
        }),
      },
    });
  }

  return aggregates;
}

function toCarryoverDetailView(
  detail: InventoryCarryoverDetailPayload,
): InventoryCarryoverDetailView {
  return {
    ...detail,
    resolvedQuantity: decimalToNumber(detail.resolvedQuantity),
    sourcePreviousQuantity: nullableDecimalToNumber(
      detail.sourcePreviousQuantity,
    ),
    sourcePurchasedQuantity: nullableDecimalToNumber(
      detail.sourcePurchasedQuantity,
    ),
    sourceLossQuantity: nullableDecimalToNumber(detail.sourceLossQuantity),
    sourceCurrentQuantity: nullableDecimalToNumber(
      detail.sourceCurrentQuantity,
    ),
    sourceQuantity: nullableDecimalToNumber(detail.sourceQuantity),
    sourceLedgerClosingDate:
      detail.sourceLedgerClosingDate?.toISOString() ?? null,
    history: [],
  };
}

function toCarryoverDetailMessage(status: InventoryCarryoverStatus) {
  switch (status) {
    case InventoryCarryoverStatus.PREVIOUS_CARRYOVER:
      return "직전 본사 마감 장부의 당일재고 후보입니다.";
    case InventoryCarryoverStatus.REVIEW_REQUIRED:
      return "직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 확인이 필요합니다.";
    case InventoryCarryoverStatus.CARRYOVER_EMPTY:
      return "전날 남은 재고 기록이 없어 0으로 표시됩니다. 실제 재고가 있으면 수량을 직접 입력해 주세요.";
    case InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED:
      return "마감 또는 정정으로 이월 기준이 바뀔 수 있습니다. 기존 입력값은 자동으로 덮어쓰지 않습니다.";
    case InventoryCarryoverStatus.OPENING_CARRYOVER:
      return "월초 재고 스냅샷에서 넘어온 품목입니다.";
    case InventoryCarryoverStatus.POLICY_UNCONFIRMED:
      return "기준 확인 필요 상태입니다.";
    case InventoryCarryoverStatus.DATA_INSUFFICIENT:
    default:
      return "전날 재고를 자동으로 가져오지 못했습니다. 실제 재고를 확인해 입력해 주세요.";
  }
}

function buildCarryoverDetail({
  source,
  status,
  resolvedQuantity,
  message = toCarryoverDetailMessage(status),
  sourceLedgerId = null,
  sourceLedgerClosingDate = null,
  sourceLedgerStatus = null,
  sourceYearMonth = null,
  sourceSnapshotId = null,
  sourcePreviousQuantity = null,
  sourcePurchasedQuantity = null,
  sourceLossQuantity = null,
  sourceCurrentQuantity = null,
  sourceQuantity = null,
}: {
  source: InventoryCarryoverSource;
  status: InventoryCarryoverStatus;
  resolvedQuantity: number;
  message?: string;
  sourceLedgerId?: string | null;
  sourceLedgerClosingDate?: Date | string | null;
  sourceLedgerStatus?: InventoryCarryoverDetailView["sourceLedgerStatus"];
  sourceYearMonth?: string | null;
  sourceSnapshotId?: string | null;
  sourcePreviousQuantity?: number | null;
  sourcePurchasedQuantity?: number | null;
  sourceLossQuantity?: number | null;
  sourceCurrentQuantity?: number | null;
  sourceQuantity?: number | null;
}): InventoryCarryoverDetailView {
  return {
    source,
    status,
    resolvedQuantity,
    sourceLedgerId,
    sourceLedgerClosingDate:
      sourceLedgerClosingDate instanceof Date
        ? sourceLedgerClosingDate.toISOString()
        : sourceLedgerClosingDate,
    sourceLedgerStatus,
    sourceYearMonth,
    sourceSnapshotId,
    sourcePreviousQuantity,
    sourcePurchasedQuantity,
    sourceLossQuantity,
    sourceCurrentQuantity,
    sourceQuantity,
    message,
    history: [],
  };
}

function buildLedgerCarryoverDetail({
  source,
  status,
  ledger,
  item,
  lossQuantity = null,
}: {
  source: InventoryCarryoverSource;
  status: InventoryCarryoverStatus;
  ledger: {
    id: string;
    status: InventoryCarryoverDetailView["sourceLedgerStatus"];
    closingDate: Date;
  };
  item: ExistingCarryoverBasis;
  lossQuantity?: number | null;
}) {
  return buildCarryoverDetail({
    source,
    status,
    resolvedQuantity: toPreviousQuantity(item),
    sourceLedgerId: ledger.id,
    sourceLedgerClosingDate: ledger.closingDate,
    sourceLedgerStatus: ledger.status,
    sourcePreviousQuantity: decimalToNumber(item.previousQuantity),
    sourcePurchasedQuantity: decimalToNumber(item.purchasedQuantity),
    sourceLossQuantity: lossQuantity,
    sourceCurrentQuantity: nullableDecimalToNumber(item.currentQuantity),
    sourceQuantity: nullableDecimalToNumber(item.quantity),
  });
}

function buildSnapshotCarryoverDetail({
  snapshot,
  status = InventoryCarryoverStatus.OPENING_CARRYOVER,
}: {
  snapshot: {
    id: string;
    yearMonth: string;
    quantity: DecimalNumber;
  };
  status?: InventoryCarryoverStatus;
}) {
  return buildCarryoverDetail({
    source: InventoryCarryoverSource.OPENING_SNAPSHOT,
    status,
    resolvedQuantity: decimalToNumber(snapshot.quantity),
    sourceYearMonth: snapshot.yearMonth,
    sourceSnapshotId: snapshot.id,
    sourcePreviousQuantity: decimalToNumber(snapshot.quantity),
    sourceQuantity: decimalToNumber(snapshot.quantity),
  });
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
    purchasePrice: null,
    plannedUnitPrice: null,
    unitPrice: base.unitPrice,
    previousQuantity: base.previousQuantity,
    purchasedQuantity,
    purchaseAmount: 0,
    lossQuantity: loss?.quantity ?? 0,
    lossAmount: loss?.amount ?? 0,
    currentQuantity,
    quantity,
    inventoryAmount: calculateInventoryAmount(quantity, base.unitPrice),
    fifoLots: [],
    carryoverSource: base.carryoverSource,
    carryoverStatus: base.carryoverStatus,
    carryoverLedgerId: base.carryoverLedgerId,
    previousQuantityDetail: base.previousQuantityDetail,
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
    beforeQuantity: decimalToNumber(adjustment.beforeQuantity),
    beforeAmount: adjustment.beforeAmount,
    afterQuantity: decimalToNumber(adjustment.afterQuantity),
    afterAmount: adjustment.afterAmount,
    differenceQuantity: decimalToNumber(adjustment.differenceQuantity),
    differenceAmount: adjustment.differenceAmount,
    amountStatus: adjustment.amountStatus,
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
  const previousQuantity = decimalToNumber(item.previousQuantity);

  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    purchasePrice: null,
    plannedUnitPrice: null,
    unitPrice: item.unitPrice,
    previousQuantity,
    purchasedQuantity:
      purchase?.quantity ?? decimalToNumber(item.purchasedQuantity),
    purchaseAmount: purchase?.amount ?? 0,
    lossQuantity: loss?.quantity ?? 0,
    lossAmount: loss?.amount ?? 0,
    currentQuantity: nullableDecimalToNumber(item.currentQuantity),
    quantity: nullableDecimalToNumber(item.quantity),
    inventoryAmount: item.inventoryAmount,
    fifoLots: [],
    carryoverSource: item.carryoverSource,
    carryoverStatus,
    carryoverLedgerId: item.carryoverLedgerId,
    previousQuantityDetail: item.carryoverDetail
      ? {
          ...toCarryoverDetailView(item.carryoverDetail),
          status: carryoverStatus,
        }
      : buildCarryoverDetail({
          source: item.carryoverSource,
          status: carryoverStatus,
          resolvedQuantity: previousQuantity,
          sourceLedgerId: item.carryoverLedgerId,
        }),
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

function toPreviousQuantity(
  item: Pick<ExistingCarryoverBasis, "currentQuantity" | "quantity">,
) {
  return (
    nullableDecimalToNumber(item.currentQuantity) ??
    nullableDecimalToNumber(item.quantity) ??
    0
  );
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
      return "전날 재고를 자동으로 가져오지 못했습니다. 실제 재고를 확인해 입력해 주세요.";
    case InventoryCarryoverStatus.DATA_INSUFFICIENT:
      return "일부 품목은 전날 재고를 자동으로 가져오지 못했습니다. 실제 재고를 확인해 입력해 주세요.";
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
        lotSignatureByProduct: Map<string, string>;
      }
    | undefined,
  recordedLotSignatureByLedger: Map<string, Map<string, string>>,
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

  const recordedLotSignature =
    (item.carryoverLedgerId
      ? recordedLotSignatureByLedger.get(item.carryoverLedgerId)
      : undefined
    )?.get(item.productId) ?? null;

  const basis = carryoverLedger.ledgerInventoryItems.find(
    (candidate) => candidate.productId === item.productId,
  );

  if (!basis) {
    // 원천 장부에서 품목 행 자체가 사라진 경우: 기록된 이월 근거가 있으면 근거
    // 소실이라 재확인으로 승격한다. 근거가 없던 품목은 기존 상태를 유지한다.
    if (recordedLotSignature !== null) {
      return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
    }

    return item.carryoverStatus;
  }

  // DESIGN.md D10: 수량 일치뿐 아니라 FIFO 원가 근거 변화도 재확인 사유다.
  // 과거 매입 단가/FIFO 원가가 바뀌면 수량이 같아도 이월 재확인이 필요하다.
  // 합계가 아닌 lot 구성(단가:수량) 시그니처로 비교하고, 남은 lot이 없거나
  // 사라진 경우는 근거 소실로 승격한다. 실제 입력은 덮어쓰지 않는다.
  return resolveCarryoverRecheckStatus({
    currentStatus: item.carryoverStatus,
    isReviewRequiredCarryover: false,
    previousLedgerClosed: false,
    quantityMatches:
      toPreviousQuantity(basis) === decimalToNumber(item.previousQuantity),
    costBasisComparison: compareCarryoverCostBasis({
      sourceLotSignature:
        carryoverLedger.lotSignatureByProduct.get(item.productId) ?? "",
      recordedLotSignature,
    }),
  });
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
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
              },
            },
            // DESIGN.md D10: 원천 장부의 현재 FIFO lot 구성(단가·잔량·순서). 이월
            // 재확인 판정은 합계가 아닌 lot 시그니처 비교로 하며 FIFO 소진 순서가
            // 달라지는 경우도 잡아야 하므로 sortOrder를 포함한다.
            ledgerInventoryFifoLots: {
              select: {
                productId: true,
                unitPrice: true,
                remainingQuantity: true,
                sortOrder: true,
              },
              orderBy: [{ sortOrder: "asc" }],
            },
          },
        });
  const carryoverLedgerById = new Map(
    carryoverLedgers.map((ledger) => {
      const lotsByProduct = new Map<
        string,
        Array<{ unitPrice: number; quantity: number; sortOrder: number }>
      >();

      for (const lot of ledger.ledgerInventoryFifoLots) {
        const lots = lotsByProduct.get(lot.productId) ?? [];

        lots.push({
          unitPrice: lot.unitPrice,
          quantity: decimalToNumber(lot.remainingQuantity),
          sortOrder: lot.sortOrder,
        });
        lotsByProduct.set(lot.productId, lots);
      }

      const lotSignatureByProduct = new Map<string, string>();

      for (const [productId, lots] of lotsByProduct) {
        lotSignatureByProduct.set(productId, toCarryoverLotSignature(lots));
      }

      return [
        ledger.id,
        {
          status: ledger.status,
          ledgerInventoryItems: ledger.ledgerInventoryItems,
          lotSignatureByProduct,
        },
      ] as const;
    }),
  );
  // 다음 장부가 마지막 저장 시점에 원천 장부에서 이어받은 lot의 구성 기록
  // (sourceLedgerId = 원천 장부 id인 lot의 unitPrice + originalAmount 기준 수량).
  // 이월 lot은 다음 날 판매로 소진돼도 originalQuantity/originalAmount가 보존되므로
  // 저장 시점 이월 원가 근거 그대로다.
  const currentLedgerCarryoverLots =
    carryoverLedgerIds.length === 0
      ? []
      : await tx.ledgerInventoryFifoLot.findMany({
          where: {
            dailyLedgerId,
            sourceLedgerId: { in: carryoverLedgerIds },
          },
          select: {
            sourceLedgerId: true,
            productId: true,
            unitPrice: true,
            originalQuantity: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: "asc" }],
        });
  const recordedLotSignatureByLedger = new Map<string, Map<string, string>>();

  {
    const lotsByLedgerAndProduct = new Map<
      string,
      Map<
        string,
        Array<{ unitPrice: number; quantity: number; sortOrder: number }>
      >
    >();

    for (const lot of currentLedgerCarryoverLots) {
      if (!lot.sourceLedgerId) {
        continue;
      }

      const byProduct =
        lotsByLedgerAndProduct.get(lot.sourceLedgerId) ??
        new Map<
          string,
          Array<{ unitPrice: number; quantity: number; sortOrder: number }>
        >();
      const lots = byProduct.get(lot.productId) ?? [];

      lots.push({
        unitPrice: lot.unitPrice,
        quantity: decimalToNumber(lot.originalQuantity),
        sortOrder: lot.sortOrder,
      });
      byProduct.set(lot.productId, lots);
      lotsByLedgerAndProduct.set(lot.sourceLedgerId, byProduct);
    }

    for (const [sourceLedgerId, byProduct] of lotsByLedgerAndProduct) {
      const signatures = new Map<string, string>();

      for (const [productId, lots] of byProduct) {
        const signature = toCarryoverLotSignature(lots);

        if (signature !== "") {
          signatures.set(productId, signature);
        }
      }

      recordedLotSignatureByLedger.set(sourceLedgerId, signatures);
    }
  }
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
        recordedLotSignatureByLedger,
      ),
    ),
  );
  // 저장 행 뒤에 모든 활성 품목을 다시 붙이면 근거 없는 품목이 "이월 공백 0"으로
  // 보인다. 당일 매입/손실로 생긴 품목만 보강하고, 나머지 활성 품목은
  // manualProductOptions로 내려 "품목 추가"로만 표에 넣는다.
  for (const base of mergeActivityBases([], purchases, losses)) {
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
      ledgerLossItems: {
        select: {
          productId: true,
          quantity: true,
        },
      },
    },
  });

  const priorLedgerClosingYearMonth = priorLedger
    ? getYearMonth(priorLedger.closingDate)
    : null;
  const sameMonthPrior =
    priorLedgerClosingYearMonth != null &&
    priorLedgerClosingYearMonth === yearMonth;

  const snapshots = sameMonthPrior
    ? []
    : await tx.inventoryOpeningSnapshot.findMany({
        where: {
          storeId,
          yearMonth,
        },
        orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
        select: {
          id: true,
          yearMonth: true,
          productId: true,
          productName: true,
          productCategory: true,
          productSpec: true,
          unitPrice: true,
          quantity: true,
        },
      });

  const previousQuantitySource = resolveInventoryPreviousQuantitySource({
    closingYearMonth: yearMonth,
    priorLedgerClosingYearMonth,
    hasOpeningSnapshots: snapshots.length > 0,
  });

  if (
    previousQuantitySource === "SAME_MONTH_PRIOR_LEDGER" ||
    previousQuantitySource === "CROSS_MONTH_PRIOR_LEDGER"
  ) {
    if (!priorLedger) {
      return {
        status: "manual" as const,
        source: InventoryCarryoverSource.MANUAL,
        message:
          "전일 장부나 월초 스냅샷이 없습니다. 오늘 매입·손실·저장 품목만 표시합니다. 추가 재고는 품목 추가로 입력해 주세요.",
        bases: [],
      };
    }

    const isDirectPrevious = isPreviousCalendarDate(
      closingDate,
      priorLedger.closingDate,
    );
    const isHeadquartersClosed = priorLedger.status === "HEADQUARTERS_CLOSED";
    const source = isHeadquartersClosed
      ? InventoryCarryoverSource.PREVIOUS_CLOSED_LEDGER
      : InventoryCarryoverSource.PREVIOUS_SAVED_LEDGER;
    const status =
      previousQuantitySource === "CROSS_MONTH_PRIOR_LEDGER"
        ? InventoryCarryoverStatus.CARRYOVER_EMPTY
        : isDirectPrevious
          ? isHeadquartersClosed
            ? InventoryCarryoverStatus.PREVIOUS_CARRYOVER
            : InventoryCarryoverStatus.REVIEW_REQUIRED
          : InventoryCarryoverStatus.CARRYOVER_EMPTY;
    const lossQuantityByProductId = new Map<string, number>();

    for (const lossItem of priorLedger.ledgerLossItems) {
      lossQuantityByProductId.set(
        lossItem.productId,
        (lossQuantityByProductId.get(lossItem.productId) ?? 0) +
          decimalToNumber(lossItem.quantity),
      );
    }

    const isCrossMonth = previousQuantitySource === "CROSS_MONTH_PRIOR_LEDGER";

    return {
      status:
        status === InventoryCarryoverStatus.CARRYOVER_EMPTY
          ? ("manual" as const)
          : ("loaded" as const),
      source,
      message: isCrossMonth
        ? "전날 재고를 자동으로 가져오지 못했습니다. 화면에 보이는 재고를 확인해 실제 수량으로 입력해 주세요."
        : isDirectPrevious
          ? isHeadquartersClosed
            ? "전일 이월 재고를 불러왔습니다. 변경된 품목만 수정하세요."
            : "직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 검토 필요 상태로 확인해 주세요."
          : "전날 재고를 자동으로 가져오지 못했습니다. 화면에 보이는 재고를 확인해 실제 수량으로 입력해 주세요.",
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
          previousQuantityDetail: buildLedgerCarryoverDetail({
            source,
            status,
            ledger: priorLedger,
            item,
            lossQuantity: lossQuantityByProductId.get(item.productId) ?? null,
          }),
        }),
      ),
    };
  }

  if (previousQuantitySource === "OPENING_SNAPSHOT") {
    return {
      status: "loaded" as const,
      source: InventoryCarryoverSource.OPENING_SNAPSHOT,
      message:
        "월초 이월 재고를 불러왔습니다. 월초 스냅샷이 있는 품목만 표시합니다. 추가 재고는 품목 추가로 입력해 주세요.",
      bases: snapshots.map<ProductInventoryBase>((snapshot) => ({
        productId: snapshot.productId,
        productName: snapshot.productName,
        productCategory: snapshot.productCategory,
        productSpec: snapshot.productSpec,
        unitPrice: snapshot.unitPrice,
        previousQuantity: decimalToNumber(snapshot.quantity),
        carryoverSource: InventoryCarryoverSource.OPENING_SNAPSHOT,
        carryoverStatus: InventoryCarryoverStatus.OPENING_CARRYOVER,
        carryoverLedgerId: null,
        previousQuantityDetail: buildSnapshotCarryoverDetail({ snapshot }),
      })),
    };
  }

  // 전일 장부도 월초 스냅샷도 없을 때 모든 활성 품목을 "이월 공백 0" 행으로 펼치면
  // 매입/이월 근거가 없는 품목을 실제 재고 0으로 오해한다. 기본 표에는 근거 있는
  // 품목(당일 매입/손실)만 남기고, 숨긴 활성 품목은 manualProductOptions로 내려
  // "품목 추가"로만 표에 넣게 한다. 근거 부족 상태 자체는 상단 안내로 계속 알린다.
  return {
    status: "manual" as const,
    source: InventoryCarryoverSource.MANUAL,
    message:
      "전일 장부나 월초 스냅샷이 없습니다. 오늘 매입·손실·저장 품목만 표시합니다. 추가 재고는 품목 추가로 입력해 주세요.",
    bases: [],
  };
}

// 기본 표에 없는(근거 없는) 활성 품목을 "품목 추가" 후보로 내린다. visibleProductIds는
// 최종 items의 productId 집합이며, 이미 표에 있는 품목은 후보에서 제외한다.
async function getManualProductOptions(
  tx: Prisma.TransactionClient,
  visibleProductIds: ReadonlySet<string>,
): Promise<InventoryManualProductOption[]> {
  const products = await tx.product.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }, { spec: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
    },
  });

  return products
    .filter((product) => !visibleProductIds.has(product.id))
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      purchasePrice: null,
      plannedUnitPrice: null,
      source: "UNGROUNDED" as const,
    }));
}

function toHistoryLossQuantity(item: {
  previousQuantity: DecimalNumber;
  purchasedQuantity: DecimalNumber;
  currentQuantity: DecimalNumber | null;
  quantity: DecimalNumber | null;
}) {
  const closingQuantity =
    nullableDecimalToNumber(item.currentQuantity) ??
    nullableDecimalToNumber(item.quantity);

  if (closingQuantity === null) {
    return null;
  }

  return (
    decimalToNumber(item.previousQuantity) +
    decimalToNumber(item.purchasedQuantity) -
    closingQuantity
  );
}

async function attachCarryoverHistories(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDate: Date,
  items: InventoryStepLine[],
) {
  const productIds = [...new Set(items.map((item) => item.productId))];

  if (productIds.length === 0) {
    return items;
  }

  const historyLedgers = await tx.dailyLedger.findMany({
    where: {
      storeId,
      closingDate: { lt: closingDate },
      status: { not: "HOLIDAY" },
      ledgerInventoryItems: {
        some: {
          productId: { in: productIds },
        },
      },
    },
    orderBy: { closingDate: "desc" },
    take: historyLimit,
    select: {
      id: true,
      closingDate: true,
      status: true,
      ledgerInventoryItems: {
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          previousQuantity: true,
          purchasedQuantity: true,
          currentQuantity: true,
          quantity: true,
        },
      },
    },
  });
  const historyByProductId = new Map<string, InventoryCarryoverHistoryRow[]>();

  for (const ledger of historyLedgers) {
    for (const item of ledger.ledgerInventoryItems) {
      const rows = historyByProductId.get(item.productId) ?? [];

      rows.push({
        ledgerId: ledger.id,
        closingDate: ledger.closingDate.toISOString(),
        ledgerStatus: ledger.status,
        previousQuantity: decimalToNumber(item.previousQuantity),
        purchasedQuantity: decimalToNumber(item.purchasedQuantity),
        lossQuantity: toHistoryLossQuantity(item),
        currentQuantity: nullableDecimalToNumber(item.currentQuantity),
        quantity: nullableDecimalToNumber(item.quantity),
      });
      historyByProductId.set(item.productId, rows);
    }
  }

  return items.map((item) => ({
    ...item,
    previousQuantityDetail: {
      ...item.previousQuantityDetail,
      history: historyByProductId.get(item.productId) ?? [],
    },
  }));
}

async function attachFifoLots(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  items: InventoryStepLine[],
) {
  const lotsByProductId = await getLedgerInventoryFifoLotsByProductId(
    tx,
    dailyLedgerId,
  );

  return items.map((item) => ({
    ...item,
    fifoLots: lotsByProductId.get(item.productId) ?? [],
  }));
}

// WO-25(2026-07-25) #1: 당일/최근 매입행이 없을 때(예: 다음날 조회) 이월된 단가를 fallback으로
// 표시한다. 월초 스냅샷(OPENING)뿐 아니라 전일 장부 이월(PREVIOUS_*_LEDGER)도 포함한다 —
// item.unitPrice는 두 경우 모두 원천(엑셀 단가/FIFO 롯트 단가)에서 그대로 이월된 값이다.
// MANUAL(근거 없음)은 신뢰할 수 있는 이월 단가가 아니므로 제외한다.
function resolveCarryoverPurchasePriceFallback(
  item: Pick<InventoryStepLine, "unitPrice" | "previousQuantityDetail">,
): InventoryPurchasePrice | null {
  if (
    item.previousQuantityDetail.source === "OPENING_SNAPSHOT" &&
    item.previousQuantityDetail.sourceYearMonth
  ) {
    return {
      kind: "OPENING",
      yearMonth: item.previousQuantityDetail.sourceYearMonth,
      unitPrice: item.unitPrice,
    };
  }

  const { source, sourceLedgerClosingDate } = item.previousQuantityDetail;
  if (
    (source === "PREVIOUS_CLOSED_LEDGER" ||
      source === "PREVIOUS_SAVED_LEDGER") &&
    sourceLedgerClosingDate
  ) {
    return {
      kind: "CARRYOVER",
      businessDate: sourceLedgerClosingDate.slice(0, 10),
      unitPrice: item.unitPrice,
    };
  }

  return null;
}

type InventoryCarryoverPriceEvidence = {
  sourceClosingQuantity: number | null;
  sourceInventoryAmount: number | null;
};

function resolveSourceClosingQuantity({
  currentQuantity,
  quantity,
}: {
  currentQuantity: number | null;
  quantity: number | null;
}) {
  // 전일 이월 수량과 같은 우선순위다. 과거 행에서 두 필드가 다르더라도 실제
  // 당일재고(currentQuantity)가 있으면 그 값을 원천 장부의 마감수량으로 본다.
  return currentQuantity ?? quantity;
}

function aggregateCurrentDayPurchases(ledger: InventoryLedgerPayload) {
  const purchases = new Map<string, { quantity: number; amount: number }>();

  for (const purchase of ledger.ledgerPurchaseItems) {
    if (!purchase.productId) {
      continue;
    }

    const current = purchases.get(purchase.productId);
    const quantity = decimalToNumber(purchase.quantity);

    if (current) {
      current.quantity += quantity;
      current.amount += purchase.amount;
      continue;
    }

    purchases.set(purchase.productId, {
      quantity,
      amount: purchase.amount,
    });
  }

  return purchases;
}

async function attachPurchasePrices(
  tx: Prisma.TransactionClient,
  ledger: InventoryLedgerPayload,
  items: InventoryStepLine[],
  manualProductOptions: InventoryManualProductOption[],
) {
  const itemProductIds = [...new Set(items.map((item) => item.productId))];
  const purchaseProductIds = [
    ...new Set([
      ...itemProductIds,
      ...manualProductOptions.map((option) => option.productId),
    ]),
  ];

  if (purchaseProductIds.length === 0) {
    return { items, manualProductOptions };
  }

  // Exact-date plans only. Carryover fallback is applied at the store-manager
  // response boundary so HQ screens and audit snapshots keep persisted values.
  // ponytail: one eligible-history query; use a DB aggregate/window query only if measured history volume makes this slow.
  const [purchaseHistory, currentSalesPlans] = await Promise.all([
    tx.ledgerPurchaseItem.findMany({
      where: {
        productId: { in: purchaseProductIds },
        dailyLedger: {
          storeId: ledger.storeId,
          closingDate: { lte: ledger.closingDate },
        },
      },
      select: {
        productId: true,
        quantity: true,
        amount: true,
        dailyLedger: { select: { closingDate: true } },
      },
    }),
    tx.storeSalesPricePlan.findMany({
      where: {
        storeId: ledger.storeId,
        businessDate: ledger.closingDate,
        productId: { in: purchaseProductIds },
      },
      select: { productId: true, plannedUnitPrice: true },
    }),
  ]);
  const purchasePrices = resolveInventoryPurchasePrices(
    ledger.closingDate.toISOString().slice(0, 10),
    purchaseHistory.map((purchase) => ({
      productId: purchase.productId,
      businessDate: purchase.dailyLedger.closingDate.toISOString().slice(0, 10),
      quantity: decimalToNumber(purchase.quantity),
      amount: purchase.amount,
    })),
  );
  const plannedUnitPrices = new Map(
    currentSalesPlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );

  const todayPurchases = aggregateCurrentDayPurchases(ledger);
  const averageCandidates = items.filter(
    (item) => item.previousQuantity > 0 && todayPurchases.has(item.productId),
  );
  const averageProductIds = [
    ...new Set(averageCandidates.map((item) => item.productId)),
  ];

  // 표시 평균의 원천은 현재 장부의 전일수량이 아니라, 이월 원천 장부의
  // 마감 inventoryAmount 또는 월초 스냅샷이다. 저장 후 현재고가 줄어도 시작 평균이
  // 달라지지 않도록, 당일 매입과 전일재고가 모두 있는 품목의 근거만 일괄 조회한다.
  const sourceLedgerIds = [
    ...new Set(
      averageCandidates
        .filter(
          (item) => item.previousQuantityDetail.source !== "OPENING_SNAPSHOT",
        )
        .map(
          (item) =>
            item.previousQuantityDetail.sourceLedgerId ??
            item.carryoverLedgerId,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const sourceSnapshotIds = [
    ...new Set(
      averageCandidates
        .filter(
          (item) => item.previousQuantityDetail.source === "OPENING_SNAPSHOT",
        )
        .map((item) => item.previousQuantityDetail.sourceSnapshotId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [sourceInventoryItems, sourceSnapshots] = await Promise.all([
    sourceLedgerIds.length === 0
      ? []
      : tx.ledgerInventoryItem.findMany({
          where: {
            dailyLedgerId: { in: sourceLedgerIds },
            productId: { in: averageProductIds },
            dailyLedger: {
              storeId: ledger.storeId,
              closingDate: { lt: ledger.closingDate },
            },
          },
          select: {
            dailyLedgerId: true,
            productId: true,
            currentQuantity: true,
            quantity: true,
            inventoryAmount: true,
          },
        }),
    sourceSnapshotIds.length === 0
      ? []
      : tx.inventoryOpeningSnapshot.findMany({
          where: {
            id: { in: sourceSnapshotIds },
            storeId: ledger.storeId,
            productId: { in: averageProductIds },
          },
          select: {
            id: true,
            productId: true,
            unitPrice: true,
            quantity: true,
          },
        }),
  ]);
  const sourceEvidenceByKey = new Map<string, InventoryCarryoverPriceEvidence>(
    sourceInventoryItems.map((sourceItem) => {
      const sourceCurrentQuantity = nullableDecimalToNumber(
        sourceItem.currentQuantity,
      );
      const sourceQuantity = nullableDecimalToNumber(sourceItem.quantity);

      return [
        `${sourceItem.dailyLedgerId}:${sourceItem.productId}`,
        {
          sourceClosingQuantity: resolveSourceClosingQuantity({
            currentQuantity: sourceCurrentQuantity,
            quantity: sourceQuantity,
          }),
          sourceInventoryAmount: sourceItem.inventoryAmount,
        },
      ];
    }),
  );
  const snapshotEvidenceById = new Map<string, InventoryCarryoverPriceEvidence>(
    sourceSnapshots.map((snapshot) => {
      const quantity = decimalToNumber(snapshot.quantity);

      return [
        snapshot.id,
        {
          sourceClosingQuantity: quantity,
          sourceInventoryAmount: calculateInventoryAmount(
            quantity,
            snapshot.unitPrice,
          ),
        },
      ];
    }),
  );
  const averageRows = averageCandidates.map((item) => {
    const todayPurchase = todayPurchases.get(item.productId)!;
    const detail = item.previousQuantityDetail;
    const evidence =
      detail.source === "OPENING_SNAPSHOT" && detail.sourceSnapshotId
        ? snapshotEvidenceById.get(detail.sourceSnapshotId)
        : (() => {
            const sourceLedgerId =
              detail.sourceLedgerId ?? item.carryoverLedgerId;

            return sourceLedgerId
              ? sourceEvidenceByKey.get(`${sourceLedgerId}:${item.productId}`)
              : undefined;
          })();

    return {
      productId: item.productId,
      currentPreviousQuantity: item.previousQuantity,
      sourceClosingQuantity: evidence?.sourceClosingQuantity ?? null,
      sourceInventoryAmount: evidence?.sourceInventoryAmount ?? null,
      purchasedQuantity: todayPurchase.quantity,
      purchaseAmount: todayPurchase.amount,
    };
  });
  const carryoverAveragePrices =
    resolveInventoryCarryoverWeightedAveragePrices(averageRows);

  return {
    items: items.map((item) => ({
      ...item,
      purchasePrice:
        carryoverAveragePrices.get(item.productId) ??
        purchasePrices.get(item.productId) ??
        resolveCarryoverPurchasePriceFallback(item),
      plannedUnitPrice: plannedUnitPrices.get(item.productId) ?? null,
    })),
    manualProductOptions: manualProductOptions.map((option) => ({
      ...option,
      purchasePrice: purchasePrices.get(option.productId) ?? null,
      plannedUnitPrice: plannedUnitPrices.get(option.productId) ?? null,
    })),
  };
}

async function loadSalesPriceCarryoverByProductId(
  tx: Prisma.TransactionClient,
  ledger: Pick<InventoryLedgerPayload, "storeId" | "closingDate">,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) {
    return new Map();
  }

  const priorLedger = await tx.dailyLedger.findFirst({
    where: {
      storeId: ledger.storeId,
      closingDate: { lt: ledger.closingDate },
      status: { in: [...SALES_PRICE_CARRYOVER_LEDGER_STATUSES] },
    },
    orderBy: { closingDate: "desc" },
    select: { closingDate: true },
  });

  if (!priorLedger) {
    return new Map();
  }

  const fallbackSalesPlans = await tx.storeSalesPricePlan.findMany({
    where: {
      storeId: ledger.storeId,
      businessDate: priorLedger.closingDate,
      productId: { in: [...productIds] },
    },
    select: { productId: true, plannedUnitPrice: true },
  });

  return new Map(
    fallbackSalesPlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );
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
  const inventoryGate = await getInventoryPlanGateForLedgerInTx(tx, ledger);
  const stepCompletion = getStoreEntryStepCompletion({
    ...ledger,
    inventoryComplete: inventoryGate.complete,
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
    const itemsWithHistory = await attachCarryoverHistories(
      tx,
      ledger.storeId,
      ledger.closingDate,
      items,
    );
    const itemsWithFifoLots = await attachFifoLots(
      tx,
      ledger.id,
      itemsWithHistory,
    );
    const carryoverStatus = getPrimaryCarryoverStatus(items);
    const manualProductOptions = await getManualProductOptions(
      tx,
      new Set(itemsWithFifoLots.map((item) => item.productId)),
    );
    const priced = await attachPurchasePrices(
      tx,
      ledger,
      itemsWithFifoLots,
      manualProductOptions,
    );

    return {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
      version: ledger.version,
      authorDisplayName: ledger.authorDisplayName ?? null,
      status: ledger.status,
      stepCompletion,
      items: priced.items,
      manualProductOptions: priced.manualProductOptions,
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
  const items = bases.map((base) =>
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
  const itemsWithHistory = await attachCarryoverHistories(
    tx,
    ledger.storeId,
    ledger.closingDate,
    items,
  );
  const manualProductOptions = await getManualProductOptions(
    tx,
    new Set(itemsWithHistory.map((item) => item.productId)),
  );
  const priced = await attachPurchasePrices(
    tx,
    ledger,
    itemsWithHistory,
    manualProductOptions,
  );

  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName ?? null,
    status: ledger.status,
    stepCompletion,
    items: priced.items,
    manualProductOptions: priced.manualProductOptions,
    carryover: {
      status: carryover.status,
      source: carryover.source,
      message: carryover.message,
    },
  };
}

export async function getLossInventoryAvailabilityLinesInTx(
  tx: Prisma.TransactionClient,
  ledger: {
    id: string;
    storeId: string;
    closingDate: string | Date;
  },
): Promise<LossInventoryAvailabilityLine[]> {
  const closingDate =
    ledger.closingDate instanceof Date
      ? ledger.closingDate
      : new Date(ledger.closingDate);

  const [purchaseRows, lossRows, existingItems] = await Promise.all([
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId: ledger.id, productId: { not: null } },
      select: { productId: true, quantity: true },
    }),
    tx.ledgerLossItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: { productId: true, quantity: true },
    }),
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: {
        productId: true,
        previousQuantity: true,
        purchasedQuantity: true,
      },
    }),
  ]);

  const purchaseQuantities = aggregateQuantityByProductId(purchaseRows);
  const lossQuantities = aggregateQuantityByProductId(lossRows);

  if (existingItems.length > 0) {
    return buildLossInventoryAvailabilityLines({
      existingItems: existingItems.map((item) => ({
        productId: item.productId,
        previousQuantity: decimalToNumber(item.previousQuantity),
        purchasedQuantity: decimalToNumber(item.purchasedQuantity),
      })),
      purchaseQuantities,
      lossQuantities,
    });
  }

  const previousQuantities = await loadLossAvailabilityPreviousQuantitiesInTx(
    tx,
    ledger.storeId,
    closingDate,
  );

  return buildLossInventoryAvailabilityLines({
    existingItems: [],
    purchaseQuantities,
    lossQuantities,
    previousQuantities,
  });
}

function aggregateQuantityByProductId(
  rows: readonly { productId: string | null; quantity: DecimalNumber }[],
) {
  const quantities = new Map<string, number>();

  for (const row of rows) {
    if (!row.productId) {
      continue;
    }

    quantities.set(
      row.productId,
      (quantities.get(row.productId) ?? 0) + decimalToNumber(row.quantity),
    );
  }

  return quantities;
}

async function loadLossAvailabilityPreviousQuantitiesInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDate: Date,
) {
  const yearMonth = getYearMonth(closingDate);
  const priorLedger = await tx.dailyLedger.findFirst({
    where: {
      storeId,
      closingDate: { lt: closingDate },
      status: { not: "HOLIDAY" },
      ledgerInventoryItems: { some: {} },
    },
    orderBy: { closingDate: "desc" },
    select: {
      closingDate: true,
      ledgerInventoryItems: {
        select: {
          productId: true,
          currentQuantity: true,
          quantity: true,
        },
      },
    },
  });

  const priorLedgerClosingYearMonth = priorLedger
    ? getYearMonth(priorLedger.closingDate)
    : null;
  const sameMonthPrior =
    priorLedgerClosingYearMonth != null &&
    priorLedgerClosingYearMonth === yearMonth;

  const snapshots = sameMonthPrior
    ? []
    : await tx.inventoryOpeningSnapshot.findMany({
        where: { storeId, yearMonth },
        select: { productId: true, quantity: true },
      });

  const previousQuantitySource = resolveInventoryPreviousQuantitySource({
    closingYearMonth: yearMonth,
    priorLedgerClosingYearMonth,
    hasOpeningSnapshots: snapshots.length > 0,
  });

  if (
    previousQuantitySource === "SAME_MONTH_PRIOR_LEDGER" ||
    previousQuantitySource === "CROSS_MONTH_PRIOR_LEDGER"
  ) {
    return new Map(
      (priorLedger?.ledgerInventoryItems ?? []).map((item) => [
        item.productId,
        toPreviousQuantity(item),
      ]),
    );
  }

  if (previousQuantitySource === "OPENING_SNAPSHOT") {
    return new Map(
      snapshots.map((snapshot) => [
        snapshot.productId,
        decimalToNumber(snapshot.quantity),
      ]),
    );
  }

  return new Map<string, number>();
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
  return db.$transaction(async (tx) => {
    const data = await getInventoryStepDataInTx(
      tx,
      storeId,
      closingDate,
      actorId,
    );

    // 폼 응답만 0재고 표시 정책을 적용한다. 저장/감사 before는 InTx 원본을 쓴다.
    return toStoreManagerInventoryStepDataInTx(
      tx,
      applyInventoryFormDisplayPolicy(data),
    );
  });
}

export async function getInventoryStepDataByLedgerId(
  ledgerId: string,
): Promise<InventoryStepData | null> {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction(async (tx) => {
    const data = await getInventoryStepDataByLedgerIdInTx(tx, ledgerId);

    return data ? applyInventoryFormDisplayPolicy(data) : null;
  });
}

export async function toStoreManagerInventoryStepDataInTx(
  tx: Prisma.TransactionClient,
  data: InventoryStepData,
): Promise<StoreManagerInventoryStepData> {
  const productIds = [
    ...new Set([
      ...data.items.map((item) => item.productId),
      ...data.manualProductOptions.map((option) => option.productId),
    ]),
  ];
  const missingProductIds = productIds.filter((productId) => {
    const item = data.items.find((row) => row.productId === productId);
    const option = data.manualProductOptions.find(
      (row) => row.productId === productId,
    );
    const current = item?.plannedUnitPrice ?? option?.plannedUnitPrice ?? null;

    return current === null;
  });
  const carryoverByProductId = await loadSalesPriceCarryoverByProductId(
    tx,
    {
      storeId: data.storeId,
      closingDate: new Date(data.closingDate),
    },
    missingProductIds,
  );

  return toStoreManagerInventoryStepData(data, carryoverByProductId);
}

export function toStoreManagerInventoryStepData(
  data: InventoryStepData,
  carryoverByProductId: ReadonlyMap<string, number> = new Map(),
): StoreManagerInventoryStepData {
  return shapeStoreManagerInventoryStepData(data, carryoverByProductId);
}
