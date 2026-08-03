import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const STORE_ID = "store-story-d6-closed-price";
const PRODUCT_A_NAME = "스토리D6 광어";
const PRODUCT_B_NAME = "스토리D6 우럭";
const LOSS_CODE_NAME = "스토리D6 폐기";

test.beforeEach(async () => {
  await cleanupStoryData();
});

test.afterAll(async () => {
  await cleanupStoryData();
  await prisma.$disconnect();
});

async function loginAsHq(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq@example.com");
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

function getKstMidnight(offsetDays = 0) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + offsetDays);

  return date;
}

async function seedClosedLedgerWithPrices() {
  const actorId = await getHeadquartersUserId();
  const closingDate = getKstMidnight();

  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "스토리D6 마감점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const [productA, productB] = [
    await prisma.product.create({
      data: {
        name: PRODUCT_A_NAME,
        category: "수산물",
        spec: "1kg",
        defaultUnitPrice: 1000,
        updatedById: actorId,
      },
    }),
    await prisma.product.create({
      data: {
        name: PRODUCT_B_NAME,
        category: "수산물",
        spec: "1kg",
        defaultUnitPrice: 1200,
        updatedById: actorId,
      },
    }),
  ];
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      name: LOSS_CODE_NAME,
      group: "LOSS_TYPE",
      displayOrder: 1,
      isActive: true,
      updatedById: actorId,
    },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 50000,
      cashAmount: 50000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 2,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt: new Date(),
    },
  });

  // 품목 A: 손실이 있어 판매가 기준 손실금액 재산정 대상이다. 기준재고와 당일재고가
  // 일치해 조정 사유 없이 저장할 수 있다.
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productA.id,
      productName: productA.name,
      productCategory: productA.category,
      productSpec: productA.spec,
      unitPrice: 1000,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 12,
      quantity: 12,
      inventoryAmount: 12000,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  // 품목 B: 판매가가 없던 품목. 함께 저장될 수 있어야 한다.
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productB.id,
      productName: productB.name,
      productCategory: productB.category,
      productSpec: productB.spec,
      unitPrice: 1200,
      previousQuantity: 4,
      purchasedQuantity: 0,
      currentQuantity: 4,
      quantity: 4,
      inventoryAmount: 4800,
      isModified: false,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productA.id,
      ledgerInputCodeId: lossCode.id,
      productName: productA.name,
      productCategory: productA.category,
      productSpec: productA.spec,
      unitPrice: 1500,
      lossTypeName: lossCode.name,
      quantity: 3,
      recoveredAmount: 0,
      amount: 4500,
      usedPlannedPrice: true,
      reason: "seed",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  // 지점장이 입력한 판매가(마감일). 다른 날짜 가격도 함께 심어 불변을 검증한다.
  for (const offsetDays of [-1, 0, 1]) {
    await prisma.storeSalesPricePlan.create({
      data: {
        storeId: store.id,
        businessDate: getKstMidnight(offsetDays),
        productId: productA.id,
        plannedUnitPrice: 1500,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  }

  return { actorId, ledger, productA, productB };
}

async function seedClosedLedgerForDashboardRecalc() {
  const actorId = await getHeadquartersUserId();
  const closingDate = getKstMidnight();

  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "스토리D6 마감점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const productA = await prisma.product.create({
    data: {
      name: PRODUCT_A_NAME,
      category: "수산물",
      spec: "1kg",
      defaultUnitPrice: 1000,
      updatedById: actorId,
    },
  });
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      name: LOSS_CODE_NAME,
      group: "LOSS_TYPE",
      displayOrder: 1,
      isActive: true,
      updatedById: actorId,
    },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 50000,
      cashAmount: 50000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 2,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt: new Date(),
    },
  });

  // 품목 A: 판매수량 = 전일 10 + 매입 5 - 손실 3 - 당일재고 7 = 5개.
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productA.id,
      productName: productA.name,
      productCategory: productA.category,
      productSpec: productA.spec,
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
  // 저장 시 FIFO 재계산과 동일한 lot 구성을 심어 저장 전후 재고금액/COGS가
  // 달라지지 않게 한다: 기초 10개 중 8개 소진 + 매입 5개 미소진(잔존 7개 = 7,000원,
  // COGS 8,000원).
  await prisma.ledgerInventoryFifoLot.createMany({
    data: [
      {
        dailyLedgerId: ledger.id,
        ledgerInventoryItemId: inventoryItem.id,
        productId: productA.id,
        sourceType: "LEGACY_OPENING",
        sourceBusinessDate: closingDate,
        unitPrice: 1000,
        originalQuantity: 10,
        consumedQuantity: 8,
        remainingQuantity: 2,
        originalAmount: 10000,
        consumedAmount: 8000,
        remainingAmount: 2000,
        sortOrder: 0,
      },
      {
        dailyLedgerId: ledger.id,
        ledgerInventoryItemId: inventoryItem.id,
        productId: productA.id,
        sourceType: "PURCHASE",
        sourceBusinessDate: closingDate,
        unitPrice: 1000,
        originalQuantity: 5,
        consumedQuantity: 0,
        remainingQuantity: 5,
        originalAmount: 5000,
        consumedAmount: 0,
        remainingAmount: 5000,
        sortOrder: 1,
      },
    ],
  });
  // 매입 행: 저장 시 purchasedQuantity 동기화가 5개를 유지하게 한다.
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productA.id,
      sourceType: "MANUAL",
      productName: productA.name,
      productCategory: productA.category,
      productSpec: productA.spec,
      unitPrice: 1000,
      quantity: 5,
      amount: 5000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: productA.id,
      ledgerInputCodeId: lossCode.id,
      productName: productA.name,
      productCategory: productA.category,
      productSpec: productA.spec,
      unitPrice: 2000,
      lossTypeName: lossCode.name,
      quantity: 3,
      recoveredAmount: 0,
      amount: 6000,
      usedPlannedPrice: true,
      reason: "seed",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: store.id,
      businessDate: closingDate,
      productId: productA.id,
      plannedUnitPrice: 2000,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return { actorId, ledger, productA };
}

