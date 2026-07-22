import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_IDS = {
  empty: "store-story-6-1-empty",
  closed: "store-story-6-1-closed",
  holiday: "store-story-6-1-holiday",
  inProgress: "store-story-6-2-in-progress",
  tieGa: "store-story-6-1-tie-ga",
  tieNa: "store-story-6-1-tie-na",
  zeroSales: "store-story-6-1-zero-sales",
  marginDefault: "store-report-margin-default",
  marginDestructive: "store-report-margin-destructive",
  marginMissing: "store-report-margin-missing",
  productRanking: "store-report-product-ranking",
} as const;
const STORY_STORE_IDS = Object.values(STORE_IDS);
const DAILY_CHART_STORE_IDS = [
  STORE_IDS.marginDefault,
  STORE_IDS.marginDestructive,
  STORE_IDS.marginMissing,
  STORE_IDS.productRanking,
];
const PRODUCT_IDS = {
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
const STORY_EMPLOYEE_ID = "employee-story-6-1";
const HISTORICAL_REPORT_DATE = new Date(Date.UTC(2026, 4, 31));
const THIRTY_PERCENT_EXPORT_PATTERN =
  /30[%_-]?단가|thirty[_-]?percent|thirty[_-]?percent[_-]?unit[_-]?price|price[_-]?30|margin[_-]?30/i;

test.beforeEach(async () => {
  await cleanupStorySixOneData();
  await seedStorySixOneData();
});

test.afterAll(async () => {
  await cleanupStorySixOneData();
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function fetchCsvFromVisibleLink(
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

function getTodayKstMidnight(inputDate = new Date()) {
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

function getTodayKstInput() {
  return getTodayKstMidnight().toISOString().slice(0, 10);
}

function getPreviousKstMidnight() {
  const date = getTodayKstMidnight();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function getCurrentMonthInput() {
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

async function seedDailyChartAndRankingFixtures() {
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
        reportMarginGapThresholdBps: 100,
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
    plannedUnitPrice: 979158,
  });
  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginDestructive,
    plannedUnitPrice: 979020,
  });
  await seedMarginFixture({
    actorId,
    storeId: STORE_IDS.marginMissing,
    plannedUnitPrice: null,
  });
  await seedProductRankingFixture(actorId);
}

async function seedMarginFixture(input: {
  actorId: string;
  storeId: string;
  plannedUnitPrice: number | null;
}) {
  const ledger = await seedLedger({
    actorId: input.actorId,
    storeId: input.storeId,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 1000001,
    cashAmount: 1000001,
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
      unitPrice: 700000,
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
      unitPrice: 700000,
      originalQuantity: 1,
      consumedQuantity: 1,
      remainingQuantity: 0,
      originalAmount: 700000,
      consumedAmount: 700000,
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

async function cleanupDailyChartAndRankingFixtures() {
  await cleanupStoreFixtures(DAILY_CHART_STORE_IDS, DAILY_CHART_PRODUCT_IDS);
}

async function cleanupStorySixOneData() {
  await cleanupStoreFixtures(STORY_STORE_IDS, STORY_PRODUCT_IDS);
  await prisma.employee.deleteMany({ where: { id: STORY_EMPLOYEE_ID } });
  await prisma.ledgerInputCode.deleteMany({
    where: { id: { in: STORY_LOSS_CODE_IDS } },
  });
}

function getDesktopRow(page: Page, storeId: string) {
  return page.locator(`[data-testid="hq-report-row-${storeId}"]`);
}

function getStoreSelect(page: Page) {
  return page.getByRole("combobox", { name: "지점" });
}

test("본사는 리포트에 들어와 통합 리포트를 열고 차트와 같은 표를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  const reportsLink = page.getByRole("link", { name: "리포트" });
  await expect(reportsLink).toHaveAttribute("href", "/app/reports/daily");

  // 리포트 진입점은 매일 쓰는 아침 회의 리포트로 연다.
  await page.goto("/app/reports/daily");
  await expect(page).toHaveURL(/\/app\/reports\/daily/);
  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();

  // 통합 리포트는 상단 리포트 메뉴에서 한 번에 이동한다.
  await page.getByRole("link", { name: "통합 리포트" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/overview/);
  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(page.getByText("영업 매출 합계").first()).toBeVisible();
  await expect(page.getByText("손실 유형").first()).toBeVisible();
  await expect(page.getByText("월 손익 흐름").first()).toBeVisible();
  await expect(page.getByText(/오늘 기준/)).toBeVisible();

  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /상세/ }).first()).toBeVisible();
});

test("본사는 인건비 현황에서 미연결 근무자와 지점 합계를 읽기 전용으로 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily");

  const laborLink = page.getByRole("link", { name: "인건비", exact: true });
  await expect(laborLink).toHaveAttribute("href", "/app/reports/labor");

  await page.goto(
    `/app/reports/labor?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "인건비 현황" }),
  ).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(page.getByText("정상 연결 직원", { exact: true })).toBeVisible();
  await expect(
    page.getByText("복합 미연결 직원", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10분 지각", { exact: true })).toBeVisible();
  await expect(page.getByText("병원 방문", { exact: true })).toBeVisible();
  await expect(page.getByText("인수인계 필요", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("row", { name: /정상 연결 직원/ })
      .getByText("본사 마감", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("조회기간 인건비 합계").locator(".."),
  ).toContainText("1,864,197,540");
  await expect(page.getByText("근무 기록 수").locator("..")).toContainText(
    "2건",
  );
  await expect(page.getByRole("button", { name: /수정|삭제/ })).toHaveCount(0);
});

test("지정 지점 본사는 인건비에서 권한 밖 지점 URL을 빈 결과로 본다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await page.goto(
    `/app/reports/labor?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "인건비 현황" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요.",
    ),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue("");
  await expect(
    page.getByText("조회기간 인건비 합계").locator(".."),
  ).toContainText("₩0");
  await expect(page.getByText("근무 기록 수").locator("..")).toContainText(
    "0건",
  );
  await expect(page.getByRole("heading", { name: "지점 요약" })).toBeVisible();
  await expect(
    page.getByText("선택한 조건에 근무자별 상세 기록이 없습니다."),
  ).toBeVisible();
  await expect(page.getByText("복합 미연결 직원")).toHaveCount(0);
});

test("통합 리포트 월 지점 필터는 URL과 모든 표에 유지된다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/overview?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));

  await page.getByRole("button", { name: "표 보기" }).click();
  expect(await page.getByRole("table").count()).toBeGreaterThanOrEqual(5);
  await expect(
    page.getByRole("table").getByText("스토리6-1 정정마감점").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("스토리6-2 입력중점"),
  ).toHaveCount(0);
});

