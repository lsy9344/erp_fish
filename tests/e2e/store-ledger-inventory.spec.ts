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

function lossSaveButton(page: Page) {
  return page.locator('button[type="submit"]').filter({ hasText: "저장" });
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

function getCurrentKstDayOfMonth() {
  return getTodayKstMidnight().getUTCDate();
}

function getPreviousKstMidnight() {
  const date = getTodayKstMidnight();
  date.setUTCDate(date.getUTCDate() - 1);

  return date;
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

async function markLossStepReviewed(ledgerId: string, actorId: string) {
  await prisma.dailyLedger.update({
    where: { id: ledgerId },
    data: {
      lossReviewedAt: new Date(),
      lossReviewedById: actorId,
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

  // 손실 시드용 LOSS_TYPE 입력코드 정리(손실 행 삭제 후라 FK 충돌 없음).
  await prisma.ledgerInputCode.deleteMany({
    where: { group: "LOSS_TYPE", name: { startsWith: "스토리2-5" } },
  });
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
  await expect(row.getByText("고침 완료").first()).toBeVisible();
  // 재고금액은 카드에서 제거됐다(2026-06-25). FIFO 금액 텍스트도 더는 노출하지 않는다.
  await expect(row).not.toContainText("8,888,886원");
  // 단가/조정 금액(고치기 전·고친 후·바뀐 수량)은 계속 차단한다.
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
  const actorId = await getHeadquartersUserId();
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);
  await markLossStepReviewed(ledger.id, actorId);
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

  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`, {
    exact: true,
  });
  await currentQuantityInput.fill("9");
  await page
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("실사 재고 차이");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expectInventorySaveSucceeded(page);

  await page.reload();

  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("9");
  const productRow = page.locator("tr").filter({ hasText: product.name });
  await expect(productRow.getByText("수정됨").first()).toBeVisible();
  await expect(productRow.getByText("고침 완료").first()).toBeVisible();
  await expect(productRow).toHaveAttribute("aria-label", /수정됨/);
  await expect(productRow).toHaveAttribute("aria-label", /고침 완료/);
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

  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);
  await markLossStepReviewed(ledger.id, actorId);

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

// WO-11(2026-06-28): 상단 "전날 재고 보기" 모달은 품목/규격/수량/FIFO 기준일만 보여주고
// 금액·단가·원가·마진은 보여주지 않는다. 전날 장부 수정 링크도 없다.
test("지점장은 전날 재고 보기에서 품목·수량만 보고 금액·단가는 보지 않는다", async ({
  page,
}) => {
  test.skip(
    getCurrentKstDayOfMonth() === 1,
    "월 1일에는 같은 달의 이전 영업일 마감 장부가 존재할 수 없다.",
  );

  await login(page);
  const actorId = await getHeadquartersUserId();
  // 단가/금액을 눈에 띄는 큰 값으로 둬서 모달에 새면 바로 잡히게 한다.
  const product = await seedProduct("스토리2-5 전날보기 대구", "생물", 777_777);

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
      currentQuantity: 13,
      inventoryAmount: 9_888_888,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await upsertLedger(getTodayKstMidnight(), actorId);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "전날 재고 보기" }).click();

  const dialog = page.getByRole("dialog", { name: "전날 재고 보기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(product.name);
  await expect(dialog).toContainText(product.spec);
  // 전일재고 수량(13)은 보인다.
  await expect(dialog).toContainText("13");
  // 금액·단가는 노출되지 않는다.
  await expect(dialog).not.toContainText("777,777");
  await expect(dialog).not.toContainText("9,888,888");
  await expect(dialog).not.toContainText("원");
  // 전날 장부 수정 링크는 없다.
  await expect(dialog.getByRole("link")).toHaveCount(0);
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

  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);
  await markLossStepReviewed(ledger.id, actorId);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  await expect(page.getByText(/검토 필요 상태/)).toBeVisible();
  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("검토 필요").first()).toBeVisible();
  await expect(row).toContainText("6");
  await page.getByLabel(`${product.name} 당일재고`, { exact: true }).fill("6");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expectInventorySaveSucceeded(page);
});

test("전일 근거가 없으면 근거 없는 활성 품목을 자동 표시하지 않고 품목 추가로만 입력한다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 이월 공백 고등어", "냉동", 5000);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);
  await markLossStepReviewed(ledger.id, actorId);

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  // 전일/월초 근거 없음 안내는 계속 보여주되, 근거 없는 활성 품목을 0개 행으로 자동
  // 펼치지는 않는다.
  await expect(
    page.getByText(/오늘 매입·손실·저장 품목만 표시합니다/).first(),
  ).toBeVisible();
  await expect(
    page.locator("tr").filter({ hasText: product.name }),
  ).toHaveCount(0);

  // 품목 추가로 직접 넣어야 표에 행이 생기고, 추가 행은 0개가 아니라 빈 입력으로 시작한다.
  const manualProductSelect = page.getByLabel("추가할 품목 선택");
  await manualProductSelect.selectOption(product.id);
  await expect(manualProductSelect).toHaveValue(product.id);
  await page.getByRole("button", { name: "추가" }).click();

  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row.getByText("직접 입력").first()).toBeVisible();
  // exact 매칭으로 "당일재고 바꾼 이유" 입력과의 라벨 충돌을 피한다.
  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`, {
    exact: true,
  });
  await expect(currentQuantityInput).toHaveValue("");

  // 입력 후 저장하면 재조회 시 저장 행으로 보인다.
  await currentQuantityInput.fill("3");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expectInventorySaveSucceeded(page);

  await page.reload();
  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("3");
  await expect(
    page
      .locator("tr")
      .filter({ hasText: product.name })
      .getByText("고칠 내용 있음"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expectInventorySaveSucceeded(page);
});

test("당일 매입이 있는 품목은 전일 근거가 없어도 기본 표에 보인다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 당일 매입 병어", "냉동", 6000);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);

  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 6,
      amount: 6 * product.defaultUnitPrice,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  const row = page.locator("tr").filter({ hasText: product.name });
  await expect(row).toBeVisible();
  await expect(row.getByText("오늘 매입").first()).toBeVisible();
  // 근거 없는 품목 자동 표시를 막아도 매입 품목은 품목 추가 후보가 아니라 표에 있어야 한다.
  await expect(row).toContainText("6");
});

test("매입 품목은 당일재고를 빈칸으로 시작하고 손실 검토 전 재고 저장을 막는다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 미입력 차단 병어", "냉동", 6000);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);

  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 6,
      amount: 6 * product.defaultUnitPrice,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  // 매입 품목의 당일재고는 0이 아니라 빈칸으로 시작한다(0 디폴트로 전량판매 오해 방지).
  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`, {
    exact: true,
  });
  await expect(currentQuantityInput).toHaveValue("");

  // 미입력 상태로 저장하면 차단되고 안내가 뜬다.
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page
      .getByText(/당일재고를 입력하지 않은 매입·손실 품목이 있습니다/)
      .first(),
  ).toBeVisible();
  await expect(currentQuantityInput).toBeFocused();
  // 저장이 막혔으므로 재고 행은 DB에 들어가지 않는다.
  expect(
    await prisma.ledgerInventoryItem.count({
      where: { dailyLedgerId: ledger.id, productId: product.id },
    }),
  ).toBe(0);

  // 재고 URL/탭에 직접 들어온 경우에도 손실 단계를 저장하기 전에는 서버가 저장을 막는다.
  await currentQuantityInput.fill("2");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "4단계 손실/폐기 단계를 먼저 저장해 주세요." }),
  ).toBeVisible();
  expect(
    await prisma.ledgerInventoryItem.count({
      where: { dailyLedgerId: ledger.id, productId: product.id },
    }),
  ).toBe(0);

  // 손실이 없더라도 4단계를 저장하면 "검토 완료"로 기록되고 재고 저장을 진행할 수 있다.
  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await lossSaveButton(page).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  const manager = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });
  const reviewedLedger = await prisma.dailyLedger.findUnique({
    where: { id: ledger.id },
    select: { lossReviewedAt: true, lossReviewedById: true },
  });
  expect(reviewedLedger?.lossReviewedAt).toBeTruthy();
  expect(reviewedLedger?.lossReviewedById).toBe(manager?.id);

  // 매입 6, 남은 2 = 4개 판매. 손실 검토 뒤에는 조정 사유 없이 한 번에 저장된다.
  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  await page.getByLabel(`${product.name} 당일재고`, { exact: true }).fill("2");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expectInventorySaveSucceeded(page);

  // 정상 판매라 재고 조정 레코드는 생기지 않는다(실사 차이가 아님).
  expect(
    await prisma.ledgerInventoryAdjustment.count({
      where: { dailyLedgerId: ledger.id, productId: product.id },
    }),
  ).toBe(0);

  await page.reload();
  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("2");
});

// WO-03(2026-06-28): 진입 직후(아무 값도 안 바꾼 화면)에는 매입 품목의 당일재고가
// 빈칸이어도 미저장 경고가 뜨지 않는다. 필수 수량 미입력은 dirty가 아니라 저장 시
// validation이다. 단계 이동은 그대로 진행된다.
test("매입 품목 당일재고 미입력 상태로 진입 직후 이동해도 미저장 경고가 뜨지 않는다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-5 미저장경고 병어", "냉동", 6000);
  const ledger = await upsertLedger(getTodayKstMidnight(), actorId);

  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 6,
      amount: 6 * product.defaultUnitPrice,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  // 매입 품목 당일재고는 빈칸으로 시작한다(필수 입력). 하지만 사용자가 아무것도 바꾸지
  // 않았으므로 이동 시 미저장 경고는 뜨지 않아야 한다.
  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("");

  await page.getByRole("link", { name: "3단계: 매입" }).click();
  await expect(page.getByText("저장하지 않은 변경이 있습니다")).toHaveCount(0);
  await expect(page).toHaveURL(/step=purchase/);
});

test("월초 스냅샷에 누락된 활성 품목은 자동 표시하지 않고 품목 추가로만 입력한다", async ({
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
    page.getByText(/월초 스냅샷이 있는 품목만 표시합니다/),
  ).toBeVisible();

  const snapshotRow = page
    .locator("tr")
    .filter({ hasText: snapshotProduct.name });
  await expect(snapshotRow.getByText("월초 이월").first()).toBeVisible();
  await expect(snapshotRow).toContainText("8");

  const missingRow = page
    .locator("tr")
    .filter({ hasText: missingProduct.name });
  await expect(missingRow).toHaveCount(0);

  const manualProductSelect = page.getByLabel("추가할 품목 선택");
  await manualProductSelect.selectOption(missingProduct.id);
  await expect(manualProductSelect).toHaveValue(missingProduct.id);
  await page.getByRole("button", { name: "추가" }).click();
  await expect(
    page.locator("tr").filter({ hasText: missingProduct.name }),
  ).toBeVisible();
});

test("오늘이 아닌 재고 입력 URL은 지점장 접근을 차단한다", async ({ page }) => {
  await login(page);

  await page.goto(
    `/app/store-entry/inventory?storeId=${STORY_STORE_ID}&date=${getCurrentKstYearMonth()}-01`,
  );

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
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
  await expect(
    page.getByLabel(`${product.name} 당일재고`, { exact: true }),
  ).toHaveValue("4");
});

test("30개 이상 재고 행은 50행 단위 페이지 처리를 제공한다", async ({
  page,
}) => {
  await login(page);
  // 근거 없는 활성 품목은 더 이상 기본 표에 자동 표시되지 않으므로, 페이징 검증용
  // 품목은 월초 스냅샷으로 근거를 만들어 표에 보이게 한다.
  const yearMonth = getCurrentKstYearMonth();
  const products = await Promise.all(
    Array.from({ length: 55 }, (_, index) =>
      seedProduct(`스토리2-5 대량 ${String(index + 1).padStart(2, "0")}`),
    ),
  );
  await prisma.inventoryOpeningSnapshot.createMany({
    data: products.map((product) => ({
      storeId: STORY_STORE_ID,
      yearMonth,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 1,
    })),
  });

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
  // 근거 없는 활성 품목은 자동 표시되지 않으므로 월초 스냅샷으로 근거를 만든다.
  await prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentKstYearMonth(),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 2,
    },
  });

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);

  // exact 매칭으로 "당일재고 바꾼 이유" 입력과의 라벨 충돌을 피한다.
  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`, {
    exact: true,
  });
  await currentQuantityInput.fill("1");
  await currentQuantityInput.pressSequentially("a");
  await page.getByRole("button", { name: "저장", exact: true }).click();

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
    .getByRole("button", { name: "저장", exact: true })
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
  const currentQuantityInput = page.getByLabel(`${product.name} 당일재고`, {
    exact: true,
  });
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
  await page.getByRole("button", { name: "저장", exact: true }).click();

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
