import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const THIRTY_PERCENT_DERIVED_KEY_PATTERN =
  /30[%_-]?단가|thirty[_-]?percent|thirty[_-]?percent[_-]?unit[_-]?price|price[_-]?30|margin[_-]?30/i;

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

async function expectInventorySaveSucceeded(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
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

function getCurrentKstYearMonth() {
  return getTodayKstMidnight().toISOString().slice(0, 7);
}

function getCurrentKstMonthStart() {
  const [year, month] = getCurrentKstYearMonth().split("-");

  return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
}

function getCurrentKstDayOfMonth() {
  return getTodayKstMidnight().getUTCDate();
}

function getPreviousKstMidnight() {
  const date = getTodayKstMidnight();
  date.setUTCDate(date.getUTCDate() - 1);

  return date;
}

function getPreviousMonthLastKstMidnight() {
  const date = getCurrentKstMonthStart();
  date.setUTCDate(date.getUTCDate() - 1);

  return date;
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

async function upsertLedger(
  closingDate: Date,
  actorId: string,
  status: "IN_PROGRESS" | "HEADQUARTERS_CLOSED" = "IN_PROGRESS",
) {
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
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      status,
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
  await cleanupStoryTwoFiveData();
});

test("지점장 재고 화면은 FIFO 재고금액은 노출하되 단가와 조정 금액은 직렬화하지 않는다", async ({
  page,
}) => {
  const inventoryResponseBodies: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/app/store-entry/inventory")) {
      return;
    }

    const contentType = response.headers()["content-type"] ?? "";
    if (
      !/json|text|html|x-component/i.test(contentType) ||
      response.request().resourceType() === "document"
    ) {
      return;
    }

    try {
      inventoryResponseBodies.push(await response.text());
    } catch {
      // Playwright can reject response body reads for redirected or cached assets.
    }
  });

  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 민감 차단 광어", "냉동", 987654);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 10,
      purchasedQuantity: 0,
      currentQuantity: 9,
      quantity: 9,
      inventoryAmount: 8_888_886,
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
      beforeAmount: 9_876_540,
      afterQuantity: 9,
      afterAmount: 8_888_886,
      differenceQuantity: -1,
      differenceAmount: -987_654,
      reason: "민감 금액 차단 확인",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row).toContainText(product.name);
  await expect(row).toContainText("10");
  await expect(row).toContainText("9");
  await expect(row.getByText("조정됨").first()).toBeVisible();
  // 보완(2026-06-22): FIFO 재고금액은 지점장에게도 노출한다.
  await expect(row).toContainText("8,888,886원");
  // 단가/조정 금액(조정 전·후·차이)은 계속 차단한다.
  await expect(row).not.toContainText("987,654원");
  await expect(row).not.toContainText("9,876,540원");
  await expect(row).not.toContainText("987654");
  await expect(row).not.toContainText("9876540");
  await expect(row).not.toContainText(THIRTY_PERCENT_DERIVED_KEY_PATTERN);

  const responsePayload = inventoryResponseBodies.join("\n");
  // inventoryAmount(FIFO 재고금액)는 노출되므로 차단 목록에서 제외한다.
  expect(responsePayload).not.toMatch(
    /unitPrice|purchaseAmount|lossAmount|beforeAmount|afterAmount|differenceAmount/,
  );
  expect(responsePayload).not.toMatch(THIRTY_PERCENT_DERIVED_KEY_PATTERN);
});

