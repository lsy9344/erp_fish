import type { Prisma } from "../../../generated/prisma/index.ts";

import type { ReportExportSheet } from "./export.ts";
import { buildPeriodTrendColumns } from "./period-analysis.ts";

export const SOURCE_WORKBOOK_HEADERS = [
  "일자",
  "요일",
  "매장",
  "매출",
  "매출이익",
  "마진율",
  "영업이익",
  "인당생산성",
  "근무인원",
  "팀장",
  "팀장",
  ...Array.from({ length: 11 }, () => "팀원"),
  "매출차액",
] as const;

export function getSourceWorkbookTrendDateRanges({
  unit,
  year,
  fromYear,
  toYear,
  fromMonth,
  toMonth,
}: {
  unit: "month" | "year";
  year: number;
  fromYear: number;
  toYear: number;
  fromMonth: number;
  toMonth: number;
}) {
  const years = Array.from(
    { length: toYear - fromYear + 1 },
    (_, index) => fromYear + index,
  );
  const { columns } = buildPeriodTrendColumns({
    unit,
    year,
    years,
    fromMonth,
    toMonth,
  });

  return columns.map(({ startDateInput, endDateInput }) => ({
    startDate: startDateInput,
    endDate: endDateInput,
  }));
}

const SOURCE_WORKBOOK_COLUMN_KEYS = [
  "businessDate",
  "weekday",
  "storeName",
  "salesAmount",
  "grossProfit",
  "grossMarginRate",
  "operatingProfit",
  "productivity",
  "workerCount",
  "lead1",
  "lead2",
  ...Array.from({ length: 11 }, (_, index) => `member${index + 1}`),
  "salesDifference",
] as const;

type SourceWorkbookValue = string | number | Date | null | { error: string };

export type HistoricalSourceFact = {
  storeId: string;
  storeName: string;
  businessDate: string;
  rawCells: { values: unknown[] };
  roles: Array<{
    role: "LEAD" | "MEMBER";
    slotNumber: number;
    originalName: string;
  }>;
};

export type OperationalSourceFact = {
  storeId: string;
  storeName: string;
  businessDate: string;
  salesAmount: number | null;
  grossProfit: number | null;
  grossMarginRate: number | null;
  operatingProfit: number | null;
  productivity: number | null;
  workerCount: number | null;
  salesDifference: number | null;
  roles: Array<{
    role: "역할 미기록";
    slotNumber: null;
    originalName: string;
  }>;
};

export type SourceWorkbookBuildInput = {
  historicalFacts: HistoricalSourceFact[];
  operationalFacts: OperationalSourceFact[];
  includePersonnel?: boolean;
};

export type SourceWorkbookPersonnelRow = {
  businessDate: string;
  storeName: string;
  role: "LEAD" | "MEMBER" | "역할 미기록";
  slotNumber: number | null;
  workerName: string;
  source: "historical" | "operational";
};

type SourceWorkbookRow = Record<
  (typeof SOURCE_WORKBOOK_COLUMN_KEYS)[number],
  SourceWorkbookValue
>;

const SOURCE_NUMBER_FORMATS: Record<string, string> = {
  businessDate: "yyyy/mm/dd;@",
  salesAmount: "#,##0",
  grossProfit: "#,##0",
  grossMarginRate: "0.0%",
  operatingProfit: "#,##0",
  productivity: "#,##0",
  workerCount: "#,##0.0",
  salesDifference: "#,##0",
};

