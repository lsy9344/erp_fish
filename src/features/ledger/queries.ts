import type { Prisma } from "../../../generated/prisma";

import {
  calculateExpenseTotal,
  calculateGrossProfit,
  calculatePaymentDifference,
  calculatePurchaseTotal,
  calculatePayrollTotal,
  calculateProductivity,
} from "~/server/calculations/ledger";
import { writeAuditLog } from "~/server/audit";
import {
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { toStoreManagerLedgerCostStepData as shapeStoreManagerLedgerCostStepData } from "./response-shaping";
import { getStoreEntryStepCompletion } from "./step-completion";
import {
  type LedgerCostStepData,
  type LedgerSalesStepData,
  type StoreManagerLedgerCostStepData,
} from "./types";
import { getKstBusinessDate } from "./date";
export { getKstBusinessDate, getKstBusinessDateParam } from "./date";

const ledgerExpenseSelect = {
  id: true,
  ledgerInputCodeId: true,
  ledgerInputCode: {
    select: {
      name: true,
    },
  },
  amount: true,
  memo: true,
} as const;

const ledgerPurchaseSelect = {
  id: true,
  productId: true,
  purchaseStandardId: true,
  sourceType: true,
  productName: true,
  productCategory: true,
  productSpec: true,
  unitPrice: true,
  quantity: true,
  amount: true,
  referenceInfo: true,
  // 이카운트 원본 추적/적용 단가 override 메타. 저장 시 delete+recreate에서 보존한다.
  ecountImportLineId: true,
  sourceUnitPrice: true,
  unitPriceOverrideReason: true,
  unitPriceUpdatedById: true,
  unitPriceUpdatedAt: true,
} as const;

const ledgerLaborSelect = {
  id: true,
  employeeId: true,
  workerName: true,
  amount: true,
  lateMemo: true,
  earlyLeaveMemo: true,
  specialMemo: true,
} as const;

export const ledgerSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  updatedAt: true,
  version: true,
  authorDisplayName: true,
  status: true,
  totalSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  workMemo: true,
  submittedById: true,
  submittedAt: true,
  closedById: true,
  closedAt: true,
  ledgerExpenses: {
    select: ledgerExpenseSelect,
    orderBy: {
      createdAt: "asc",
    },
  },
  ledgerPurchaseItems: {
    select: ledgerPurchaseSelect,
    orderBy: {
      createdAt: "asc",
    },
  },
  ledgerLaborItems: {
    select: ledgerLaborSelect,
    orderBy: {
      createdAt: "asc",
    },
  },
  _count: {
    select: {
      ledgerInventoryItems: true,
      ledgerLossItems: true,
    },
  },
} as const;

type DailyLedgerPayload = Prisma.DailyLedgerGetPayload<{
  select: typeof ledgerSelect;
}>;

type LedgerExpensePayload = DailyLedgerPayload["ledgerExpenses"][number];
type LedgerPurchasePayload = DailyLedgerPayload["ledgerPurchaseItems"][number];
type LedgerLaborPayload = DailyLedgerPayload["ledgerLaborItems"][number];

// WO(2026-06-24) Task 15: 감사 payload의 매입 항목에는 원본 단가(sourceUnitPrice)와
// 적용 단가 override 메타를 포함해, 본사 보정 이력을 원본/적용값으로 구분해 볼 수 있게 한다.
type LedgerAuditPurchaseItem = LedgerCostStepData["purchaseItems"][number] & {
  sourceUnitPrice: number | null;
  unitPriceOverridden: boolean;
  unitPriceOverrideReason: string | null;
  unitPriceUpdatedById: string | null;
  ecountImportLineId: string | null;
};

type LedgerAuditPayload = {
  status: DailyLedgerPayload["status"];
  version: number;
  authorDisplayName: string | null;
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  workMemo: string | null;
  submittedById: string | null;
  submittedAt: string | null;
  closedById: string | null;
  closedAt: string | null;
  expenseItems: LedgerCostStepData["expenseItems"];
  purchaseItems: LedgerAuditPurchaseItem[];
  laborItems: LedgerCostStepData["laborItems"];
  expenseTotal: number;
  purchaseTotal: number;
  payrollTotal: number;
  grossProfit: number;
  productivity: number | null;
  paymentDifferenceAmount: number;
};

