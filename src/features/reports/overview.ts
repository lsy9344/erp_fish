import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { HqDashboardRow } from "../dashboard/types.ts";
import type {
  MONTHLY_PNL_COMPANY_WIDE_STORE_ID,
  MonthlyProfitAndLossRow,
} from "./monthly-profit-loss.ts";
import type { LedgerProfitSummary } from "./queries.ts";
import type { MonthlyClosingAnomalyReportMonthRange } from "./types.ts";

const COMPANY_WIDE_STORE_ID: typeof MONTHLY_PNL_COMPANY_WIDE_STORE_ID =
  "__company_wide__";
const includedStatuses = new Set<DailyLedgerStatus>([
  "IN_REVIEW",
  "HEADQUARTERS_CLOSED",
]);

export type ReportOverviewMetricKey =
  | "sales"
  | "grossProfit"
  | "grossMarginRate"
  | "loss";

export type ReportOverviewStatusRow = {
  storeId: string;
  dateInput: string;
  status: DailyLedgerStatus;
};

export type HqReportOverviewData = {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: Array<{ id: string; name: string }>;
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  summary: {
    salesAmount: number | null;
    grossProfit: number | null;
    netAmount: number | null;
    lossAmount: number;
    actionCount: number;
  };
  chartSummaries: {
    salesTrend: string;
    lossBreakdown: string;
    profitAndLoss: string;
    closingStatus: string;
  };
  salesTrend: Array<{
    day: number;
    dateInput: string;
    currentAmount: number | null;
    previousAmount: number | null;
    currentStatusLabel: string;
    previousStatusLabel: string;
    detailHref: string;
  }>;
  lossBreakdown: {
    items: Array<{ name: string; amount: number; ratio: number }>;
    totalAmount: number;
    computableCount: number;
    totalCount: number;
    uncomputableCount: number;
    detailHref: string;
  };
  rankings: Record<
    ReportOverviewMetricKey,
    {
      summary: string;
      rows: Array<{
        storeId: string;
        storeName: string;
        value: number;
        detailHref: string;
      }>;
      excluded: Array<{
        storeId: string;
        storeName: string;
        reason: string;
      }>;
    }
  >;
  profitAndLoss: {
    available: boolean;
    reason: string | null;
    steps: Array<{
      key: string;
      label: string;
      start: number;
      end: number;
      offset: number;
      amount: number;
      kind: "total" | "increase" | "decrease";
    }>;
    detailHref: string;
  };
  closingStatus: Array<{
    key: "closed" | "progress" | "missing" | "holiday";
    label: string;
    count: number;
    ratio: number;
    detailHref: string;
  }>;
  closingMissingDays: Array<{
    storeId: string;
    storeName: string;
    dateInput: string;
    detailHref: string;
  }>;
  actions: Array<{
    id: string;
    storeName: string;
    label: string;
    detail: string;
    severity: "info" | "warning" | "critical";
    detailHref: string;
  }>;
  dataQuality: {
    missingCount: number;
    lossBasisLabel: string;
    profitAndLossLabel: string;
  };
  errorMessages: string[];
};

