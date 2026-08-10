// 챗봇 도구 계층. 설계: docs/rev/2026-08-10_챗봇_설계.md
//
// 이 파일의 두 가지 금기(작업지시서 §2.1, §2.2):
//  1. `db`를 직접 import하지 않는다. 모든 조회는 기존 리포트 함수에 위임한다.
//     그 함수들이 requireReportAccess / requireLaborViewAccess / 지점 scope를
//     이미 수행하므로, 위임만으로 인가가 성립한다.
//  2. 반환값을 재계산·재합산하지 않는다. 정렬 · 상위 N 절단 · 필드 선택만 한다.
//     `매출`은 마감+이월에 정정값이 덮인 값이고(calculations/ledger.ts:785),
//     여기서 다시 더하면 대시보드와 어긋난다.

// import 규약(reports/queries.ts · overview.ts와 동일): 정적 import는 순수
// 모듈만 상대경로 + `.ts`로 가져오고, `db`·`authz`를 끌어오는 모듈은
// 함수 안에서 동적 import한다. 그래야 `node --experimental-strip-types` 단위
// 테스트가 DB 연결 없이 이 모듈을 import할 수 있다.
import { z } from "zod";

import { getKstBusinessDate } from "../ledger/date.ts";
import { PERIOD_ANALYSIS_METRICS } from "../reports/period-analysis.ts";
import type { CalculationMetric } from "../../server/calculations/ledger.ts";

// 인건비 리포트와 동일한 상한(headquarters-labor-queries.ts:17).
const MAX_RANGE_DAYS = 366;
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 5;

export type ChatToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * 필드 allowlist. 스프레드 후 삭제(`{...row, bankAccount: undefined}`)를 쓰지
 * 않는 이유 — 원본 타입에 필드가 추가되면 조용히 새어 나간다. 통과시킬 이름을
 * 반드시 나열한다.
 */
function pick<T extends object, K extends keyof T>(
  row: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    result[key] = row[key];
  }

  return result;
}

/**
 * 계산 불가 지표를 0으로 보내면 LLM이 "0원"이라고 답한다. 숫자이거나, 사유를
 * 담은 한국어 문자열이거나 둘 중 하나로만 내보낸다.
 */
function metric(value: CalculationMetric | undefined): number | string {
  if (!value) {
    return "산출 불가";
  }

  if (value.value === null) {
    return `산출 불가: ${value.reason ?? "근거 데이터 부족"}`;
  }

  return value.value;
}

function normalizeStoreName(value: string) {
  return value.replace(/\s+/g, "");
}

type ResolvedStore =
  | { ok: true; storeId: string | null; storeName: string | null }
  | { ok: false; error: string };

/**
 * 지점명 → storeId. 모호하면 추측하지 않고 후보를 돌려준다.
 * 엉뚱한 지점의 숫자를 자신 있게 답하는 것이 최악의 실패 모드다.
 */
async function resolveStore(storeName?: string): Promise<ResolvedStore> {
  if (!storeName || storeName.trim().length === 0) {
    return { ok: true, storeId: null, storeName: null };
  }

  const { getHeadquartersStoreScope } = await import("../../server/authz.ts");
  const scope = await getHeadquartersStoreScope();
  const needle = normalizeStoreName(storeName);
  const matches = scope.stores.filter((store) =>
    normalizeStoreName(store.name).includes(needle),
  );

  if (matches.length === 1) {
    const [store] = matches;

    return { ok: true, storeId: store!.id, storeName: store!.name };
  }

  const available = scope.stores.map((store) => store.name).join(", ");

  if (matches.length === 0) {
    return {
      ok: false,
      error: `'${storeName}'과(와) 일치하는 지점이 없습니다. 조회 가능한 지점: ${available}`,
    };
  }

  return {
    ok: false,
    error: `'${storeName}'이(가) 여러 지점과 일치합니다: ${matches
      .map((store) => store.name)
      .join(", ")}. 어느 지점인지 다시 물어보세요.`,
  };
}

type ResolvedRange =
  | { ok: true; startDate: string; endDate: string }
  | { ok: false; error: string };