test("통합 리포트는 정정과 손실 계산 기준 누락을 0으로 숨기지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/overview?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByText(/45,000/).first()).toBeVisible();
  await expect(page.getByText(/계산 가능 1\/2건/).first()).toBeVisible();
  await expect(page.getByText(/판매한 가격 기준/).first()).toBeVisible();
  await expect(page.getByText(/^미입력 \d+건$/)).toBeVisible();
});

test("통합 리포트는 조회와 export 권한을 분리한다", async ({ page }) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/reports/overview");

  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Excel/ })).toHaveCount(0);
});

test("지정 지점 본사는 통합 리포트에서 배정 지점만 본다", async ({ page }) => {
  await login(page, "hq-assigned@example.com");
  await page.goto("/app/reports/overview");

  const options = await page
    .locator('select[name="storeId"] option')
    .allTextContents();
  expect(options).toContain("서초점");
  expect(options).not.toContain("스토리6-1 정정마감점");
  expect(options).not.toContain("스토리6-2 입력중점");
});

test("지점장은 통합 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/overview");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("통합 리포트는 좁은 화면에서 가로 넘침 없이 키보드로 표를 전환한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto("/app/reports/overview");

  await page.getByRole("button", { name: "표 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table").first()).toBeVisible();

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 일별 아침 회의 리포트에서 지점별 상태와 정정 반영 숫자를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  // 냉동/생물 매출 차트 카드는 일별 리포트에서 제거됐다.
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("품목별 POS 매출이 없어 재고 흐름 기반 추정값입니다."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "지점별 영업 매출·이익률" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마진율순", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "매출액순", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("columnheader", { name: "판매수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘" })).toBeVisible();
  await expect(page.getByRole("link", { name: "어제" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Excel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /CSV/ })).toBeVisible();
  await expect(page.getByLabel("조회 날짜")).toHaveValue(getTodayKstInput());
  await expect(
    page.getByRole("columnheader", { name: "최신 반영" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "상태 메시지" }),
  ).toBeVisible();

  const expectedSectionOrder = [
    "지점별 영업 매출·이익률",
    "매출 분석",
    "직원 근태 현황",
    "품목별 판매 현황",
    "마감·이상 신호 현황",
  ];
  const sectionHeadings = await page.locator("h2").allTextContents();
  expect(
    expectedSectionOrder.map((heading) => sectionHeadings.indexOf(heading)),
  ).toEqual([...expectedSectionOrder.keys()]);

  const salesAnalysisSection = page
    .getByRole("heading", { name: "매출 분석", exact: true })
    .locator("..");
  const salesChangeCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "전일 대비 매출액 증감률" });
  await expect(
    salesChangeCard.getByLabel("지점별 전일 대비 매출액 증감률 차트"),
  ).toBeVisible();
  await expect(salesChangeCard).toContainText("+50% 증가");
  await expect(salesChangeCard).toContainText("15,000원");
  await expect(salesChangeCard).not.toContainText("선택일 매출");
  await expect(salesChangeCard).not.toContainText("전일 매출액");

  const inventoryCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "재고비율" });
  await expect(
    inventoryCard.getByLabel("지점별 매출 대비 재고 편차율 차트"),
  ).toBeVisible();
  const inventoryRatioRow = inventoryCard
    .getByRole("table", { name: "지점별 매출 대비 재고 편차 데이터" })
    .getByRole("row")
    .filter({ hasText: "스토리6-1 정정마감점" });
  await expect(inventoryRatioRow).toContainText("₩120,000");
  await expect(inventoryRatioRow).toContainText("+166.7%");
  await expect(inventoryCard).toContainText("+166.7% (75,000원)");
  await expect(salesChangeCard).toContainText("전일 매출 0원");
  const incompleteInventoryRow = inventoryCard
    .getByRole("table", { name: "지점별 매출 대비 재고 편차 데이터" })
    .getByRole("row")
    .filter({ hasText: "스토리6-2 입력중점" });
  await expect(incompleteInventoryRow).toContainText("저장 FIFO 재고금액 누락");

  const positionCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "매장 매출 포지션" });
  await expect(
    positionCard.getByLabel("지점별 선택일 매출 비중 도넛 차트"),
  ).toBeVisible();
  await expect(positionCard).toContainText("가 동률점");
  await expect(positionCard).toContainText("나 동률점");
  await expect(positionCard).toContainText("스토리6-1 정정마감점");
  await expect(positionCard).toContainText(/\d+(?:\.\d+)?% \([\d,]+원\)/);
  await expect(positionCard).not.toContainText("전체 평균 대비");
  await expect(positionCard).toContainText(
    "스토리6-1 미입력점: 선택일 장부 미입력",
  );
  await expect(positionCard).toContainText("스토리6-1 휴무점: 선택일 휴무");

  const attendanceSection = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  await expect(attendanceSection).toContainText("복합 미연결 직원");
  await expect(attendanceSection).toContainText("지각");
  await expect(attendanceSection).toContainText("조퇴");
  await expect(attendanceSection).toContainText("특이사항");
  await expect(attendanceSection).toContainText("직원 미연결");
  await expect(attendanceSection).not.toContainText("정상 연결 직원");
  await expect(attendanceSection).not.toContainText("명단 미입력 1명");
  await expect(attendanceSection).not.toContainText("근태 미입력");
  const attendanceText = await attendanceSection.innerText();
  const attendanceDigits = attendanceText.replace(/\D/g, "");
  expect(attendanceDigits).not.toContain("987654321");
  expect(attendanceDigits).not.toContain("876543219");
  expect(attendanceText).not.toContain(STORY_EMPLOYEE_ID);

  const emptyRow = getDesktopRow(page, STORE_IDS.empty);
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");
  await expect(emptyRow).toContainText("반영 전");
  await expect(emptyRow).toContainText("미제출");
  await expect(emptyRow).toContainText("입력 전");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("본사 마감");
  await expect(closedRow).toContainText(
    /회의 반영 완료|지연 제출|확인 필요 - 기준값 설정 전/,
  );
  await expect(closedRow).toContainText("₩45,000");
  await expect(
    closedRow.getByRole("link", { name: "상세 보기" }),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  const holidayRow = getDesktopRow(page, STORE_IDS.holiday);
  await expect(holidayRow).toContainText("스토리6-1 휴무점");
  await expect(holidayRow).toContainText("휴무");
  await expect(holidayRow).toContainText("휴무일");
  await expect(holidayRow).toContainText("정정 확인 필요");
});