function toExcelValue(value: unknown): SourceWorkbookValue {
  if (value === null || value === undefined) return null;

  if (typeof value === "object") {
    if (("formula" in value || "sharedFormula" in value) && "result" in value) {
      return toExcelValue(value.result);
    }
    if ("error" in value && typeof value.error === "string") {
      return { error: value.error };
    }
    if (
      "kind" in value &&
      value.kind === "date" &&
      typeof (value as { iso?: unknown }).iso === "string"
    ) {
      const date = new Date((value as unknown as { iso: string }).iso);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if ("kind" in value && value.kind === "undefined") return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  ) {
    return value;
  }

  return null;
}

function dateValue(dateInput: string) {
  return new Date(`${dateInput}T00:00:00.000Z`);
}

function weekdayValue(dateInput: string) {
  return ["일", "월", "화", "수", "목", "금", "토"][
    dateValue(dateInput).getUTCDay()
  ];
}

function sourceRoleValues(
  roles: Array<{
    role: "LEAD" | "MEMBER";
    slotNumber: number;
    originalName: string;
  }>,
) {
  const values: Record<string, string | null> = {};
  for (const role of roles) {
    const key =
      role.role === "LEAD"
        ? `lead${role.slotNumber}`
        : `member${role.slotNumber}`;
    if (key in values || (role.role === "LEAD" && role.slotNumber > 2)) {
      continue;
    }
    if (role.role === "MEMBER" && role.slotNumber > 11) continue;
    values[key] = role.originalName;
  }
  return values;
}

function historicalRow(
  fact: HistoricalSourceFact,
  includePersonnel: boolean,
): SourceWorkbookRow {
  const values = Array.from(
    { length: SOURCE_WORKBOOK_HEADERS.length },
    (_, i) => toExcelValue(fact.rawCells.values[i]),
  );
  const roles = includePersonnel ? sourceRoleValues(fact.roles) : {};

  // Historical metric cells intentionally come from rawCells. In particular, a
  // formula's cached result, an original error, or an original blank is retained.
  values[0] = dateValue(fact.businessDate);
  values[1] ??= weekdayValue(fact.businessDate) ?? null;
  // The canonical fact store name is authoritative. This also repairs legacy
  // rows whose original C cell contained the review value `0`.
  values[2] = fact.storeName;
  if (!includePersonnel) {
    values.fill(null, 9, 22);
  }
  for (const [key, value] of Object.entries(roles)) {
    const index = (SOURCE_WORKBOOK_COLUMN_KEYS as readonly string[]).indexOf(
      key,
    );
    if (index >= 0) values[index] = value;
  }

  return Object.fromEntries(
    SOURCE_WORKBOOK_COLUMN_KEYS.map((key, index) => [
      key,
      values[index] ?? null,
    ]),
  );
}

function operationalRow(fact: OperationalSourceFact): SourceWorkbookRow {
  // Operational ledger labor rows do not store the historical team-lead/team-member
  // slots. Keep those cells blank; names are preserved in the detail sheet.
  const roles: Record<string, string | null> = {};
  return {
    businessDate: dateValue(fact.businessDate),
    weekday: weekdayValue(fact.businessDate) ?? null,
    storeName: fact.storeName,
    salesAmount: fact.salesAmount,
    grossProfit: fact.grossProfit,
    grossMarginRate: fact.grossMarginRate,
    operatingProfit: fact.operatingProfit,
    productivity: fact.productivity,
    workerCount: fact.workerCount,
    lead1: roles.lead1 ?? null,
    lead2: roles.lead2 ?? null,
    member1: roles.member1 ?? null,
    member2: roles.member2 ?? null,
    member3: roles.member3 ?? null,
    member4: roles.member4 ?? null,
    member5: roles.member5 ?? null,
    member6: roles.member6 ?? null,
    member7: roles.member7 ?? null,
    member8: roles.member8 ?? null,
    member9: roles.member9 ?? null,
    member10: roles.member10 ?? null,
    member11: roles.member11 ?? null,
    salesDifference: fact.salesDifference,
  };
}

export function buildSourceWorkbookSheet({
  historicalFacts,
  operationalFacts,
  includePersonnel = true,
}: SourceWorkbookBuildInput): ReportExportSheet {
  const operationalKeys = new Set(
    operationalFacts.map((fact) => `${fact.storeId}|${fact.businessDate}`),
  );
  const rows = [
    ...historicalFacts
      .filter(
        (fact) => !operationalKeys.has(`${fact.storeId}|${fact.businessDate}`),
      )
      .map((fact) => historicalRow(fact, includePersonnel)),
    ...operationalFacts.map(operationalRow),
  ].sort((left, right) => {
    const dateOrder = sortValue(left.businessDate ?? null).localeCompare(
      sortValue(right.businessDate ?? null),
    );
    return (
      dateOrder ||
      sortValue(left.storeName ?? null).localeCompare(
        sortValue(right.storeName ?? null),
        "ko",
      )
    );
  });

  return {
    name: "입력",
    columns: SOURCE_WORKBOOK_COLUMN_KEYS.map((key, index) => ({
      key,
      label: SOURCE_WORKBOOK_HEADERS[index]!,
      numberFormat: SOURCE_NUMBER_FORMATS[key],
    })),
    rows,
  };
}

function sortValue(value: SourceWorkbookValue) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}

export function buildSourceWorkbookPersonnelSheet(
  rows: SourceWorkbookPersonnelRow[],
): ReportExportSheet {
  return {
    name: "입력_근무자상세",
    columns: [
      { key: "businessDate", label: "일자" },
      { key: "storeName", label: "매장" },
      { key: "role", label: "역할" },
      { key: "slotNumber", label: "원본 칸" },
      { key: "workerName", label: "근무자" },
      { key: "source", label: "출처" },
    ],
    rows: rows.map((row) => ({
      ...row,
      role:
        row.role === "LEAD"
          ? "팀장"
          : row.role === "MEMBER"
            ? "팀원"
            : "역할 미기록",
      source: row.source === "historical" ? "과거 엑셀" : "ERP",
    })),
  };
}

