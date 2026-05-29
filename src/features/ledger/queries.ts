import { Prisma } from "../../../generated/prisma";

import {
  calculateExpenseTotal,
  calculateGrossProfit,
  calculatePaymentDifference,
  calculatePurchaseTotal,
  calculateProductivity,
} from "~/server/calculations/ledger";
import { writeAuditLog } from "~/server/audit";
import { db } from "~/server/db";
import { type LedgerCostStepData, type LedgerSalesStepData } from "./types";

const LEGAL_SEOUL_TZ = "Asia/Seoul";

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
  productName: true,
  productCategory: true,
  productSpec: true,
  unitPrice: true,
  quantity: true,
  amount: true,
  referenceInfo: true,
} as const;

export const ledgerSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  status: true,
  totalSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  workMemo: true,
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
} as const;

type DailyLedgerPayload = Prisma.DailyLedgerGetPayload<{
  select: typeof ledgerSelect;
}>;

type LedgerExpensePayload = DailyLedgerPayload["ledgerExpenses"][number];
type LedgerPurchasePayload = DailyLedgerPayload["ledgerPurchaseItems"][number];

type LedgerAuditPayload = {
  status: DailyLedgerPayload["status"];
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  expenseTotal: number;
  purchaseTotal: number;
  grossProfit: number;
  productivity: number | null;
  paymentDifferenceAmount: number;
};

type LedgerAuditInput = Pick<
  DailyLedgerPayload,
  | "status"
  | "totalSalesAmount"
  | "cashAmount"
  | "cardAmount"
  | "otherPaymentAmount"
  | "workerCount"
  | "workMemo"
  | "ledgerExpenses"
  | "ledgerPurchaseItems"
>;

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function getTodayKstMidnight(inputDate = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEGAL_SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );
}

export function toLedgerSalesStepData(
  ledger: DailyLedgerPayload,
): LedgerSalesStepData {
  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    status: ledger.status,
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

function getLedgerExpenseItems(
  ledger: DailyLedgerPayload,
): LedgerCostStepData["expenseItems"] {
  return ledger.ledgerExpenses.map((item: LedgerExpensePayload) => ({
    id: item.id,
    ledgerInputCodeId: item.ledgerInputCodeId,
    ledgerInputCodeName: item.ledgerInputCode.name,
    amount: item.amount,
    memo: item.memo ?? null,
  }));
}

function getLedgerPurchaseItems(
  ledger: DailyLedgerPayload,
): LedgerCostStepData["purchaseItems"] {
  return ledger.ledgerPurchaseItems.map((item: LedgerPurchasePayload) => ({
    id: item.id,
    productId: item.productId,
    purchaseStandardId: item.purchaseStandardId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    amount: item.amount,
    referenceInfo: item.referenceInfo ?? null,
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
    grossProfit,
    productivity: calculateProductivity(
      grossProfit,
      ledger.workerCount ?? null,
    ),
  };
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
  const grossProfit = calculateGrossProfit(
    ledger.totalSalesAmount,
    expenseTotal,
  );

  return {
    status: ledger.status,
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount ?? null,
    expenseTotal,
    purchaseTotal,
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

async function getOrCreateTodayStoreLedgerInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  actorId: string,
) {
  const closingDate = getTodayKstMidnight();

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

  try {
    const created = await tx.dailyLedger.create({
      data: {
        storeId,
        closingDate,
        status: "IN_PROGRESS",
        totalSalesAmount: 0,
        cashAmount: 0,
        cardAmount: 0,
        otherPaymentAmount: 0,
        workerCount: null,
        workMemo: null,
        createdById: actorId,
        updatedById: actorId,
      },
      select: ledgerSelect,
    });

    await writeAuditLog(tx, {
      action: "ledger.created",
      targetType: "DailyLedger",
      targetId: created.id,
      actorId,
      before: null,
      after: toLedgerAuditPayload(created),
    });

    return created;
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      const recovered = await tx.dailyLedger.findUnique({
        where: {
          storeId_closingDate: {
            storeId,
            closingDate,
          },
        },
        select: ledgerSelect,
      });

      if (recovered) {
        return recovered;
      }
    }

    throw error;
  }
}

export async function getTodayStoreLedger(
  storeId: string,
  actorId: string,
): Promise<LedgerCostStepData> {
  return db.$transaction((tx) =>
    getOrCreateTodayStoreLedgerInTx(tx, storeId, actorId).then(
      toLedgerCostStepData,
    ),
  );
}

export async function getTodayStoreLedgerInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  actorId: string,
): Promise<DailyLedgerPayload> {
  const ledger = await getOrCreateTodayStoreLedgerInTx(tx, storeId, actorId);

  return ledger;
}