type LedgerAuditInput = Pick<
  DailyLedgerPayload,
  | "status"
  | "version"
  | "authorDisplayName"
  | "totalSalesAmount"
  | "cashAmount"
  | "cardAmount"
  | "otherPaymentAmount"
  | "workerCount"
  | "workMemo"
  | "submittedById"
  | "submittedAt"
  | "closedById"
  | "closedAt"
  | "ledgerExpenses"
  | "ledgerPurchaseItems"
  | "ledgerLaborItems"
>;

export function getTodayKstMidnight(inputDate = new Date()) {
  return getKstBusinessDate(inputDate);
}

export function toLedgerSalesStepData(
  ledger: DailyLedgerPayload,
): LedgerSalesStepData {
  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName ?? null,
    status: ledger.status,
    submittedById: ledger.submittedById ?? null,
    submittedAt: ledger.submittedAt?.toISOString() ?? null,
    closedById: ledger.closedById ?? null,
    closedAt: ledger.closedAt?.toISOString() ?? null,
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    paymentDifferenceAmount: calculatePaymentDifference(
      ledger.totalSalesAmount,
      ledger.cashAmount,
      ledger.cardAmount,
      ledger.otherPaymentAmount,
    ),
  };
}

function getLedgerExpenseItems(ledger: {
  ledgerExpenses: LedgerExpensePayload[];
}): LedgerCostStepData["expenseItems"] {
  return ledger.ledgerExpenses.map((item: LedgerExpensePayload) => ({
    id: item.id,
    ledgerInputCodeId: item.ledgerInputCodeId,
    ledgerInputCodeName: item.ledgerInputCode.name,
    amount: item.amount,
    memo: item.memo ?? null,
  }));
}

function getLedgerPurchaseItems(ledger: {
  ledgerPurchaseItems: LedgerPurchasePayload[];
}): LedgerCostStepData["purchaseItems"] {
  return ledger.ledgerPurchaseItems.map((item: LedgerPurchasePayload) => ({
    id: item.id,
    productId: item.productId,
    purchaseStandardId: item.purchaseStandardId,
    sourceType: item.sourceType,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    amount: item.amount,
    referenceInfo: item.referenceInfo ?? null,
    // 기본은 null. 판매 예정가는 지점장 매입 화면 전용 조회 경로(getStoreLedger)에서만 채운다.
    plannedUnitPrice: null,
    kind: "purchase" as const,
    previousQuantity: 0,
  }));
}

function getLedgerAuditPurchaseItems(ledger: {
  ledgerPurchaseItems: LedgerPurchasePayload[];
}): LedgerAuditPurchaseItem[] {
  return ledger.ledgerPurchaseItems.map((item: LedgerPurchasePayload) => ({
    id: item.id,
    productId: item.productId,
    purchaseStandardId: item.purchaseStandardId,
    sourceType: item.sourceType,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    amount: item.amount,
    referenceInfo: item.referenceInfo ?? null,
    plannedUnitPrice: null,
    kind: "purchase" as const,
    previousQuantity: 0,
    sourceUnitPrice: item.sourceUnitPrice ?? null,
    unitPriceOverridden:
      item.sourceUnitPrice !== null &&
      item.sourceUnitPrice !== undefined &&
      item.sourceUnitPrice !== item.unitPrice,
    unitPriceOverrideReason: item.unitPriceOverrideReason ?? null,
    unitPriceUpdatedById: item.unitPriceUpdatedById ?? null,
    ecountImportLineId: item.ecountImportLineId ?? null,
  }));
}

function getLedgerLaborItems(ledger: {
  ledgerLaborItems: LedgerLaborPayload[];
}): LedgerCostStepData["laborItems"] {
  return ledger.ledgerLaborItems.map((item: LedgerLaborPayload) => ({
    id: item.id,
    employeeId: item.employeeId ?? null,
    workerName: item.workerName,
    amount: item.amount,
    lateMemo: item.lateMemo ?? null,
    earlyLeaveMemo: item.earlyLeaveMemo ?? null,
    specialMemo: item.specialMemo ?? null,
  }));
}