async function cleanupStoryData() {
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryFifoLot.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLossItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerPurchaseItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryAdjustment.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({ where: { id: { in: ledgerIds } } });
  }

  await prisma.storeSalesPricePlan.deleteMany({ where: { storeId: STORE_ID } });

  const products = await prisma.product.findMany({
    where: { name: { in: [PRODUCT_A_NAME, PRODUCT_B_NAME] } },
    select: { id: true },
  });
  if (products.length > 0) {
    await prisma.product.deleteMany({
      where: { id: { in: products.map((product) => product.id) } },
    });
  }

  await prisma.ledgerInputCode.deleteMany({ where: { name: LOSS_CODE_NAME } });
  await prisma.store.deleteMany({ where: { id: STORE_ID } });
}

test("마스터가 지점장이 입력한 판매한 가격을 마감 장부 재고 탭에서 수정한다", async ({
  page,
}) => {
  const { ledger, productA } = await seedClosedLedgerWithPrices();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "재고" }).click();

  // 다른 탭의 수정 사유/저장 버튼이 forceMount로 함께 존재하므로 재고 패널로 한정한다.
  const inventoryPanel = page.locator('[data-ledger-detail-panel="inventory"]');

  const priceInput = inventoryPanel.getByLabel(`${PRODUCT_A_NAME} 판매한 가격`);
  await expect(priceInput).toBeVisible();
  await expect(priceInput).toBeEnabled();
  // 판매가가 없는 품목도 같은 행 목록에 입력 없이 함께 보인다.
  await expect(
    inventoryPanel.getByLabel(`${PRODUCT_B_NAME} 판매한 가격`),
  ).toBeVisible();

  await priceInput.click();
  await priceInput.press("Control+A");
  await priceInput.pressSequentially("1800");
  await inventoryPanel
    .getByLabel("본사 수정 사유")
    .fill("판매한 가격 오기입 정정");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const plan = await prisma.storeSalesPricePlan.findFirst({
        where: {
          storeId: STORE_ID,
          businessDate: getKstMidnight(),
          productId: productA.id,
        },
        select: { plannedUnitPrice: true },
      });

      return plan?.plannedUnitPrice;
    })
    .toBe(1800);

  // 다른 날짜의 같은 품목 가격은 변하지 않는다.
  for (const offsetDays of [-1, 1]) {
    const plan = await prisma.storeSalesPricePlan.findFirst({
      where: {
        storeId: STORE_ID,
        businessDate: getKstMidnight(offsetDays),
        productId: productA.id,
      },
      select: { plannedUnitPrice: true },
    });
    expect(plan?.plannedUnitPrice).toBe(1500);
  }

  // 판매가 기준 손실금액이 새 가격으로 재산정된다(3개 × 1800원).
  await expect
    .poll(async () => {
      const loss = await prisma.ledgerLossItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: productA.id },
        select: { unitPrice: true, amount: true, usedPlannedPrice: true },
      });

      return loss;
    })
    .toMatchObject({
      unitPrice: 1800,
      amount: 5400,
      usedPlannedPrice: true,
    });
});