test("월초 스냅샷 기준 전일재고를 프리필하고 저장 후 수정 행을 유지한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-5 월초 광어", "냉동", 12000);

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentKstYearMonth(),
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
  await expect(page.getByText(/월초 이월 재고를 불러왔습니다/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "냉동" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "생물" })).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText("7").first()).toBeVisible();
  await page
    .getByRole("button", { name: `${product.name} 전일재고 이력 보기` })
    .click();

  const snapshotDialog = page.getByRole("dialog", { name: "전일재고 이력" });
  await expect(snapshotDialog).toBeVisible();
  await expect(snapshotDialog).toContainText(product.name);
  await expect(snapshotDialog).toContainText("월초 스냅샷");
  await expect(snapshotDialog).toContainText("현재 장부 전일재고");
  await expect(snapshotDialog).toContainText("날짜별 수량 흐름");
  await expect(snapshotDialog).toContainText("월초 스냅샷 수량");
  await expect(snapshotDialog).toContainText(getCurrentKstYearMonth());
  await expect(snapshotDialog).toContainText("7개");
  await snapshotDialog.getByRole("button", { name: "Close" }).click();

  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`);
  await currentQuantityInput.fill("9");
  await page.getByLabel(`${product.name} 조정 사유`).fill("실사 재고 차이");
  await page.getByRole("button", { name: `${product.name} 조정 기록` }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "조정이 저장됐습니다." }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByLabel(`${product.name} 당일재고`)).toHaveValue("9");
  const productRow = page.locator("tr").filter({ hasText: product.name });
  await expect(productRow.getByText("수정됨").first()).toBeVisible();
  await expect(productRow.getByText("조정됨").first()).toBeVisible();
  await expect(productRow).toHaveAttribute("aria-label", /수정됨/);
  await expect(productRow).toHaveAttribute("aria-label", /조정됨/);
});

test("직전 본사 마감 장부의 당일재고를 이후 영업일 전일재고로 불러온다", async ({
  page,
}) => {
  test.skip(
    getCurrentKstDayOfMonth() === 1,
    "월 1일에는 같은 달의 이전 영업일 마감 장부가 존재할 수 없어 월초 스냅샷 케이스로 검증한다.",
  );

  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 전일 우럭", "생물", 8000);

  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getPreviousKstMidnight(),
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
      carryoverStatus: "DATA_INSUFFICIENT",
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
  await page
    .getByRole("button", { name: `${product.name} 전일재고 이력 보기` })
    .click();

  const ledgerDialog = page.getByRole("dialog", { name: "전일재고 이력" });
  await expect(ledgerDialog).toBeVisible();
  await expect(ledgerDialog).toContainText(product.name);
  await expect(ledgerDialog).toContainText("직전 본사 마감 장부");
  await expect(ledgerDialog).toContainText("날짜별 수량 흐름");
  await expect(ledgerDialog).toContainText("기준 장부 시작 수량");
  await expect(ledgerDialog).toContainText("기준 장부 마감 수량");
  await expect(ledgerDialog).toContainText("현재 장부 전일재고");
  await expect(ledgerDialog).toContainText(
    getPreviousKstMidnight().toISOString().slice(0, 10),
  );
  await expect(ledgerDialog).toContainText("본사 마감");
  await expect(ledgerDialog).toContainText("11개");
});

test("직전 장부가 미마감이면 검토 필요 후보를 보여주고 저장을 허용한다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 검토 꽃게", "냉동", 5000);
  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getPreviousKstMidnight(),
      status: "IN_PROGRESS",
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
      previousQuantity: 0,
      purchasedQuantity: 0,
      currentQuantity: 6,
      quantity: 6,
      inventoryAmount: 30000,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/검토 필요 상태/)).toBeVisible();
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("검토 필요").first()).toBeVisible();
  await expect(row).toContainText("6");
  await page.getByLabel(`${product.name} 당일재고`).fill("6");
  await page.getByRole("button", { name: "저장" }).click();
  await expectInventorySaveSucceeded(page);
});

test("전일 근거가 없으면 이월 공백을 표시하고 0과 근거 부족을 구분한다", async ({
  page,
}) => {
  await login(page);
  const product = await seedProduct("스토리2-5 이월 공백 고등어", "냉동", 5000);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/이월 공백 상태/).first()).toBeVisible();
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("이월 공백").first()).toBeVisible();
  await expect(row.getByLabel(/^이월 공백:/)).toBeVisible();
});

test("월초 스냅샷에 누락된 활성 품목은 데이터 부족으로 표시한다", async ({
  page,
}) => {
  await login(page);
  const snapshotProduct = await seedProduct(
    "스토리2-5 스냅샷 광어",
    "냉동",
    12000,
  );
  const missingProduct = await seedProduct(
    "스토리2-5 스냅샷 누락 우럭",
    "냉동",
    9000,
  );

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentKstYearMonth(),
      productId: snapshotProduct.id,
      productName: snapshotProduct.name,
      productCategory: snapshotProduct.category,
      productSpec: snapshotProduct.spec,
      unitPrice: snapshotProduct.defaultUnitPrice,
      quantity: 8,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(
    page.getByText(/스냅샷이 없는 품목은 데이터 부족/),
  ).toBeVisible();

  const snapshotRow = page
    .locator("tr")
    .filter({ hasText: snapshotProduct.name });
  await expect(snapshotRow.getByText("월초 이월").first()).toBeVisible();
  await expect(snapshotRow).toContainText("8");

  const missingRow = page
    .locator("tr")
    .filter({ hasText: missingProduct.name });
  await expect(missingRow.getByText("데이터 부족").first()).toBeVisible();
  await expect(missingRow.getByLabel(/^데이터 부족:/)).toBeVisible();
});

test("월초 스냅샷이 없으면 더 과거 저장 장부 후보를 이월 공백으로 표시한다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 이전월 후보 갈치", "생물", 6000);
  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getPreviousMonthLastKstMidnight(),
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
      previousQuantity: 0,
      purchasedQuantity: 0,
      currentQuantity: 12,
      quantity: 12,
      inventoryAmount: 72000,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(
    `/app/store-entry/inventory?storeId=${STORY_STORE_ID}&date=${getCurrentKstYearMonth()}-01`,
  );
  await page.getByRole("tab", { name: "생물" }).click();

  await expect(page.getByText(/가장 최근 저장 장부/)).toBeVisible();
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("이월 공백").first()).toBeVisible();
  await expect(row).toContainText("12");
});

test("마감 후 이월 기준이 바뀌면 기존 입력을 덮어쓰지 않고 재확인 상태를 표시한다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 재확인 대구", "냉동", 11000);

  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getPreviousKstMidnight(),
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
      previousQuantity: 0,
      purchasedQuantity: 0,
      currentQuantity: 9,
      quantity: 9,
      inventoryAmount: 99000,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  const currentLedger = await upsertLedger(getTodayKstMidnight(), actorId);

  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: currentLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 6,
      purchasedQuantity: 0,
      currentQuantity: 4,
      quantity: 4,
      inventoryAmount: 44000,
      carryoverSource: "PREVIOUS_SAVED_LEDGER",
      carryoverStatus: "REVIEW_REQUIRED",
      carryoverLedgerId: previousLedger.id,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/이월 재확인 필요 상태/)).toBeVisible();
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("이월 재확인 필요").first()).toBeVisible();
  await expect(row.getByLabel(/^이월 재확인 필요:/)).toBeVisible();
  await expect(row).toContainText("6");
  await expect(page.getByLabel(`${product.name} 당일재고`)).toHaveValue("4");
});

test("30개 이상 재고 행은 50행 단위 페이지 처리를 제공한다", async ({
  page,
}) => {
  await login(page);
  await Promise.all(
    Array.from({ length: 55 }, (_, index) =>
      seedProduct(`스토리2-5 대량 ${String(index + 1).padStart(2, "0")}`),
    ),
  );

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/1-50 \/ \d+행/)).toBeVisible();
  await expect(page.getByText(/스토리2-5 대량 01/)).toBeVisible();
  await expect(page.getByText(/스토리2-5 대량 55/)).not.toBeVisible();

  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText(/51-\d+ \/ \d+행/)).toBeVisible();
  await expect(page.getByText(/스토리2-5 대량 55/)).toBeVisible();
});

test("390px 모바일에서 재고 행 검증 오류와 터치 가능한 편집 셀을 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const product = await seedProduct("스토리2-5 모바일 참돔", "냉동", 7000);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`);
  await currentQuantityInput.fill("1");
  await currentQuantityInput.pressSequentially("a");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("재고 수량은 0 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(currentQuantityInput).toBeFocused();
  await expect(currentQuantityInput).toHaveAttribute("aria-invalid", "true");
  const describedBy =
    await currentQuantityInput.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText(
    "재고 수량은 0 이상의 정수여야 합니다.",
  );

  await expect(currentQuantityInput).toHaveAttribute("inputmode", "numeric");
  const inputBox = await currentQuantityInput.boundingBox();
  const saveBox = await page
    .getByRole("button", { name: "저장" })
    .boundingBox();

  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);
});

test("stale version 재고 저장은 conflict dialog를 보여주고 입력값을 쓰지 않는다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 stale 재고 방어", "냉동", 7000);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);

  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentKstYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 5,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`);
  await expect(currentQuantityInput).toBeVisible();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "재고 저장 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await currentQuantityInput.fill("5");
  await page.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("재고").first()).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const savedInventoryCount = await prisma.ledgerInventoryItem.count({
    where: { dailyLedgerId: ledger.id, productId: product.id },
  });
  expect(savedInventoryCount).toBe(0);
});