test("지정 지점 본사는 일별 매출 분석과 근태에서 권한 밖 지점을 보지 않는다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "매출 분석", exact: true }),
  ).toBeVisible();
  const assignedSalesAnalysis = page
    .getByRole("heading", { name: "매출 분석", exact: true })
    .locator("..");
  const assignedAttendance = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  await expect(assignedSalesAnalysis).toContainText("서초점");
  await expect(assignedAttendance).toContainText(
    "선택일에 지각·조퇴·특이사항이 없습니다.",
  );
  for (const hiddenText of [
    "스토리6-1 정정마감점",
    "스토리6-1 미입력점",
    "스토리6-1 휴무점",
    "정상 연결 직원",
    "복합 미연결 직원",
    "10분 지각",
    "가 동률점",
    "나 동률점",
    "0원 매출점",
  ]) {
    await expect(page.getByText(hiddenText, { exact: false })).toHaveCount(0);
  }
});

test.describe("일별 차트와 품목 순위 전용 데이터", () => {
  test.beforeEach(async () => {
    await seedDailyChartAndRankingFixtures();
  });

  test.afterEach(async () => {
    await cleanupDailyChartAndRankingFixtures();
  });

  test("아침 회의 지점별 장부 매출 차트는 지점별 기준값과 정확한 1.5%p 경계를 표시한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "hq@example.com");
    await page.goto("/app/reports/daily?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "지점별 영업 매출·이익률" });
    const salesSort = section.getByRole("button", {
      name: "매출액순",
      exact: true,
    });
    const marginSort = section.getByRole("button", {
      name: "마진율순",
      exact: true,
    });
    await expect(salesSort).toHaveAttribute("aria-pressed", "true");
    await expect(marginSort).toHaveAttribute("aria-pressed", "false");

    const bars = section.locator('[data-testid^="store-performance-bar-"]');
    await expect(
      section.getByTestId(`store-performance-bar-${STORE_IDS.marginDefault}`),
    ).toBeAttached();
    const scroller = section.getByTestId("store-performance-chart-scroll");
    await expect(scroller).toBeVisible();
    expect(
      await scroller.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);

    const closedBar = section.getByTestId(
      `store-performance-bar-${STORE_IDS.marginDefault}`,
    );
    expect((await closedBar.boundingBox())?.width ?? 0).toBeGreaterThan(80);

    const accessibleTable = section.getByRole("table", {
      name: "지점별 매출 구성과 마진 데이터",
    });
    const defaultMarginRow = accessibleTable
      .locator("tbody tr")
      .filter({ hasText: "경계 기본점" });
    await expect(defaultMarginRow).toContainText("경계 기본점");
    await expect(defaultMarginRow).toContainText("₩100만");
    await expect(defaultMarginRow).toContainText("30%");
    await expect(defaultMarginRow).toContainText("28.51%");
    await expect(defaultMarginRow).toContainText("1%p 이상");

    const missingMarginRow = accessibleTable
      .locator("tbody tr")
      .filter({ hasText: "경계 예상없음점" });
    await expect(missingMarginRow).toContainText("경계 예상없음점");
    await expect(missingMarginRow).toContainText("₩100만");
    await expect(missingMarginRow).toContainText("30%");
    await expect(missingMarginRow).toContainText("데이터 부족");
    await expect(missingMarginRow).toContainText("판정 불가");

    const salesOrder = await bars.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    );
    expect(
      salesOrder.indexOf(`store-performance-bar-${STORE_IDS.marginDefault}`),
    ).toBeLessThan(
      salesOrder.indexOf(`store-performance-bar-${STORE_IDS.closed}`),
    );
    expect(salesOrder).not.toContain(
      `store-performance-bar-${STORE_IDS.empty}`,
    );

    await section
      .getByTestId(`store-performance-bar-${STORE_IDS.marginDefault}`)
      .hover();
    await expect(section.locator(".recharts-tooltip-wrapper")).toContainText(
      /영업 합계 ₩100만[\s\S]*실제 30% \(예상 28\.51%\)[\s\S]*마진 차이 1%p 이상/,
    );

    await section
      .getByTestId(`store-performance-bar-${STORE_IDS.marginDestructive}`)
      .hover();
    await expect(section.locator(".recharts-tooltip-wrapper")).toContainText(
      /영업 합계 ₩100만[\s\S]*실제 30% \(예상 28\.50%\)[\s\S]*마진 차이 1\.5%p 이상/,
    );

    await marginSort.click();
    await expect(salesSort).toHaveAttribute("aria-pressed", "false");
    await expect(marginSort).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const marginOrder = await bars.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-testid")),
        );
        const closedIndex = marginOrder.indexOf(
          `store-performance-bar-${STORE_IDS.closed}`,
        );
        const defaultIndex = marginOrder.indexOf(
          `store-performance-bar-${STORE_IDS.marginDefault}`,
        );
        return (
          closedIndex >= 0 && defaultIndex >= 0 && closedIndex < defaultIndex
        );
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const marginOrder = await bars.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-testid")),
        );
        const unavailableIndex = marginOrder.indexOf(
          `store-performance-bar-${STORE_IDS.tieGa}`,
        );
        const availableIndex = marginOrder.indexOf(
          `store-performance-bar-${STORE_IDS.marginDefault}`,
        );
        return availableIndex >= 0 && availableIndex < unavailableIndex;
      })
      .toBe(true);

    await section
      .getByTestId(`store-performance-bar-${STORE_IDS.tieGa}`)
      .hover();
    await expect(section.locator(".recharts-tooltip-wrapper")).toContainText(
      /영업 합계 ₩5만[\s\S]*실제 데이터 부족 \(예상 데이터 부족\)/,
    );

    await expect(section.getByText(/실제 30% \(예상 28\.51%\)/)).toBeVisible();
    await expect(
      section.getByText("마진 차이 1%p 이상", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText("마진 차이 1.5%p 이상", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText(/실제 30% \(예상 데이터 부족\)/),
    ).toBeVisible();
    await expect(
      section.getByTestId(`store-performance-bar-${STORE_IDS.marginDefault}`),
    ).toHaveAttribute("fill", "var(--destructive)");
    await expect(
      section.getByTestId(
        `store-performance-bar-${STORE_IDS.marginDestructive}`,
      ),
    ).toHaveAttribute("fill", "var(--destructive)");
    await expect(
      section.getByTestId(`store-performance-bar-${STORE_IDS.marginMissing}`),
    ).toHaveAttribute("fill", "var(--chart-1)");
  });

  test("일별 품목별 판매 현황은 판매수량 상위 10개와 이름·규격 검색을 제공한다", async ({
    page,
  }) => {
    await login(page, "hq@example.com");
    await page.goto("/app/reports/daily?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "품목별 판매 현황" });
    await expect(
      section.getByLabel("품목별 판매수량 상위 10개 세로 막대 차트"),
    ).toBeVisible();
    await expect(
      section.locator('[data-testid^="daily-product-sales-bar-"]'),
    ).toHaveCount(10);
    await expect(
      section.getByText("검색전용품목01 · 숨은규격01", { exact: true }),
    ).toBeVisible();
    await expect(section.getByText("판매수량 상위 10개")).toBeVisible();
    for (const summaryLabel of [
      "추정 판매액 합계",
      "추정 매출이익 합계",
      "당일 추정 이익률",
      "품목 수",
    ]) {
      await expect(
        section.getByText(summaryLabel, { exact: true }),
      ).toHaveCount(0);
    }

    await expect(section.getByRole("columnheader")).toHaveText([
      "품목",
      "규격",
      "판매수량",
    ]);
    for (const removedHeader of [
      "분류",
      "추정 판매액",
      "추정 원가",
      "추정 마진",
      "추정 이익률",
      "상태",
    ]) {
      await expect(
        section.getByRole("columnheader", { name: removedHeader, exact: true }),
      ).toHaveCount(0);
    }

    const rows = section.locator("tbody tr");
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("검색전용품목01");
    await expect(rows.last()).toContainText("검색전용품목10");
    await expect(section.getByText("검색전용품목11")).toHaveCount(0);

    const search = section.getByLabel("품목 검색");
    await expect(search).toHaveAttribute("type", "search");
    await expect(search).toHaveAttribute(
      "placeholder",
      "품목명 또는 규격 검색",
    );
    await search.fill("검색전용품목11");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("검색전용품목11");

    await search.fill("");
    await expect(rows).toHaveCount(10);
    await search.fill("숨은규격12");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("검색전용품목12");
    await search.fill("없는 품목");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator("td")).toHaveCount(1);
    await expect(rows.first().locator("td")).toHaveAttribute("colspan", "3");
    await expect(rows.first()).toHaveText("검색 결과가 없습니다.");

    await expect(section).toContainText(
      "판매수량 = 전일재고 + 당일매입 − 손실수량 − 당일재고. POS 실제 판매 데이터가 아닌 재고 흐름 기반 추정값입니다.",
    );
  });
});

