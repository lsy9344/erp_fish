import { db } from "~/server/db";
import { getStoreProfitSummariesForRange } from "~/features/reports/queries";
import { getActiveLongStockThresholdDaysByCategory } from "~/features/dashboard/long-stock-threshold-queries";

export type MorningSummaryPayload = {
  reportDate: string;
  dailyDeficitStores: string[];
  missingEntryStores: string[];
  longTermStagnantProducts: Array<{
    storeName: string;
    productName: string;
    staleDays: number;
  }>;
  belowTargetMarginStores: string[];
};

export function formatMorningSummaryMessage(
  payload: MorningSummaryPayload,
): string {
  const lines: string[] = [`[ERP 아침 요약] ${payload.reportDate}`];

  lines.push("");
  lines.push(`📉 당일 적자 발생 지점 (${payload.dailyDeficitStores.length}건)`);

  if (payload.dailyDeficitStores.length === 0) {
    lines.push("없음");
  } else {
    for (const store of payload.dailyDeficitStores) {
      lines.push(`• ${store}`);
    }
  }

  lines.push("");
  lines.push(
    `📋 전날 결산 미입력 지점 (${payload.missingEntryStores.length}건)`,
  );

  if (payload.missingEntryStores.length === 0) {
    lines.push("없음");
  } else {
    for (const store of payload.missingEntryStores) {
      lines.push(`• ${store}`);
    }
  }

  lines.push("");
  lines.push(
    // WO-13(2026-06-28): 기준일이 품목군별로 다르므로 "한 달" 고정 문구를 쓰지 않는다.
    `📦 장기 체화 재고 (품목군 기준일 초과, ${payload.longTermStagnantProducts.length}건)`,
  );

  if (payload.longTermStagnantProducts.length === 0) {
    lines.push("없음");
  } else {
    for (const item of payload.longTermStagnantProducts.slice(0, 5)) {
      lines.push(
        `• ${item.storeName} / ${item.productName} (${item.staleDays}일)`,
      );
    }

    if (payload.longTermStagnantProducts.length > 5) {
      lines.push(`  외 ${payload.longTermStagnantProducts.length - 5}건`);
    }
  }

  lines.push("");
  lines.push(
    `📊 목표 마진율 미달 지점 (${payload.belowTargetMarginStores.length}건)`,
  );

  if (payload.belowTargetMarginStores.length === 0) {
    lines.push("없음");
  } else {
    for (const store of payload.belowTargetMarginStores) {
      lines.push(`• ${store}`);
    }
  }

  return lines.join("\n");
}

export async function buildMorningSummaryPayload(
  reportDate: string,
): Promise<MorningSummaryPayload> {
  const [year, month, day] = reportDate.split("-").map(Number);

  if (!year || !month || !day) {
    return {
      reportDate,
      dailyDeficitStores: [],
      missingEntryStores: [],
      longTermStagnantProducts: [],
      belowTargetMarginStores: [],
    };
  }

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const thirtyDaysAgo = new Date(Date.UTC(year, month - 1, day - 30));

  const [activeStores, ledgersYesterday] = await Promise.all([
    db.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    db.dailyLedger.findMany({
      where: { closingDate: targetDate },
      select: {
        storeId: true,
        status: true,
      },
    }),
  ]);

  const activeStoreIds = new Set(activeStores.map((s) => s.id));
  const submittedStoreIds = new Set(
    ledgersYesterday
      .filter(
        (l) => l.status === "IN_REVIEW" || l.status === "HEADQUARTERS_CLOSED",
      )
      .map((l) => l.storeId),
  );

  const missingEntryStores = activeStores
    .filter((store) => !submittedStoreIds.has(store.id))
    .map((store) => store.name);

  const storeNameById = new Map(activeStores.map((s) => [s.id, s.name]));

  // change.md(2026-06-22): 적자 발생 지점은 reportDate 하루 기준으로 본다.
  // 본사 리포트와 같은 매출원가(COGS) 기반 영업이익 계산을 재사용한다.
  const dailyProfitSummaries = await getStoreProfitSummariesForRange({
    storeIds: [...activeStoreIds],
    startDate: targetDate,
    endDate: targetDate,
  });

  // WO-G(2026-06-22): 마진 미달 판정은 본사 리포트와 같은 기준을 쓴다.
  // 단순 (총매출 - 지출)이 아니라 매출원가(COGS) 기반 grossProfit/grossMarginRate,
  // 그리고 본사 정정(correction) 반영 상태를 함께 사용한다.
  // - 마진 미달: 최근 30일 누적 grossMarginRate가 활성 목표 마진율 미만인 지점.
  const marginSummaries = await getStoreProfitSummariesForRange({
    storeIds: [...activeStoreIds],
    startDate: thirtyDaysAgo,
    endDate: targetDate,
  });

  // WO-10(2026-06-22): 목표 마진율은 활성 이상 신호 기준값(marginRateBps)을 사용한다.
  // 기준값이 없거나 비활성이면 마진율 미달 판정을 생략한다.
  const thresholdSetting = await db.anomalyThresholdSetting.findUnique({
    where: { scope: "GLOBAL" },
    select: { marginRateBps: true, isActive: true },
  });
  const targetMarginRate = thresholdSetting?.isActive
    ? thresholdSetting.marginRateBps / 10000
    : null;

  const dailyDeficitStores: string[] = [];
  const belowTargetMarginStores: string[] = [];

  for (const [storeId, summary] of dailyProfitSummaries) {
    const storeName = storeNameById.get(storeId) ?? storeId;

    if (summary.operatingProfit !== null && summary.operatingProfit < 0) {
      dailyDeficitStores.push(storeName);
    }
  }

  for (const [storeId, summary] of marginSummaries) {
    const storeName = storeNameById.get(storeId) ?? storeId;

    if (
      targetMarginRate !== null &&
      summary.grossMarginRate !== null &&
      summary.grossMarginRate < targetMarginRate
    ) {
      belowTargetMarginStores.push(storeName);
    }
  }

  // WO-13(2026-06-28): 장기재고 기준일은 하드코딩 30일 대신 품목군별 설정을 쓴다.
  const thresholdDaysByCategory =
    await getActiveLongStockThresholdDaysByCategory();
  const longTermStagnantProducts = await buildLongTermStagnantProducts({
    activeStoreIds: [...activeStoreIds],
    storeNameById,
    targetDate,
    thresholdDaysByCategory,
  });

  return {
    reportDate,
    dailyDeficitStores,
    missingEntryStores,
    longTermStagnantProducts,
    belowTargetMarginStores,
  };
}

