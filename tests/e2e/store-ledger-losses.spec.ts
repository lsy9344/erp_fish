import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const STORY_MARKER = "story-2-7-test";

test.afterAll(async () => {
  await cleanupStoryTwoSevenData();
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

function getCurrentYearMonth(inputDate = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(inputDate);
}

async function seedTodayLedger(inputDate = new Date()) {
  const actorId = await getHeadquartersUserId();
  const closingDate = getTodayKstMidnight(inputDate);

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
      status: "IN_PROGRESS",
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      status: "IN_PROGRESS",
      workMemo: STORY_MARKER,
      updatedById: actorId,
    },
  });
}

async function seedOpeningSnapshot(
  product: Awaited<ReturnType<typeof seedProduct>>,
  quantity: number,
  inputDate = new Date(),
) {
  return prisma.inventoryOpeningSnapshot.create({
    data: {
      storeId: STORY_STORE_ID,
      yearMonth: getCurrentYearMonth(inputDate),
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity,
    },
  });
}

async function seedInventoryItem(
  ledgerId: string,
  product: Awaited<ReturnType<typeof seedProduct>>,
  quantity: number,
) {
  const actorId = await getHeadquartersUserId();

  return prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledgerId,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: quantity,
      purchasedQuantity: 0,
      currentQuantity: quantity,
      quantity,
      inventoryAmount: quantity * product.defaultUnitPrice,
      carryoverSource: "OPENING_SNAPSHOT",
      createdById: actorId,
      updatedById: actorId,
    },
  });
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

async function seedLossType(name: string, isActive = true) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);

  return prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: `${name} ${suffix}`,
      displayOrder: 500,
      isActive,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoSevenData() {
  const currentLedgers = await prisma.dailyLedger.findMany({
    where: {
      storeId: STORY_STORE_ID,
      closingDate: getTodayKstMidnight(),
    },
    select: { id: true },
  });
  const currentLedgerIds = currentLedgers.map((ledger) => ledger.id);

  if (currentLedgerIds.length > 0) {
    await prisma.ledgerLossItem.deleteMany({
      where: { dailyLedgerId: { in: currentLedgerIds } },
    });
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "스토리2-7" } },
        { name: { startsWith: "변경된 스토리2-7" } },
      ],
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const lossTypes = await prisma.ledgerInputCode.findMany({
    where: {
      group: "LOSS_TYPE",
      OR: [
        { name: { startsWith: "스토리2-7" } },
        { name: { startsWith: "변경된 스토리2-7" } },
      ],
    },
    select: { id: true },
  });
  const lossTypeIds = lossTypes.map((lossType) => lossType.id);
  if (productIds.length > 0 || lossTypeIds.length > 0) {
    await prisma.ledgerLossItem.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { ledgerInputCodeId: { in: lossTypeIds } },
        ],
      },
    });
  }

  if (productIds.length > 0) {
    await prisma.ledgerInventoryAdjustment.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.ledgerPurchaseItem.deleteMany({
      where: { productId: { in: productIds } },
    });
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

  await prisma.dailyLedger.updateMany({
    where: {
      storeId: STORY_STORE_ID,
      workMemo: { startsWith: STORY_MARKER },
    },
    data: { workMemo: null },
  });
}

test.beforeEach(async () => {
  await cleanupStoryTwoSevenData();
});