test("본사는 선택한 특정 일자의 리포트를 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=2026-05-31");

  await expect(page.getByLabel("조회 날짜")).toHaveValue("2026-05-31");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("₩777,000");
  await expect(closedRow).not.toContainText("₩45,000");
});

test("본사는 리포트 숫자 근거에서 원본과 정정 반영값을 확인하고 정정 타임라인으로 이동한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await closedRow.getByText("근거 보기").first().click();

  await expect(closedRow).toContainText("원본");
  await expect(closedRow).toContainText("₩300,000");
  await expect(closedRow).toContainText("정정 반영");
  await expect(closedRow).toContainText("₩45,000");
  await expect(closedRow).toContainText("계산 불가 사유");

  const timelineLink = closedRow.getByRole("link", { name: "정정 타임라인" });
  await expect(timelineLink).toHaveAttribute(
    "href",
    /\/app\/ledgers\/.+#correction-timeline/,
  );

  await timelineLink.click();
  await expect(page).toHaveURL(/#correction-timeline$/);
  await expect(page.getByRole("heading", { name: "정정 기록" })).toBeVisible();
});

test("본사는 리포트 숫자 근거에서 미입력과 휴무 상태를 구분해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  const emptyRow = getDesktopRow(page, STORE_IDS.empty);
  await emptyRow.getByText("근거 보기").first().click();
  await expect(emptyRow).toContainText("미입력");
  await expect(emptyRow).toContainText("계산 불가 사유");

  const holidayRow = getDesktopRow(page, STORE_IDS.holiday);
  await holidayRow.getByText("근거 보기").first().click();
  await expect(holidayRow).toContainText("휴무");
  await expect(holidayRow).toContainText("원본");
});