// WO-G(2026-06-22) / WO-13(2026-06-28): 장기 체화 재고.
// 각 활성 매장의 reportDate 이전 최신 장부에서 잔량이 남은 FIFO lot 중,
// lot의 실제 영업 기준일(sourceBusinessDate)이 "품목군별 기준일" 이상 지난 품목을 후보로 본다.
// 기준일이 설정되지 않은 품목군(thresholdDaysByCategory에 없음)은 "기준 확인 필요"로 보고
// 알림 대상에서 제외한다(생물 3~4일 같은 현장 기준을 설정으로 관리).
async function buildLongTermStagnantProducts({
  activeStoreIds,
  storeNameById,
  targetDate,
  thresholdDaysByCategory,
}: {
  activeStoreIds: string[];
  storeNameById: Map<string, string>;
  targetDate: Date;
  thresholdDaysByCategory: Map<string, number>;
}): Promise<MorningSummaryPayload["longTermStagnantProducts"]> {
  if (activeStoreIds.length === 0 || thresholdDaysByCategory.size === 0) {
    return [];
  }

  // 활성 기준 중 가장 짧은 일수로 1차 cutoff를 잡아 조회 행을 줄이고,
  // 품목군별 정확한 기준은 아래 루프에서 staleDays로 다시 비교한다.
  const minThresholdDays = Math.min(...thresholdDaysByCategory.values());
  const staleBeforeDate = new Date(
    targetDate.getTime() - minThresholdDays * 24 * 60 * 60 * 1000,
  );

  // 매장별 reportDate 이전 최신 장부 1건을 찾는다.
  const latestLedgers = await db.dailyLedger.findMany({
    where: {
      storeId: { in: activeStoreIds },
      closingDate: { lte: targetDate },
    },
    orderBy: [{ storeId: "asc" }, { closingDate: "desc" }],
    select: { id: true, storeId: true, closingDate: true },
  });

  const latestLedgerByStore = new Map<
    string,
    { id: string; storeId: string }
  >();

  for (const ledger of latestLedgers) {
    if (!latestLedgerByStore.has(ledger.storeId)) {
      latestLedgerByStore.set(ledger.storeId, {
        id: ledger.id,
        storeId: ledger.storeId,
      });
    }
  }

  const latestLedgerIds = [...latestLedgerByStore.values()].map(
    (ledger) => ledger.id,
  );

  if (latestLedgerIds.length === 0) {
    return [];
  }

  const stagnantLots = await db.ledgerInventoryFifoLot.findMany({
    where: {
      dailyLedgerId: { in: latestLedgerIds },
      remainingQuantity: { gt: 0 },
      sourceBusinessDate: { lte: staleBeforeDate },
    },
    select: {
      dailyLedgerId: true,
      sourceBusinessDate: true,
      sourcePurchaseItem: { select: { productName: true } },
      product: { select: { name: true, category: true } },
    },
  });

  const ledgerStoreById = new Map(
    [...latestLedgerByStore.values()].map((ledger) => [
      ledger.id,
      ledger.storeId,
    ]),
  );
  const stagnant: MorningSummaryPayload["longTermStagnantProducts"] = [];

  for (const lot of stagnantLots) {
    if (!lot.sourceBusinessDate) {
      continue;
    }

    // WO-13(2026-06-28): 품목군 기준일이 없으면(=기준 확인 필요) 알림 대상에서 제외한다.
    const category = lot.product?.category;
    const thresholdDays = category
      ? thresholdDaysByCategory.get(category)
      : undefined;

    if (thresholdDays === undefined) {
      continue;
    }

    const staleDays = Math.floor(
      (targetDate.getTime() - lot.sourceBusinessDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (staleDays < thresholdDays) {
      continue;
    }

    const storeId = ledgerStoreById.get(lot.dailyLedgerId);
    const storeName = storeId ? (storeNameById.get(storeId) ?? storeId) : "";
    const productName =
      lot.product?.name ?? lot.sourcePurchaseItem?.productName ?? "품목";

    stagnant.push({ storeName, productName, staleDays });
  }

  return stagnant.sort((a, b) => b.staleDays - a.staleDays);
}
