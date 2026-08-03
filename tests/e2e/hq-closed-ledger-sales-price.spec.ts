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
    await prisma.ledgerLossItem.deleteMany({
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
  const inventoryPanel = page.locator(
    '[data-ledger-detail-panel="inventory"]',
  );

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
  await inventoryPanel.getByLabel("본사 수정 사유").fill("판매한 가격 오기입 정정");
  await inventoryPanel.getByRole("button", { name: "저장", exact: true }).click();

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

  const inventoryPanel = page.locator(
    '[data-ledger-detail-panel="inventory"]',
  );

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
  await inventoryPanel.getByRole("button", { name: "저장", exact: true }).click();

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
test("마감 장부 재고·판매가격의 오래된 화면 저장은 충돌로 거부된다", async ({
  page,
}) => {
  const { actorId, ledger, productA } = await seedClosedLedgerWithPrices();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "재고" }).click();

  const inventoryPanel = page.locator(
    '[data-ledger-detail-panel="inventory"]',
  );

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
