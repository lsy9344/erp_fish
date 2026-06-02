import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_IDS = {
  empty: "store-story-5-1-empty",
  closed: "store-story-5-1-closed",
  holiday: "store-story-5-1-holiday",
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
const STORY_MARKER = "story-5-1-test";
const HISTORICAL_REPORT_DATE = new Date(Date.UTC(2026, 4, 31));

test.beforeEach(async () => {
  await cleanupStoryFiveOneData();
  await seedStoryFiveOneData();
});

test.afterAll(async () => {
  await cleanupStoryFiveOneData();
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
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

async function seedStoryFiveOneData() {
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
        name: "스토리5-1 미입력점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.closed,
        name: "스토리5-1 정정마감점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.holiday,
        name: "스토리5-1 휴무점",
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

async function cleanupStoryFiveOneData() {
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

test("본사는 일별 아침 회의 리포트에서 지점별 상태와 정정 반영 숫자를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘" })).toBeVisible();
  await expect(page.getByRole("link", { name: "어제" })).toBeVisible();

  const emptyRow = getDesktopRow(page, STORE_IDS.empty);
  await expect(emptyRow).toContainText("스토리5-1 미입력점");
  await expect(emptyRow).toContainText("미입력");
  await expect(emptyRow).toContainText("입력 전");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리5-1 정정마감점");
  await expect(closedRow).toContainText("본사마감");
  await expect(
    closedRow.locator("td").nth(2).locator("div").first(),
  ).toContainText("₩45,000");
  await expect(
    closedRow.getByRole("link", { name: "상세 보기" }),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  const holidayRow = getDesktopRow(page, STORE_IDS.holiday);
  await expect(holidayRow).toContainText("스토리5-1 휴무점");
  await expect(holidayRow).toContainText("휴무");
  await expect(holidayRow).toContainText("정정 확인 필요");
});

test("본사는 선택한 특정 일자의 리포트를 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=2026-05-31");

  await expect(page.getByLabel("조회 날짜")).toHaveValue("2026-05-31");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리5-1 정정마감점");
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
  await expect(closedRow).toContainText("스토리5-1 정정마감점");
  await expect(closedRow).toContainText("본사마감 2일");
  await expect(closedRow).toContainText("₩822,000");
  await expect(closedRow).toContainText("정정 반영");

  const emptyRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.empty}"]`,
  );
  await expect(emptyRow).toContainText("스토리5-1 미입력점");
  await expect(emptyRow).toContainText("미입력");

  const holidayRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.holiday}"]`,
  );
  await expect(holidayRow).toContainText("스토리5-1 휴무점");
  await expect(holidayRow).toContainText("휴무 1일");
  await expect(holidayRow).toContainText("정정 확인 필요");
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
  await page.getByLabel("지점").selectOption(STORE_IDS.closed);
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(/\/app\/reports\/monthly/);
  await expect(page).toHaveURL(new RegExp(`month=${currentMonth}`));
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));
  await expect(page.getByLabel("지점")).toHaveValue(STORE_IDS.closed);
  const kpiSummary = page.getByLabel("월간 핵심 성과");
  await expect(kpiSummary).toContainText("월간 매출");
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
  await expect(statusSummary).toContainText("본사마감");
  await expect(statusSummary).toContainText("1일");
  await expect(statusSummary).toContainText("미입력");
  await expect(statusSummary).toContainText(`${missingDayCount}일`);

  const todayRow = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(todayRow).toContainText("본사마감");
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

test("본사는 월간 리포트에서 잘못된 월과 지점 URL을 안전한 기본값으로 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/monthly?month=2026-13&storeId=missing-store");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(page.getByText(/조회 월을 확인/)).toBeVisible();
  await expect(page.getByText(/조회 지점을 확인/)).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
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
  await expect(page.getByLabel("월간 핵심 성과")).toBeVisible();
  await expect(page.getByTestId("hq-report-monthly-loss-summary")).toBeVisible();
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
  await expect(mobileDay).toContainText("본사마감");
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
