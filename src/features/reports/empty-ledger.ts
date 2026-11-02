import type { Prisma } from "../../../generated/prisma";

// 휴무일에 화면만 열려 생긴(그리고 본사가 마감했을 수도 있는) 빈 장부.
// 월 단위 리포트는 이를 미입력과 같게 보고 집계에서 뺀다. 실제 영업일은 재고
// 행이 반드시 있으므로 걸리지 않는다. 휴무(HOLIDAY) 장부는 휴무로 계속 보인다.
export const excludeEmptyLedgers = {
  NOT: {
    status: { not: "HOLIDAY" },
    totalSalesAmount: 0,
    carryoverSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: null,
    ledgerInventoryItems: { none: {} },
    ledgerPurchaseItems: { none: {} },
    ledgerExpenses: { none: {} },
    ledgerLossItems: { none: {} },
    ledgerLaborItems: { none: {} },
  },
} satisfies Prisma.DailyLedgerWhereInput;