type HistoricalFactRecord = Prisma.HistoricalDailyFactGetPayload<{
  select: {
    storeId: true;
    sourceStoreName: true;
    businessDate: true;
    sourceRawRow: { select: { rawCells: true } };
    dailyRoles: {
      select: { role: true; slotNumber: true; originalName: true };
    };
  };
}>;

const historicalFactSelect = {
  storeId: true,
  sourceStoreName: true,
  businessDate: true,
  sourceRawRow: { select: { rawCells: true } },
  dailyRoles: {
    select: { role: true, slotNumber: true, originalName: true },
  },
} as const;

const sourceLedgerSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  totalSalesAmount: true,
  carryoverSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  store: { select: { name: true } },
  ledgerInventoryItems: {
    select: {
      id: true,
      productId: true,
      productName: true,
      previousQuantity: true,
      purchasedQuantity: true,
      conversionInQuantity: true,
      conversionOutQuantity: true,
      currentQuantity: true,
      quantity: true,
      unitPrice: true,
      inventoryAmount: true,
      fifoLots: {
        select: {
          sourceType: true,
          lotOriginKey: true,
          soldQuantity: true,
          unitPrice: true,
          consumedAmount: true,
          soldAmount: true,
          lossAmount: true,
          conversionOutAmount: true,
          remainingAmount: true,
        },
      },
    },
  },
  ledgerExpenses: { select: { id: true, amount: true } },
  ledgerInventoryAdjustments: {
    select: { differenceAmount: true },
  },
  ledgerLossItems: {
    select: {
      id: true,
      productId: true,
      productName: true,
      quantity: true,
      amount: true,
    },
  },
  ledgerLaborItems: {
    select: {
      id: true,
      createdAt: true,
      workerName: true,
    },
  },
} as const;

type SourceLedgerRecord = Prisma.DailyLedgerGetPayload<{
  select: typeof sourceLedgerSelect;
}>;

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number(
      (value as unknown as { toString: () => string }).toString(),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = numberValue(value);
  return Number.isFinite(number) ? number : null;
}

function operationalRoles(ledger: SourceLedgerRecord) {
  return [...ledger.ledgerLaborItems]
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .map((item) => {
      return {
        role: "역할 미기록" as const,
        slotNumber: null,
        originalName: item.workerName,
      };
    });
}

async function operationalFact(
  ledger: SourceLedgerRecord,
  corrections: Map<string, unknown>,
) {
  const {
    applyCorrectionValuesToLedgerReviewInput,
    calculateExpenseTotal,
    calculateLedgerReviewSummary,
  } = await import("../../server/calculations/ledger.ts");
  const reviewInput = {
    totalSalesAmount: ledger.totalSalesAmount,
    carryoverSalesAmount: ledger.carryoverSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: calculateExpenseTotal(
      ledger.ledgerExpenses.map((item) => item.amount),
    ),
    inventoryItems: ledger.ledgerInventoryItems.map((item) => ({
      ...item,
      previousQuantity: numberValue(item.previousQuantity),
      purchasedQuantity: numberValue(item.purchasedQuantity),
      conversionInQuantity: numberValue(item.conversionInQuantity),
      conversionOutQuantity: numberValue(item.conversionOutQuantity),
      currentQuantity: nullableNumberValue(item.currentQuantity),
      quantity: nullableNumberValue(item.quantity),
      unitPrice: item.unitPrice,
      inventoryAmount: nullableNumberValue(item.inventoryAmount),
      fifoLots: item.fifoLots.map((lot) => ({
        ...lot,
        soldQuantity: numberValue(lot.soldQuantity),
        unitPrice: lot.unitPrice,
        consumedAmount: numberValue(lot.consumedAmount),
        soldAmount: numberValue(lot.soldAmount),
        lossAmount: numberValue(lot.lossAmount),
        conversionOutAmount: numberValue(lot.conversionOutAmount),
        remainingAmount: numberValue(lot.remainingAmount),
      })),
    })),
    inventoryAdjustments: ledger.ledgerInventoryAdjustments.map((item) => ({
      differenceAmount: item.differenceAmount,
    })),
    lossItems: ledger.ledgerLossItems.map((item) => ({
      ...item,
      quantity: numberValue(item.quantity),
      amount: item.amount,
    })),
  };
  const lossItems = reviewInput.lossItems ?? [];
  const overlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput,
    expenseItems: ledger.ledgerExpenses,
    lossItems,
    corrections: corrections.values() as never,
  });
  const summary = calculateLedgerReviewSummary(overlay.reviewInput);
  const applied = summary;

  return {
    storeId: ledger.storeId,
    storeName: ledger.store.name,
    businessDate: ledger.closingDate.toISOString().slice(0, 10),
    salesAmount: applied.operatingSales.value,
    grossProfit: applied.grossProfit.value,
    grossMarginRate: applied.grossMarginRate.value,
    operatingProfit: applied.operatingProfit.value,
    productivity: applied.productivity.value,
    workerCount: applied.workerCount.value,
    salesDifference: applied.salesDifference.value,
    roles: operationalRoles(ledger),
  } satisfies OperationalSourceFact;
}