test("손실 항목 여러 건을 저장하고 재방문 시 목록과 합계를 본다", async ({
  page,
}) => {
  await login(page);
  const fixtureDate = new Date();
  const first = await seedProduct("스토리2-7 폐기 광어", "냉동", 12000);
  const second = await seedProduct("스토리2-7 떨이 우럭", "생물", 8000);
  const inactive = await seedProduct("스토리2-7 비활성 농어");
  await prisma.product.update({
    where: { id: inactive.id },
    data: { isActive: false },
  });
  const disposal = await seedLossType("스토리2-7 폐기");
  const discount = await seedLossType("스토리2-7 떨이");
  const inactiveType = await seedLossType("스토리2-7 비활성", false);
  const ledger = await seedTodayLedger(fixtureDate);
  await seedOpeningSnapshot(first, 4, fixtureDate);
  await seedOpeningSnapshot(second, 3, fixtureDate);
  await seedInventoryItem(ledger.id, first, 4);
  await seedInventoryItem(ledger.id, second, 3);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);

  await expect(
    page.getByRole("heading", { name: "손실/폐기/떨이 입력" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page
      .getByLabel("품목")
      .nth(0)
      .locator("option", { hasText: inactive.name }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("처리 유형")
      .nth(0)
      .locator("option", { hasText: inactiveType.name }),
  ).toHaveCount(0);
  await page.getByLabel("품목").nth(0).selectOption(first.id);
  await page.getByLabel("처리 유형").nth(0).selectOption(disposal.id);
  await page.getByLabel("수량").nth(0).fill("2");
  await page.getByLabel("손실액(원)").nth(0).fill("5000");
  await page.getByLabel("사유/특이사항").nth(0).fill("폐기 처리");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").nth(1).selectOption(second.id);
  await page.getByLabel("처리 유형").nth(1).selectOption(discount.id);
  await page.getByLabel("수량").nth(1).fill("1");
  await page.getByLabel("손실액(원)").nth(1).fill("3000");
  await page.getByLabel("사유/특이사항").nth(1).fill("떨이 판매");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 2건을 저장했습니다." }),
  ).toBeVisible();
  await expect(page.getByText(`기준 초과 ${first.name}`)).toBeVisible();
  await expect(page.getByText(`기준 초과 ${first.name}`)).toContainText("수량");
  await expect(page.getByText("총 손실 수량").locator("..")).toContainText("3");
  await expect(page.getByText("총 손실액")).toHaveCount(0);

  await page.reload();

  await expect(page.getByLabel("품목")).toHaveCount(2);
  await expect(
    page.getByText(first.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(second.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("사유/특이사항").nth(0)).toHaveValue(
    "폐기 처리",
  );
  await expect(page.getByLabel("사유/특이사항").nth(1)).toHaveValue(
    "떨이 판매",
  );
  await expect(page.getByLabel("손실액(원)").nth(0)).toHaveValue("5000");
  await expect(page.getByLabel("손실액(원)").nth(1)).toHaveValue("3000");
  await expect(page.getByText("총 손실액")).toHaveCount(0);
  await expect(page.getByText("기준 단가")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(
    /defaultUnitPrice|unitPrice|totalAmount|exceededAmount|FIFO|lot|margin|profit/,
  );

  const renamedProductName = `변경된 ${first.name}`;
  const renamedLossTypeName = `변경된 ${disposal.name}`;

  await prisma.product.update({
    where: { id: first.id },
    data: { name: renamedProductName, isActive: false },
  });
  await prisma.ledgerInputCode.update({
    where: { id: disposal.id },
    data: { name: renamedLossTypeName, isActive: false },
  });

  await page.reload();

  await expect(
    page.getByLabel("품목").nth(0).locator("option:checked"),
  ).toHaveText(first.name);
  await expect(
    page.getByLabel("처리 유형").nth(0).locator("option:checked"),
  ).toHaveText(disposal.name);
  await expect(page.getByLabel("사유/특이사항").nth(0)).toHaveValue(
    "폐기 처리",
  );

  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page
      .getByLabel("품목")
      .nth(2)
      .locator("option", { hasText: renamedProductName }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("처리 유형")
      .nth(2)
      .locator("option", { hasText: renamedLossTypeName }),
  ).toHaveCount(0);
});

test("사유가 비어 있으면 저장을 막고 390px 모바일 입력 상태를 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const fixtureDate = new Date();
  const product = await seedProduct("스토리2-7 모바일 고등어", "냉동", 7000);
  const lossType = await seedLossType("스토리2-7 모바일 폐기");
  const ledger = await seedTodayLedger(fixtureDate);
  await seedOpeningSnapshot(product, 2, fixtureDate);
  await seedInventoryItem(ledger.id, product, 2);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("처리 유형").selectOption(lossType.id);
  await page.getByLabel("수량").fill("1");
  await page.getByLabel("손실액(원)").fill("2000");
  await page.getByRole("button", { name: "저장" }).click();

  const reasonInput = page.getByLabel("사유/특이사항");
  const productSelect = page.getByLabel("품목");
  const lossTypeSelect = page.getByLabel("처리 유형");
  const quantityInput = page.getByLabel("수량");
  const amountInput = page.getByLabel("손실액(원)");
  const saveButton = page.getByRole("button", { name: "저장" }).first();

  await expect(page.getByText("사유/특이사항을 입력해 주세요.")).toBeVisible();
  await expect(reasonInput).toBeFocused();
  await expect(quantityInput).toHaveAttribute("inputmode", "numeric");
  await expect(amountInput).toHaveAttribute("inputmode", "numeric");

  for (const target of [
    productSelect,
    lossTypeSelect,
    quantityInput,
    amountInput,
    saveButton,
  ]) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await reasonInput.fill("모바일 폐기");
  await saveButton.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toBeVisible();
});

test("손실 수량이 재고 흐름보다 크면 저장을 막는다", async ({ page }) => {
  await login(page);
  const fixtureDate = new Date();
  const product = await seedProduct("스토리2-7 과다 손실 방어", "냉동", 9000);
  const lossType = await seedLossType("스토리2-7 과다 폐기");
  const ledger = await seedTodayLedger(fixtureDate);

  await seedOpeningSnapshot(product, 2, fixtureDate);
  await seedInventoryItem(ledger.id, product, 2);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("처리 유형").selectOption(lossType.id);
  await page.getByLabel("수량").fill("3");
  await page.getByLabel("손실액(원)").fill("27000");
  await page.getByLabel("사유/특이사항").fill("재고 초과 폐기");
  await page.getByRole("button", { name: "저장" }).click();

  const quantityError = page
    .getByRole("alert")
    .filter({
      hasText: `${product.name} / 1kg 손실 수량을 저장할 수 없습니다`,
    })
    .first();

  await expect(quantityError).toBeVisible();
  await expect(quantityError).toContainText("현재 차감 가능 수량 2");
  await expect(page.getByLabel("수량")).toHaveValue("3");

  const savedCount = await prisma.ledgerLossItem.count({
    where: {
      dailyLedgerId: ledger.id,
      productId: product.id,
    },
  });

  expect(savedCount).toBe(0);

  await page.getByLabel("수량").fill("2");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toBeVisible();
});

test("손실 저장 후 재고 기준 수량에 손실 수량을 반영한다", async ({ page }) => {
  await login(page);
  const fixtureDate = new Date();
  const product = await seedProduct("스토리2-7 재고 반영 연어", "냉동", 10000);
  const lossType = await seedLossType("스토리2-7 재고 폐기");
  const ledger = await seedTodayLedger(fixtureDate);

  await seedOpeningSnapshot(product, 7, fixtureDate);
  await seedInventoryItem(ledger.id, product, 7);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("처리 유형").selectOption(lossType.id);
  await page.getByLabel("수량").fill("2");
  await page.getByLabel("손실액(원)").fill("20000");
  await page.getByLabel("사유/특이사항").fill("보관 중 폐기");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await page.goto(`/app/store-entry/inventory?storeId=${STORY_STORE_ID}`);
  const row = page.locator("tr").filter({ hasText: product.name });

  await expect(row).toContainText("2");
  await expect(row).not.toContainText("20,000원");
  await expect(row.getByText("조정 필요").first()).toBeVisible();
  await expect(row.getByText("기준 5")).toBeVisible();
  await expect(row).not.toContainText(
    /lossAmount|inventoryAmount|unitPrice|purchaseAmount|20000/,
  );

  const savedLoss = await prisma.ledgerLossItem.findFirst({
    where: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossType.id,
    },
  });

  expect(savedLoss?.quantity).toBe(2);
  expect(savedLoss?.amount).toBe(20000);
  expect(savedLoss?.reason).toBe("보관 중 폐기");
});

test("손실 라인을 수정하고 삭제하면 version과 감사 로그에 전후 값이 남는다", async ({
  page,
}) => {
  await login(page);
  const fixtureDate = new Date();
  const first = await seedProduct("스토리2-7 수정 폐기 방어", "냉동", 10000);
  const second = await seedProduct("스토리2-7 삭제 떨이 방어", "생물", 6000);
  const disposal = await seedLossType("스토리2-7 수정 폐기");
  const discount = await seedLossType("스토리2-7 삭제 떨이");
  const ledger = await seedTodayLedger(fixtureDate);
  await seedOpeningSnapshot(first, 8, fixtureDate);
  await seedOpeningSnapshot(second, 5, fixtureDate);
  await seedInventoryItem(ledger.id, first, 8);
  await seedInventoryItem(ledger.id, second, 5);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").nth(0).selectOption(first.id);
  await page.getByLabel("처리 유형").nth(0).selectOption(disposal.id);
  await page.getByLabel("수량").nth(0).fill("2");
  await page.getByLabel("손실액(원)").nth(0).fill("5000");
  await page.getByLabel("사유/특이사항").nth(0).fill("초기 폐기");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").nth(1).selectOption(second.id);
  await page.getByLabel("처리 유형").nth(1).selectOption(discount.id);
  await page.getByLabel("수량").nth(1).fill("1");
  await page.getByLabel("손실액(원)").nth(1).fill("1000");
  await page.getByLabel("사유/특이사항").nth(1).fill("초기 떨이");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  const initialVersion = (
    await prisma.dailyLedger.findUniqueOrThrow({
      where: { id: ledger.id },
      select: { version: true },
    })
  ).version;
  const initiallySavedLosses = await prisma.ledgerLossItem.findMany({
    where: { dailyLedgerId: ledger.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  expect(initiallySavedLosses).toHaveLength(2);

  await page.getByLabel("손실액(원)").nth(0).fill("");
  await expect(page.getByLabel("손실액(원)").nth(0)).toHaveValue("");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByText("손실 금액은 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("손실액(원)").nth(0)).toBeFocused();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toHaveCount(0);
  await page.getByLabel("손실액(원)").nth(0).fill("5000");

  await page.getByLabel("수량").nth(0).fill("3");
  await page.getByLabel("손실액(원)").nth(0).fill("7000");
  await page.getByLabel("사유/특이사항").nth(0).fill("수정된 폐기 사유");
  await page.getByRole("button", { name: "삭제" }).nth(1).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "손실/폐기 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  const afterVersion = (
    await prisma.dailyLedger.findUniqueOrThrow({
      where: { id: ledger.id },
      select: { version: true },
    })
  ).version;
  expect(afterVersion).toBeGreaterThan(initialVersion);

  const finalLosses = await prisma.ledgerLossItem.findMany({
    where: { dailyLedgerId: ledger.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  expect(finalLosses).toHaveLength(1);
  expect(finalLosses[0]).toMatchObject({
    id: initiallySavedLosses[0]!.id,
    productId: first.id,
    ledgerInputCodeId: disposal.id,
    quantity: 3,
    amount: 7000,
    reason: "수정된 폐기 사유",
  });

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: "ledger.losses.saved",
      targetType: "DailyLedger",
      targetId: ledger.id,
    },
    orderBy: { createdAt: "desc" },
  });

  expect(auditLog?.actorId).toBeTruthy();
  const beforeSnapshot = auditLog?.before as {
    lossItems?: Array<{
      id: string;
      productId: string;
      quantity: number;
      amount: number;
      reason: string;
    }>;
  } | null;
  const afterSnapshot = auditLog?.after as {
    lossItems?: Array<{
      id: string;
      productId: string;
      quantity: number;
      amount: number;
      reason: string;
    }>;
  } | null;

  expect(beforeSnapshot?.lossItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: initiallySavedLosses[0]!.id,
        productId: first.id,
        quantity: 2,
        amount: 5000,
        reason: "초기 폐기",
      }),
      expect.objectContaining({
        id: initiallySavedLosses[1]!.id,
        productId: second.id,
        quantity: 1,
        amount: 1000,
        reason: "초기 떨이",
      }),
    ]),
  );
  expect(afterSnapshot?.lossItems).toEqual([
    expect.objectContaining({
      id: initiallySavedLosses[0]!.id,
      productId: first.id,
      quantity: 3,
      amount: 7000,
      reason: "수정된 폐기 사유",
    }),
  ]);
});

test("본사 마감 장부는 원본 손실 입력 버튼을 비활성화한다", async ({
  page,
}) => {
  const fixtureDate = new Date();
  const product = await seedProduct("스토리2-7 마감 폐기 방어", "냉동", 9000);
  const lossType = await seedLossType("스토리2-7 마감 폐기");
  const ledger = await seedTodayLedger(fixtureDate);
  await seedOpeningSnapshot(product, 3, fixtureDate);
  await seedInventoryItem(ledger.id, product, 3);
  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: { status: "HEADQUARTERS_CLOSED" },
  });

  await login(page);
  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);

  await expect(page.getByRole("button", { name: "항목 추가" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
  await expect(page.getByText("본사마감")).toBeVisible();

  const savedCount = await prisma.ledgerLossItem.count({
    where: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossType.id,
    },
  });
  expect(savedCount).toBe(0);
});

test("stale version 손실 저장은 conflict dialog를 보여주고 입력값을 쓰지 않는다", async ({
  page,
}) => {
  await login(page);
  const fixtureDate = new Date();
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("스토리2-7 stale 손실 방어", "냉동", 9000);
  const lossType = await seedLossType("스토리2-7 stale 폐기");
  const ledger = await seedTodayLedger(fixtureDate);
  await seedOpeningSnapshot(product, 4, fixtureDate);
  await seedInventoryItem(ledger.id, product, 4);

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("처리 유형").selectOption(lossType.id);
  await page.getByLabel("수량").fill("1");
  await page.getByLabel("손실액(원)").fill("3000");
  await page.getByLabel("사유/특이사항").fill("stale 손실 저장");

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "손실 저장 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await page.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("손실/폐기").first()).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const savedLossCount = await prisma.ledgerLossItem.count({
    where: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossType.id,
    },
  });
  expect(savedLossCount).toBe(0);
});
