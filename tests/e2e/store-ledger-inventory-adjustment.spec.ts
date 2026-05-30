import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
  type Prisma,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const STORY_MARKER = "story-2-5-test";

test.afterAll(async () => {
  await cleanupStoryTwoFiveData();
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
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      status,
      workMemo: STORY_MARKER,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoFiveData() {
  const products = await prisma.product.findMany({
    where: {
      name: { startsWith: "스토리2-5" },
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
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
  await cleanupStoryTwoFiveData();
});

test("실제 재고 차이를 조정 사유와 함께 저장하고 재방문 시 표시한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-5 조정 광어", "냉동", 12000);
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

  await page.getByLabel(`${product.name} 당일재고`).fill("9");
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("조정 필요").first()).toBeVisible();

  await page.getByLabel(`${product.name} 조정 사유`).fill("실사 재고 차이");
  await page.getByRole("button", { name: `${product.name} 조정 기록` }).click();

  await expect(page.getByText("조정이 저장됐습니다.")).toBeVisible();
  await page.reload();

  const updatedRow = page.locator("tr").filter({ hasText: product.name });
  await expect(updatedRow.getByText("조정됨").first()).toBeVisible();
  await expect(updatedRow).toHaveAttribute("aria-label", /조정됨/);
  await expect(updatedRow.getByText("조정 전")).toBeVisible();
  await expect(updatedRow.getByText("7").first()).toBeVisible();
  await expect(updatedRow.getByText("조정 후")).toBeVisible();
  await expect(updatedRow.getByText("9").first()).toBeVisible();
  await expect(updatedRow.getByText("차이").first()).toBeVisible();
  await expect(updatedRow.getByText("+2")).toBeVisible();
  await expect(updatedRow.getByText("실사 재고 차이")).toBeVisible();

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: "ledger.inventory_adjustment.saved",
      targetType: "DailyLedger",
      targetId: ledger.id,
      reason: "실사 재고 차이",
    },
    orderBy: { createdAt: "desc" },
  });

  expect(auditLog?.actorId).toBeTruthy();
  expect(auditLog?.createdAt).toBeTruthy();
  expect(auditLog?.before).toBeTruthy();
  expect(auditLog?.after).toBeTruthy();
});

test("조정 사유가 비어 있으면 저장을 막고 사유 필드에 포커스한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const product = await seedProduct("스토리2-5 사유 우럭", "냉동", 8000);
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

  await page.getByLabel(`${product.name} 당일재고`).fill("6");
  const reasonInput = page.getByLabel(`${product.name} 조정 사유`);
  const saveButton = page.getByRole("button", {
    name: `${product.name} 조정 기록`,
  });

  await saveButton.click();

  await expect(page.getByText("조정 사유를 입력해 주세요.")).toBeVisible();
  await expect(reasonInput).toBeFocused();

  const inputBox = await reasonInput.boundingBox();
  const buttonBox = await saveButton.boundingBox();

  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
});

test("본사 마감 장부는 원본 재고 조정을 막고 정정 기록 안내를 보여준다", async ({
  page,
}) => {
  const product = await seedProduct("스토리2-5 마감 참돔", "냉동", 7000);
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
  await expect(
    page.getByRole("button", { name: `${product.name} 조정 기록` }),
  ).toBeDisabled();
});

test("검토 대기 장부에서도 권한 있는 사용자가 원본 재고 조정을 저장한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-5 검토 농어", "생물", 9000);
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
  await page.getByLabel(`${product.name} 당일재고`).fill("4");
  await page.getByLabel(`${product.name} 조정 사유`).fill("검토 중 실사 차이");
  await page.getByRole("button", { name: `${product.name} 조정 기록` }).click();

  await expect(page.getByText("조정이 저장됐습니다.")).toBeVisible();
  await expect(
    page
      .locator("tr")
      .filter({ hasText: product.name })
      .getByText("조정됨")
      .first(),
  ).toBeVisible();
});