test("본사는 좁은 화면에서도 일별 아침 회의 리포트 핵심 상태를 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  const expectedSectionOrder = [
    "지점별 영업 매출·이익률",
    "매출 분석",
    "직원 근태 현황",
    "품목별 판매 현황",
    "마감·이상 신호 현황",
  ];
  const sectionHeadings = await page.locator("h2").allTextContents();
  expect(
    expectedSectionOrder.map((heading) => sectionHeadings.indexOf(heading)),
  ).toEqual([...expectedSectionOrder.keys()]);

  const attendanceSection = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  const attendanceCards = attendanceSection.locator("div.md\\:hidden");
  await expect(attendanceCards.getByText("복합 미연결 직원")).toBeVisible();
  await expect(attendanceCards.getByText("정상 연결 직원")).toHaveCount(0);
  await expect(attendanceCards.getByText("명단 미입력 1명")).toHaveCount(0);

  const emptyCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.empty}"]`,
  );
  await expect(emptyCard).toBeVisible();
  await expect(emptyCard).toContainText("스토리6-1 미입력점");
  await expect(emptyCard).toContainText("최신 반영");
  await expect(emptyCard).toContainText("반영 전");
  await expect(emptyCard).toContainText("상태 메시지");
  await expect(emptyCard).toContainText("미제출");
  await expect(emptyCard).toContainText("입력 전");

  const closedCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리6-1 정정마감점");
  await expect(closedCard).toContainText("본사 마감");
  await expect(closedCard).toContainText(
    /회의 반영 완료|지연 제출|확인 필요 - 기준값 설정 전/,
  );
  await expect(closedCard).toContainText("₩45,000");
  await expect(closedCard).toContainText("정정 반영");
  await expect(
    closedCard.getByRole("link", { name: "상세 보기" }),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  const holidayCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.holiday}"]`,
  );
  await expect(holidayCard).toBeVisible();
  await expect(holidayCard).toContainText("스토리6-1 휴무점");
  await expect(holidayCard).toContainText("휴무일");
  await expect(holidayCard).toContainText("정정 확인 필요");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 일별 리포트에서 기간 비교로 이동해 선택 기간의 지점별 실적을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "기간 비교" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/comparison/);
  await expect(
    page.getByRole("heading", { name: "기간 비교 리포트" }),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue("");

  await page.getByLabel("시작일").fill("2026-05-31");
  await page
    .getByLabel("종료일")
    .fill(getTodayKstMidnight().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(/startDate=2026-05-31/);
  await expect(page).toHaveURL(/endDate=/);

  const closedRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("본사 마감 2일");
  await expect(closedRow).toContainText("₩822,000");
  await expect(closedRow).toContainText("정정 반영");
  await closedRow.getByText("근거 보기").first().click();
  await expect(closedRow).toContainText("원본");
  await expect(closedRow).toContainText("₩1,077,000");
  await expect(closedRow).toContainText("정정 반영");
  await expect(closedRow).toContainText("₩822,000");
  await expect(
    closedRow.getByRole("link", { name: "장부 상세" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\//);
  await expect(
    closedRow.getByRole("link", { name: "정정 타임라인" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\/.+#correction-timeline/);

  const inProgressRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.inProgress}"]`,
  );
  await expect(inProgressRow).toContainText("스토리6-2 입력중점");
  await expect(inProgressRow).toContainText("미마감 포함");
  await expect(inProgressRow).toContainText("입력 중 1일");
  await expect(inProgressRow).toContainText("₩150,000");

  const emptyRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.empty}"]`,
  );
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");

  const holidayRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.holiday}"]`,
  );
  await expect(holidayRow).toContainText("스토리6-1 휴무점");
  await expect(holidayRow).toContainText("휴무 2일");
  await expect(holidayRow).toContainText("정정 확인 필요");

  await getStoreSelect(page).selectOption(STORE_IDS.closed);
  await page.getByRole("button", { name: "조회" }).click();
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(emptyRow).toHaveCount(0);
});

