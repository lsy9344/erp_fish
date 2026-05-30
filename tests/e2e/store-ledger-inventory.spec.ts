import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";

test.afterAll(async () => {
  await cleanupStoryTwoFourData();
  await prisma.$disconnect();
});

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function seedProduct(name: string, category = "냉동", unitPrice = 12000) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);

  return prisma.product.create({
    data: {
      name: `${name} ${suffix}`,
      category,
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoFourData() {
  const products = await prisma.product.findMany({
    where: {
      name: { startsWith: "스토리2-4" },
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);

  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORY_STORE_ID },
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
      where: { productId: { in: productIds } },
    });
    await prisma.purchaseStandard.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }
}

test.beforeEach(async () => {
  await cleanupStoryTwoFourData();
});

test("월초 스냅샷 기준 전일재고를 프리필하고 저장 후 수정 행을 유지한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-4 월초 광어", "냉동", 12000);

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: "2026-05",
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 7,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByRole("heading", { name: "재고 입력" })).toBeVisible();
  await expect(
    page.getByText("전일 재고를 불러왔습니다. 변경된 품목만 수정하세요."),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "냉동" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "생물" })).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText("7").first()).toBeVisible();

  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`);
  await currentQuantityInput.fill("9");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  await page.reload();

  await expect(page.getByLabel(`${product.name} 당일재고`)).toHaveValue("9");
  const productRow = page.locator("tr").filter({ hasText: product.name });
  await expect(productRow.getByText("수정됨").first()).toBeVisible();
  await expect(productRow).toHaveAttribute("aria-label", /수정됨/);
});

test("직전 본사 마감 장부의 당일재고를 이후 영업일 전일재고로 불러온다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-4 전일 우럭", "생물", 8000);

  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: new Date("2026-05-28T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: previousLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 4,
      purchasedQuantity: 0,
      currentQuantity: 11,
      inventoryAmount: 88000,
      carryoverSource: "MANUAL",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  await page.getByRole("tab", { name: "생물" }).click();

  await expect(page.getByText(product.name)).toBeVisible();
  await expect(
    page.locator("tr").filter({ hasText: product.name }),
  ).toContainText("11");
});

test("직전 장부가 미마감이면 수동 입력 안내를 보여주고 저장을 허용한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-4 수동 꽃게", "냉동", 5000);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/직접 입력하거나 본사에 문의/)).toBeVisible();
  await page.getByLabel(`${product.name} 당일재고`).fill("2");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();
});

test("390px 모바일에서 재고 행 검증 오류와 터치 가능한 편집 셀을 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const product = await seedProduct("스토리2-4 모바일 참돔", "냉동", 7000);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`);
  await currentQuantityInput.fill("1");
  await currentQuantityInput.pressSequentially("a");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("재고 수량은 0 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(currentQuantityInput).toBeFocused();

  await expect(currentQuantityInput).toHaveAttribute("inputmode", "numeric");
  const inputBox = await currentQuantityInput.boundingBox();
  const saveBox = await page
    .getByRole("button", { name: "저장" })
    .boundingBox();

  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);
});