export function toLedgerCostStepData(
  ledger: DailyLedgerPayload,
): LedgerCostStepData {
  const expenseItems = getLedgerExpenseItems(ledger);
  const expenseTotal = calculateExpenseTotal(
    expenseItems.map((item) => item.amount),
  );
  const purchaseItems = getLedgerPurchaseItems(ledger);
  const laborItems = getLedgerLaborItems(ledger);
  const grossProfit = calculateGrossProfit(
    ledger.totalSalesAmount,
    expenseTotal,
  );

  return {
    ...toLedgerSalesStepData(ledger),
    workerCount: ledger.workerCount ?? null,
    workMemo: ledger.workMemo ?? null,
    expenseItems,
    expenseTotal,
    purchaseItems,
    purchaseTotal: calculatePurchaseTotal(
      purchaseItems.map((item) => item.amount),
    ),
    laborItems,
    payrollTotal: calculatePayrollTotal(laborItems.map((item) => item.amount)),
    grossProfit,
    productivity: calculateProductivity(
      grossProfit,
      ledger.workerCount ?? null,
    ),
    stepCompletion: getStoreEntryStepCompletion({
      ...ledger,
      inventoryItemCount: ledger._count.ledgerInventoryItems,
      lossItemCount: ledger._count.ledgerLossItems,
    }),
  };
}

export function toStoreManagerLedgerCostStepData(
  ledger: DailyLedgerPayload,
): StoreManagerLedgerCostStepData {
  return shapeStoreManagerLedgerCostStepData(toLedgerCostStepData(ledger));
}

export function toLedgerPurchaseStepData(
  ledger: DailyLedgerPayload,
): LedgerCostStepData {
  return toLedgerCostStepData(ledger);
}

export function toLedgerAuditPayload(
  ledger: LedgerAuditInput,
): LedgerAuditPayload {
  const expenseTotal = calculateExpenseTotal(
    ledger.ledgerExpenses.map(
      (expense: LedgerExpensePayload) => expense.amount,
    ),
  );
  const purchaseTotal = calculatePurchaseTotal(
    ledger.ledgerPurchaseItems.map(
      (purchase: LedgerPurchasePayload) => purchase.amount,
    ),
  );
  const laborItems = getLedgerLaborItems(ledger);
  const payrollTotal = calculatePayrollTotal(
    laborItems.map((item) => item.amount),
  );
  const grossProfit = calculateGrossProfit(
    ledger.totalSalesAmount,
    expenseTotal,
  );

  return {
    status: ledger.status,
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName ?? null,
    submittedById: ledger.submittedById ?? null,
    submittedAt: ledger.submittedAt?.toISOString() ?? null,
    closedById: ledger.closedById ?? null,
    closedAt: ledger.closedAt?.toISOString() ?? null,
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount ?? null,
    workMemo: ledger.workMemo ?? null,
    expenseItems: getLedgerExpenseItems(ledger),
    purchaseItems: getLedgerAuditPurchaseItems(ledger),
    laborItems,
    expenseTotal,
    purchaseTotal,
    payrollTotal,
    grossProfit,
    productivity: calculateProductivity(
      grossProfit,
      ledger.workerCount ?? null,
    ),
    paymentDifferenceAmount: calculatePaymentDifference(
      ledger.totalSalesAmount,
      ledger.cashAmount,
      ledger.cardAmount,
      ledger.otherPaymentAmount,
    ),
  };
}

export async function getOrCreateStoreLedgerInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDateInput: string | Date,
  actorId: string,
) {
  const closingDate = getKstBusinessDate(closingDateInput);

  const existing = await tx.dailyLedger.findUnique({
    where: {
      storeId_closingDate: {
        storeId,
        closingDate,
      },
    },
    select: ledgerSelect,
  });

  if (existing) {
    return existing;
  }

  const createdResult = await tx.dailyLedger.createMany({
    data: {
      storeId,
      closingDate,
      status: "IN_PROGRESS",
      version: 1,
      totalSalesAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: null,
      workMemo: null,
      createdById: actorId,
      updatedById: actorId,
    },
    skipDuplicates: true,
  });

  const ledger = await tx.dailyLedger.findUnique({
    where: {
      storeId_closingDate: {
        storeId,
        closingDate,
      },
    },
    select: ledgerSelect,
  });

  if (!ledger) {
    throw new Error("Daily ledger was not found after creation.");
  }

  if (createdResult.count === 1) {
    await writeAuditLog(tx, {
      action: "ledger.created",
      targetType: "DailyLedger",
      targetId: ledger.id,
      actorId,
      before: null,
      after: toLedgerAuditPayload(ledger),
    });
  }

  return ledger;
}

/**
 * WO(2026-06-24) Task 8/9: 장부 매입 행은 저장 시 delete+recreate되므로
 * 재생성된 LedgerPurchaseItem.ecountImportLineId(권위 있는 링크)를 기준으로
 * EcountImportLine.ledgerPurchaseItemId back-pointer를 다시 맞춘다.
 *
 * - 재생성된 행이 가리키는 import line은 새 장부 행 id를 가리키게 한다.
 * - 더 이상 어떤 장부 행도 가리키지 않게 된 import line(행 삭제 등)은 back-pointer를 null로 비운다.
 */
export async function syncEcountImportLineBackPointersInTx(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
): Promise<void> {
  // 재생성된 장부 행이 가리키는 import line(권위 있는 ecountImportLineId 링크).
  const items = await tx.ledgerPurchaseItem.findMany({
    where: { dailyLedgerId, ecountImportLineId: { not: null } },
    select: { id: true, ecountImportLineId: true },
  });
  const links = items.flatMap((item) =>
    item.ecountImportLineId
      ? [{ importLineId: item.ecountImportLineId, itemId: item.id }]
      : [],
  );
  const linkedImportLineIds = links.map((link) => link.importLineId);

  // 영향받은 batch 안에서, 더 이상 이 장부의 어떤 행도 가리키지 않게 된
  // import line의 back-pointer를 정리한다. ledgerPurchaseItemId는 FK가 아닌
  // 비정규화 컬럼이라 행 삭제만으로는 자동 정리되지 않는다.
  const affectedBatchIds = [
    ...new Set(
      (
        await tx.ecountImportLine.findMany({
          where: { id: { in: linkedImportLineIds } },
          select: { batchId: true },
        })
      ).map((line) => line.batchId),
    ),
  ];

  if (affectedBatchIds.length > 0) {
    await tx.ecountImportLine.updateMany({
      where: {
        batchId: { in: affectedBatchIds },
        ledgerPurchaseItemId: { not: null },
        id: {
          notIn: linkedImportLineIds.length > 0 ? linkedImportLineIds : [""],
        },
      },
      data: { ledgerPurchaseItemId: null },
    });
  }

  for (const link of links) {
    await tx.ecountImportLine.update({
      where: { id: link.importLineId },
      data: { ledgerPurchaseItemId: link.itemId },
    });
  }
}

export async function getTodayStoreLedger(
  storeId: string,
  actorId: string,
): Promise<StoreManagerLedgerCostStepData> {
  return getStoreLedger(storeId, getTodayKstMidnight(), actorId);
}

