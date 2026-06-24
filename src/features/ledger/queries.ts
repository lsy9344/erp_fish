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
  purchaseItems: LedgerCostStepData["purchaseItems"];
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
    purchaseItems: getLedgerPurchaseItems(ledger),
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

export async function getTodayStoreLedger(
  storeId: string,
  actorId: string,
): Promise<StoreManagerLedgerCostStepData> {
  return getStoreLedger(storeId, getTodayKstMidnight(), actorId);
}

export async function getStoreLedger(
  storeId: string,
  closingDate: string | Date,
  actorId: string,
): Promise<StoreManagerLedgerCostStepData> {
  return db.$transaction((tx) =>
    getOrCreateStoreLedgerInTx(tx, storeId, closingDate, actorId).then(
      toStoreManagerLedgerCostStepData,
    ),
  );
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
