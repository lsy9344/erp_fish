// WO-15(2026-06-28) part2: 월별 손익계산서.
// 한 달 동안 지점이 얼마나 벌고(매출), 얼마나 쓰고(매입원가·인건비·고정비·기타),
// 얼마가 남았는지(남은금액)를 보는 표다. 새 DB 없이 기존 데이터로 계산한다:
//  - 매출/매입원가/매출이익: getStoreProfitSummariesForRange (장부 매출, FIFO 원가 기준)
//  - 인건비: LedgerLaborItem.amount 합계 (본사 전용)
//  - 고정비/기타/본사조정: HeadquartersExpense를 category로 합산
// G-09 기준: 달력월 / 장부 매출 / FIFO 원가 / 본사 급여 snapshot 인건비 / 마감 후 수정 허용(감사 로그).

import { requireReportAccess, getHeadquartersStoreScope } from "~/server/authz";
import { db } from "~/server/db";
import { getHeadquartersExpenseMonthRange } from "~/features/headquarters-expenses/queries";
import { getStoreProfitSummariesForRange } from "./queries";

// 월별 손익 조정 항목(C-16 확정). 본사가 HeadquartersExpense의 category로 입력한다.
// 이 라벨과 정확히 일치하는 category 금액은 해당 컬럼으로, 그 외 category는 기타비용으로 합산한다.
export const MONTHLY_PNL_FIXED_COST_CATEGORIES = [
  "월세",
  "관리비",
  "공과금",
  "세금/수수료",
  "포장/소모품",
  "배송/운반",
  "수선/유지보수",
] as const;

export const MONTHLY_PNL_HQ_ADJUSTMENT_CATEGORY = "본사조정";

export type MonthlyProfitAndLossRow = {
  monthInput: string;
  storeId: string;
  storeName: string;
  salesAmount: number;
  cogsAmount: number;
  grossProfit: number | null;
  grossMarginRate: number | null;
  laborAmount: number;
  // 고정비 항목별 합계(없으면 0).
  fixedCosts: Record<(typeof MONTHLY_PNL_FIXED_COST_CATEGORIES)[number], number>;
  otherExpenseAmount: number;
  hqAdjustmentAmount: number;
  // 매출이익 - 인건비 - 모든 비용(고정비+기타+본사조정).
  netAmount: number;
  // 조정 사유/메모는 본사조정 category의 memo를 모아서 보여준다.
  adjustmentReason: string | null;
  memo: string | null;
};

export type MonthlyProfitAndLossData = {
  monthInput: string;
  rows: MonthlyProfitAndLossRow[];
};

function emptyFixedCosts() {
  return Object.fromEntries(
    MONTHLY_PNL_FIXED_COST_CATEGORIES.map((category) => [category, 0]),
  ) as MonthlyProfitAndLossRow["fixedCosts"];
}

// 빈 배열이면 null, 아니면 " · "로 합친다(빈 문자열을 null로 변환).
function joinOrNull(values: string[] | undefined): string | null {
  if (!values || values.length === 0) {
    return null;
  }

  return values.join(" · ");
}

