import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../../generated/prisma/index.js";

export const prisma = new PrismaClient();
export const STORE_IDS = {
  empty: "store-story-6-1-empty",
  closed: "store-story-6-1-closed",
  holiday: "store-story-6-1-holiday",
  inProgress: "store-story-6-2-in-progress",
  tieGa: "store-story-6-1-tie-ga",
  tieNa: "store-story-6-1-tie-na",
  zeroSales: "store-story-6-1-zero-sales",
  inventoryEqual: "store-story-6-1-inventory-equal",
  marginDefault: "store-report-margin-default",
  marginDestructive: "store-report-margin-destructive",
  marginMissing: "store-report-margin-missing",
  marginSortHighSales: "store-report-margin-sort-high-sales",
  productRanking: "store-report-product-ranking",
} as const;
const STORY_STORE_IDS = Object.values(STORE_IDS);
const DAILY_CHART_STORE_IDS = [
  STORE_IDS.marginDefault,
  STORE_IDS.marginDestructive,
  STORE_IDS.marginMissing,
  STORE_IDS.marginSortHighSales,
  STORE_IDS.productRanking,
];
export const PRODUCT_IDS = {
  fish: "product-story-5-5-fish",
  margin: "product-report-margin",
} as const;
const PRODUCT_RANKING_IDS = Array.from(
  { length: 12 },
  (_, index) => `product-report-ranking-${String(index + 1).padStart(2, "0")}`,
);
const STORY_PRODUCT_IDS = [
  ...Object.values(PRODUCT_IDS),
  ...PRODUCT_RANKING_IDS,
];
const DAILY_CHART_PRODUCT_IDS = [PRODUCT_IDS.margin, ...PRODUCT_RANKING_IDS];
const LOSS_CODE_IDS = {
  waste: "loss-code-story-5-5-waste",
} as const;
const STORY_LOSS_CODE_IDS = Object.values(LOSS_CODE_IDS);
const STORY_MARKER = "story-6-1-test";
export const STORY_EMPLOYEE_ID = "employee-story-6-1";
const HISTORICAL_REPORT_DATE = new Date(Date.UTC(2026, 4, 31));
export const THIRTY_PERCENT_EXPORT_PATTERN =
  /30[%_-]?단가|thirty[_-]?percent|thirty[_-]?percent[_-]?unit[_-]?price|price[_-]?30|margin[_-]?30/i;