test("본사는 기간 비교에서 권한 밖 지점 필터를 데이터 없이 안내받는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    "/app/reports/comparison?startDate=2026-05-31&endDate=2026-06-02&storeId=missing-store",
  );

  await expect(
    page.getByRole("heading", { name: "기간 비교 리포트" }),
  ).toBeVisible();
  await expect(page.getByText(/조회 지점을 확인/)).toBeVisible();
  await expect(
    page.getByText(/선택한 조건에 표시할 지점 데이터가 없습니다/),
  ).toBeVisible();
  await expect(
    page.locator(`[data-testid^="hq-report-comparison-row-"]`),
  ).toHaveCount(0);
});

test("본사는 좁은 화면에서도 기간 비교 핵심 지표와 상태를 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "기간 비교 리포트" }),
  ).toBeVisible();

  const closedCard = page.locator(
    `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리6-1 정정마감점");
  await expect(closedCard).toContainText("본사 마감");
  await expect(closedCard).toContainText("매출");
  await expect(closedCard).toContainText("정정 반영");
  await expect(closedCard).toContainText("나머지 지표");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 월간 리포트에서 선택 지점의 마감 상태와 정정 이상을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "월간" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/monthly/);
  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();
  const missingDayCount = Math.max(0, Number(todayInput.slice(8, 10)) - 1);

  await expect(page.getByLabel("조회 월")).toHaveValue(currentMonth);
  await getStoreSelect(page).selectOption(STORE_IDS.closed);
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(/\/app\/reports\/monthly/);
  await expect(page).toHaveURL(new RegExp(`month=${currentMonth}`));
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  const kpiSummary = page.getByLabel("월간 핵심 성과", { exact: true });
  await expect(kpiSummary).toContainText("장부 마감 매출");
  await expect(kpiSummary).toContainText("마감 장부 숫자만 포함");
  await expect(kpiSummary).toContainText("정정 반영 건수");
  const kpiSales = page.getByTestId("hq-report-monthly-kpi-sales");
  await expect(kpiSales).toContainText("₩45,000");
  const operatingSalesKpi = kpiSummary
    .getByText("영업 매출 합계", { exact: true })
    .locator("..");
  await expect(operatingSalesKpi).toContainText("정정 반영");

  const lossSummary = page.getByTestId("hq-report-monthly-loss-summary");
  await expect(lossSummary).toContainText("손실 유형별 요약");
  await expect(lossSummary).toContainText("스토리5-5 폐기");
  await expect(lossSummary).toContainText("₩30,000");

  const inventoryFlow = page.getByTestId("hq-report-monthly-inventory-flow");
  await expect(inventoryFlow).toContainText("전일재고");
  await expect(inventoryFlow).toContainText("매입");
  await expect(inventoryFlow).toContainText("당일재고");
  await expect(inventoryFlow).toContainText("조정 차이");

  await expect(page.getByLabel("최고매출품목")).toContainText(
    "계산 기준 확인 필요",
  );
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText("포함");

  const statusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(statusSummary).toContainText("본사 마감");
  await expect(statusSummary).toContainText("1일");
  await expect(statusSummary).toContainText("미입력");
  await expect(statusSummary).toContainText(`${missingDayCount}일`);

  const todayRow = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(todayRow).toContainText("본사 마감");
  await expect(todayRow).toContainText("정정 반영");
  await expect(
    todayRow.getByRole("link", { name: "장부 상세" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  if (missingDayCount > 0) {
    const missingRow = page.locator(
      `[data-testid="hq-report-monthly-day-${currentMonth}-01"]`,
    );
    await expect(missingRow).toContainText("미입력");
    await expect(missingRow).toContainText("입력 전");
  }

  const anomalyItem = page
    .locator(`[data-testid^="hq-report-monthly-anomaly-${todayInput}-"]`)
    .first();
  await expect(anomalyItem).toContainText("정정 반영");
  await expect(
    anomalyItem.getByRole("link", { name: "정정 타임라인" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\/.+#correction-timeline/);
});

test("본사는 월간 리포트에서 미마감과 휴무 상태를 텍스트로 구분해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();

  await page.goto(
    `/app/reports/monthly?month=${currentMonth}&storeId=${STORE_IDS.inProgress}`,
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.inProgress);

  const inProgressKpis = page.getByLabel("월간 핵심 성과", { exact: true });
  await expect(inProgressKpis).toContainText("미마감 장부 포함");
  await expect(inProgressKpis).toContainText("장부 마감 매출");
  await expect(page.getByTestId("hq-report-monthly-kpi-sales")).toContainText(
    "₩150,000",
  );

  const inProgressStatusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(inProgressStatusSummary).toContainText("입력 중");
  await expect(inProgressStatusSummary).toContainText("미마감 장부 포함");

  const inProgressDay = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(inProgressDay).toContainText("입력 중");
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText(
    "장부 집계 포함",
  );

  await getStoreSelect(page).selectOption(STORE_IDS.holiday);
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.holiday}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.holiday);

  const holidayStatusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(holidayStatusSummary).toContainText("휴무");
  await expect(holidayStatusSummary).toContainText("미입력");

  const holidayDay = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(holidayDay).toContainText("휴무");
  await expect(holidayDay).not.toContainText("입력 중");
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText("휴무일");
});

test("본사는 월간 리포트에서 잘못된 월과 지점 URL을 빈 결과로 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/monthly?month=2026-13&storeId=missing-store");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(page.getByText(/조회 월을 확인/)).toBeVisible();
  await expect(page.getByText(/권한 범위에 없거나 비활성/)).toBeVisible();
  await expect(page.getByText(/표시할 지점 데이터가 없습니다/)).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue("");
});

test("본사는 일별 기간비교 월간 리포트를 CSV로 다운로드하고 감사 이력을 본다", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await login(page, "hq@example.com");

  await page.goto("/app/reports/daily?date=today");
  const dailyCsv = await fetchCsvFromVisibleLink(
    page,
    /filename="erp-fish-report-daily-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  expect(dailyCsv).toContain("정정 반영");
  expect(dailyCsv).not.toContain("300000");
  expect(dailyCsv).not.toContain("inventoryAmount");
  expect(dailyCsv).not.toContain("lot");
  expect(dailyCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}`,
  );
  const comparisonCsv = await fetchCsvFromVisibleLink(
    page,
    /filename="erp-fish-report-comparison-2026-05-31-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  expect(comparisonCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );
  const monthlyCsv = await fetchCsvFromVisibleLink(
    page,
    `erp-fish-report-monthly-${getCurrentMonthInput()}.csv`,
  );
  expect(monthlyCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  const auditLogs = await prisma.auditLog.findMany({
    where: { targetType: "ReportExport" },
    orderBy: { createdAt: "desc" },
  });

  expect(auditLogs).toHaveLength(3);
  expect(auditLogs.every((log) => log.action === "report.export.created")).toBe(
    true,
  );
  expect(auditLogs.every((log) => log.after)).toBe(true);

  await page.goto("/app/master-data/history?targetType=ReportExport");
  await expect(page.getByRole("heading", { name: "변경 이력" })).toBeVisible();
  await expect(page.getByText("리포트 Export").first()).toBeVisible();
  await expect(page.getByText("리포트 Export 생성").first()).toBeVisible();
});

