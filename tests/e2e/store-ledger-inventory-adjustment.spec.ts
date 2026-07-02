import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
  type Prisma,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const STORY_MARKER = "story-2-7-test";

test.afterAll(async () => {
  await cleanupStoryTwoSevenAdjustmentData();
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
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

function getAdjustmentButton(page: Page, productName: string) {
  return page.getByRole("button", { name: `${productName} 고친 이유 저장` });
}

function getInventorySaveButton(page: Page) {
  return page.getByRole("button", { name: "저장", exact: true });
}

function inventoryRow(page: Page, productName: string) {
  return page.locator("tr").filter({ hasText: productName });
}

async function fillInventoryQuantityAndWait(
  page: Page,
  productName: string,
  quantity: string,
) {
  const input = page.getByLabel(`${productName} 당일재고`, { exact: true });
  const row = inventoryRow(page, productName);

  await expect(row).toBeVisible();
  await expect(async () => {
    await input.fill(quantity);
    await expect(row.getByText("고칠 내용 있음").first()).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 15_000 });

  return row;
}

async function expectInventorySaveSucceeded(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
}

async function seedProduct(name: string, category = "냉동", unitPrice = 12000) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);

  const product = await prisma.product.create({
    data: {
      name: `${name} ${suffix}`,
      category,
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });

  // defaultUnitPrice는 nullable이지만 시드에서 항상 단가를 넣으므로 non-null로 좁혀 반환한다.
  return { ...product, defaultUnitPrice: unitPrice };
}

async function seedLossType(name: string) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);

  return prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: `${name} ${suffix}`,
      displayOrder: 500,
      isActive: true,
      updatedById: actorId,
    },
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

function getCurrentYearMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