export function setupReportFixtures() {
  test.beforeEach(async () => {
    await cleanupStorySixOneData();
    await seedStorySixOneData();
  });

  test.afterAll(async () => {
    await cleanupStorySixOneData();
    await prisma.$disconnect();
  });
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

export async function fetchCsvFromVisibleLink(
  page: Page,
  expectedFilename: RegExp | string,
) {
  const csvLink = page.getByRole("link", { name: "CSV" });
  await expect(csvLink).toBeVisible();

  const href = await csvLink.getAttribute("href");

  expect(href).toBeTruthy();

  const response = await page.request.get(href!);

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");

  const contentDisposition = response.headers()["content-disposition"] ?? "";

  expect(contentDisposition).toContain("attachment");
  if (typeof expectedFilename === "string") {
    expect(contentDisposition).toContain(`filename="${expectedFilename}"`);
  } else {
    expect(contentDisposition).toMatch(expectedFilename);
  }

  const csv = await response.text();

  expect(csv.charCodeAt(0)).toBe(0xfeff);

  return csv;
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

export function getTodayKstMidnight(inputDate = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function getTodayKstInput() {
  return getTodayKstMidnight().toISOString().slice(0, 10);
}

function getPreviousKstMidnight() {
  const date = getTodayKstMidnight();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

export function getCurrentMonthInput() {
  return getTodayKstInput().slice(0, 7);
}

async function seedStorySixOneData() {
  const actorId = await getHeadquartersUserId();

  await prisma.employee.create({
    data: {
      id: STORY_EMPLOYEE_ID,
      name: "정상 연결 직원",
      hireDate: new Date(Date.UTC(2025, 0, 1)),
    },
  });

  await prisma.product.create({
    data: {
      id: PRODUCT_IDS.fish,
      name: "스토리5-5 광어",
      category: "선어",
      spec: "1kg",
      defaultUnitPrice: 10000,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInputCode.create({
    data: {
      id: LOSS_CODE_IDS.waste,
      group: "LOSS_TYPE",
      name: "스토리5-5 폐기",
      displayOrder: 955,
      updatedById: actorId,
    },
  });

  await prisma.store.createMany({
    data: [
      {
        id: STORE_IDS.empty,
        name: "스토리6-1 미입력점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.closed,
        name: "스토리6-1 정정마감점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.holiday,
        name: "스토리6-1 휴무점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.inProgress,
        name: "스토리6-2 입력중점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.tieGa,
        name: "가 동률점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.tieNa,
        name: "나 동률점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.zeroSales,
        name: "0원 매출점",
        isActive: true,
        updatedById: actorId,
      },
    ],
  });

  const closedLedger = await seedLedger({
    actorId,
    storeId: STORE_IDS.closed,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 300000,
    cashAmount: 100000,
    cardAmount: 190000,
    otherPaymentAmount: 10000,
    workerCount: 4,
  });
  await seedLedger({
    actorId,
    storeId: STORE_IDS.closed,
    closingDate: HISTORICAL_REPORT_DATE,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 777000,
    cashAmount: 777000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
  });
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: closedLedger.id,
      productId: PRODUCT_IDS.fish,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 10000,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 12,
      quantity: 12,
      inventoryAmount: 120000,
      isModified: true,
      carryoverSource: "MANUAL",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: closedLedger.id,
      ledgerInventoryItemId: inventoryItem.id,
      productId: PRODUCT_IDS.fish,
      sourceType: "PURCHASE",
      unitPrice: 10000,
      originalQuantity: 15,
      consumedQuantity: 3,
      remainingQuantity: 12,
      originalAmount: 150000,
      consumedAmount: 30000,
      remainingAmount: 120000,
      sortOrder: 1,
      sourceBusinessDate: closedLedger.closingDate,
    },
  });
  await prisma.ledgerInventoryAdjustment.create({
    data: {
      dailyLedgerId: closedLedger.id,
      productId: PRODUCT_IDS.fish,
      ledgerInventoryItemId: inventoryItem.id,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 10000,
      beforeQuantity: 14,
      beforeAmount: 140000,
      afterQuantity: 12,
      afterAmount: 120000,
      differenceQuantity: -2,
      differenceAmount: -20000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: closedLedger.id,
      productId: PRODUCT_IDS.fish,
      ledgerInputCodeId: LOSS_CODE_IDS.waste,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 10000,
      lossTypeName: "스토리5-5 폐기",
      quantity: 1,
      amount: 10000,
      usedPlannedPrice: false,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: closedLedger.id,
      productId: PRODUCT_IDS.fish,
      ledgerInputCodeId: LOSS_CODE_IDS.waste,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 10000,
      lossTypeName: "스토리5-5 폐기",
      quantity: 2,
      amount: 20000,
      usedPlannedPrice: true,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  const holidayLedger = await seedLedger({
    actorId,
    storeId: STORE_IDS.holiday,
    status: "HOLIDAY",
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: null,
  });
  await seedLedger({
    actorId,
    storeId: STORE_IDS.holiday,
    closingDate: getPreviousKstMidnight(),
    status: "HOLIDAY",
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: null,
  });
  const inProgressLedger = await seedLedger({
    actorId,
    storeId: STORE_IDS.inProgress,
    status: "IN_PROGRESS",
    totalSalesAmount: 150000,
    cashAmount: 50000,
    cardAmount: 100000,
    otherPaymentAmount: 0,
    workerCount: 2,
  });
  await seedLedger({
    actorId,
    storeId: STORE_IDS.inProgress,
    closingDate: getPreviousKstMidnight(),
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
  });
  for (const fixture of [
    { storeId: STORE_IDS.tieGa, sales: 45000 },
    { storeId: STORE_IDS.tieNa, sales: 45000 },
    { storeId: STORE_IDS.zeroSales, sales: 0 },
  ]) {
    await seedLedger({
      actorId,
      storeId: fixture.storeId,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: fixture.sales,
      cashAmount: fixture.sales,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 0,
    });
    const previousLedger = await seedLedger({
      actorId,
      storeId: fixture.storeId,
      closingDate: getPreviousKstMidnight(),
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 100000,
      cashAmount: 100000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 0,
    });
    if (fixture.storeId === STORE_IDS.tieGa) {
      await createCorrectionRecord({
        dailyLedgerId: previousLedger.id,
        targetType: "PAYMENT_FIELD",
        targetId: previousLedger.id,
        fieldKey: "totalSalesAmount",
        label: "총매출",
        originalValue: previousLedger.totalSalesAmount,
        correctedValue: 30000,
        reason: STORY_MARKER,
      });
    }
  }
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: inProgressLedger.id,
      productId: PRODUCT_IDS.fish,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 10000,
      previousQuantity: 1,
      purchasedQuantity: 0,
      currentQuantity: 1,
      quantity: 1,
      inventoryAmount: null,
      isModified: true,
      carryoverSource: "MANUAL",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLaborItem.createMany({
    data: [
      {
        dailyLedgerId: closedLedger.id,
        employeeId: STORY_EMPLOYEE_ID,
        workerName: "정상 연결 직원",
        amount: 987654321,
        createdById: actorId,
        updatedById: actorId,
      },
      {
        dailyLedgerId: closedLedger.id,
        workerName: "복합 미연결 직원",
        amount: 876543219,
        lateMemo: "10분 지각",
        earlyLeaveMemo: "병원 방문",
        specialMemo: "인수인계 필요",
        createdById: actorId,
        updatedById: actorId,
      },
    ],
  });
  await createCorrectionRecord({
    dailyLedgerId: holidayLedger.id,
    targetType: "CALCULATED_METRIC",
    targetId: holidayLedger.id,
    fieldKey: "salesDifference",
    label: "매출 차이",
    originalValue: null,
    correctedValue: "정정 확인",
    reason: STORY_MARKER,
  });
  await createCorrectionRecord({
    dailyLedgerId: closedLedger.id,
    targetType: "PAYMENT_FIELD",
    targetId: closedLedger.id,
    fieldKey: "totalSalesAmount",
    label: "총매출",
    originalValue: closedLedger.totalSalesAmount,
    correctedValue: 45000,
    reason: STORY_MARKER,
  });
  await createCorrectionRecord({
    dailyLedgerId: closedLedger.id,
    targetType: "LEDGER_FIELD",
    targetId: closedLedger.id,
    fieldKey: "workerCount",
    label: "근무자 수",
    originalValue: closedLedger.workerCount,
    correctedValue: 3,
    correctedValueKind: "quantity",
    reason: STORY_MARKER,
  });
}

export async function seedDailyChartAndRankingFixtures() {
  const actorId = await getHeadquartersUserId();

  await prisma.product.create({
    data: {
      id: PRODUCT_IDS.margin,
      name: "마진 경계 품목",
      category: "선어",
      spec: "1개",
      defaultUnitPrice: 700000,
      updatedById: actorId,
    },
  });
  await prisma.product.createMany({
    data: PRODUCT_RANKING_IDS.map((id, index) => ({
      id,
      name: `검색전용품목${String(index + 1).padStart(2, "0")}`,
      category: index % 2 === 0 ? "냉동" : "생물",
      spec: `숨은규격${String(index + 1).padStart(2, "0")}`,
      defaultUnitPrice: 1000,
      updatedById: actorId,
    })),
  });
  await prisma.store.createMany({
    data: [
      {
        id: STORE_IDS.marginDefault,
        name: "경계 기본점",
        isActive: true,
        reportMarginGapThresholdBps: 500,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.marginDestructive,
        name: "경계 경고점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.marginMissing,
        name: "경계 예상없음점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.marginSortHighSales,
        name: "고매출 저마진점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.productRanking,
        name: "품목 순위점",
        isActive: true,
        updatedById: actorId,
      },
    ],
  });

  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginDefault,
    plannedUnitPrice: 933457,
  });
  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginDestructive,
    plannedUnitPrice: 933333,
  });
  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginMissing,
    plannedUnitPrice: null,
  });
  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginSortHighSales,
    plannedUnitPrice: 2_000_000,
    totalSalesAmount: 2_000_000,
    costAmount: 1_800_000,
  });
  await seedProductRankingFixture(actorId);
}