type ClosingStatusKey = HqReportOverviewData["closingStatus"][number]["key"];
type Ranking = HqReportOverviewData["rankings"][ReportOverviewMetricKey];

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateInputs(startDate: Date, endDate: Date) {
  const inputs: string[] = [];
  const date = new Date(startDate);

  while (date <= endDate) {
    inputs.push(toDateInput(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return inputs;
}

function previousMonthDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

export function getPreviousMonthComparisonRange(
  range: MonthlyClosingAnomalyReportMonthRange,
): {
  startDate: Date;
  endDate: Date;
  startDateInput: string;
  endDateInput: string;
} {
  const year = range.startDate.getUTCFullYear();
  const month = range.startDate.getUTCMonth();
  const startDate = previousMonthDate(
    year,
    month,
    range.startDate.getUTCDate(),
  );
  const endDate = previousMonthDate(year, month, range.endDate.getUTCDate());

  return {
    startDate,
    endDate,
    startDateInput: toDateInput(startDate),
    endDateInput: toDateInput(endDate),
  };
}

function statusKey(storeId: string, dateInput: string) {
  return `${storeId}:${dateInput}`;
}

function statusMap(rows: ReportOverviewStatusRow[]) {
  return new Map(
    rows.map((row) => [statusKey(row.storeId, row.dateInput), row.status]),
  );
}

function closingKey(status: DailyLedgerStatus | undefined): ClosingStatusKey {
  if (status === "HEADQUARTERS_CLOSED") return "closed";
  if (status === "IN_PROGRESS" || status === "IN_REVIEW") return "progress";
  if (status === "HOLIDAY") return "holiday";
  return "missing";
}

export function buildClosingStatusForTest(input: {
  storeIds: string[];
  dateInputs: string[];
  statusRows: ReportOverviewStatusRow[];
}): HqReportOverviewData["closingStatus"] {
  const statuses = statusMap(input.statusRows);
  const counts: Record<ClosingStatusKey, number> = {
    closed: 0,
    progress: 0,
    missing: 0,
    holiday: 0,
  };

  for (const storeId of input.storeIds) {
    for (const dateInput of input.dateInputs) {
      counts[closingKey(statuses.get(statusKey(storeId, dateInput)))] += 1;
    }
  }

  const total = input.storeIds.length * input.dateInputs.length;
  const rows: Array<{
    key: ClosingStatusKey;
    label: string;
  }> = [
    { key: "closed", label: "본사 마감" },
    { key: "progress", label: "진행 중" },
    { key: "missing", label: "미입력" },
    { key: "holiday", label: "휴무" },
  ];

  return rows.map(({ key, label }) => ({
    key,
    label,
    count: counts[key],
    ratio: total === 0 ? 0 : counts[key] / total,
    detailHref: "/app/reports/monthly",
  }));
}

function monthlyHref(monthInput: string, storeId?: string | null) {
  const params = new URLSearchParams({ month: monthInput });
  if (storeId) params.set("storeId", storeId);
  return `/app/reports/monthly?${params.toString()}`;
}

function sumFixedCosts(row: MonthlyProfitAndLossRow) {
  return Object.values(row.fixedCosts).reduce((sum, amount) => sum + amount, 0);
}

function waterfallStep(
  key: string,
  label: string,
  start: number,
  end: number,
  kind: "total" | "increase" | "decrease",
): HqReportOverviewData["profitAndLoss"]["steps"][number] {
  return {
    key,
    label,
    start,
    end,
    offset: Math.min(start, end),
    amount: Math.abs(end - start),
    kind,
  };
}

export function buildProfitAndLossWaterfallForTest(input: {
  ledgers: LedgerProfitSummary[];
  rows: MonthlyProfitAndLossRow[];
  coverageComplete: boolean;
}): HqReportOverviewData["profitAndLoss"] {
  const monthInput = input.rows[0]?.monthInput ?? "";
  const detailHref = monthlyHref(monthInput);
  const businessRows = input.rows.filter(
    (row) => row.storeId !== COMPANY_WIDE_STORE_ID,
  );
  const businessStoreIds = new Set(
    input.ledgers.map((ledger) => ledger.storeId),
  );
  const businessGrossProfits = businessRows.map((row) => row.grossProfit);

  if (
    !input.coverageComplete ||
    input.ledgers.length === 0 ||
    businessRows.length === 0 ||
    [...businessStoreIds].some(
      (storeId) => !businessRows.some((row) => row.storeId === storeId),
    ) ||
    input.ledgers.some((ledger) => ledger.grossProfit === null) ||
    !businessGrossProfits.every(
      (grossProfit): grossProfit is number => grossProfit !== null,
    )
  ) {
    return {
      available: false,
      reason: "모든 영업일의 FIFO 매출이익이 계산되어야 합니다.",
      steps: [],
      detailHref,
    };
  }

  const companyWideRow = input.rows.find(
    (row) => row.storeId === COMPANY_WIDE_STORE_ID,
  );
  const sales = businessRows.reduce((sum, row) => sum + row.salesAmount, 0);
  const cogs = businessRows.reduce((sum, row) => sum + row.cogsAmount, 0);
  const grossProfit = businessGrossProfits.reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const labor = businessRows.reduce((sum, row) => sum + row.laborAmount, 0);
  const storeExpenses = businessRows.reduce(
    (sum, row) => sum + sumFixedCosts(row) + row.otherExpenseAmount,
    0,
  );
  const companyWideExpenses = companyWideRow
    ? sumFixedCosts(companyWideRow) + companyWideRow.otherExpenseAmount
    : 0;
  const hqAdjustment = input.rows.reduce(
    (sum, row) => sum + row.hqAdjustmentAmount,
    0,
  );
  const net = input.rows.reduce((sum, row) => sum + row.netAmount, 0);
  let running = sales;
  const steps = [waterfallStep("sales", "매출", 0, sales, "total")];

  running -= cogs;
  steps.push(
    waterfallStep("cogs", "FIFO 매출원가", sales, running, "decrease"),
    waterfallStep("grossProfit", "매출이익", 0, grossProfit, "total"),
  );
  running = grossProfit;

  for (const [key, label, amount] of [
    ["labor", "인건비", labor],
    ["storeExpenses", "지점 귀속 고정비·기타", storeExpenses],
    ["companyWideExpenses", "전사 공통 비용", companyWideExpenses],
    ["hqAdjustment", "본사조정", hqAdjustment],
  ] as Array<[string, string, number]>) {
    const start = running;
    running -= amount;
    steps.push(
      waterfallStep(
        key,
        label,
        start,
        running,
        amount < 0 ? "increase" : "decrease",
      ),
    );
  }

  steps.push(waterfallStep("net", "순이익", 0, net, "total"));

  return { available: true, reason: null, steps, detailHref };
}

function ledgersByStoreAndDate(ledgers: LedgerProfitSummary[]) {
  return new Map(
    ledgers.map((ledger) => [
      statusKey(ledger.storeId, toDateInput(ledger.closingDate)),
      ledger,
    ]),
  );
}

function trendValue(input: {
  storeIds: string[];
  dateInput: string | null;
  statuses: Map<string, DailyLedgerStatus>;
  ledgers: Map<string, LedgerProfitSummary>;
}) {
  if (!input.dateInput) {
    return { amount: null, label: "비교 일자 없음" };
  }

  const businessStoreIds = input.storeIds.filter(
    (storeId) =>
      input.statuses.get(statusKey(storeId, input.dateInput ?? "")) !==
      "HOLIDAY",
  );
  if (businessStoreIds.length === 0) {
    return { amount: null, label: "휴무" };
  }

  const businessStatuses = businessStoreIds.map((storeId) =>
    input.statuses.get(statusKey(storeId, input.dateInput ?? "")),
  );
  if (businessStatuses.some((status) => status === undefined)) {
    return { amount: null, label: "누락" };
  }
  if (
    businessStatuses.some(
      (status) => status !== undefined && !includedStatuses.has(status),
    )
  ) {
    return { amount: null, label: "입력 중" };
  }

  const salesValues = businessStoreIds.map(
    (storeId) =>
      input.ledgers.get(statusKey(storeId, input.dateInput ?? ""))?.totalSales,
  );
  if (
    !salesValues.every(
      (sales): sales is number => sales !== null && sales !== undefined,
    )
  ) {
    return { amount: null, label: "누락" };
  }

  return {
    amount: salesValues.reduce((sum, sales) => sum + sales, 0),
    label: "실제값",
  };
}

function buildLossBreakdown(
  ledgers: LedgerProfitSummary[],
  monthInput: string,
  selectedStoreId: string | null,
): HqReportOverviewData["lossBreakdown"] {
  const allLossItems = ledgers.flatMap((ledger) => ledger.lossItems);
  const usableLossItems = allLossItems.filter((item) => item.usedPlannedPrice);
  const groupedLosses = new Map<string, number>();

  for (const item of usableLossItems) {
    const name = item.lossTypeName.trim() || "유형 미지정";
    groupedLosses.set(name, (groupedLosses.get(name) ?? 0) + item.amount);
  }

  const sortedLosses = [...groupedLosses]
    .map(([name, amount]) => ({ name, amount }))
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        left.name.localeCompare(right.name, "ko-KR"),
    );
  const lossItems =
    sortedLosses.length <= 3
      ? sortedLosses
      : [
          ...sortedLosses.slice(0, 3),
          {
            name: "기타",
            amount: sortedLosses
              .slice(3)
              .reduce((sum, item) => sum + item.amount, 0),
          },
        ];
  const totalAmount = usableLossItems.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  return {
    items: lossItems.map((item) => ({
      ...item,
      ratio: totalAmount === 0 ? 0 : item.amount / totalAmount,
    })),
    totalAmount,
    computableCount: usableLossItems.length,
    totalCount: allLossItems.length,
    uncomputableCount: allLossItems.length - usableLossItems.length,
    detailHref: monthlyHref(monthInput, selectedStoreId),
  };
}

function buildRankings(input: {
  stores: Array<{ id: string; name: string }>;
  monthInput: string;
  dateInputs: string[];
  ledgers: LedgerProfitSummary[];
  statusRows: ReportOverviewStatusRow[];
}): HqReportOverviewData["rankings"] {
  const statuses = statusMap(input.statusRows);
  const ledgers = ledgersByStoreAndDate(input.ledgers);
  const emptyRanking = (): Ranking => ({
    summary: "",
    rows: [],
    excluded: [],
  });
  const result: HqReportOverviewData["rankings"] = {
    sales: emptyRanking(),
    grossProfit: emptyRanking(),
    grossMarginRate: emptyRanking(),
    loss: emptyRanking(),
  };

  for (const store of input.stores) {
    const businessLedgers: LedgerProfitSummary[] = [];
    let coverageComplete = true;

    for (const dateInput of input.dateInputs) {
      const status = statuses.get(statusKey(store.id, dateInput));
      if (status === "HOLIDAY") continue;
      const ledger = ledgers.get(statusKey(store.id, dateInput));
      if (!status || !includedStatuses.has(status) || !ledger) {
        coverageComplete = false;
        continue;
      }
      businessLedgers.push(ledger);
    }

    for (const metric of ["sales", "grossProfit", "grossMarginRate"] as const) {
      let value: number | null = null;
      let reason = "월 범위가 완전하지 않습니다.";

      if (coverageComplete && businessLedgers.length > 0) {
        const salesValues = businessLedgers.map((ledger) => ledger.totalSales);
        const profitValues = businessLedgers.map(
          (ledger) => ledger.grossProfit,
        );
        if (salesValues.every((item): item is number => item !== null)) {
          const sales = salesValues.reduce((sum, item) => sum + item, 0);
          if (metric === "sales") value = sales;
          if (profitValues.every((item): item is number => item !== null)) {
            const profit = profitValues.reduce((sum, item) => sum + item, 0);
            if (metric === "grossProfit") value = profit;
            if (metric === "grossMarginRate" && sales !== 0) {
              value = profit / sales;
            }
          }
        }
        if (value === null) reason = "계산 가능한 값이 없습니다.";
      }

      addRankingValue(result[metric], store, value, reason, input.monthInput);
    }

    const storeLedgers = input.ledgers.filter(
      (ledger) => ledger.storeId === store.id,
    );
    const allLosses = storeLedgers.flatMap((ledger) => ledger.lossItems);
    const usableLosses = allLosses.filter((item) => item.usedPlannedPrice);
    addRankingValue(
      result.loss,
      store,
      storeLedgers.length === 0 ||
        (allLosses.length > 0 && usableLosses.length === 0)
        ? null
        : usableLosses.reduce((sum, item) => sum + item.amount, 0),
      "판매가 계획 기준이 없습니다.",
      input.monthInput,
    );
  }

  for (const metric of [
    "sales",
    "grossProfit",
    "grossMarginRate",
    "loss",
  ] as const) {
    const ranking = result[metric];
    ranking.rows.sort(
      (left, right) =>
        right.value - left.value ||
        left.storeName.localeCompare(right.storeName, "ko-KR"),
    );
    const leader = ranking.rows[0];
    ranking.summary = leader
      ? `${leader.storeName}이(가) 1위이며 ${ranking.excluded.length}개 지점이 제외되었습니다.${
          metric === "loss" ? " 판매가 계획 기준입니다." : ""
        }`
      : `계산 가능한 지점이 없습니다. ${ranking.excluded.length}개 지점이 제외되었습니다.${
          metric === "loss" ? " 판매가 계획 기준입니다." : ""
        }`;
  }

  return result;
}

function addRankingValue(
  ranking: Ranking,
  store: { id: string; name: string },
  value: number | null,
  reason: string,
  monthInput: string,
) {
  if (value === null) {
    ranking.excluded.push({
      storeId: store.id,
      storeName: store.name,
      reason,
    });
    return;
  }

  ranking.rows.push({
    storeId: store.id,
    storeName: store.name,
    value,
    detailHref: monthlyHref(monthInput, store.id),
  });
}

function buildActions(
  rows: HqDashboardRow[],
  selectedStoreId: string | null,
): HqReportOverviewData["actions"] {
  return rows
    .filter(
      (row) =>
        (!selectedStoreId || row.storeId === selectedStoreId) &&
        (row.priority.rank < 90 ||
          row.signals.length > 0 ||
          row.correctionState.hasUnappliedCorrections),
    )
    .sort(
      (left, right) =>
        left.priority.rank - right.priority.rank ||
        left.storeName.localeCompare(right.storeName, "ko-KR"),
    )
    .slice(0, 7)
    .map((row, index) => {
      const signal = row.signals[0];
      const details = [
        signal?.detail,
        row.priority.reasons.join(", "),
        row.correctionState.hasUnappliedCorrections
          ? "미반영 정정을 확인해 주세요."
          : null,
      ].filter((detail): detail is string => Boolean(detail));

      return {
        id: `${row.storeId}:${row.ledgerId ?? "missing"}:${signal?.id ?? index}`,
        storeName: row.storeName,
        label: signal?.label ?? row.priority.label,
        detail: details.join(" · "),
        severity:
          signal?.severity ??
          (row.correctionState.hasUnappliedCorrections
            ? "warning"
            : row.priority.rank <= 10
              ? "critical"
              : row.priority.rank <= 20
                ? "warning"
                : "info"),
        detailHref: row.ledgerId
          ? `/app/ledgers/${row.ledgerId}`
          : "/app/reports/daily?date=today",
      };
    });
}

function aggregateCompleteMetric(input: {
  stores: Array<{ id: string }>;
  dateInputs: string[];
  statusRows: ReportOverviewStatusRow[];
  ledgers: LedgerProfitSummary[];
  key: "totalSales" | "grossProfit";
}) {
  const statuses = statusMap(input.statusRows);
  const ledgers = ledgersByStoreAndDate(input.ledgers);
  let total = 0;
  let businessCount = 0;

  for (const store of input.stores) {
    for (const dateInput of input.dateInputs) {
      const status = statuses.get(statusKey(store.id, dateInput));
      if (status === "HOLIDAY") continue;
      businessCount += 1;
      const value = ledgers.get(statusKey(store.id, dateInput))?.[input.key];
      if (!status || !includedStatuses.has(status) || value === null) {
        return null;
      }
      if (value === undefined) return null;
      total += value;
    }
  }

  return businessCount === 0 ? null : total;
}

export function buildHqReportOverviewForTest(input: {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: Array<{ id: string; name: string }>;
  selectedStoreId: string | null;
  currentLedgers: LedgerProfitSummary[];
  previousLedgers: LedgerProfitSummary[];
  statusRows: ReportOverviewStatusRow[];
  pnlRows: MonthlyProfitAndLossRow[];
  todayRows: HqDashboardRow[];
  errorMessages: string[];
}): HqReportOverviewData {
  const scopedStores = input.selectedStoreId
    ? input.stores.filter((store) => store.id === input.selectedStoreId)
    : input.stores;
  const scopedStoreIds = new Set(scopedStores.map((store) => store.id));
  const currentLedgers = input.currentLedgers.filter((ledger) =>
    scopedStoreIds.has(ledger.storeId),
  );
  const previousLedgers = input.previousLedgers.filter((ledger) =>
    scopedStoreIds.has(ledger.storeId),
  );
  const dateInputs = getDateInputs(
    input.monthRange.startDate,
    input.monthRange.endDate,
  );
  const previousRange = getPreviousMonthComparisonRange(input.monthRange);
  const previousDateInputs = getDateInputs(
    previousRange.startDate,
    previousRange.endDate,
  );
  const statuses = statusMap(input.statusRows);
  const currentByDate = ledgersByStoreAndDate(currentLedgers);
  const previousByDate = ledgersByStoreAndDate(previousLedgers);
  const storeIds = scopedStores.map((store) => store.id);
  const salesTrend = dateInputs.map((dateInput, index) => {
    const previousDateInput = previousDateInputs[index] ?? null;
    const current = trendValue({
      storeIds,
      dateInput,
      statuses,
      ledgers: currentByDate,
    });
    const previous = trendValue({
      storeIds,
      dateInput: previousDateInput,
      statuses,
      ledgers: previousByDate,
    });

    return {
      day: new Date(`${dateInput}T00:00:00.000Z`).getUTCDate(),
      dateInput,
      currentAmount: current.amount,
      previousAmount: previous.amount,
      currentStatusLabel: current.label,
      previousStatusLabel: previous.label,
      detailHref: `/app/reports/daily?date=${dateInput}`,
    };
  });
  const lossBreakdown = buildLossBreakdown(
    currentLedgers,
    input.monthRange.monthInput,
    input.selectedStoreId,
  );
  const closingStatus = buildClosingStatusForTest({
    storeIds,
    dateInputs,
    statusRows: input.statusRows,
  }).map((row) => ({
    ...row,
    detailHref: monthlyHref(input.monthRange.monthInput, input.selectedStoreId),
  }));
  const closingMissingDays = scopedStores.flatMap((store) =>
    dateInputs
      .filter((dateInput) => !statuses.has(statusKey(store.id, dateInput)))
      .map((dateInput) => ({
        storeId: store.id,
        storeName: store.name,
        dateInput,
        detailHref: `/app/reports/daily?date=${dateInput}`,
      })),
  );
  const coverageComplete = scopedStores.every((store) =>
    dateInputs.every((dateInput) => {
      const status = statuses.get(statusKey(store.id, dateInput));
      return (
        status === "HOLIDAY" ||
        (status !== undefined &&
          includedStatuses.has(status) &&
          currentByDate.has(statusKey(store.id, dateInput)))
      );
    }),
  );
  const pnlRows = input.pnlRows.filter(
    (row) =>
      scopedStoreIds.has(row.storeId) ||
      (!input.selectedStoreId && row.storeId === COMPANY_WIDE_STORE_ID),
  );
  const profitAndLossResult = buildProfitAndLossWaterfallForTest({
    ledgers: currentLedgers,
    rows: pnlRows,
    coverageComplete,
  });
  const profitAndLoss = {
    ...profitAndLossResult,
    steps: input.selectedStoreId
      ? profitAndLossResult.steps.filter(
          (step) => step.key !== "companyWideExpenses",
        )
      : profitAndLossResult.steps,
    detailHref: monthlyHref(input.monthRange.monthInput, input.selectedStoreId),
  };
  const rankings = buildRankings({
    stores: scopedStores,
    monthInput: input.monthRange.monthInput,
    dateInputs,
    ledgers: currentLedgers,
    statusRows: input.statusRows,
  });
  const actions = buildActions(input.todayRows, input.selectedStoreId);
  const highestSales = [...salesTrend]
    .filter(
      (item): item is typeof item & { currentAmount: number } =>
        item.currentAmount !== null,
    )
    .sort((left, right) => right.currentAmount - left.currentAmount)[0];
  const previousChange =
    highestSales?.previousAmount === null || highestSales === undefined
      ? null
      : highestSales.currentAmount - highestSales.previousAmount;
  const topLoss = lossBreakdown.items[0];
  const missingCount = closingMissingDays.length;
  const netAmount = profitAndLoss.available
    ? pnlRows.reduce((sum, row) => sum + row.netAmount, 0)
    : null;

  return {
    monthRange: input.monthRange,
    stores: input.stores,
    selectedStoreId: input.selectedStoreId,
    selectedStoreName:
      input.stores.find((store) => store.id === input.selectedStoreId)?.name ??
      null,
    summary: {
      salesAmount: aggregateCompleteMetric({
        stores: scopedStores,
        dateInputs,
        statusRows: input.statusRows,
        ledgers: currentLedgers,
        key: "totalSales",
      }),
      grossProfit: aggregateCompleteMetric({
        stores: scopedStores,
        dateInputs,
        statusRows: input.statusRows,
        ledgers: currentLedgers,
        key: "grossProfit",
      }),
      netAmount,
      lossAmount: lossBreakdown.totalAmount,
      actionCount: actions.length,
    },
    chartSummaries: {
      salesTrend: highestSales
        ? `${highestSales.day}일 매출이 가장 높습니다.${
            previousChange === null
              ? " 전월 비교값은 없습니다."
              : ` 전월 같은 날보다 ${previousChange}원 변했습니다.`
          }`
        : "계산 가능한 일 매출이 없습니다.",
      lossBreakdown: topLoss
        ? `${topLoss.name} 손실이 가장 크며 판매가 계획 기준 ${lossBreakdown.computableCount}/${lossBreakdown.totalCount}건을 계산했습니다.`
        : `손실 금액이 없으며 판매가 계획 기준 ${lossBreakdown.computableCount}/${lossBreakdown.totalCount}건을 계산했습니다.`,
      profitAndLoss:
        profitAndLoss.available && netAmount !== null
          ? `순이익은 ${netAmount}원입니다.`
          : (profitAndLoss.reason ?? "손익을 계산할 수 없습니다."),
      closingStatus: `미입력은 ${missingCount}건입니다.`,
    },
    salesTrend,
    lossBreakdown,
    rankings,
    profitAndLoss,
    closingStatus,
    closingMissingDays,
    actions,
    dataQuality: {
      missingCount,
      lossBasisLabel: `판매가 계획 기준 ${lossBreakdown.computableCount}/${lossBreakdown.totalCount}건`,
      profitAndLossLabel: profitAndLoss.available
        ? "FIFO 손익 계산 완료"
        : (profitAndLoss.reason ?? "손익 계산 불가"),
    },
    errorMessages: input.errorMessages,
  };
}
