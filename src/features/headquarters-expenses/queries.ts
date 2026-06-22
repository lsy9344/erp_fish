import type { Prisma } from "../../../generated/prisma/index.js";
import { summarizeHeadquartersExpenseAmounts } from "./schemas.ts";

const headquartersExpenseSelect = {
  id: true,
  expenseDate: true,
  storeId: true,
  category: true,
  amount: true,
  memo: true,
  updatedAt: true,
  store: {
    select: {
      id: true,
      name: true,
    },
  },
  updatedBy: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

type HeadquartersExpenseRecord = Prisma.HeadquartersExpenseGetPayload<{
  select: typeof headquartersExpenseSelect;
}>;

export type HeadquartersExpenseStoreOption = {
  id: string;
  name: string;
};

export type HeadquartersExpenseListItem = {
  id: string;
  expenseDate: string;
  expenseDateLabel: string;
  storeId: string | null;
  storeName: string | null;
  category: string;
  amount: number;
  memo: string | null;
  updatedAt: string;
  updatedByName: string;
};

export type HeadquartersExpenseListView = {
  monthInput: string;
  expenses: HeadquartersExpenseListItem[];
  stores: HeadquartersExpenseStoreOption[];
  totalAmount: number;
  storeAttributedAmount: number;
  unattributedAmount: number;
  count: number;
};

const MONTH_QUERY_PATTERN = /^\d{4}-\d{2}$/;

function toDateInput(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatExpenseDateLabel(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getCurrentMonthInput(inputDate: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(inputDate);
}

// 본사 지출 조회 월(YYYY-MM)의 UTC 시작/끝 경계를 만든다. 잘못된 입력은 현재 월로 대체한다.
export function getHeadquartersExpenseMonthRange(
  month: unknown,
  inputDate = new Date(),
) {
  const currentMonthInput = getCurrentMonthInput(inputDate);
  const monthInput =
    typeof month === "string" && MONTH_QUERY_PATTERN.test(month)
      ? month
      : currentMonthInput;
  const year = Number(monthInput.slice(0, 4));
  const monthNumber = Number(monthInput.slice(5, 7));
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));

  return { monthInput, startDate, endDate };
}

function toHeadquartersExpenseListItem(
  expense: HeadquartersExpenseRecord,
): HeadquartersExpenseListItem {
  return {
    id: expense.id,
    expenseDate: toDateInput(expense.expenseDate),
    expenseDateLabel: formatExpenseDateLabel(expense.expenseDate),
    storeId: expense.storeId,
    storeName: expense.store?.name ?? null,
    category: expense.category,
    amount: expense.amount,
    memo: expense.memo,
    updatedAt: expense.updatedAt.toISOString(),
    updatedByName:
      expense.updatedBy?.name ?? expense.updatedBy?.email ?? "시스템",
  };
}

export async function getHeadquartersExpensesForHeadquarters({
  month,
}: {
  month?: unknown;
} = {}): Promise<HeadquartersExpenseListView> {
  const { getHeadquartersStoreScope, requireSettingsAccess } =
    await import("../../server/authz.ts");
  const { db } = await import("../../server/db.ts");
  await requireSettingsAccess();
  const scope = await getHeadquartersStoreScope();
  const monthRange = getHeadquartersExpenseMonthRange(month);

  const storeFilter =
    scope.storeIds.length > 0
      ? { OR: [{ storeId: { in: scope.storeIds } }, { storeId: null }] }
      : { storeId: null };

  const expenses = await db.headquartersExpense.findMany({
    where: {
      expenseDate: {
        gte: monthRange.startDate,
        lte: monthRange.endDate,
      },
      ...storeFilter,
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    select: headquartersExpenseSelect,
  });

  const summary = summarizeHeadquartersExpenseAmounts(expenses);

  return {
    monthInput: monthRange.monthInput,
    expenses: expenses.map(toHeadquartersExpenseListItem),
    stores: scope.stores.map((store) => ({ id: store.id, name: store.name })),
    totalAmount: summary.totalAmount,
    storeAttributedAmount: summary.storeAttributedAmount,
    unattributedAmount: summary.unattributedAmount,
    count: summary.count,
  };
}

export type HeadquartersExpenseReportSummary = {
  totalAmount: number;
  storeAttributedAmount: number;
  unattributedAmount: number;
  count: number;
};

// 월간 리포트용 본사 지출 합계. 지점 일일 장부와 무관하게 월 범위로 직접 집계한다.
// (리포트 페이지에서 호출하며, reports/queries.ts에 쓰기 호출을 추가하지 않는다.)
export async function getHeadquartersExpenseReportSummary({
  month,
}: {
  month?: unknown;
} = {}): Promise<HeadquartersExpenseReportSummary> {
  const { requireSettingsAccess, getHeadquartersStoreScope } = await import(
    "../../server/authz.ts"
  );
  const { db } = await import("../../server/db.ts");
  await requireSettingsAccess();
  const scope = await getHeadquartersStoreScope();
  const monthRange = getHeadquartersExpenseMonthRange(month);

  const storeFilter =
    scope.storeIds.length > 0
      ? { OR: [{ storeId: { in: scope.storeIds } }, { storeId: null }] }
      : { storeId: null };

  const expenses = await db.headquartersExpense.findMany({
    where: {
      expenseDate: {
        gte: monthRange.startDate,
        lte: monthRange.endDate,
      },
      ...storeFilter,
    },
    select: {
      amount: true,
      storeId: true,
    },
  });

  const summary = summarizeHeadquartersExpenseAmounts(expenses);

  return {
    totalAmount: summary.totalAmount,
    storeAttributedAmount: summary.storeAttributedAmount,
    unattributedAmount: summary.unattributedAmount,
    count: summary.count,
  };
}