export async function getSourceWorkbookSheets({
  dateRanges,
  storeId,
}: {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  storeId?: string | null;
}): Promise<ReportExportSheet[]> {
  const {
    getHeadquartersStoreScope,
    hasActionPermission,
    requireReportAccess,
  } = await import("../../server/authz.ts");
  const { db } = await import("../../server/db.ts");
  const { getLatestCorrectionValuesForLedgersScoped } =
    await import("../corrections/queries.ts");
  const reportUser = await requireReportAccess();
  const includePersonnel = await hasActionPermission(
    reportUser.id,
    "LABOR_VIEW",
  );
  const scope = await getHeadquartersStoreScope();
  if (storeId && !scope.storeIds.includes(storeId)) return [];
  const selectedStoreIds = storeId ? [storeId] : scope.storeIds;
  if (dateRanges.length === 0 || selectedStoreIds.length === 0) return [];
  const activeBatch = await db.historicalExcelImportBatch.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const [historicalRows, ledgers] = await Promise.all([
    activeBatch
      ? db.historicalDailyFact.findMany({
          where: {
            batchId: activeBatch.id,
            storeId: { in: selectedStoreIds },
            OR: dateRanges.map(({ startDate, endDate }) => ({
              businessDate: {
                gte: dateValue(startDate),
                lte: new Date(`${endDate}T23:59:59.999Z`),
              },
            })),
          },
          select: historicalFactSelect,
          orderBy: [{ businessDate: "asc" }, { storeId: "asc" }],
        })
      : [],
    db.dailyLedger.findMany({
      where: {
        storeId: { in: selectedStoreIds },
        OR: dateRanges.map(({ startDate, endDate }) => ({
          closingDate: {
            gte: dateValue(startDate),
            lte: new Date(`${endDate}T23:59:59.999Z`),
          },
        })),
      },
      select: sourceLedgerSelect,
      orderBy: [{ closingDate: "asc" }, { storeId: "asc" }],
    }),
  ]);
  const correctionValues = await getLatestCorrectionValuesForLedgersScoped(
    ledgers.map((ledger) => ledger.id),
    selectedStoreIds,
  );

  const historicalFacts = (historicalRows as HistoricalFactRecord[]).map(
    (row) => ({
      storeId: row.storeId,
      storeName: row.sourceStoreName,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      rawCells: row.sourceRawRow.rawCells as { values: unknown[] },
      roles: row.dailyRoles.map((role) => ({
        role: role.role,
        slotNumber: role.slotNumber,
        originalName: role.originalName,
      })),
    }),
  );
  const operationalFacts = await Promise.all(
    ledgers.map((ledger) =>
      operationalFact(
        ledger,
        correctionValues.get(ledger.id) ?? new Map<string, unknown>(),
      ),
    ),
  );
  const sourceSheet = buildSourceWorkbookSheet({
    historicalFacts,
    operationalFacts,
    includePersonnel,
  });
  if (!includePersonnel) return [sourceSheet];

  const personnelRows: SourceWorkbookPersonnelRow[] = [
    ...historicalFacts.flatMap((fact) =>
      fact.roles.map((role) => ({
        businessDate: fact.businessDate,
        storeName: fact.storeName,
        role: role.role,
        slotNumber: role.slotNumber,
        workerName: role.originalName,
        source: "historical" as const,
      })),
    ),
    ...operationalFacts.flatMap((fact) =>
      fact.roles.map((role) => ({
        businessDate: fact.businessDate,
        storeName: fact.storeName,
        role: role.role,
        slotNumber: role.slotNumber,
        workerName: role.originalName,
        source: "operational" as const,
      })),
    ),
  ];
  const hasOverflow = personnelRows.some(
    (row) =>
      row.slotNumber !== null &&
      ((row.role === "LEAD" && row.slotNumber > 2) ||
        (row.role === "MEMBER" && row.slotNumber > 11)),
  );
  const hasOperationalPersonnel = personnelRows.some(
    (row) => row.source === "operational",
  );

  return hasOverflow || hasOperationalPersonnel
    ? [sourceSheet, buildSourceWorkbookPersonnelSheet(personnelRows)]
    : [sourceSheet];
}
