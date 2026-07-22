import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "store-gangnam";
const PRODUCT_PREFIX = "재고계획 회귀";
const createdLedgerIds = new Set<string>();
const createdProductIds = new Set<string>();

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

function getPreviousKstMidnight() {
  const date = getTodayKstMidnight();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function getActorId() {
  const actor = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(actor?.id).toBeTruthy();
  return actor!.id;
}

async function seedProduct(defaultUnitPrice = 1_000) {
  const actorId = await getActorId();

  const product = await prisma.product.create({
    data: {
      name: `${PRODUCT_PREFIX} ${randomUUID().slice(0, 8)}`,
      category: "냉동",
      spec: "1kg",
      defaultUnitPrice,
      updatedById: actorId,
    },
  });

  createdProductIds.add(product.id);
  return product;
}

async function createTodayLedger(
  actorId: string,
  status: "IN_PROGRESS" | "IN_REVIEW" = "IN_PROGRESS",
) {
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: STORE_ID,
      closingDate: getTodayKstMidnight(),
      status,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  createdLedgerIds.add(ledger.id);
  return ledger;
}

async function seedPurchase(
  ledgerId: string,
  product: Awaited<ReturnType<typeof seedProduct>>,
  actorId: string,
  unitPrice = product.defaultUnitPrice ?? 0,
  quantity = 1,
) {
  return prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledgerId,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice,
      quantity,
      amount: unitPrice * quantity,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function markLossesReviewed(ledgerId: string, actorId: string) {
  await prisma.dailyLedger.update({
    where: { id: ledgerId },
    data: { lossReviewedAt: new Date(), lossReviewedById: actorId },
  });
}

async function seedCompleteInventoryGate() {
  const actorId = await getActorId();
  const product = await seedProduct();
  const ledger = await createTodayLedger(actorId);
  await seedPurchase(ledger.id, product, actorId);
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1_000,
      previousQuantity: 0,
      purchasedQuantity: 1,
      currentQuantity: 1,
      quantity: 1,
      inventoryAmount: 1_000,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: STORE_ID,
      businessDate: getTodayKstMidnight(),
      productId: product.id,
      plannedUnitPrice: 2_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return { ledger, product };
}

async function cleanupRegressionData() {
  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      OR: [
        { id: { in: [...createdLedgerIds] } },
        {
          storeId: STORE_ID,
          closingDate: {
            in: [getTodayKstMidnight(), getPreviousKstMidnight()],
          },
        },
      ],
    },
    select: { id: true },
  });
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: [...createdProductIds] } },
        { name: { startsWith: PRODUCT_PREFIX } },
      ],
    },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);
  const productIds = products.map((product) => product.id);

  if (ledgerIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: { in: ledgerIds } },
    });
    await prisma.correctionRecord.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLossItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryAdjustment.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryFifoLot.deleteMany({
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
    await prisma.dailyLedger.deleteMany({ where: { id: { in: ledgerIds } } });
  }

  if (productIds.length > 0) {
    await prisma.storeSalesPricePlan.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.inventoryOpeningSnapshot.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }

  createdLedgerIds.clear();
  createdProductIds.clear();
}

test.beforeEach(cleanupRegressionData);
test.afterEach(cleanupRegressionData);

test.afterAll(async () => {
  await cleanupRegressionData();
  await prisma.$disconnect();
});