test("export 권한이 없는 본사 조회 사용자와 지점장은 CSV를 받을 수 없다", async ({
  page,
}) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/reports/daily?date=today");
  await expect(page.getByRole("link", { name: "CSV" })).toHaveCount(0);

  const viewerResponse = await page.goto(
    `/api/reports/export?report=daily&date=${getTodayKstInput()}&format=csv`,
  );
  expect(viewerResponse?.status()).toBe(403);
  await expect(page.locator("body")).not.toContainText("grossProfit");
  await expect(page.locator("body")).not.toContainText(STORE_IDS.closed);
  await expect(page.locator("body")).not.toContainText(
    THIRTY_PERCENT_EXPORT_PATTERN,
  );

  await page.context().clearCookies();
  await login(page, "manager@example.com");
  const managerResponse = await page.goto(
    `/api/reports/export?report=monthly&month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}&format=csv`,
  );
  expect(managerResponse?.status()).toBe(403);
  await expect(page.locator("body")).not.toContainText("inventoryAmount");
  await expect(page.locator("body")).not.toContainText(STORE_IDS.closed);
  await expect(page.locator("body")).not.toContainText(
    THIRTY_PERCENT_EXPORT_PATTERN,
  );
});

test("본사는 잘못된 export 요청에서 CSV 파일이나 감사 로그를 받지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await prisma.auditLog.deleteMany({ where: { targetType: "ReportExport" } });

  const response = await page.request.get(
    "/api/reports/export?report=monthly&month=2026-13&format=csv",
  );
  const responseText = await response.text();

  expect(response.status()).toBe(400);
  expect(response.headers()["content-disposition"]).toBeUndefined();
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(responseText).toContain("bad_request");
  expect(responseText).not.toContain(STORE_IDS.closed);
  expect(responseText).not.toContain("inventoryAmount");
  expect(responseText).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  const auditLogCount = await prisma.auditLog.count({
    where: { targetType: "ReportExport" },
  });
  expect(auditLogCount).toBe(0);
});