async function seedTodayLedger(status: DailyLedgerStatus = "IN_PROGRESS") {
  const actorId = await getHeadquartersUserId();
  const closingDate = getTodayKstMidnight();

  return prisma.dailyLedger.upsert({
    where: {
      storeId_closingDate: {
        storeId: STORY_STORE_ID,
        closingDate,
      },
    },
    create: {
      storeId: STORY_STORE_ID,
      closingDate,
      status,
      workMemo: STORY_MARKER,
      lossReviewedAt: new Date(),
      lossReviewedById: actorId,
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      status,
      workMemo: STORY_MARKER,
      lossReviewedAt: new Date(),
      lossReviewedById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoSevenAdjustmentData() {
  const products = await prisma.product.findMany({
    where: {
      name: { startsWith: "스토리2-7" },
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const lossTypes = await prisma.ledgerInputCode.findMany({
    where: {
      group: "LOSS_TYPE",
      name: { startsWith: "스토리2-7" },
    },
    select: { id: true },
  });
  const lossTypeIds = lossTypes.map((lossType) => lossType.id);
  const ledgerFilters: Prisma.DailyLedgerWhereInput[] = [
    { workMemo: { startsWith: STORY_MARKER } },
  ];

  if (productIds.length > 0) {
    ledgerFilters.push(
      {
        ledgerInventoryAdjustments: { some: { productId: { in: productIds } } },
      },
      { ledgerInventoryItems: { some: { productId: { in: productIds } } } },
      { ledgerPurchaseItems: { some: { productId: { in: productIds } } } },
    );
  }

  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      storeId: STORY_STORE_ID,
      OR: ledgerFilters,
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

  if (lossTypeIds.length > 0) {
    await prisma.ledgerLossItem.deleteMany({
      where: { ledgerInputCodeId: { in: lossTypeIds } },
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

  if (lossTypeIds.length > 0) {
    await prisma.ledgerInputCode.deleteMany({
      where: { id: { in: lossTypeIds } },
    });
  }
}

test.beforeEach(async () => {
  await cleanupStoryTwoSevenAdjustmentData();
});

test("실제 재고 차이를 바꾼 이유와 함께 저장하고 재방문 시 표시한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-7 조정 광어", "냉동", 12000);
  const ledger = await seedTodayLedger();

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 7,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await fillInventoryQuantityAndWait(page, product.name, "9");

  await page
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("실사 재고 차이");
  await getInventorySaveButton(page).click();

  await expectInventorySaveSucceeded(page);
  await page.reload();

  const updatedRow = page.locator("tr").filter({ hasText: product.name });
  await expect(updatedRow.getByText("고침 완료").first()).toBeVisible();
  await expect(updatedRow).toHaveAttribute("aria-label", /고침 완료/);
  await expect(updatedRow.getByText("고치기 전")).toBeVisible();
  await expect(updatedRow.getByText("7").first()).toBeVisible();
  await expect(updatedRow.getByText("고친 후")).toBeVisible();
  await expect(updatedRow.getByText("9").first()).toBeVisible();
  await expect(updatedRow.getByText("바뀐 수량").first()).toBeVisible();
  await expect(updatedRow.getByText("+2", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`${product.name} 재고 조정 이유`)).toHaveValue(
    "실사 재고 차이",
  );
  await expect(updatedRow.getByText("금액 기준 확인 필요")).toBeVisible();

  const adjustment = await prisma.ledgerInventoryAdjustment.findUnique({
    where: {
      dailyLedgerId_productId: {
        dailyLedgerId: ledger.id,
        productId: product.id,
      },
    },
    select: {
      beforeQuantity: true,
      afterQuantity: true,
      differenceQuantity: true,
      amountStatus: true,
      reason: true,
    },
  });

  expect(adjustment).toMatchObject({
    beforeQuantity: 7,
    afterQuantity: 9,
    differenceQuantity: 2,
    amountStatus: "POLICY_UNCONFIRMED",
    reason: "실사 재고 차이",
  });

  await expect(updatedRow).not.toContainText(
    /unitPrice|purchaseAmount|lossAmount|inventoryAmount|beforeAmount|afterAmount|differenceAmount|FIFO/,
  );

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: "ledger.inventory.saved",
      targetType: "DailyLedger",
      targetId: ledger.id,
    },
    orderBy: { createdAt: "desc" },
  });

  expect(auditLog?.actorId).toBeTruthy();
  expect(auditLog?.createdAt).toBeTruthy();
  expect(auditLog?.before).toBeTruthy();
  expect(auditLog?.after).toBeTruthy();
});

test("바꾼 이유가 비어 있으면 저장을 막고 이유 필드에 포커스한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const product = await seedProduct("스토리2-7 사유 우럭", "냉동", 8000);
  await seedTodayLedger();

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 4,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  const row = await fillInventoryQuantityAndWait(page, product.name, "6");
  const reasonInput = page.getByLabel(`${product.name} 재고 조정 이유`);
  const saveButton = getInventorySaveButton(page);

  await saveButton.click();

  await expect(
    row.getByRole("alert").filter({
      hasText: /기준재고 4개인데 당일재고가 6개입니다/,
    }),
  ).toBeVisible();
  await expect(reasonInput).toBeFocused();

  const inputBox = await reasonInput.boundingBox();
  const buttonBox = await saveButton.boundingBox();

  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
});

test("본사 마감 장부는 원본 재고 조정을 막고 정정 기록 안내를 보여준다", async ({
  page,
}) => {
  const product = await seedProduct("스토리2-7 마감 참돔", "냉동", 7000);
  await seedTodayLedger("HEADQUARTERS_CLOSED");

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 3,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(
    page
      .getByText(
        "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("정정 기록 사용").first()).toBeVisible();
  await expect(getAdjustmentButton(page, product.name)).toHaveCount(0);
});

test("검토 대기 장부에서도 권한 있는 사용자가 원본 재고 조정을 저장한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-7 검토 농어", "생물", 9000);
  await seedTodayLedger("IN_REVIEW");

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 5,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  await page.getByRole("tab", { name: "생물" }).click();
  await fillInventoryQuantityAndWait(page, product.name, "4");
  await page
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("검토 중 실사 차이");
  await getInventorySaveButton(page).click();

  await expectInventorySaveSucceeded(page);
  await expect(
    page
      .locator("tr")
      .filter({ hasText: product.name })
      .getByText("고침 완료")
      .first(),
  ).toBeVisible();
});

test("손실 저장 후 기존 재고 조정의 기준 수량과 차이를 재계산한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct(
    "스토리2-7 손실 재계산 방어",
    "냉동",
    11000,
  );
  const lossType = await seedLossType("스토리2-7 재계산 폐기");
  const ledger = await seedTodayLedger();

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 10,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  await fillInventoryQuantityAndWait(page, product.name, "12");
  await page
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("손실 반영 전 실사");
  await getInventorySaveButton(page).click();
  await expectInventorySaveSucceeded(page);

  let adjustment = await prisma.ledgerInventoryAdjustment.findUnique({
    where: {
      dailyLedgerId_productId: {
        dailyLedgerId: ledger.id,
        productId: product.id,
      },
    },
    select: {
      beforeQuantity: true,
      afterQuantity: true,
      differenceQuantity: true,
      amountStatus: true,
      reason: true,
    },
  });

  expect(adjustment).toMatchObject({
    beforeQuantity: 10,
    afterQuantity: 12,
    differenceQuantity: 2,
    amountStatus: "POLICY_UNCONFIRMED",
    reason: "손실 반영 전 실사",
  });

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("처리 유형").selectOption(lossType.id);
  await page.getByLabel("수량").fill("3");
  await page.getByLabel("실제 판매/회수액(원)").fill("33000");
  await page.getByLabel("사유/특이사항").fill("조정 후 폐기 발견");
  await page.getByRole("button", { name: "저장" }).first().click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  const updatedRow = page.locator("tr").filter({ hasText: product.name });

  await expect(updatedRow.getByText("고침 완료").first()).toBeVisible();
  await expect(updatedRow.getByText("기준 7")).toBeVisible();
  await expect(updatedRow.getByText("고치기 전")).toBeVisible();
  await expect(updatedRow.getByText("7").first()).toBeVisible();
  await expect(updatedRow.getByText("고친 후")).toBeVisible();
  await expect(updatedRow.getByText("12").first()).toBeVisible();
  await expect(updatedRow.getByText("바뀐 수량").first()).toBeVisible();
  await expect(updatedRow.getByText("+5", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`${product.name} 재고 조정 이유`)).toHaveValue(
    "손실 반영 전 실사",
  );

  adjustment = await prisma.ledgerInventoryAdjustment.findUnique({
    where: {
      dailyLedgerId_productId: {
        dailyLedgerId: ledger.id,
        productId: product.id,
      },
    },
    select: {
      beforeQuantity: true,
      afterQuantity: true,
      differenceQuantity: true,
      amountStatus: true,
      reason: true,
    },
  });

  expect(adjustment).toMatchObject({
    beforeQuantity: 7,
    afterQuantity: 12,
    differenceQuantity: 5,
    amountStatus: "POLICY_UNCONFIRMED",
    reason: "손실 반영 전 실사",
  });
});