export async function buildMonthlyProfitAndLoss({
  month,
  storeId,
}: {
  month?: string;
  storeId?: string | null;
}): Promise<MonthlyProfitAndLossData> {
  await requireReportAccess();

  const scope = await getHeadquartersStoreScope();
  const { monthInput, startDate, endDate } =
    getHeadquartersExpenseMonthRange(month);

  // 조회 범위 지점: 요청 지점이 scope 안이면 그 지점만, 아니면 scope 전체.
  const scopedStoreIds = scope.storeIds;
  const targetStoreIds =
    storeId && scopedStoreIds.includes(storeId) ? [storeId] : scopedStoreIds;

  if (targetStoreIds.length === 0) {
    return { monthInput, rows: [] };
  }

  const [profitSummaries, stores, laborItems, expenses] = await Promise.all([
    getStoreProfitSummariesForRange({
      storeIds: targetStoreIds,
      startDate,
      endDate,
    }),
    db.store.findMany({
      where: { id: { in: targetStoreIds } },
      select: { id: true, name: true },
    }),
    // 인건비: 해당 월 장부의 급여 합계(본사 전용 snapshot).
    db.ledgerLaborItem.findMany({
      where: {
        dailyLedger: {
          storeId: { in: targetStoreIds },
          closingDate: { gte: startDate, lte: endDate },
        },
      },
      select: { amount: true, dailyLedger: { select: { storeId: true } } },
    }),
    // 고정비/기타/본사조정: 본사 지출. storeId가 null인 항목은 지점에 귀속하지 않으므로
    // 월별 손익의 "본사조정/기타"로 전 지점에 나누지 않고 별도 store="(전사)" 행으로 둔다.
    db.headquartersExpense.findMany({
      where: {
        expenseDate: { gte: startDate, lte: endDate },
        OR: [{ storeId: { in: targetStoreIds } }, { storeId: null }],
      },
      select: { storeId: true, category: true, amount: true, memo: true },
    }),
  ]);

  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const laborByStore = new Map<string, number>();
  for (const item of laborItems) {
    const key = item.dailyLedger.storeId;
    laborByStore.set(key, (laborByStore.get(key) ?? 0) + item.amount);
  }

  // 지점별 비용 누적기. storeId가 null인 본사 지출은 "(전사)" 가상 행에 모은다.
  const COMPANY_WIDE = "__company_wide__";
  type CostBucket = {
    fixedCosts: MonthlyProfitAndLossRow["fixedCosts"];
    otherExpenseAmount: number;
    hqAdjustmentAmount: number;
    adjustmentReasons: string[];
    memos: string[];
  };
  const costByStore = new Map<string, CostBucket>();
  const fixedCostSet = new Set<string>(MONTHLY_PNL_FIXED_COST_CATEGORIES);

  for (const expense of expenses) {
    const key = expense.storeId ?? COMPANY_WIDE;
    const bucket = costByStore.get(key) ?? {
      fixedCosts: emptyFixedCosts(),
      otherExpenseAmount: 0,
      hqAdjustmentAmount: 0,
      adjustmentReasons: [],
      memos: [],
    };

    if (expense.category === MONTHLY_PNL_HQ_ADJUSTMENT_CATEGORY) {
      bucket.hqAdjustmentAmount += expense.amount;
      if (expense.memo) {
        bucket.adjustmentReasons.push(expense.memo);
      }
    } else if (fixedCostSet.has(expense.category)) {
      bucket.fixedCosts[
        expense.category as (typeof MONTHLY_PNL_FIXED_COST_CATEGORIES)[number]
      ] += expense.amount;
    } else {
      bucket.otherExpenseAmount += expense.amount;
    }

    if (expense.memo) {
      bucket.memos.push(expense.memo);
    }

    costByStore.set(key, bucket);
  }

  function sumBucketCosts(bucket: CostBucket | undefined): number {
    if (!bucket) {
      return 0;
    }

    const fixedTotal = Object.values(bucket.fixedCosts).reduce(
      (sum, value) => sum + value,
      0,
    );

    return (
      fixedTotal + bucket.otherExpenseAmount + bucket.hqAdjustmentAmount
    );
  }

  const rows: MonthlyProfitAndLossRow[] = targetStoreIds.map((id) => {
    const summary = profitSummaries.get(id);
    const salesAmount = summary?.totalSales ?? 0;
    const grossProfit = summary?.grossProfit ?? null;
    const cogsAmount = grossProfit === null ? 0 : salesAmount - grossProfit;
    const laborAmount = laborByStore.get(id) ?? 0;
    const bucket = costByStore.get(id);
    const expenseTotal = sumBucketCosts(bucket);
    const netAmount = (grossProfit ?? 0) - laborAmount - expenseTotal;

    return {
      monthInput,
      storeId: id,
      storeName: storeNameById.get(id) ?? id,
      salesAmount,
      cogsAmount,
      grossProfit,
      grossMarginRate: summary?.grossMarginRate ?? null,
      laborAmount,
      fixedCosts: bucket?.fixedCosts ?? emptyFixedCosts(),
      otherExpenseAmount: bucket?.otherExpenseAmount ?? 0,
      hqAdjustmentAmount: bucket?.hqAdjustmentAmount ?? 0,
      netAmount,
      adjustmentReason: joinOrNull(bucket?.adjustmentReasons),
      memo: joinOrNull(bucket?.memos),
    };
  });

  // 전사(본사 지출 storeId=null) 비용은 별도 "(전사)" 행으로 노출한다.
  const companyWide = costByStore.get(COMPANY_WIDE);
  if (companyWide) {
    const expenseTotal = sumBucketCosts(companyWide);
    rows.push({
      monthInput,
      storeId: COMPANY_WIDE,
      storeName: "(전사 공통)",
      salesAmount: 0,
      cogsAmount: 0,
      grossProfit: null,
      grossMarginRate: null,
      laborAmount: 0,
      fixedCosts: companyWide.fixedCosts,
      otherExpenseAmount: companyWide.otherExpenseAmount,
      hqAdjustmentAmount: companyWide.hqAdjustmentAmount,
      netAmount: -expenseTotal,
      adjustmentReason: joinOrNull(companyWide.adjustmentReasons),
      memo: joinOrNull(companyWide.memos),
    });
  }

  return { monthInput, rows };
}