// 지점장 매입 화면(3단계)에 통합한 판매 예정가를 매입 행에 채운다. 판매 예정가는
// StoreSalesPricePlan(storeId, businessDate=closingDate, productId)에 하루 1개 값으로
// 저장되므로 같은 품목의 여러 매입 행에는 같은 값이 채워진다. businessDate는 review-queries와
// 동일하게 raw Prisma closingDate(Date)를 그대로 쓴다.
export async function fillPurchasePlannedUnitPricesInTx(
  tx: Prisma.TransactionClient,
  data: StoreManagerLedgerCostStepData,
  storeId: string,
  businessDate: Date,
  ledgerId: string,
): Promise<StoreManagerLedgerCostStepData> {
  const purchaseProductIds = new Set(
    data.purchaseItems
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id)),
  );

  // 전일 이월돼 매입 행이 없는 품목(전일재고>0, 오늘 매입 안 함)을 carryover 행으로 만든다.
  // 이 품목들은 매입 화면에 행이 없어 판매 예정가를 넣을 곳이 없었고, 그 결과 7단계 추정 매출이
  // "데이터 부족"이 되던 근본 원인이다. 매입 화면 끝에 별도 행으로 노출해 판매 예정가만 받는다.
  const carryoverInventoryItems = await tx.ledgerInventoryItem.findMany({
    where: {
      dailyLedgerId: ledgerId,
      previousQuantity: { gt: 0 },
      productId: { notIn: [...purchaseProductIds] },
    },
    select: {
      productId: true,
      productName: true,
      productCategory: true,
      productSpec: true,
      previousQuantity: true,
    },
    orderBy: [{ productCategory: "asc" }, { productName: "asc" }],
  });

  const carryoverProductIds = carryoverInventoryItems.map(
    (item) => item.productId,
  );

  const planProductIds = [...purchaseProductIds, ...carryoverProductIds];

  const plans =
    planProductIds.length > 0
      ? await tx.storeSalesPricePlan.findMany({
          where: {
            storeId,
            businessDate,
            productId: { in: planProductIds },
          },
          select: { productId: true, plannedUnitPrice: true },
        })
      : [];
  const plannedByProductId = new Map(
    plans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );

  const carryoverItems: StoreManagerLedgerCostStepData["purchaseItems"] =
    carryoverInventoryItems.map((item) => ({
      id: `carryover-${item.productId}`,
      productId: item.productId,
      purchaseStandardId: null,
      sourceType: "MANUAL" as const,
      productName: item.productName,
      productCategory: item.productCategory,
      productSpec: item.productSpec,
      unitPrice: 0,
      quantity: 0,
      amount: 0,
      referenceInfo: null,
      plannedUnitPrice: plannedByProductId.get(item.productId) ?? null,
      kind: "carryover" as const,
      previousQuantity: item.previousQuantity,
    }));

  return {
    ...data,
    purchaseItems: [
      ...data.purchaseItems.map((item) => ({
        ...item,
        plannedUnitPrice: item.productId
          ? (plannedByProductId.get(item.productId) ?? null)
          : null,
      })),
      ...carryoverItems,
    ],
  };
}

export async function getStoreLedger(
  storeId: string,
  closingDate: string | Date,
  actorId: string,
): Promise<StoreManagerLedgerCostStepData> {
  return db.$transaction(async (tx) => {
    const ledger = await getOrCreateStoreLedgerInTx(
      tx,
      storeId,
      closingDate,
      actorId,
    );

    return fillPurchasePlannedUnitPricesInTx(
      tx,
      toStoreManagerLedgerCostStepData(ledger),
      ledger.storeId,
      ledger.closingDate,
      ledger.id,
    );
  });
}

export async function getTodayStoreLedgerInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  actorId: string,
): Promise<DailyLedgerPayload> {
  const ledger = await getStoreLedgerInTx(
    tx,
    storeId,
    getTodayKstMidnight(),
    actorId,
  );

  return ledger;
}

export async function getStoreLedgerInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  closingDate: string | Date,
  actorId: string,
): Promise<DailyLedgerPayload> {
  const ledger = await getOrCreateStoreLedgerInTx(
    tx,
    storeId,
    closingDate,
    actorId,
  );

  return ledger;
}

export async function getLedgerCostStepDataByIdInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
): Promise<LedgerCostStepData | null> {
  const ledger = await tx.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: ledgerSelect,
  });

  return ledger ? toLedgerCostStepData(ledger) : null;
}

export async function getLedgerCostStepDataById(
  ledgerId: string,
): Promise<LedgerCostStepData | null> {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction((tx) => getLedgerCostStepDataByIdInTx(tx, ledgerId));
}
