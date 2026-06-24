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
} as const;
const STORY_STORE_IDS = Object.values(STORE_IDS);
const PRODUCT_IDS = {
  fish: "product-story-5-5-fish",
} as const;
const STORY_PRODUCT_IDS = Object.values(PRODUCT_IDS);
const LOSS_CODE_IDS = {
  waste: "loss-code-story-5-5-waste",
} as const;
const STORY_LOSS_CODE_IDS = Object.values(LOSS_CODE_IDS);
const STORY_MARKER = "story-6-1-test";
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
  await page.getByLabel("이메일").fill(email);
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

function getCurrentMonthInput() {
  return getTodayKstInput().slice(0, 7);
}

async function seedStorySixOneData() {
  const actorId = await getHeadquartersUserId();

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
    storeId: STORE_IDS.inProgress,
    status: "IN_PROGRESS",
    totalSalesAmount: 150000,
    cashAmount: 50000,
    cardAmount: 100000,
    otherPaymentAmount: 0,
    workerCount: 2,
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
  targetType: "PAYMENT_FIELD" | "CALCULATED_METRIC";
  targetId: string;
  fieldKey: string;
  label: string;
  originalValue: number | null;
  correctedValue: number | string;
  reason: string;
}) {
  const actorId = await getHeadquartersUserId();
  const originalValue = {
    kind: typeof input.originalValue === "number" ? "money" : "metric",
    value: input.originalValue,
    label: input.label,
  };
  const correctedValue = {
    kind: typeof input.correctedValue === "number" ? "money" : "metric",
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

async function cleanupStorySixOneData() {
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: { in: STORY_STORE_IDS } },
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
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  await prisma.store.deleteMany({
    where: { id: { in: STORY_STORE_IDS } },
  });
  await prisma.ledgerInputCode.deleteMany({
    where: { id: { in: STORY_LOSS_CODE_IDS } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: STORY_PRODUCT_IDS } },
  });
}

function getDesktopRow(page: Page, storeId: string) {
  return page.locator(`[data-testid="hq-report-row-${storeId}"]`);
}

function getStoreSelect(page: Page) {
  return page.getByRole("combobox", { name: "지점" });
}

test("본사는 일별 아침 회의 리포트에서 지점별 상태와 정정 반영 숫자를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  // WO-03(2026-06-22): 냉동/생물 매출 차트가 추정값임을 명시하며 노출된다.
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("품목별 POS 매출이 없어 재고 흐름 기반 추정값입니다.")
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘" })).toBeVisible();
  await expect(page.getByRole("link", { name: "어제" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "최신 반영" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "상태 메시지" }),
  ).toBeVisible();

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
  await expect(holidayRow).toContainText("휴무 1일");
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
  const kpiSummary = page.getByLabel("월간 핵심 성과", { exact: true });
  await expect(kpiSummary).toContainText("월간 매출");
  await expect(kpiSummary).toContainText("마감 장부 숫자만 포함");
  await expect(kpiSummary).toContainText("정정 반영 건수");
  const kpiSales = page.getByTestId("hq-report-monthly-kpi-sales");
  await expect(kpiSales).toContainText("₩45,000");
  await expect(kpiSales).toContainText("정정 반영");

  const lossSummary = page.getByTestId("hq-report-monthly-loss-summary");
  await expect(lossSummary).toContainText("손실 유형별 요약");
  await expect(lossSummary).toContainText("스토리5-5 폐기");
  await expect(lossSummary).toContainText("₩10,000");

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
  await expect(inProgressKpis).toContainText("월간 매출");
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
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
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