test("마감 장부 재고 저장은 빈 가격 유지, 0원 저장, 무가격 품목 혼합을 지원한다", async ({
  page,
}) => {
  const { ledger, productA, productB } = await seedClosedLedgerWithPrices();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "재고" }).click();

  const inventoryPanel = page.locator('[data-ledger-detail-panel="inventory"]');

  const priceA = inventoryPanel.getByLabel(`${PRODUCT_A_NAME} 판매한 가격`);
  const priceB = inventoryPanel.getByLabel(`${PRODUCT_B_NAME} 판매한 가격`);

  // 품목 A 가격을 비우고(변경 없음), 품목 B에 0원을 저장한다.
  await priceA.click();
  await priceA.press("Control+A");
  await priceA.press("Backspace");
  await priceB.click();
  await priceB.press("Control+A");
  await priceB.pressSequentially("0");
  await inventoryPanel
    .getByLabel("본사 수정 사유")
    .fill("무가격 품목 0원 저장 확인");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const [planA, planB] = await Promise.all([
        prisma.storeSalesPricePlan.findFirst({
          where: {
            storeId: STORE_ID,
            businessDate: getKstMidnight(),
            productId: productA.id,
          },
          select: { plannedUnitPrice: true },
        }),
        prisma.storeSalesPricePlan.findFirst({
          where: {
            storeId: STORE_ID,
            businessDate: getKstMidnight(),
            productId: productB.id,
          },
          select: { plannedUnitPrice: true },
        }),
      ]);

      return { planA: planA?.plannedUnitPrice, planB: planB?.plannedUnitPrice };
    })
    .toEqual({ planA: 1500, planB: 0 });
});

// DESIGN.md D8: 마감 재고/판매가격 저장도 오래된 화면 저장은 충돌로 거부된다.
// DESIGN.md D6/테스트 계획 5: 판매가격 수정 후 관제판의 예상매출·예상 마진율이 같은
// 날짜 기준으로 갱신되는지 처음부터 끝까지 검증한다.
test("판매한 가격 수정 후 관제판 예상매출·예상 마진율이 갱신된다", async ({
  page,
}) => {
  const { ledger, productA } = await seedClosedLedgerForDashboardRecalc();

  await loginAsHq(page);

  const dashboardRow = page.getByTestId(`hq-dashboard-row-${STORE_ID}`);

  // 수정 전: 판매수량 5개 × 2,000원 = 예상매출 10,000원,
  // 예상 마진율 (10,000 - COGS 8,000) / 10,000 = 20%.
  await page.goto("/app/dashboard?date=today");
  await expect(dashboardRow).toContainText("예상매출 ₩10,000");
  await expect(dashboardRow).toContainText("예상 20.0%");

  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "재고" }).click();

  const inventoryPanel = page.locator('[data-ledger-detail-panel="inventory"]');
  const priceInput = inventoryPanel.getByLabel(`${PRODUCT_A_NAME} 판매한 가격`);
  await priceInput.click();
  await priceInput.press("Control+A");
  await priceInput.pressSequentially("1800");
  await inventoryPanel
    .getByLabel("본사 수정 사유")
    .fill("관제판 재계산 확인용 가격 수정");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const plan = await prisma.storeSalesPricePlan.findFirst({
        where: {
          storeId: STORE_ID,
          businessDate: getKstMidnight(),
          productId: productA.id,
        },
        select: { plannedUnitPrice: true },
      });

      return plan?.plannedUnitPrice;
    })
    .toBe(1800);

  // 수정 후: 판매수량 5개 × 1,800원 = 예상매출 9,000원,
  // 예상 마진율 (9,000 - COGS 8,000) / 9,000 = 11.1%.
  await page.goto("/app/dashboard?date=today");
  await expect(dashboardRow).toContainText("예상매출 ₩9,000");
  await expect(dashboardRow).toContainText("예상 11.1%");
});

test("마감 장부 재고·판매가격의 오래된 화면 저장은 충돌로 거부된다", async ({
  page,
}) => {
  const { actorId, ledger, productA } = await seedClosedLedgerWithPrices();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "재고" }).click();

  const inventoryPanel = page.locator('[data-ledger-detail-panel="inventory"]');

  // 화면 로드 후 다른 곳에서 장부가 바뀌면(UpdatedAt/version 변동) stale token이다.
  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: { workerCount: 3, updatedById: actorId, version: { increment: 1 } },
  });

  const priceInput = inventoryPanel.getByLabel(`${PRODUCT_A_NAME} 판매한 가격`);
  await priceInput.click();
  await priceInput.press("Control+A");
  await priceInput.pressSequentially("1900");
  await inventoryPanel
    .getByLabel("본사 수정 사유")
    .fill("stale 마감 재고 저장 확인");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect(
    page.getByRole("dialog", { name: "저장 충돌이 발생했습니다" }),
  ).toBeVisible();

  // 판매가격은 변하지 않는다.
  const plan = await prisma.storeSalesPricePlan.findFirst({
    where: {
      storeId: STORE_ID,
      businessDate: getKstMidnight(),
      productId: productA.id,
    },
    select: { plannedUnitPrice: true },
  });
  expect(plan?.plannedUnitPrice).toBe(1500);
});
