import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_MARKER = "story-3-1-test";
const STORE_IDS = {
  empty: "store-story-3-1-empty",
  progress: "store-story-3-1-progress",
  review: "store-story-3-1-review",
  closed: "store-story-3-1-closed",
  holiday: "store-story-3-1-holiday",
  inactive: "store-story-3-1-inactive",
} as const;
const STORY_STORE_IDS = Object.values(STORE_IDS);
const STORY_PRODUCT_NAME = "스토리3-1 테스트 품목";
const STORY_LOSS_CODE_NAME = "스토리3-1 손실";

test.beforeEach(async () => {
  await cleanupStoryThreeOneData();
  await seedStoryThreeOneData();
});

test.afterAll(async () => {
  await cleanupStoryThreeOneData();
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

async function seedStoryThreeOneData() {
  const actorId = await getHeadquartersUserId();

  await prisma.store.createMany({
    data: [
      {
        id: STORE_IDS.empty,
        name: "스토리3-1 미입력점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.progress,
        name: "스토리3-1 입력중점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.review,
        name: "스토리3-1 검토대기점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.closed,
        name: "스토리3-1 본사마감점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.holiday,
        name: "스토리3-1 휴무점",
        isActive: true,
        updatedById: actorId,
      },
      {
        id: STORE_IDS.inactive,
        name: "스토리3-1 비활성점",
        isActive: false,
        updatedById: actorId,
      },
    ],
  });

  const product = await prisma.product.create({
    data: {
      name: STORY_PRODUCT_NAME,
      category: "관제판",
      spec: "1kg",
      defaultUnitPrice: 1000,
      updatedById: actorId,
    },
  });
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: STORY_LOSS_CODE_NAME,
      displayOrder: 931,
      updatedById: actorId,
    },
  });

  const progressLedger = await seedLedger({
    actorId,
    storeId: STORE_IDS.progress,
    status: "IN_PROGRESS",
    totalSalesAmount: 120000,
    cashAmount: 50000,
    cardAmount: 70000,
    otherPaymentAmount: 0,
    workerCount: 2,
  });
  const reviewLedger = await seedLedger({
    actorId,
    storeId: STORE_IDS.review,
    status: "IN_REVIEW",
    totalSalesAmount: 200000,
    cashAmount: 80000,
    cardAmount: 110000,
    otherPaymentAmount: 10000,
    workerCount: 3,
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
    storeId: STORE_IDS.inactive,
    status: "IN_REVIEW",
    totalSalesAmount: 999999,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
  });

  await seedInventoryItem(progressLedger.id, product.id, actorId);
  const reviewInventoryItem = await seedInventoryItem(
    reviewLedger.id,
    product.id,
    actorId,
  );
  await seedInventoryItem(closedLedger.id, product.id, actorId);
  await prisma.ledgerInventoryAdjustment.create({
    data: {
      dailyLedgerId: reviewLedger.id,
      productId: product.id,
      ledgerInventoryItemId: reviewInventoryItem.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      beforeQuantity: 15,
      beforeAmount: 15000,
      afterQuantity: 3,
      afterAmount: 3000,
      differenceQuantity: -12,
      differenceAmount: -12000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: reviewLedger.id,
      productId: product.id,
      ledgerInputCodeId: lossCode.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      lossTypeName: lossCode.name,
      quantity: 52,
      amount: 52000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function seedStoryThreeThreeThresholds() {
  const actorId = await getHeadquartersUserId();

  await prisma.anomalyThresholdSetting.create({
    data: {
      scope: "GLOBAL",
      salesDropRateBps: 1250,
      grossMarginDropBps: 350,
      salesDifferenceAmount: 10000,
      lossAmount: 50000,
      inventoryDifferenceQuantity: 10,
      updatedById: actorId,
    },
  });
}

async function seedLedger(data: {
  actorId: string;
  storeId: string;
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
      closingDate: getTodayKstMidnight(),
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

async function seedInventoryItem(
  dailyLedgerId: string,
  productId: string,
  actorId: string,
) {
  return prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId,
      productId,
      productName: STORY_PRODUCT_NAME,
      productCategory: "관제판",
      productSpec: "1kg",
      unitPrice: 1000,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 7,
      quantity: 7,
      inventoryAmount: 7000,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryThreeOneData() {
  await prisma.auditLog.deleteMany({
    where: { targetType: "AnomalyThresholdSetting" },
  });
  await prisma.anomalyThresholdSetting.deleteMany();

  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: { in: STORY_STORE_IDS } },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);
  const products = await prisma.product.findMany({
    where: { name: STORY_PRODUCT_NAME },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: STORY_LOSS_CODE_NAME },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);

  if (ledgerIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "DailyLedger",
        targetId: { in: ledgerIds },
      },
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

  await prisma.inventoryOpeningSnapshot.deleteMany({
    where: {
      OR: [
        { storeId: { in: STORY_STORE_IDS } },
        ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
      ],
    },
  });

  await prisma.userStoreAssignment.deleteMany({
    where: { storeId: { in: STORY_STORE_IDS } },
  });
  await prisma.store.deleteMany({
    where: { id: { in: STORY_STORE_IDS } },
  });

  if (productIds.length > 0) {
    await prisma.purchaseStandard.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

  if (codeIds.length > 0) {
    await prisma.ledgerInputCode.deleteMany({
      where: { id: { in: codeIds } },
    });
  }
}

function getDesktopRow(page: Page, storeId: string) {
  return page.getByTestId(`hq-dashboard-row-${storeId}`);
}

function getMobileRow(page: Page, storeId: string) {
  return page.getByTestId(`hq-dashboard-mobile-row-${storeId}`);
}

async function expectNoOverlap(first: Locator, second: Locator) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  expect(firstBox).toBeTruthy();
  expect(secondBox).toBeTruthy();

  const overlaps =
    firstBox!.x < secondBox!.x + secondBox!.width &&
    firstBox!.x + firstBox!.width > secondBox!.x &&
    firstBox!.y < secondBox!.y + secondBox!.height &&
    firstBox!.y + firstBox!.height > secondBox!.y;

  expect(overlaps).toBe(false);
}

test("본사 관제판은 활성 지점 전체와 장부 상태를 보여준다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/dashboard?date=today");

  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();
  await expect(getDesktopRow(page, STORE_IDS.empty)).toContainText("미입력");
  await expect(getDesktopRow(page, STORE_IDS.progress)).toContainText("입력중");
  await expect(getDesktopRow(page, STORE_IDS.review)).toContainText("검토대기");
  await expect(getDesktopRow(page, STORE_IDS.closed)).toContainText("본사마감");
  await expect(getDesktopRow(page, STORE_IDS.holiday)).toContainText("휴무");

  const reviewRow = getDesktopRow(page, STORE_IDS.review);
  await expect(reviewRow).toContainText("손실 있음");
  await expect(reviewRow).toContainText("기준값 설정 전");
  await expect(reviewRow).toContainText("계산 기준 확인 필요");
  await expect(page.getByText("스토리3-1 비활성점")).toHaveCount(0);
});

test("기준값이 저장된 관제판은 매출 신호 계산 상태와 상세 이동을 제공한다", async ({
  page,
}) => {
  await seedStoryThreeThreeThresholds();
  await login(page, "hq@example.com");
  await page.goto("/app/dashboard?date=today");

  const reviewRow = getDesktopRow(page, STORE_IDS.review);
  await expect(reviewRow).toContainText("매출 기준 확인");
  await expect(reviewRow).toContainText("이익률 기준 확인");
  await expect(reviewRow).toContainText("매출차액 기준 확인");
  await expect(reviewRow).toContainText("재고 이상");
  await expect(reviewRow).toContainText("손실 이상");
  await expect(reviewRow).not.toContainText("기준값 저장됨");

  await reviewRow.getByText("스토리3-1 검토대기점").click();
  await expect(page).toHaveURL(/\/app\/ledgers\//);
  await expect(
    page.getByRole("heading", { name: "스토리3-1 검토대기점 장부 상세" }),
  ).toBeVisible();
  await expect(page.getByText("매출 기준 확인")).toBeVisible();
  await expect(page.getByText("이익률 기준 확인")).toBeVisible();
  await expect(page.getByText("매출차액 기준 확인")).toBeVisible();
  await expect(page.getByText("재고 이상")).toBeVisible();
  await expect(page.getByText(/12개/)).toBeVisible();
  await expect(page.getByText("손실 이상")).toBeVisible();
  await expect(page.getByText(/52,000원/)).toBeVisible();
});

test("지점장은 본사 관제판에 직접 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/dashboard");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("스토리3-1 검토대기점")).toHaveCount(0);
});