test("본사는 좁은 화면에서도 월간 리포트 날짜와 이상 항목을 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();

  await page.goto(
    `/app/reports/monthly?month=${currentMonth}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("월간 핵심 성과", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-monthly-loss-summary"),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-monthly-inventory-flow"),
  ).toBeVisible();
  await expect(page.getByLabel("최고매출품목")).toContainText(
    "계산 기준 확인 필요",
  );

  const mobileDay = page.locator(
    `[data-testid="hq-report-monthly-mobile-day-${todayInput}"]`,
  );
  await expect(mobileDay).toBeVisible();
  await expect(mobileDay).toContainText("본사 마감");
  await expect(mobileDay).toContainText("정정 반영");

  const anomalyItem = page
    .locator(`[data-testid^="hq-report-monthly-anomaly-${todayInput}-"]`)
    .first();
  await expect(anomalyItem).toBeVisible();
  await expect(anomalyItem).toContainText("정정 타임라인");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 일별 리포트에서 전 지점 재고 현황으로 이동해 남은 재고를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "재고 현황" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/inventory/);
  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();

  const closedRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("스토리5-5 광어");
  // 남은 재고 12개 → 재고 금액 120,000원, 입력됨.
  await expect(closedRow).toContainText("₩120,000");
  await expect(closedRow).toContainText("입력됨");

  await closedRow
    .getByRole("button", { name: /재고 금액 FIFO 매입 이력 보기/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("FIFO 매입 이력");
  await expect(page.getByRole("dialog")).toContainText("최근 1개월");
  await expect(page.getByRole("dialog")).toContainText("입고 영업일");
  await expect(page.getByRole("dialog")).toContainText("₩120,000");
  await page.keyboard.press("Escape");

  await closedRow
    .getByRole("button", { name: /전일재고 FIFO 매입 이력 보기/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("FIFO 매입 이력");
  await page.keyboard.press("Escape");

  // 장부 없는 지점은 0이 아니라 미입력으로 노출된다.
  const emptyRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.empty}-missing"]`,
  );
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");
});

test("본사는 전 지점 재고 현황을 지점 필터로 좁혀 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/inventory?date=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);

  const closedRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedRow).toContainText("스토리5-5 광어");

  // 다른 지점의 미입력 행은 필터 결과에서 제외된다.
  await expect(
    page.locator(
      `[data-testid="hq-report-inventory-row-${STORE_IDS.empty}-missing"]`,
    ),
  ).toHaveCount(0);
});

test("본사는 좁은 화면에서도 전 지점 재고 현황 핵심 값을 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/inventory?date=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();

  const closedCard = page.locator(
    `[data-testid="hq-report-inventory-mobile-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리5-5 광어");
  await expect(closedCard).toContainText("남은 재고");
  await expect(closedCard).toContainText("₩120,000");
  await expect(closedCard).toContainText("나머지 지표");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 전 지점 재고 현황을 CSV로 내려받고 미입력 행을 확인한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(`/app/reports/inventory?date=${getTodayKstInput()}`);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^erp-fish-report-inventory-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath, "utf8");

  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("스토리5-5 광어");
  expect(csv).toContain("미입력");
  expect(csv).not.toContain("inventoryAmount");
  expect(csv).not.toContain("unitPrice");
  expect(csv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);
});

test("본사는 월간 리포트에서 손익 준비도와 추정 매출 순위 라벨을 본다", async ({
  page,
}) => {
  test.slow();
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();

  const plReadiness = page.getByTestId("hq-report-monthly-pl-readiness");
  await expect(plReadiness).toContainText("손익(P&L) 리포트 준비도");
  await expect(plReadiness).toContainText("실측");
  await expect(plReadiness).toContainText("추정");
  await expect(plReadiness).toContainText("미구현");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-sales"),
  ).toContainText("실측");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-labor"),
  ).toContainText("실측");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-productSales"),
  ).toContainText("추정");

  await expect(page.getByLabel("매출 상위·하위 품목")).toContainText(
    "매출 상위5 / 하위5 품목 (추정)",
  );
});

test("지점장은 전 지점 재고 현황 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(`/app/reports/inventory?date=${getTodayKstInput()}`);

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 일별 아침 회의 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 본사 인건비 현황에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/labor?month=2026-05");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("복합 미연결 직원")).toHaveCount(0);
});

test("지점장은 기간 비교 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(
    "/app/reports/comparison?startDate=2026-05-31&endDate=2026-06-02",
  );

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 월간 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

// WO-16(2026-06-28): 본사 전용 품목 검토 / 매출 검토 차트 페이지. 차트↔표 전환을 제공한다.
test("본사는 품목 검토 페이지에서 차트와 표를 전환해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/product-review?date=today");

  await expect(
    page.getByRole("heading", { name: "품목 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황 (추정)" }),
  ).toBeVisible();

  // 기본은 차트 보기. 표 보기로 전환하면 표 헤더가 보인다.
  const profitabilitySection = page
    .locator("section")
    .filter({ hasText: "품목별 판매 현황 (추정)" });
  await profitabilitySection.getByRole("button", { name: "표 보기" }).click();
  await expect(
    profitabilitySection.getByText("추정 판매액 합계", { exact: true }),
  ).toHaveCount(0);
  await expect(
    profitabilitySection
      .getByRole("columnheader", { name: "추정 판매 수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
});

test("본사는 매출 검토 페이지에서 지점별 매출 차트와 표를 전환해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/sales-review?date=today");

  await expect(
    page.getByRole("heading", { name: "매출 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "지점별 영업 매출 합계·마진율" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "차트 보기" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "표 보기" }).first(),
  ).toBeVisible();

  const profitabilitySection = page
    .locator("section")
    .filter({ hasText: "품목별 추정 매출" });
  await profitabilitySection.getByRole("button", { name: "표 보기" }).click();
  await expect(
    profitabilitySection
      .getByRole("columnheader", { name: "추정 판매 수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
});

test("지점장은 품목 검토와 매출 검토 페이지에 접근할 수 없다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await page.goto("/app/reports/product-review?date=today");
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();

  await page.goto("/app/reports/sales-review?date=today");
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});