export async function seedEqualInventoryRatioFixture() {
  const actorId = await getHeadquartersUserId();
  await prisma.store.create({
    data: {
      id: STORE_IDS.inventoryEqual,
      name: "재고동일점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const ledger = await seedLedger({
    actorId,
    storeId: STORE_IDS.inventoryEqual,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 45000,
    cashAmount: 45000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
  });
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: PRODUCT_IDS.fish,
      productName: "스토리5-5 광어",
      productCategory: "선어",
      productSpec: "1kg",
      unitPrice: 45000,
      previousQuantity: 1,
      purchasedQuantity: 0,
      currentQuantity: 1,
      quantity: 1,
      inventoryAmount: 45000,
      isModified: true,
      carryoverSource: "MANUAL",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInventoryItemId: inventoryItem.id,
      productId: PRODUCT_IDS.fish,
      sourceType: "PURCHASE",
      unitPrice: 45000,
      originalQuantity: 1,
      consumedQuantity: 0,
      remainingQuantity: 1,
      originalAmount: 45000,
      consumedAmount: 0,
      remainingAmount: 45000,
      sortOrder: 1,
      sourceBusinessDate: ledger.closingDate,
    },
  });
}

async function seedMarginFixture(input: {
  actorId: string;
  storeId: string;
  plannedUnitPrice: number | null;
  totalSalesAmount?: number;
  costAmount?: number;
}) {
  const totalSalesAmount = input.totalSalesAmount ?? 1_000_001;
  const costAmount = input.costAmount ?? 700_000;
  const ledger = await seedLedger({
    actorId: input.actorId,
    storeId: input.storeId,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount,
    cashAmount: totalSalesAmount,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
  });
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: PRODUCT_IDS.margin,
      productName: "마진 경계 품목",
      productCategory: "선어",
      productSpec: "1개",
      unitPrice: costAmount,
      previousQuantity: 1,
      purchasedQuantity: 0,
      currentQuantity: 0,
      quantity: 0,
      inventoryAmount: 0,
      isModified: true,
      carryoverSource: "MANUAL",
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInventoryItemId: inventoryItem.id,
      productId: PRODUCT_IDS.margin,
      sourceType: "PURCHASE",
      unitPrice: costAmount,
      originalQuantity: 1,
      consumedQuantity: 1,
      remainingQuantity: 0,
      originalAmount: costAmount,
      consumedAmount: costAmount,
      remainingAmount: 0,
      sortOrder: 1,
      sourceBusinessDate: ledger.closingDate,
    },
  });

  if (input.plannedUnitPrice !== null) {
    await prisma.storeSalesPricePlan.create({
      data: {
        storeId: input.storeId,
        businessDate: ledger.closingDate,
        productId: PRODUCT_IDS.margin,
        plannedUnitPrice: input.plannedUnitPrice,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }
}

async function seedProductRankingFixture(actorId: string) {
  const ledger = await seedLedger({
    actorId,
    storeId: STORE_IDS.productRanking,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 100000,
    cashAmount: 100000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
  });

  await prisma.ledgerInventoryItem.createMany({
    data: PRODUCT_RANKING_IDS.map((productId, index) => {
      const rank = index + 1;
      const soldQuantity = 13 - rank;
      return {
        dailyLedgerId: ledger.id,
        productId,
        productName: `검색전용품목${String(rank).padStart(2, "0")}`,
        productCategory: index % 2 === 0 ? "냉동" : "생물",
        productSpec: `숨은규격${String(rank).padStart(2, "0")}`,
        unitPrice: 1000,
        previousQuantity: soldQuantity,
        purchasedQuantity: 0,
        currentQuantity: 0,
        quantity: 0,
        inventoryAmount: 0,
        isModified: true,
        carryoverSource: "MANUAL" as const,
        createdById: actorId,
        updatedById: actorId,
      };
    }),
  });
}

async function seedLedger(data: {
  actorId: string;
  storeId: string;
  closingDate?: Date;
  status: DailyLedgerStatus;
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
}) {
  return prisma.dailyLedger.create({
    data: {
      storeId: data.storeId,
      closingDate: data.closingDate ?? getTodayKstMidnight(),
      status: data.status,
      totalSalesAmount: data.totalSalesAmount,
      cashAmount: data.cashAmount,
      cardAmount: data.cardAmount,
      otherPaymentAmount: data.otherPaymentAmount,
      workerCount: data.workerCount,
      workMemo: STORY_MARKER,
      createdById: data.actorId,
      updatedById: data.actorId,
    },
  });
}

async function createCorrectionRecord(input: {
  dailyLedgerId: string;
  targetType: "PAYMENT_FIELD" | "CALCULATED_METRIC" | "LEDGER_FIELD";
  targetId: string;
  fieldKey: string;
  label: string;
  originalValue: number | null;
  correctedValue: number | string;
  correctedValueKind?: "money" | "quantity" | "metric";
  reason: string;
}) {
  const actorId = await getHeadquartersUserId();
  const originalValue = {
    kind: typeof input.originalValue === "number" ? "money" : "metric",
    value: input.originalValue,
    label: input.label,
  };
  const correctedValue = {
    kind:
      input.correctedValueKind ??
      (typeof input.correctedValue === "number" ? "money" : "metric"),
    value: input.correctedValue,
    label: input.label,
  };

  return prisma.correctionRecord.create({
    data: {
      dailyLedgerId: input.dailyLedgerId,
      targetType: input.targetType,
      targetId: input.targetId,
      fieldKey: input.fieldKey,
      originalValue,
      previousAppliedValue: originalValue,
      correctedValue,
      reason: input.reason,
      createdById: actorId,
    },
  });
}

async function cleanupStoreFixtures(
  storeIds: readonly string[],
  productIds: readonly string[],
) {
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: { in: [...storeIds] } },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    const correctionRecords = await prisma.correctionRecord.findMany({
      where: { dailyLedgerId: { in: ledgerIds } },
      select: { id: true },
    });
    const correctionRecordIds = correctionRecords.map((record) => record.id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetType: "DailyLedger", targetId: { in: ledgerIds } },
          {
            targetType: "CorrectionRecord",
            targetId: { in: correctionRecordIds },
          },
          { targetType: "ReportExport" },
        ],
      },
    });
    await prisma.correctionRecord.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLossItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryAdjustment.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerPurchaseItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerExpense.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  await prisma.storeSalesPricePlan.deleteMany({
    where: { storeId: { in: [...storeIds] } },
  });
  await prisma.store.deleteMany({
    where: { id: { in: [...storeIds] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [...productIds] } },
  });
}

export async function cleanupDailyChartAndRankingFixtures() {
  await cleanupStoreFixtures(DAILY_CHART_STORE_IDS, DAILY_CHART_PRODUCT_IDS);
}

async function cleanupStorySixOneData() {
  await cleanupStoreFixtures(STORY_STORE_IDS, STORY_PRODUCT_IDS);
  await prisma.employee.deleteMany({ where: { id: STORY_EMPLOYEE_ID } });
  await prisma.ledgerInputCode.deleteMany({
    where: { id: { in: STORY_LOSS_CODE_IDS } },
  });
}

export function getDesktopRow(page: Page, storeId: string) {
  return page.locator(`[data-testid="hq-report-row-${storeId}"]`);
}

export function getStoreSelect(page: Page) {
  return page.getByRole("combobox", { name: "지점" });
}