function resolveRange(startDate: string, endDate: string): ResolvedRange {
  let start: Date;
  let end: Date;

  try {
    start = getKstBusinessDate(startDate);
    end = getKstBusinessDate(endDate);
  } catch {
    return {
      ok: false,
      error: "날짜는 YYYY-MM-DD 형식이어야 합니다.",
    };
  }

  if (start > end) {
    return { ok: false, error: "시작일이 종료일보다 늦습니다." };
  }

  // 조용히 자르면 사용자가 물은 기간과 다른 답이 나간다. 오류로 되돌린다.
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;

  if (days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다. 요청 기간은 ${Math.round(days)}일입니다.`,
    };
  }

  return { ok: true, startDate, endDate };
}

/** limit은 LLM이 아니라 서버가 강제한다. */
function clampLimit(limit?: number) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthField = z.string().regex(/^\d{4}-\d{2}$/);

// ---------------------------------------------------------------------------
// 1. get_period_metrics — 수치의 기본 축
// ---------------------------------------------------------------------------

const periodMetricsArgs = z.object({
  startDate: dateField,
  endDate: dateField,
  storeName: z.string().optional(),
  compareToPrevious: z.boolean().optional(),
});

function toMetricRow(row: {
  storeName: string;
  salesAmount: CalculationMetric;
  grossProfit: CalculationMetric;
  grossMarginRate: CalculationMetric;
  averageWorkerCount: CalculationMetric;
  productivity: CalculationMetric;
  averageInventory: CalculationMetric;
  averageSales: CalculationMetric;
  inventoryToSalesRatio: CalculationMetric;
}) {
  return {
    지점: row.storeName,
    매출: metric(row.salesAmount),
    매출이익: metric(row.grossProfit),
    이익률: metric(row.grossMarginRate),
    평균근무인원: metric(row.averageWorkerCount),
    인당생산성: metric(row.productivity),
    평균재고: metric(row.averageInventory),
    평균매출: metric(row.averageSales),
    매출대비재고비율: metric(row.inventoryToSalesRatio),
  };
}

async function runPeriodMetrics(
  args: z.infer<typeof periodMetricsArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  const range = resolveRange(args.startDate, args.endDate);

  if (!range.ok) {
    return range;
  }

  const { getHqPeriodContrastReport, getHqStoreComparisonReport } =
    await import("../reports/queries.ts");

  // 비교를 요청하지 않으면 단일 기간만 조회한다. 대조 리포트는 항상 직전 기간을
  // 한 번 더 조회하므로, 단순 매출 질문에서 왕복이 두 배가 된다.
  if (!args.compareToPrevious) {
    const report = await getHqStoreComparisonReport({
      startDate: range.startDate,
      endDate: range.endDate,
      storeId: store.storeId ?? undefined,
    });

    return {
      ok: true,
      data: {
        기간: `${report.range.startDateInput} ~ ${report.range.endDateInput}`,
        지점별: report.rows.map(toMetricRow),
        안내: report.errorMessages,
      },
    };
  }

  const report = await getHqPeriodContrastReport({
    startDate: range.startDate,
    endDate: range.endDate,
    storeId: store.storeId ?? undefined,
  });
  const metricLabelByKey = new Map(
    PERIOD_ANALYSIS_METRICS.map((item) => [item.key, item.label]),
  );

  return {
    ok: true,
    data: {
      기간: `${report.current.range.startDateInput} ~ ${report.current.range.endDateInput}`,
      대조기간: `${report.base.range.startDateInput} ~ ${report.base.range.endDateInput}`,
      지점별: report.current.rows.map(toMetricRow),
      증감: report.contrastRows.map((row) => ({
        지점: row.storeName,
        지표: Object.entries(row.deltas).map(([key, delta]) => ({
          이름: metricLabelByKey.get(key as never) ?? key,
          변화:
            delta.value ??
            `산출 불가: ${delta.unavailableReason ?? "근거 데이터 부족"}`,
          // 이익률·재고비율은 %p 차분, 나머지는 비율(period-analysis.ts:36-38).
          단위: delta.kind === "point" ? "%p" : "비율",
        })),
      })),
      안내: report.errorMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. get_month_overview — 원인 분석의 축
// ---------------------------------------------------------------------------

const monthOverviewArgs = z.object({
  month: monthField,
  storeName: z.string().optional(),
});

async function runMonthOverview(
  args: z.infer<typeof monthOverviewArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  const { getHqReportOverview } = await import("../reports/overview.ts");
  const report = await getHqReportOverview({
    month: args.month,
    storeId: store.storeId ?? undefined,
  });

  return {
    ok: true,
    data: {
      월: report.monthRange.monthInput,
      지점: report.selectedStoreName ?? "전체",
      요약: pick(report.summary, [
        "closingSalesAmount",
        "carryoverSalesAmount",
        "operatingSalesAmount",
        "grossProfit",
        "netAmount",
        "lossAmount",
      ]),
      // 어느 단계에서 얼마가 빠졌는지가 곧 감소 원인의 근거다.
      손익단계: report.profitAndLoss.available
        ? report.profitAndLoss.steps.map((step) =>
            pick(step, ["label", "amount", "kind"]),
          )
        : `산출 불가: ${report.profitAndLoss.reason ?? "근거 데이터 부족"}`,
      손실분해: {
        항목: report.lossBreakdown.items.map((item) =>
          pick(item, ["name", "amount", "ratio"]),
        ),
        합계: report.lossBreakdown.totalAmount,
        산출불가건수: report.lossBreakdown.uncomputableCount,
        // 이 항목은 차트용 절단본이다(overview.ts:462) — 4위 이하 유형은 이름이
        // 사라지고 "기타"로 뭉친다. 유형·품목 질문을 여기서 답하면 틀린다.
        주의:
          "항목은 상위 3개 유형 + 기타로 뭉친 값입니다. 특정 손실 유형(떨이·폐기 등)이나 " +
          "품목별 손실을 물었다면 이 값으로 답하지 말고 get_loss_breakdown을 호출하세요.",
      },
      일별추이: report.salesTrend.map((day) => ({
        일자: day.dateInput,
        당월: day.currentAmount,
        전월: day.previousAmount,
      })),
      지점순위: Object.fromEntries(
        Object.entries(report.rankings).map(([key, ranking]) => [
          key,
          {
            상위: ranking.rows
              .slice(0, DEFAULT_LIMIT)
              .map((row) => ({ 지점: row.storeName, 값: row.value })),
            제외: ranking.excluded.map((row) => ({
              지점: row.storeName,
              사유: row.reason,
            })),
          },
        ]),
      ),
      마감상태: report.closingStatus.map((status) =>
        pick(status, ["label", "count"]),
      ),
      경보: report.actions.map((action) =>
        pick(action, ["storeName", "label", "detail", "severity"]),
      ),
      데이터품질: report.dataQuality,
      안내: report.errorMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. get_product_sales — 품목 축
// ---------------------------------------------------------------------------

type RankableProductItem = {
  productId: string | null;
  productName: string;
  productSpec: string;
  productCategory: string;
  storeName: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
  lossQuantity: number;
  statusLabel: string;
};

/**
 * getHqProductSalesReportForRange는 store × product 단위로 돌려준다(queries.ts:1667).
 * 그대로 정렬해 상위 N을 자르면 **한 지점의 수량이 전사 1위로 둔갑한다.**
 * 품목 단위로 묶은 뒤 자른다. 묶는 규칙은 buildProductProfitability
 * (queries.ts:1239-1257)와 같다 — productId가 없으면 품목명+규격으로 묶는다.
 * 지점명도 반드시 실어 보낸다. 숨기면 LLM이 출처를 오인한다.
 */
function rankProductSales(
  rows: RankableProductItem[],
  sortKey: "soldQuantity" | "estimatedSalesAmount",
  limit: number,
) {
  const byProduct = new Map<
    string,
    {
      productName: string;
      productSpec: string;
      productCategory: string;
      soldQuantity: number;
      estimatedSalesAmount: number;
      lossQuantity: number;
      storeNames: string[];
      statusLabels: string[];
    }
  >();

  for (const row of rows) {
    const key = row.productId ?? `name:${row.productName}|${row.productSpec}`;
    const bucket = byProduct.get(key) ?? {
      productName: row.productName,
      productSpec: row.productSpec,
      productCategory: row.productCategory,
      soldQuantity: 0,
      estimatedSalesAmount: 0,
      lossQuantity: 0,
      storeNames: [],
      statusLabels: [],
    };

    bucket.soldQuantity += row.soldQuantity;
    bucket.estimatedSalesAmount += row.estimatedSalesAmount;
    bucket.lossQuantity += row.lossQuantity;

    if (!bucket.storeNames.includes(row.storeName)) {
      bucket.storeNames.push(row.storeName);
    }

    if (!bucket.statusLabels.includes(row.statusLabel)) {
      bucket.statusLabels.push(row.statusLabel);
    }

    byProduct.set(key, bucket);
  }

  const items = [...byProduct.values()]
    .map((bucket) => ({
      ...bucket,
      // 0.1 단위 수량을 더하면 부동소수 꼬리(26.799999999999994)가 그대로 노출된다.
      soldQuantity: Math.round(bucket.soldQuantity * 100) / 100,
    }))
    .sort((a, b) => b[sortKey] - a[sortKey])
    .slice(0, limit);

  return { items, productCount: byProduct.size };
}

const productSalesArgs = z.object({
  startDate: dateField,
  endDate: dateField,
  storeName: z.string().optional(),
  metric: z.enum(["quantity", "amount"]).optional(),
  limit: z.number().optional(),
});

async function runProductSales(
  args: z.infer<typeof productSalesArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  const range = resolveRange(args.startDate, args.endDate);

  if (!range.ok) {
    return range;
  }

  const { getHqProductSalesReportForRange } =
    await import("../reports/queries.ts");
  const report = await getHqProductSalesReportForRange({
    startDate: range.startDate,
    endDate: range.endDate,
    storeId: store.storeId ?? undefined,
  });
  const limit = clampLimit(args.limit);
  const { items, productCount } = rankProductSales(
    report.items,
    args.metric === "amount" ? "estimatedSalesAmount" : "soldQuantity",
    limit,
  );

  return {
    ok: true,
    data: {
      기간: `${report.startDateInput} ~ ${report.endDateInput}`,
      지점: report.selectedStoreName ?? "전체",
      집계단위: report.selectedStoreName ? "해당 지점" : "전 지점 합산",
      정렬기준: args.metric === "amount" ? "추정 매출액" : "판매 수량",
      전체품목수: productCount,
      상위품목: items.map((item) => ({
        품목: item.productName,
        규격: item.productSpec,
        분류: item.productCategory,
        판매수량: item.soldQuantity,
        추정매출액: item.estimatedSalesAmount,
        손실수량: item.lossQuantity,
        판매지점: item.storeNames.join(", "),
        상태: item.statusLabels.join(", "),
      })),
      // 금액은 판매계획가 기반 추정치다. 수량과 달리 확정값이 아니다.
      주의: "추정매출액은 판매계획가 기준 추정치입니다. 상태가 '추정'/'계산 불가'인 항목은 답변에 그 사실을 밝히세요.",
    },
  };
}

// ---------------------------------------------------------------------------
// 4. get_monthly_pnl — 비용 세부 축
// ---------------------------------------------------------------------------

const monthlyPnlArgs = z.object({
  month: monthField,
  storeName: z.string().optional(),
});

async function runMonthlyPnl(
  args: z.infer<typeof monthlyPnlArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  const { buildMonthlyProfitAndLoss } =
    await import("../reports/monthly-profit-loss.ts");
  const report = await buildMonthlyProfitAndLoss({
    month: args.month,
    storeId: store.storeId,
  });

  return {
    ok: true,
    data: {
      월: report.monthInput,
      지점별: report.rows.map((row) => ({
        지점: row.storeName,
        매출: row.salesAmount,
        매입원가: row.cogsAmount,
        매출이익: row.grossProfit,
        이익률: row.grossMarginRate,
        인건비: row.laborAmount,
        고정비: row.fixedCosts,
        기타비용: row.otherExpenseAmount,
        본사조정: row.hqAdjustmentAmount,
        남은금액: row.netAmount,
        조정사유: row.adjustmentReason,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. get_labor_report — 인건비·급여 축 (LABOR_VIEW 전용)
// ---------------------------------------------------------------------------

const laborReportArgs = z.object({
  month: monthField.optional(),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
  storeName: z.string().optional(),
  workerName: z.string().optional(),
});

/**
 * 통과시킬 필드 나열. `HeadquartersLaborWorkerSettlement`에는 `bankAccount`가,
 * `Employee`에는 주소·연락처가 있다. 외부 LLM API로 나가면 안 된다.
 */
const LABOR_SETTLEMENT_FIELDS = [
  "workerName",
  "storeNames",
  "workdayCount",
  "laborAmount",
] as const;

const LABOR_STORE_SUMMARY_FIELDS = [
  "storeName",
  "workdayCount",
  "workerCount",
  "laborAmount",
] as const;

async function runLaborReport(
  args: z.infer<typeof laborReportArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  if (args.startDate && args.endDate) {
    const range = resolveRange(args.startDate, args.endDate);

    if (!range.ok) {
      return range;
    }
  }

  // requireLaborViewAccess()가 이 함수 안에서 실행된다(:524).
  // 권한이 없으면 여기서 차단되고, 챗봇은 별도 게이트를 두지 않는다.
  const { getHeadquartersLaborReport } =
    await import("../labor/headquarters-labor-queries.ts");
  const report = await getHeadquartersLaborReport({
    month: args.month,
    from: args.startDate,
    to: args.endDate,
    storeId: store.storeId ?? undefined,
    workerName: args.workerName,
  });

  return {
    ok: true,
    data: {
      기간: report.rangeLabel,
      지점: report.selectedStoreId ? (store.storeName ?? "선택 지점") : "전체",
      인건비합계: report.totalLaborAmount,
      급여행수: report.laborRecordCount,
      지점요약: report.storeSummaries.map((row) =>
        pick(row, LABOR_STORE_SUMMARY_FIELDS),
      ),
      근무자별: report.workerSettlements.map((row) =>
        pick(row, LABOR_SETTLEMENT_FIELDS),
      ),
      안내: report.errorMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// 6. get_inventory_position — 재고 축
// ---------------------------------------------------------------------------

const inventoryPositionArgs = z.object({
  date: dateField,
  storeName: z.string().optional(),
  limit: z.number().optional(),
});

async function runInventoryPosition(
  args: z.infer<typeof inventoryPositionArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  try {
    getKstBusinessDate(args.date);
  } catch {
    return { ok: false, error: "날짜는 YYYY-MM-DD 형식이어야 합니다." };
  }

  const { getHqInventoryPositionReport } =
    await import("../reports/inventory-position-queries.ts");
  const report = await getHqInventoryPositionReport({
    date: args.date,
    storeId: store.storeId ?? undefined,
  });
  const limit = clampLimit(args.limit);
  const rows = [...report.rows]
    .sort((a, b) => (b.inventoryAmount ?? 0) - (a.inventoryAmount ?? 0))
    .slice(0, limit);

  return {
    ok: true,
    data: {
      기준일: report.range.dateInput,
      지점: report.filters.storeName ?? "전체",
      요약: report.summary,
      상위품목: rows.map((row) => ({
        지점: row.storeName,
        품목: row.productName,
        규격: row.productSpec,
        수량: row.currentQuantity,
        재고금액: row.inventoryAmount,
        상태: row.statusLabel,
      })),
      안내: report.errorMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// 7. get_loss_breakdown — 손실 유형(떨이·폐기 등) 축
// ---------------------------------------------------------------------------

type LossRow = {
  storeName: string;
  lossTypeName: string;
  productId: string;
  productName: string;
  productSpec: string;
  quantity: number;
  amount: number;
  usedPlannedPrice: boolean;
};

/** 0.1 단위 수량을 더하면 부동소수 꼬리가 노출된다(rankProductSales와 같은 처리). */
function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * 손실 항목을 유형별·품목별로 묶는다.
 *
 * 유형 목록은 절대 자르지 않는다. 개요 화면이 상위 3개 + "기타"로 뭉치는 탓에
 * "8월 떨이·폐기 합계"를 산출 불가로 답한 적이 있다. 유형 이름 자체가 LLM에게
 * 보이지 않으면 답할 방법이 없다.
 *
 * 금액은 판매계획가가 있는 항목만 산정된다(losses/actions.ts:385-406 — 없으면 0).
 * 그래서 수량과 금액을 따로 내보내고 미산정 건수를 함께 실어 보낸다.
 */
function groupLossItems(
  rows: LossRow[],
  lossTypeNames: string[] | undefined,
  limit: number,
) {
  const needles = (lossTypeNames ?? [])
    .map((name) => normalizeStoreName(name))
    .filter((name) => name.length > 0);
  const availableTypeNames = [
    ...new Set(rows.map((row) => row.lossTypeName)),
  ].sort((left, right) => left.localeCompare(right, "ko-KR"));
  const matched = new Set<string>();
  const filtered =
    needles.length === 0
      ? rows
      : rows.filter((row) => {
          const name = normalizeStoreName(row.lossTypeName);
          const hit = needles.filter((needle) => name.includes(needle));

          for (const needle of hit) matched.add(needle);

          return hit.length > 0;
        });

  const byType = new Map<
    string,
    {
      유형: string;
      수량: number;
      금액: number;
      건수: number;
      금액미산정건수: number;
    }
  >();
  // 규격이 다른 동명 품목("전복 13미"·"전복 20미")을 한 줄로 합치지 않도록
  // productId로 묶는다. rankProductSales와 같은 규칙이다.
  const byProduct = new Map<
    string,
    {
      품목: string;
      규격: string;
      유형: string[];
      지점: string[];
      수량: number;
      금액: number;
      금액미산정건수: number;
    }
  >();

  for (const row of filtered) {
    const type = byType.get(row.lossTypeName) ?? {
      유형: row.lossTypeName,
      수량: 0,
      금액: 0,
      건수: 0,
      금액미산정건수: 0,
    };

    type.수량 += row.quantity;
    type.금액 += row.amount;
    type.건수 += 1;
    if (!row.usedPlannedPrice) type.금액미산정건수 += 1;
    byType.set(row.lossTypeName, type);

    const product = byProduct.get(row.productId) ?? {
      품목: row.productName,
      규격: row.productSpec,
      유형: [],
      지점: [],
      수량: 0,
      금액: 0,
      금액미산정건수: 0,
    };

    product.수량 += row.quantity;
    product.금액 += row.amount;
    if (!row.usedPlannedPrice) product.금액미산정건수 += 1;
    if (!product.유형.includes(row.lossTypeName)) {
      product.유형.push(row.lossTypeName);
    }
    if (!product.지점.includes(row.storeName)) {
      product.지점.push(row.storeName);
    }
    byProduct.set(row.productId, product);
  }

  const types = [...byType.values()]
    .map((type) => ({ ...type, 수량: roundQuantity(type.수량) }))
    .sort((left, right) => right.금액 - left.금액 || right.수량 - left.수량);
  const products = [...byProduct.values()]
    .map((product) => ({
      ...product,
      수량: roundQuantity(product.수량),
      유형: product.유형.join(", "),
      지점: product.지점.join(", "),
    }))
    .sort((left, right) => right.금액 - left.금액 || right.수량 - left.수량);

  return {
    types,
    products: products.slice(0, limit),
    productCount: products.length,
    availableTypeNames,
    unmatchedTypeNames: needles.filter((needle) => !matched.has(needle)),
    total: {
      수량: roundQuantity(filtered.reduce((sum, row) => sum + row.quantity, 0)),
      금액: filtered.reduce((sum, row) => sum + row.amount, 0),
      건수: filtered.length,
      금액미산정건수: filtered.filter((row) => !row.usedPlannedPrice).length,
    },
  };
}

const lossBreakdownArgs = z.object({
  startDate: dateField,
  endDate: dateField,
  storeName: z.string().optional(),
  lossTypeNames: z.array(z.string()).optional(),
  limit: z.number().optional(),
});

async function runLossBreakdown(
  args: z.infer<typeof lossBreakdownArgs>,
): Promise<ChatToolResult> {
  const store = await resolveStore(args.storeName);

  if (!store.ok) {
    return store;
  }

  const range = resolveRange(args.startDate, args.endDate);

  if (!range.ok) {
    return range;
  }

  const { getHqLossItemsForRange } = await import("../reports/queries.ts");
  const report = await getHqLossItemsForRange({
    startDate: range.startDate,
    endDate: range.endDate,
    storeId: store.storeId ?? undefined,
  });
  const grouped = groupLossItems(
    report.items,
    args.lossTypeNames,
    clampLimit(args.limit),
  );

  return {
    ok: true,
    data: {
      기간: `${report.startDateInput} ~ ${report.endDateInput}`,
      지점: report.selectedStoreName ?? "전체",
      집계단위: report.selectedStoreName ? "해당 지점" : "전 지점 합산",
      유형필터: args.lossTypeNames?.join(", ") ?? "없음(전체 손실)",
      // 유형 이름을 못 찾았는데 0원이라고 답하면 안 된다. 오타·별칭일 수 있다.
      일치하지않은유형: grouped.unmatchedTypeNames,
      기간내존재하는유형: grouped.availableTypeNames,
      유형별: grouped.types,
      품목별상위: grouped.products,
      전체품목수: grouped.productCount,
      합계: grouped.total,
      주의:
        "금액은 판매계획가가 등록된 손실만 산정됩니다. 금액미산정건수가 0보다 " +
        "크면 그 건은 수량만 집계되고 금액에는 0으로 들어갑니다. 이 사실을 답변에 밝히세요.",
      안내: report.errorMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// 카탈로그
// ---------------------------------------------------------------------------

export type ChatTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: unknown) => Promise<ChatToolResult>;
};

function defineTool<Schema extends z.ZodTypeAny>(input: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: Schema;
  run: (args: z.infer<Schema>) => Promise<ChatToolResult>;
}): ChatTool {
  return {
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    // LLM이 보낸 인자는 신뢰하지 않는다. 서버에서 다시 검증한다.
    run: async (args: unknown) => {
      const parsed = input.schema.safeParse(args);

      if (!parsed.success) {
        return {
          ok: false,
          error: `인자가 올바르지 않습니다: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join(", ")}`,
        };
      }

      return input.run(parsed.data as z.infer<Schema>);
    },
  };
}

const storeNameParam = {
  type: "string",
  description: "지점명. 생략하면 조회 권한이 있는 모든 지점.",
};

export const CHAT_TOOLS: ChatTool[] = [
  defineTool({
    name: "get_period_metrics",
    description:
      "기간과 지점의 매출·매출이익·이익률·평균근무인원·인당생산성·평균재고·평균매출·재고비율을 조회한다. 하루도 기간으로 넣을 수 있다. 매출 관련 질문의 기본 도구.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "시작일 YYYY-MM-DD" },
        endDate: { type: "string", description: "종료일 YYYY-MM-DD" },
        storeName: storeNameParam,
        compareToPrevious: {
          type: "boolean",
          description: "직전 동일 길이 기간과 비교하려면 true.",
        },
      },
      required: ["startDate", "endDate"],
    },
    schema: periodMetricsArgs,
    run: runPeriodMetrics,
  }),
  defineTool({
    name: "get_month_overview",
    description:
      "한 달의 손익 단계(매출→원가→인건비→고정비→남은금액), 손실 항목별 분해, 일별 매출 추이(전월 대비), 지점 순위, 경보를 조회한다. 무엇이 왜 늘거나 줄었는지 묻는 질문에 쓴다.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "조회 월 YYYY-MM" },
        storeName: storeNameParam,
      },
      required: ["month"],
    },
    schema: monthOverviewArgs,
    run: runMonthOverview,
  }),
  defineTool({
    name: "get_product_sales",
    description:
      "기간·지점의 품목별 판매 실적 상위 N개. 가장 많이 팔린 품목을 묻는 질문에 쓴다.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "시작일 YYYY-MM-DD" },
        endDate: { type: "string", description: "종료일 YYYY-MM-DD" },
        storeName: storeNameParam,
        metric: {
          type: "string",
          enum: ["quantity", "amount"],
          description:
            "정렬 기준. quantity(판매 수량, 확정값)가 기본. amount는 추정치다.",
        },
        limit: { type: "number", description: "상위 개수 1~20. 기본 5." },
      },
      required: ["startDate", "endDate"],
    },
    schema: productSalesArgs,
    run: runProductSales,
  }),
  defineTool({
    name: "get_monthly_pnl",
    description:
      "월별 손익을 비용 항목까지 펼친다. 매입원가·인건비·고정비(월세/관리비/공과금 등)·기타비용·본사조정·남은금액. 비용이 얼마 나갔는지 묻는 질문에 쓴다.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "조회 월 YYYY-MM" },
        storeName: storeNameParam,
      },
      required: ["month"],
    },
    schema: monthlyPnlArgs,
    run: runMonthlyPnl,
  }),
  defineTool({
    name: "get_labor_report",
    description:
      "기간·지점·근무자별 인건비와 근무일수. 직원 급여 관련 질문에 쓴다. 대표 권한이 필요하며 계좌번호·주소·연락처는 조회되지 않는다.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "조회 월 YYYY-MM" },
        startDate: {
          type: "string",
          description: "기간 조회 시작일 YYYY-MM-DD. month 대신 사용.",
        },
        endDate: { type: "string", description: "기간 조회 종료일 YYYY-MM-DD" },
        storeName: storeNameParam,
        workerName: { type: "string", description: "근무자 이름으로 좁힌다." },
      },
    },
    schema: laborReportArgs,
    run: runLaborReport,
  }),
  defineTool({
    name: "get_inventory_position",
    description: "특정 일자의 지점·품목별 재고 수량과 재고금액 상위 N개.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "기준일 YYYY-MM-DD" },
        storeName: storeNameParam,
        limit: { type: "number", description: "상위 개수 1~20. 기본 5." },
      },
      required: ["date"],
    },
    schema: inventoryPositionArgs,
    run: runInventoryPosition,
  }),
  defineTool({
    name: "get_loss_breakdown",
    description:
      "기간·지점의 손실을 손실 유형별·품목별로 조회한다. 유형은 원장에 입력된 이름 그대로다(떨이, 폐기, 파손 등). 특정 유형(예: 떨이·폐기)의 합계나 어떤 품목을 버렸는지 묻는 질문에 쓴다. get_month_overview의 손실분해는 차트용으로 상위 3개만 남기므로 유형·품목 질문에는 이 도구를 쓴다.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "시작일 YYYY-MM-DD" },
        endDate: { type: "string", description: "종료일 YYYY-MM-DD" },
        storeName: storeNameParam,
        lossTypeNames: {
          type: "array",
          items: { type: "string" },
          description:
            '합산할 손실 유형 이름. 부분 일치이며 여러 개는 OR로 묶인다. 예: ["떨이", "폐기"]. 생략하면 모든 유형을 유형별로 돌려준다.',
        },
        limit: { type: "number", description: "품목 상위 개수 1~20. 기본 5." },
      },
      required: ["startDate", "endDate"],
    },
    schema: lossBreakdownArgs,
    run: runLossBreakdown,
  }),
];

export const CHAT_TOOL_BY_NAME = new Map(
  CHAT_TOOLS.map((tool) => [tool.name, tool]),
);

// 단위 테스트 전용 export. 라우트는 CHAT_TOOLS만 쓴다.
export const chatToolInternals = {
  clampLimit,
  groupLossItems,
  rankProductSales,
  metric,
  normalizeStoreName,
  pick,
  resolveRange,
  LABOR_SETTLEMENT_FIELDS,
  LABOR_STORE_SUMMARY_FIELDS,
  MAX_LIMIT,
  MAX_RANGE_DAYS,
};
