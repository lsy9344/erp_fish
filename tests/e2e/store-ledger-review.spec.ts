import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-story-2-7-review";
const STORY_STORE_NAME = "스토리2-7 검토 지점";
const STORY_MARKER = "story-2-7-test";

test.afterAll(async () => {
  await cleanupStoryTwoSevenData();
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
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

async function getStoreManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function ensureStoryStore() {
  const actorId = await getHeadquartersUserId();
  const managerId = await getStoreManagerUserId();

  await prisma.store.upsert({
    where: { id: STORY_STORE_ID },
    create: {
      id: STORY_STORE_ID,
      name: STORY_STORE_NAME,
      updatedById: actorId,
    },
    update: {
      isActive: true,
      updatedById: actorId,
    },
  });
  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: managerId,
        storeId: STORY_STORE_ID,
      },
    },
    create: {
      userId: managerId,
      storeId: STORY_STORE_ID,
    },
    update: {},
  });
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

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );
}

async function seedExpenseCode(name: string) {
  const actorId = await getHeadquartersUserId();

  return prisma.ledgerInputCode.create({
    data: {
      group: "EXPENSE_ITEM",
      name,
      displayOrder: 770,
      updatedById: actorId,
    },
  });
}

async function seedLossType(name: string) {
  const actorId = await getHeadquartersUserId();

  return prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name,
      displayOrder: 771,
      updatedById: actorId,
    },
  });
}

async function seedProduct(name: string, unitPrice: number) {
  const actorId = await getHeadquartersUserId();

  return prisma.product.create({
    data: {
      name,
      category: "검토",
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });
}

async function seedLedger(data: {
  totalSalesAmount?: number;
  cashAmount?: number;
  cardAmount?: number;
  otherPaymentAmount?: number;
  workerCount?: number | null;
}) {
  const actorId = await getHeadquartersUserId();
  await ensureStoryStore();

  return prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getTodayKstMidnight(),
      status: "IN_PROGRESS",
      totalSalesAmount: data.totalSalesAmount ?? 0,
      cashAmount: data.cashAmount ?? 0,
      cardAmount: data.cardAmount ?? 0,
      otherPaymentAmount: data.otherPaymentAmount ?? 0,
      workerCount: data.workerCount ?? null,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoSevenData() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: "스토리2-7" } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: { startsWith: "스토리2-7" } },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);
  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      storeId: STORY_STORE_ID,
    },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
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

  if (productIds.length > 0) {
    await prisma.inventoryOpeningSnapshot.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { storeId: STORY_STORE_ID },
        ],
      },
    });
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

  await prisma.userStoreAssignment.deleteMany({
    where: { storeId: STORY_STORE_ID },
  });
  await prisma.store.deleteMany({
    where: { id: STORY_STORE_ID },
  });
}

test.beforeEach(async () => {
  await cleanupStoryTwoSevenData();
});

test("검토 화면은 계산값, 합계 불일치, 재고와 손실 이상 후보를 보여준다", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const expenseCode = await seedExpenseCode(`스토리2-7 비용 ${suffix}`);
  const lossType = await seedLossType(`스토리2-7 폐기 ${suffix}`);
  const product = await seedProduct(`스토리2-7 광어 ${suffix}`, 1_000);
  const ledger = await seedLedger({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
  });

  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInputCodeId: expenseCode.id,
      amount: 12_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 5,
      amount: 5_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8_000,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryAdjustment.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInventoryItemId: inventoryItem.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      beforeQuantity: 10,
      beforeAmount: 10_000,
      afterQuantity: 8,
      afterAmount: 8_000,
      differenceQuantity: -2,
      differenceAmount: -2_000,
      reason: "검토 화면 재고 차이",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossType.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      lossTypeName: lossType.name,
      quantity: 1,
      amount: 1_000,
      reason: "검토 화면 손실",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const metrics = page.locator("section").filter({ hasText: "계산값" });
  await expect(metrics).toContainText("총매출");
  await expect(metrics).toContainText("100,000원");
  await expect(metrics).toContainText("매출원가");
  await expect(metrics).toContainText("7,000원");
  await expect(metrics).toContainText("매출이익");
  await expect(metrics).toContainText("93,000원");
  await expect(metrics).toContainText("이익률");
  await expect(metrics).toContainText("93.0%");
  await expect(metrics).toContainText("영업이익");
  await expect(metrics).toContainText("81,000원");
  await expect(metrics).toContainText("인당생산성");
  await expect(metrics).toContainText("25,000원");
  await expect(metrics).toContainText("재고금액");
  await expect(metrics).toContainText("8,000원");
  await expect(metrics).toContainText("매출차액");
  await expect(metrics).toContainText("계산 기준 확인 필요");

  const warningSection = page
    .locator("section")
    .filter({ hasText: "경고와 이상 후보" });
  await expect(warningSection).toContainText("결제 합계 불일치");
  await expect(warningSection).toContainText("차액 +2,000원");
  await expect(warningSection).toContainText("재고 차이");
  await expect(warningSection).toContainText("수량 -2개");
  await expect(warningSection).toContainText("손실 확인 후보");
  await expect(warningSection).toContainText("금액 +1,000원");
  await expect(
    page.getByRole("link", { name: "7단계: 검토/제출" }),
  ).toHaveAttribute("aria-current", "step");
});

test("검토 화면은 누락 항목 링크와 모바일 읽기 상태를 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct(`스토리2-7 누락 ${suffix}`, 2_000);
  const ledger = await seedLedger({
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 0,
  });

  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 1,
      purchasedQuantity: 0,
      currentQuantity: null,
      quantity: null,
      inventoryAmount: null,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const missingSection = page
    .locator("section")
    .filter({ hasText: "입력 확인 항목" });

  await expect(page.getByText("계산 불가").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /이동/ }).first()).toBeVisible();
  await expect(missingSection).toContainText("총매출/결제");
  await expect(missingSection).toContainText("비용");
  await expect(missingSection).toContainText("매입");
  await expect(missingSection).toContainText("재고");
  await expect(missingSection).toContainText("근무인원");
  await expect(missingSection).toContainText("손실 항목 없음");
  await expect(
    page.getByRole("link", { name: "1단계: 매출/결제" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`storeId=${STORY_STORE_ID}.*step=sales`),
  );
  await expect(page.getByRole("link", { name: "4단계: 재고" })).toHaveAttribute(
    "href",
    `/app/store-entry/inventory?storeId=${STORY_STORE_ID}`,
  );

  const metricsBox = await page
    .locator("section")
    .filter({ hasText: "계산값" })
    .boundingBox();
  const missingBox = await page
    .locator("section")
    .filter({ hasText: "입력 확인 항목" })
    .boundingBox();

  expect(metricsBox?.width).toBeLessThanOrEqual(390);
  expect(missingBox?.width).toBeLessThanOrEqual(390);
  expect(metricsBox?.height).toBeGreaterThan(0);
  expect(missingBox?.height).toBeGreaterThan(0);
});