test("재고 계획 미완료 직접 URL은 명시 지점과 자동 선택 지점 모두 재고 단계로 보낸다", async ({
  page,
}) => {
  const actorId = await getActorId();
  const product = await seedProduct();
  const ledger = await createTodayLedger(actorId);
  await seedPurchase(ledger.id, product, actorId);
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORE_ID}&step=cost`);
  await expect(page).toHaveURL(
    /\/app\/store-entry\/inventory\?.*reason=inventory-plan-incomplete/,
  );
  await expect(page.getByRole("heading", { name: "재고 입력" })).toBeVisible();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: { status: "IN_REVIEW" },
  });
  await page.goto("/app/store-entry?step=cost");
  await expect(page).toHaveURL(
    /\/app\/store-entry\/inventory\?.*reason=inventory-plan-incomplete/,
  );
  await expect(page.getByRole("heading", { name: "재고 입력" })).toBeVisible();
});

test("재고에서 후속 단계 이동은 discard 선택 없이 저장 성공 뒤에만 진행한다", async ({
  page,
}) => {
  const actorId = await getActorId();
  const product = await seedProduct();
  const ledger = await createTodayLedger(actorId);
  await seedPurchase(ledger.id, product, actorId);
  await markLossesReviewed(ledger.id, actorId);
  await login(page);

  await page.goto(`/app/store-entry/inventory?storeId=${STORE_ID}`);
  await page.getByLabel(`${product.name} 당일재고`, { exact: true }).fill("1");
  await page.getByRole("link", { name: /4단계: 지출/ }).click();
  await expect(page).toHaveURL(/\/app\/store-entry\/inventory/);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "모든 품목의 판매한 가격을 입력해 주세요." })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" }),
  ).toHaveCount(0);
  await page.getByLabel(`${product.name} 판매한 가격`).fill("2000");
  await page.getByRole("link", { name: /4단계: 지출/ }).click();

  await expect(
    page.getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/store-entry\?.*step=cost/);

  expect(
    await prisma.ledgerInventoryItem.count({
      where: { dailyLedgerId: ledger.id, productId: product.id },
    }),
  ).toBe(1);
  expect(
    await prisma.storeSalesPricePlan.count({
      where: {
        storeId: STORE_ID,
        businessDate: getTodayKstMidnight(),
        productId: product.id,
      },
    }),
  ).toBe(1);
});

test("재고를 명시 저장한 뒤 다음 단계 이동은 버전과 감사로그를 다시 증가시키지 않는다", async ({
  page,
}) => {
  const actorId = await getActorId();
  const product = await seedProduct();
  const ledger = await createTodayLedger(actorId);
  await seedPurchase(ledger.id, product, actorId);
  await markLossesReviewed(ledger.id, actorId);
  await login(page);

  await page.goto(`/app/store-entry/inventory?storeId=${STORE_ID}`);
  await page.getByLabel(`${product.name} 당일재고`, { exact: true }).fill("1");
  await page.getByLabel(`${product.name} 판매한 가격`).fill("2000");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "다음 단계로 →" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry\?.*step=cost/);

  expect(
    await prisma.dailyLedger.findUnique({
      where: { id: ledger.id },
      select: { version: true },
    }),
  ).toEqual({ version: ledger.version + 1 });
  expect(
    await prisma.auditLog.count({
      where: {
        action: "ledger.inventory.saved",
        targetType: "DailyLedger",
        targetId: ledger.id,
      },
    }),
  ).toBe(1);
});

test("화면 밖 수동 추가 품목은 기존 판매한 가격을 복원한다", async ({
  page,
}) => {
  const actorId = await getActorId();
  const product = await seedProduct(10_000);
  await createTodayLedger(actorId);
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: STORE_ID,
      businessDate: getTodayKstMidnight(),
      productId: product.id,
      plannedUnitPrice: 16_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await login(page);

  await page.goto(`/app/store-entry/inventory?storeId=${STORE_ID}`);
  await page.getByLabel("추가할 품목 선택").selectOption(product.id);
  await page.getByRole("button", { name: "추가" }).click();

  await expect(page.getByLabel(`${product.name} 판매한 가격`)).toHaveValue(
    "16,000",
  );
  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("");
});

test("재고 계획 완료 상태는 매출을 연속 저장한 응답에서도 유지된다", async ({
  page,
}) => {
  const { ledger } = await seedCompleteInventoryGate();
  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORE_ID}&step=sales`);

  const totalSales = page.getByRole("textbox", {
    name: "총매출",
    exact: true,
  });
  const cash = page.getByRole("textbox", {
    name: "현금 (당일 지출 후)",
    exact: true,
  });
  const card = page.getByRole("textbox", { name: "카드", exact: true });
  const other = page.getByRole("textbox", {
    name: "기타 결제수단",
    exact: true,
  });

  for (const amount of ["1000", "2000"]) {
    await totalSales.fill(amount);
    await cash.fill("0");
    await card.fill(amount);
    await other.fill("0");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "저장됐습니다." }),
    ).toBeVisible();

    for (const stepName of [
      /4단계: 지출/,
      /5단계: 근무인원\/이름/,
      /7단계: 검토\/제출/,
    ]) {
      await expect(
        page.getByRole("link", { name: stepName }),
      ).not.toHaveAttribute("aria-disabled", "true");
    }
  }

  const saved = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { totalSalesAmount: true, version: true },
  });
  expect(saved.totalSalesAmount).toBe(2_000);
  expect(saved.version).toBe(ledger.version + 2);
});

test("FIFO lot 합계가 Int 범위를 넘으면 CAS 전에 행 오류로 차단한다", async ({
  page,
}) => {
  const actorId = await getActorId();
  const product = await seedProduct(1);
  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORE_ID,
      closingDate: getPreviousKstMidnight(),
      status: "HEADQUARTERS_CLOSED",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  createdLedgerIds.add(previousLedger.id);
  const previousItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: previousLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1,
      previousQuantity: 0,
      purchasedQuantity: 2,
      currentQuantity: 2,
      quantity: 2,
      inventoryAmount: 2,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryFifoLot.createMany({
    data: [0, 1].map((sortOrder) => ({
      dailyLedgerId: previousLedger.id,
      ledgerInventoryItemId: previousItem.id,
      productId: product.id,
      sourceType: "LEGACY_OPENING" as const,
      sourceLedgerId: previousLedger.id,
      sourcePurchaseItemId: null,
      sourceBusinessDate: getPreviousKstMidnight(),
      unitPrice: 1_500_000_000,
      originalQuantity: 1,
      consumedQuantity: 0,
      remainingQuantity: 1,
      originalAmount: 1_500_000_000,
      consumedAmount: 0,
      remainingAmount: 1_500_000_000,
      sortOrder,
    })),
  });
  const ledger = await createTodayLedger(actorId);
  await markLossesReviewed(ledger.id, actorId);
  await login(page);

  await page.goto(`/app/store-entry/inventory?storeId=${STORE_ID}`);
  await page.getByLabel(`${product.name} 당일재고`, { exact: true }).fill("2");
  await page.getByLabel(`${product.name} 판매한 가격`).fill("10");
  await page.getByRole("button", { name: "저장", exact: true }).click();

  const message =
    "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.";
  await expect(
    page.getByRole("alert").filter({ hasText: message }).first(),
  ).toBeVisible();
  await expect(page.getByText(message).first()).toBeVisible();
  expect(
    await prisma.dailyLedger.findUnique({
      where: { id: ledger.id },
      select: { version: true },
    }),
  ).toEqual({ version: ledger.version });
  expect(
    await prisma.ledgerInventoryItem.count({
      where: { dailyLedgerId: ledger.id },
    }),
  ).toBe(0);
  expect(
    await prisma.storeSalesPricePlan.count({
      where: {
        storeId: STORE_ID,
        businessDate: getTodayKstMidnight(),
        productId: product.id,
      },
    }),
  ).toBe(0);
});