test("지점장은 본사 장부 상세에 직접 접근할 수 없다", async ({ page }) => {
  const reviewLedger = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORE_IDS.review },
    select: { id: true },
  });

  await login(page, "manager@example.com");
  await page.goto(`/app/ledgers/${reviewLedger.id}`);

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("스토리3-1 검토대기점 장부 상세")).toHaveCount(0);
});

test("390px 모바일 관제판은 핵심 상태가 겹치지 않고 보인다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "hq@example.com");
  await page.goto("/app/dashboard?date=today");

  const row = getMobileRow(page, STORE_IDS.review);
  const storeName = row.getByTestId(
    `hq-dashboard-mobile-store-${STORE_IDS.review}`,
  );
  const status = row.getByTestId(
    `hq-dashboard-mobile-status-${STORE_IDS.review}`,
  );
  const signal = row.getByTestId(
    `hq-dashboard-mobile-signal-${STORE_IDS.review}`,
  );

  await expect(row).toBeVisible();
  await expect(storeName).toContainText("스토리3-1 검토대기점");
  await expect(status).toContainText("검토대기");
  await expect(signal).toContainText("기준값 설정 전");

  const rowBox = await row.boundingBox();
  expect(rowBox).toBeTruthy();
  expect(rowBox!.x).toBeGreaterThanOrEqual(0);
  expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390);
  await expectNoOverlap(storeName, status);
});
