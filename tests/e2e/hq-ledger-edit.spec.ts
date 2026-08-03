import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_MARKER = "story-4-3-test";
const STORE_ID = "store-story-4-3-edit";
const CLOSED_STORE_ID = "store-story-4-3-closed";
const CARRYOVER_CLOSED_STORE_ID = "store-story-4-3-carryover-closed";
const PREFLIGHT_BLOCKED_STORE_ID = "store-story-4-4-preflight-blocked";
const PRODUCT_NAME = "스토리4-3 광어";
const EXPENSE_CODE_NAME = "스토리4-3 비용";
const LOSS_CODE_NAME = "스토리4-3 손실";

test.beforeEach(async () => {
  await cleanupStoryFourOneData();
});

test.afterAll(async () => {
  await cleanupStoryFourOneData();
  await prisma.$disconnect();
});

async function loginAsHq(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsHqViewer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq-viewer@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsHqStaff(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq-assigned@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);
}

async function replaceControlValue(control: Locator, value: string) {
  await control.click();
  await control.press("Control+A");
  await control.pressSequentially(value);
  await expect(control).toHaveValue(value);
}

async function replaceKrwControlValue(control: Locator, value: string) {
  await control.click();
  await control.press("Control+A");
  await control.pressSequentially(value);
  await expect(control).toHaveValue(formatKrwInputForTest(value));
}

async function clearControlValue(control: Locator) {
  await control.click();
  await control.press("Control+A");
  await control.press("Backspace");
  await expect(control).toHaveValue("");
}

async function fillHqEditReason(panel: Locator, value: string) {
  await replaceControlValue(panel.getByLabel("본사 수정 사유"), value);
}

function formatKrwInputForTest(value: string) {
  const rawValue = value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");

  if (rawValue === "") {
    return "";
  }

  return new Intl.NumberFormat("ko-KR").format(Number(rawValue));
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
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

function formatKstDateTimeForTest(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

async function seedEditableStoryData() {
  const actorId = await getHeadquartersUserId();
  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "스토리4-3 검토대기점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: PRODUCT_NAME,
      category: "냉동",
      spec: "1kg",
      defaultUnitPrice: 1000,
      updatedById: actorId,
    },
  });
  const purchaseStandard = await prisma.purchaseStandard.create({
    data: {
      productId: product.id,
      standardUnitPrice: 1000,
      referenceInfo: STORY_MARKER,
      updatedById: actorId,
    },
  });
  const expenseCode = await prisma.ledgerInputCode.create({
    data: {
      group: "EXPENSE_ITEM",
      name: EXPENSE_CODE_NAME,
      displayOrder: 941,
      updatedById: actorId,
    },
  });
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: LOSS_CODE_NAME,
      displayOrder: 942,
      updatedById: actorId,
    },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "IN_REVIEW",
      totalSalesAmount: 10000,
      cashAmount: 3000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      authorDisplayName: "스토리4-3 작성자",
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInputCodeId: expenseCode.id,
      amount: 1000,
      memo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      purchaseStandardId: purchaseStandard.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      quantity: 1,
      amount: 1000,
      // WO-12(2026-06-28): 원본 이카운트 단가(900) ≠ 적용 단가(1000) → 본사 화면에 보정 표시.
      sourceUnitPrice: 900,
      unitPriceOverrideReason: STORY_MARKER,
      referenceInfo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      previousQuantity: 10,
      purchasedQuantity: 1,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8000,
      isModified: true,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "PREVIOUS_CARRYOVER",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossCode.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      lossTypeName: lossCode.name,
      quantity: 1,
      amount: 1000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return { actorId, ledger, product };
}

async function seedClosedStoryData() {
  const actorId = await getHeadquartersUserId();
  const closedAt = new Date("2026-06-11T06:30:00.000Z");
  const store = await prisma.store.create({
    data: {
      id: CLOSED_STORE_ID,
      name: "스토리4-3 본사마감점",
      isActive: true,
      updatedById: actorId,
    },
  });

  const hqStaff = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });
  await prisma.userStoreAssignment.create({
    data: { userId: hqStaff.id, storeId: store.id },
  });

  return prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 10000,
      cashAmount: 4000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt,
    },
  });
}

async function seedClosedCarryoverStoryData({
  sourceQuantity = 8,
  withDownstreamLedger = false,
}: {
  sourceQuantity?: number;
  withDownstreamLedger?: boolean;
} = {}) {
  const actorId = await getHeadquartersUserId();
  const targetDate = getTodayKstMidnight();
  const sourceDate = new Date(targetDate);
  sourceDate.setUTCDate(sourceDate.getUTCDate() - 1);
  const store = await prisma.store.create({
    data: {
      id: CARRYOVER_CLOSED_STORE_ID,
      name: "스토리4-3 이월재확인점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: PRODUCT_NAME,
      category: "냉동",
      spec: "1kg",
      defaultUnitPrice: 50,
      updatedById: actorId,
    },
  });
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: LOSS_CODE_NAME,
      displayOrder: 943,
      updatedById: actorId,
    },
  });
  const sourceLedger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: sourceDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 1000,
      cashAmount: 1000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt: new Date(),
    },
  });
  const targetLedger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: targetDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 1000,
      cashAmount: 1000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt: new Date(),
    },
  });
  const sourceItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: sourceLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 50,
      previousQuantity: 10,
      purchasedQuantity: 0,
      currentQuantity: sourceQuantity,
      quantity: sourceQuantity,
      inventoryAmount: sourceQuantity * 50,
      isModified: true,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "PREVIOUS_CARRYOVER",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: sourceLedger.id,
      ledgerInventoryItemId: sourceItem.id,
      productId: product.id,
      sourceType: "PURCHASE",
      unitPrice: 50,
      originalQuantity: sourceQuantity,
      consumedQuantity: 0,
      remainingQuantity: sourceQuantity,
      originalAmount: sourceQuantity * 50,
      consumedAmount: 0,
      remainingAmount: sourceQuantity * 50,
      sortOrder: 0,
      sourceBusinessDate: sourceDate,
    },
  });
  const targetItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: targetLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 50,
      previousQuantity: 5,
      purchasedQuantity: 0,
      currentQuantity: 4,
      quantity: 4,
      inventoryAmount: 200,
      isModified: true,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "CARRYOVER_RECHECK_REQUIRED",
      carryoverLedgerId: sourceLedger.id,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryCarryoverDetail.create({
    data: {
      ledgerInventoryItemId: targetItem.id,
      source: "PREVIOUS_CLOSED_LEDGER",
      status: "CARRYOVER_RECHECK_REQUIRED",
      resolvedQuantity: 5,
      sourceLedgerId: sourceLedger.id,
      sourceLedgerClosingDate: sourceDate,
      sourceLedgerStatus: "HEADQUARTERS_CLOSED",
      sourcePreviousQuantity: 10,
      sourcePurchasedQuantity: 0,
      sourceLossQuantity: 0,
      sourceCurrentQuantity: 5,
      sourceQuantity: 5,
      message: "원천 장부 수정 후 재확인이 필요합니다.",
    },
  });
  let downstreamLedger: Awaited<
    ReturnType<typeof prisma.dailyLedger.create>
  > | null = null;

  if (withDownstreamLedger) {
    const downstreamDate = new Date(targetDate);
    downstreamDate.setUTCDate(downstreamDate.getUTCDate() + 1);
    downstreamLedger = await prisma.dailyLedger.create({
      data: {
        storeId: store.id,
        closingDate: downstreamDate,
        status: "HEADQUARTERS_CLOSED",
        totalSalesAmount: 1000,
        cashAmount: 1000,
        cardAmount: 0,
        otherPaymentAmount: 0,
        workerCount: 1,
        createdById: actorId,
        updatedById: actorId,
        closedById: actorId,
        closedAt: new Date(),
      },
    });
    const downstreamItem = await prisma.ledgerInventoryItem.create({
      data: {
        dailyLedgerId: downstreamLedger.id,
        productId: product.id,
        productName: product.name,
        productCategory: product.category,
        productSpec: product.spec,
        unitPrice: 40,
        previousQuantity: 4,
        purchasedQuantity: 0,
        currentQuantity: 3,
        quantity: 3,
        inventoryAmount: 120,
        isModified: true,
        carryoverSource: "PREVIOUS_CLOSED_LEDGER",
        carryoverStatus: "PREVIOUS_CARRYOVER",
        carryoverLedgerId: targetLedger.id,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await prisma.ledgerInventoryCarryoverDetail.create({
      data: {
        ledgerInventoryItemId: downstreamItem.id,
        source: "PREVIOUS_CLOSED_LEDGER",
        status: "PREVIOUS_CARRYOVER",
        resolvedQuantity: 4,
        sourceLedgerId: targetLedger.id,
        sourceLedgerClosingDate: targetDate,
        sourceLedgerStatus: "HEADQUARTERS_CLOSED",
        sourcePreviousQuantity: 5,
        sourcePurchasedQuantity: 0,
        sourceLossQuantity: 0,
        sourceCurrentQuantity: 4,
        sourceQuantity: 4,
        message: "직전 마감 장부에서 이월했습니다.",
      },
    });
    await prisma.ledgerInventoryFifoLot.create({
      data: {
        dailyLedgerId: targetLedger.id,
        ledgerInventoryItemId: targetItem.id,
        productId: product.id,
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: sourceLedger.id,
        unitPrice: 40,
        originalQuantity: 4,
        consumedQuantity: 0,
        remainingQuantity: 4,
        originalAmount: 160,
        consumedAmount: 0,
        remainingAmount: 160,
        sortOrder: 0,
        sourceBusinessDate: sourceDate,
      },
    });
  }
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: store.id,
      businessDate: targetDate,
      productId: product.id,
      plannedUnitPrice: 100,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: targetLedger.id,
      productId: product.id,
      ledgerInputCodeId: lossCode.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 100,
      lossTypeName: lossCode.name,
      quantity: 1,
      recoveredAmount: 0,
      amount: 100,
      usedPlannedPrice: true,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return { targetLedger, sourceLedger, downstreamLedger, product };
}

async function seedPreflightBlockedStoryData() {
  const actorId = await getHeadquartersUserId();
  const store = await prisma.store.create({
    data: {
      id: PREFLIGHT_BLOCKED_STORE_ID,
      name: "스토리4-4 보완필요점",
      isActive: true,
      updatedById: actorId,
    },
  });

  return prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "IN_REVIEW",
      totalSalesAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: null,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryFourOneData() {
  const stores = [
    STORE_ID,
    CLOSED_STORE_ID,
    CARRYOVER_CLOSED_STORE_ID,
    PREFLIGHT_BLOCKED_STORE_ID,
  ];
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: { in: stores } },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);
  const products = await prisma.product.findMany({
    where: { name: PRODUCT_NAME },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: { in: [EXPENSE_CODE_NAME, LOSS_CODE_NAME] } },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);

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

  await prisma.storeSalesPricePlan.deleteMany({
    where: { storeId: { in: stores } },
  });

  if (productIds.length > 0) {
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
    where: { storeId: { in: stores } },
  });
  await prisma.store.deleteMany({
    where: { id: { in: stores } },
  });
}

test("본사는 ledgerId 상세에서 검토 대기 장부의 모든 입력 섹션을 보완 저장한다", async ({
  page,
}) => {
  test.slow();
  const { actorId, ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );
  await expect(
    page.getByRole("heading", { name: "스토리4-3 검토대기점 장부 상세" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "손실" }).click();
  const lossPanel = page.getByRole("tabpanel").filter({ hasText: "손실 항목" });
  await expect(lossPanel).toBeVisible();
  await replaceControlValue(
    lossPanel.getByLabel("사유/특이사항"),
    "본사 손실 확인",
  );
  await fillHqEditReason(lossPanel, "손실 원본 보완");
  await lossPanel.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerLossItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { reason: true },
      });

      return current?.reason;
    })
    .toBe("본사 손실 확인");
  await expect(
    lossPanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|손실\/폐기 항목 1건을 저장했습니다/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel).toBeVisible();
  const expenseTotalInput = salesPanel.getByLabel("4단계 지출 합계");
  await expect(expenseTotalInput).toHaveValue("1,000원");
  await expect(expenseTotalInput).toHaveJSProperty("readOnly", true);
  await replaceKrwControlValue(salesPanel.getByLabel("총매출"), "45000");
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "14000");
  await replaceKrwControlValue(salesPanel.getByLabel("카드"), "25000");
  await replaceKrwControlValue(salesPanel.getByLabel("기타 결제수단"), "5000");
  await fillHqEditReason(salesPanel, "매출 결제 원본 보완");
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect(
    salesPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: {
          totalSalesAmount: true,
          cashAmount: true,
          cardAmount: true,
          otherPaymentAmount: true,
        },
      });

      return current;
    })
    .toEqual({
      totalSalesAmount: 45000,
      cashAmount: 14000,
      cardAmount: 25000,
      otherPaymentAmount: 5000,
    });

  await page.getByRole("tab", { name: "지출" }).click();
  const expensePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "지출 항목" });
  await expect(expensePanel).toBeVisible();
  await replaceKrwControlValue(expensePanel.getByLabel("지출 금액"), "3000");
  await fillHqEditReason(expensePanel, "지출 원본 보완");
  await expensePanel.getByRole("button", { name: "저장" }).click();
  await expect(
    expensePanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|지출 항목 1건을 저장했습니다/ }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerExpense.findFirst({
        where: { dailyLedgerId: ledger.id },
        select: { amount: true },
      });

      return current?.amount;
    })
    .toBe(3000);

  await page.getByRole("tab", { name: "매출/결제" }).click();
  await expect(salesPanel).toBeVisible();
  await expect(expenseTotalInput).toHaveValue("3,000원");
  await expect(expenseTotalInput).toHaveJSProperty("readOnly", true);
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "12000");
  await fillHqEditReason(salesPanel, "지출 연동 후 매출 재저장");
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.sales_payment.updated",
          reason: "지출 연동 후 매출 재저장",
        },
      }),
    )
    .toBe(1);
  await expect(
    page.getByRole("dialog", { name: "저장 충돌이 발생했습니다" }),
  ).not.toBeVisible();
  await expect(
    salesPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "매입" }).click();
  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 항목" });
  await expect(purchasePanel).toBeVisible();
  await replaceControlValue(purchasePanel.getByLabel("수량"), "3");
  await fillHqEditReason(purchasePanel, "매입 원본 보완");
  await purchasePanel.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerPurchaseItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { quantity: true },
      });

      return current?.quantity.toString();
    })
    .toBe("3");

  await page.getByRole("tab", { name: "재고" }).click();
  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  await expect(inventoryPanel).toBeVisible();
  const inventoryInput = page.getByLabel(`${product.name} 당일재고`);
  await expect(inventoryInput).toBeVisible();
  await replaceControlValue(inventoryInput, "14");
  await fillHqEditReason(inventoryPanel, "재고 원본 보완");
  await inventoryPanel
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("재고 원본 보완");
  await inventoryPanel
    .getByRole("button", { name: `${product.name} 고친 이유 저장` })
    .click();
  await expect(
    inventoryPanel
      .getByRole("status")
      .filter({ hasText: "고친 내용이 저장됐습니다." }),
  ).toBeVisible();
  await fillHqEditReason(inventoryPanel, "재고 원본 보완");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    inventoryPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerInventoryItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { currentQuantity: true },
      });

      return current?.currentQuantity?.toString();
    })
    .toBe("14");

  await page.getByRole("tab", { name: "근무" }).click();
  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무인원" });
  await expect(workPanel).toBeVisible();
  await replaceControlValue(workPanel.getByLabel("근무인원"), "5");
  await replaceControlValue(workPanel.getByLabel("특이사항 메모"), "본사 보완");
  await replaceControlValue(
    workPanel.locator("#work-hq-edit-reason"),
    "근무 원본 보완",
  );
  await workPanel.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    workPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { workerCount: true },
      });

      return current?.workerCount;
    })
    .toBe(5);

  await workPanel.getByRole("button", { name: "직원 추가" }).click();
  await replaceControlValue(workPanel.getByLabel("직원명"), "본사 직원");
  await replaceKrwControlValue(workPanel.getByLabel("급여 금액"), "1500000");
  await replaceControlValue(workPanel.getByLabel("특이사항 (선택)"), "야근");
  await replaceControlValue(
    workPanel.locator("#labor-hq-edit-reason"),
    "급여 원본 보완",
  );
  await workPanel.getByRole("button", { name: "급여 저장" }).click();
  await expect(
    workPanel
      .getByRole("status")
      .filter({ hasText: "급여 항목 1건을 저장했습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerLaborItem.count({
        where: { dailyLedgerId: ledger.id },
      });

      return current;
    })
    .toBe(1);

  const savedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    include: {
      ledgerExpenses: true,
      ledgerPurchaseItems: true,
      ledgerInventoryItems: true,
      ledgerLossItems: true,
      ledgerLaborItems: true,
    },
  });
  const auditActions = await prisma.auditLog.findMany({
    where: { targetType: "DailyLedger", targetId: ledger.id },
    select: {
      action: true,
      actorId: true,
      before: true,
      after: true,
      reason: true,
    },
  });

  expect(savedLedger.totalSalesAmount).toBe(45000);
  expect(savedLedger.cashAmount).toBe(12000);
  expect(savedLedger.cardAmount).toBe(25000);
  expect(savedLedger.otherPaymentAmount).toBe(5000);
  expect(savedLedger.workerCount).toBe(5);
  expect(savedLedger.workMemo).toBe("본사 보완");
  expect(savedLedger.updatedById).toBe(actorId);
  expect(savedLedger.submittedById).toBeNull();
  expect(savedLedger.submittedAt).toBeNull();
  expect(savedLedger.ledgerExpenses[0]?.amount).toBe(3000);
  expect(savedLedger.ledgerPurchaseItems[0]?.quantity.toString()).toBe("3");
  expect(savedLedger.ledgerInventoryItems[0]?.currentQuantity?.toString()).toBe(
    "14",
  );
  expect(savedLedger.ledgerLossItems[0]?.reason).toBe("본사 손실 확인");
  expect(savedLedger.ledgerLaborItems[0]?.workerName).toBe("본사 직원");
  expect(savedLedger.ledgerLaborItems[0]?.amount).toBe(1500000);
  expect(savedLedger.ledgerLaborItems[0]?.specialMemo).toBe("야근");
  expect(auditActions.map((entry) => entry.action)).toEqual(
    expect.arrayContaining([
      "ledger.hq.sales_payment.updated",
      "ledger.hq.expenses.saved",
      "ledger.hq.purchases.saved",
      "ledger.hq.inventory.saved",
      "ledger.hq.losses.saved",
      "ledger.hq.work_info.saved",
      "ledger.hq.labor.saved",
    ]),
  );
  expect(auditActions.every((entry) => entry.actorId === actorId)).toBe(true);
  expect(auditActions.every((entry) => entry.before && entry.after)).toBe(true);
  expect(auditActions.map((entry) => entry.reason)).toEqual(
    expect.arrayContaining([
      "매출 결제 원본 보완",
      "지출 원본 보완",
      "매입 원본 보완",
      "재고 원본 보완",
      "손실 원본 보완",
      "근무 원본 보완",
      "급여 원본 보완",
    ]),
  );
});

test("본사 원본 재고 편집은 저장된 재고 행 삭제를 저장한다", async ({
  page,
}) => {
  test.slow();
  const { ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}?tab=inventory`);

  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  const removeButton = inventoryPanel.getByRole("button", {
    name: `${product.name} 재고 행 제거`,
  });

  await expect(removeButton).toBeVisible();
  await removeButton.click();
  await expect(removeButton).not.toBeVisible();
  await fillHqEditReason(inventoryPanel, "오류로 생성된 재고 행 삭제");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const [item, audit] = await Promise.all([
        prisma.ledgerInventoryItem.findUnique({
          where: {
            dailyLedgerId_productId: {
              dailyLedgerId: ledger.id,
              productId: product.id,
            },
          },
        }),
        prisma.auditLog.findFirst({
          where: {
            targetType: "DailyLedger",
            targetId: ledger.id,
            action: "ledger.hq.inventory.saved",
            reason: "오류로 생성된 재고 행 삭제",
          },
          orderBy: { createdAt: "desc" },
          select: { after: true },
        }),
      ]);

      return {
        itemExists: item !== null,
        deletedProductIds:
          audit?.after && typeof audit.after === "object"
            ? ((
                audit.after as {
                  hqEditContext?: { deletedProductIds?: string[] };
                }
              ).hqEditContext?.deletedProductIds ?? [])
            : [],
      };
    })
    .toEqual({ itemExists: false, deletedProductIds: [product.id] });
});

// WO-02(2026-06-28): 본사 장부 상세 탭이 URL ?tab= 과 연결되고, 기존 쿼리를 보존하며,
// 딥링크/뒤로가기에서 탭 상태가 유지·복원된다.
test("본사 장부 상세 탭은 URL ?tab=와 연결되고 딥링크/뒤로가기에서 유지된다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  // 딥링크로 손실 탭을 직접 연다.
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all&tab=losses`,
  );
  await expect(
    page.getByRole("tabpanel").filter({ hasText: "손실 항목" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  // 매입 탭을 누르면 URL이 tab=purchases로 바뀌고 기존 쿼리(date/sort/filter)는 보존된다.
  await page.getByRole("tab", { name: "매입" }).click();
  await expect(page).toHaveURL(/[?&]tab=purchases\b/);
  await expect(page).toHaveURL(/[?&]date=today\b/);
  await expect(page).toHaveURL(/[?&]sort=priority\b/);
  await expect(page).toHaveURL(/[?&]filter=all\b/);

  // WO-12(2026-06-28): 본사 매입 화면은 원본 이카운트 단가와 적용 단가 보정 표시를 보여준다.
  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 단가" });
  await expect(purchasePanel).toContainText("원본 이카운트 단가");
  await expect(purchasePanel).toContainText("적용 단가 보정됨");

  // 뒤로가기는 손실 탭으로 되돌아간다.
  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=losses\b/);
  await expect(
    page.getByRole("tabpanel").filter({ hasText: "손실 항목" }),
  ).toBeVisible();
});

test("본사 장부 상세 탭을 클릭하면 6개 입력 섹션 카드로 각각 이동한다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const tabList = page.getByRole("tablist", { name: "장부 입력 섹션" });
  await expect(tabList).toBeVisible();

  for (const [value, label] of [
    ["purchases", "매입"],
    ["losses", "손실"],
    ["inventory", "재고"],
    ["expenses", "지출"],
    ["work", "근무"],
    ["sales", "매출/결제"],
  ] as const) {
    await tabList.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });

    await page.getByRole("tab", { name: label, exact: true }).click();

    const panel = page.locator(`[data-ledger-detail-panel="${value}"]`);
    await expect(panel).toBeVisible();
    await expect
      .poll(() =>
        panel.evaluate((element) => {
          const bounds = element.getBoundingClientRect();

          return bounds.top < window.innerHeight && bounds.bottom > 0;
        }),
      )
      .toBe(true);
  }
});

test("마스터 본사는 마감 상태와 최초 마감 정보를 유지하며 원본을 수정한다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(
    page.getByText("마감 상태 유지 · 마스터 수정", { exact: true }),
  ).toBeVisible();
  const reviewSummary = page.getByRole("region", { name: "검토 상태 요약" });
  await expect(reviewSummary.getByText("본사 마감 정보")).toBeVisible();
  await expect(reviewSummary.getByText("본사 관리자")).toBeVisible();
  await expect(
    reviewSummary.getByText(
      formatKstDateTimeForTest(new Date("2026-06-11T06:30:00.000Z")),
    ),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "정정 기록" })).toBeVisible();
  await expect(
    page.getByText("원본 장부 값은 보존하고 정정 이력만 추가합니다."),
  ).toBeVisible();

  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel.getByLabel("총매출", { exact: true })).toBeEnabled();
  await replaceKrwControlValue(salesPanel.getByLabel("총매출"), "12000");
  await fillHqEditReason(salesPanel, "마감 장부 매출 근거 확인");
  await salesPanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () =>
      prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: {
          status: true,
          totalSalesAmount: true,
          closedAt: true,
          closedById: true,
          version: true,
        },
      }),
    )
    .toEqual({
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 12000,
      closedAt: new Date("2026-06-11T06:30:00.000Z"),
      closedById: ledger.closedById,
      version: ledger.version + 1,
    });

  const audit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.sales_payment.updated",
    },
    orderBy: { createdAt: "desc" },
  });
  expect(audit?.reason).toBe("마감 장부 매출 근거 확인");
  expect(audit?.after).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    hqEditContext: { closedLedgerEdit: true },
  });
});

test("마감 원본 수정 감사 before는 같은 transaction의 활성 정정 유효값을 기록한다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();
  const actorId = await getHeadquartersUserId();

  await prisma.correctionRecord.createMany({
    data: [
      {
        dailyLedgerId: ledger.id,
        targetType: "PAYMENT_FIELD",
        targetId: ledger.id,
        fieldKey: "totalSalesAmount",
        originalValue: { kind: "money", value: 10000, label: "총매출" },
        previousAppliedValue: {
          kind: "money",
          value: 10000,
          label: "총매출",
        },
        correctedValue: { kind: "money", value: 11000, label: "총매출" },
        reason: "매출 유효값 확인",
        createdById: actorId,
      },
      {
        dailyLedgerId: ledger.id,
        targetType: "LEDGER_FIELD",
        targetId: ledger.id,
        fieldKey: "workerCount",
        originalValue: { kind: "quantity", value: 2, label: "근무인원" },
        previousAppliedValue: {
          kind: "quantity",
          value: 2,
          label: "근무인원",
        },
        correctedValue: { kind: "quantity", value: 4, label: "근무인원" },
        reason: "근무 유효값 확인",
        createdById: actorId,
      },
    ],
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}?tab=sales`);

  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel.getByLabel("총매출", { exact: true })).toHaveValue(
    "11,000",
  );
  await replaceKrwControlValue(salesPanel.getByLabel("총매출"), "12000");
  await fillHqEditReason(salesPanel, "매출 correction 원본 통합");
  await salesPanel.getByRole("button", { name: "저장", exact: true }).click();

  await page.getByRole("tab", { name: "근무", exact: true }).click();
  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무인원" });
  await expect(workPanel.getByLabel("근무인원", { exact: true })).toHaveValue(
    "4",
  );
  await replaceControlValue(workPanel.getByLabel("근무인원"), "5");
  await replaceControlValue(
    workPanel.locator("#work-hq-edit-reason"),
    "근무 correction 원본 통합",
  );
  await workPanel.getByRole("button", { name: "저장", exact: true }).click();

  await expect
    .poll(() =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: {
            in: [
              "ledger.hq.sales_payment.updated",
              "ledger.hq.work_info.saved",
            ],
          },
        },
      }),
    )
    .toBe(2);

  const audits = await prisma.auditLog.findMany({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: {
        in: ["ledger.hq.sales_payment.updated", "ledger.hq.work_info.saved"],
      },
    },
    select: { action: true, before: true, after: true },
  });
  const salesAudit = audits.find(
    (entry) => entry.action === "ledger.hq.sales_payment.updated",
  );
  const workAudit = audits.find(
    (entry) => entry.action === "ledger.hq.work_info.saved",
  );

  expect(salesAudit?.before).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    totalSalesAmount: 11000,
  });
  expect(salesAudit?.after).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    totalSalesAmount: 12000,
  });
  expect(workAudit?.before).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    workerCount: 4,
  });
  expect(workAudit?.after).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    workerCount: 5,
  });
});

test("활성 텍스트 정정은 본사 직접 저장에서 명시적 null로 보존된다", async ({
  page,
}) => {
  test.slow();
  const { actorId, ledger } = await seedEditableStoryData();
  const expense = await prisma.ledgerExpense.findFirstOrThrow({
    where: { dailyLedgerId: ledger.id },
    select: { id: true, memo: true },
  });

  const closedLedger = await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      status: "HEADQUARTERS_CLOSED",
      closedById: actorId,
      closedAt: new Date(),
    },
  });

  await prisma.correctionRecord.createMany({
    data: [
      {
        dailyLedgerId: closedLedger.id,
        targetType: "LEDGER_FIELD",
        targetId: closedLedger.id,
        fieldKey: "workMemo",
        originalValue: {
          kind: "text",
          value: STORY_MARKER,
          label: "근무 메모",
        },
        previousAppliedValue: {
          kind: "text",
          value: STORY_MARKER,
          label: "근무 메모",
        },
        correctedValue: { kind: "text", value: null, label: "근무 메모" },
        reason: "근무 메모 삭제",
        createdById: actorId,
      },
      {
        dailyLedgerId: closedLedger.id,
        targetType: "EXPENSE_ROW",
        targetId: expense.id,
        fieldKey: "memo",
        originalValue: {
          kind: "text",
          value: STORY_MARKER,
          label: "지출 메모",
        },
        previousAppliedValue: {
          kind: "text",
          value: STORY_MARKER,
          label: "지출 메모",
        },
        correctedValue: { kind: "text", value: null, label: "지출 메모" },
        reason: "지출 메모 삭제",
        createdById: actorId,
      },
    ],
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${closedLedger.id}?tab=work`);

  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무인원" });
  await expect(workPanel.getByLabel("특이사항 메모")).toHaveValue("");
  await replaceControlValue(workPanel.getByLabel("근무인원"), "3");
  await replaceControlValue(
    workPanel.locator("#work-hq-edit-reason"),
    "활성 근무 메모 정정 통합",
  );
  await workPanel.getByRole("button", { name: "저장", exact: true }).click();

  await page.getByRole("tab", { name: "지출", exact: true }).click();
  const expensePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "지출 항목" });
  await expect(expensePanel.getByLabel("메모")).toHaveValue("");
  await replaceKrwControlValue(expensePanel.getByLabel("지출 금액"), "2000");
  await fillHqEditReason(expensePanel, "활성 지출 메모 정정 통합");
  await expensePanel.getByRole("button", { name: "저장", exact: true }).click();

  await expect
    .poll(async () => {
      const [currentLedger, currentExpense, corrections] = await Promise.all([
        prisma.dailyLedger.findUnique({
          where: { id: closedLedger.id },
          select: { workMemo: true },
        }),
        prisma.ledgerExpense.findFirst({
          where: { dailyLedgerId: closedLedger.id },
          select: { amount: true, memo: true },
        }),
        prisma.correctionRecord.findMany({
          where: { dailyLedgerId: closedLedger.id },
          select: { fieldKey: true, supersededAt: true },
        }),
      ]);

      return {
        workMemo: currentLedger?.workMemo,
        expense: currentExpense,
        superseded: corrections.every((correction) => correction.supersededAt),
      };
    })
    .toEqual({
      workMemo: null,
      expense: { amount: 2000, memo: null },
      superseded: true,
    });
});

test("LEDGER_EDIT만 가진 본사 직원은 마감 장부 원본을 수정할 수 없다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHqStaff(page);
  await page.goto(`/app/ledgers/${ledger.id}?tab=sales`);

  await expect(
    page.getByText("마감 상태 유지 · 마스터 수정", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("본사 마감된 장부", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("총매출", { exact: true })).toBeDisabled();
});

test("마감 재고 수정은 과거 판매가와 손실을 동기화하고 명시한 이월만 재확인한다", async ({
  page,
}) => {
  const { targetLedger, sourceLedger, product } =
    await seedClosedCarryoverStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${targetLedger.id}?tab=inventory`);

  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  const priceInput = inventoryPanel.getByLabel(`${product.name} 판매한 가격`);
  const acknowledgement =
    inventoryPanel.getByLabel("새 이월 근거 확인 후 재계산");

  await expect(priceInput).toBeEnabled();
  await expect(priceInput).toHaveValue("100");
  await expect(acknowledgement).toBeVisible();
  await replaceKrwControlValue(priceInput, "200");
  await acknowledgement.check();
  await fillHqEditReason(inventoryPanel, "원천 마감 장부 수정분 재확인");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const [ledger, item, price, loss, fifo] = await Promise.all([
        prisma.dailyLedger.findUnique({
          where: { id: targetLedger.id },
          select: { status: true, version: true },
        }),
        prisma.ledgerInventoryItem.findUnique({
          where: {
            dailyLedgerId_productId: {
              dailyLedgerId: targetLedger.id,
              productId: product.id,
            },
          },
          select: {
            previousQuantity: true,
            currentQuantity: true,
            quantity: true,
            carryoverStatus: true,
            carryoverLedgerId: true,
          },
        }),
        prisma.storeSalesPricePlan.findUnique({
          where: {
            storeId_businessDate_productId: {
              storeId: CARRYOVER_CLOSED_STORE_ID,
              businessDate: targetLedger.closingDate,
              productId: product.id,
            },
          },
          select: { plannedUnitPrice: true },
        }),
        prisma.ledgerLossItem.findFirst({
          where: { dailyLedgerId: targetLedger.id, productId: product.id },
          select: { unitPrice: true, amount: true, usedPlannedPrice: true },
        }),
        prisma.ledgerInventoryFifoLot.aggregate({
          where: { dailyLedgerId: targetLedger.id, productId: product.id },
          _sum: { remainingQuantity: true },
        }),
      ]);

      return {
        ledger,
        item: item
          ? {
              ...item,
              previousQuantity: item.previousQuantity.toString(),
              currentQuantity: item.currentQuantity?.toString(),
              quantity: item.quantity?.toString(),
            }
          : null,
        price,
        loss,
        fifoRemaining: fifo._sum.remainingQuantity?.toString(),
      };
    })
    .toEqual({
      ledger: {
        status: "HEADQUARTERS_CLOSED",
        version: targetLedger.version + 1,
      },
      item: {
        previousQuantity: "8",
        currentQuantity: "4",
        quantity: "4",
        carryoverStatus: "PREVIOUS_CARRYOVER",
        carryoverLedgerId: sourceLedger.id,
      },
      price: { plannedUnitPrice: 200 },
      loss: { unitPrice: 200, amount: 200, usedPlannedPrice: true },
      fifoRemaining: "4",
    });
});

test("A→B 이월 FIFO 원가 재확인은 B→C 다음 장부에도 전파된다", async ({
  page,
}) => {
  const { targetLedger, downstreamLedger, product } =
    await seedClosedCarryoverStoryData({ withDownstreamLedger: true });
  expect(downstreamLedger).not.toBeNull();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${targetLedger.id}?tab=inventory`);

  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  await inventoryPanel.getByLabel("새 이월 근거 확인 후 재계산").check();
  await fillHqEditReason(inventoryPanel, "A 원천 FIFO 원가를 B에서 재확인");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const [targetItem, targetLots, downstream, downstreamDetail] =
        await Promise.all([
          prisma.ledgerInventoryItem.findUnique({
            where: {
              dailyLedgerId_productId: {
                dailyLedgerId: targetLedger.id,
                productId: product.id,
              },
            },
            select: { inventoryAmount: true, carryoverStatus: true },
          }),
          prisma.ledgerInventoryFifoLot.findMany({
            where: {
              dailyLedgerId: targetLedger.id,
              productId: product.id,
              remainingQuantity: { gt: 0 },
            },
            select: { unitPrice: true, remainingAmount: true },
            orderBy: { sortOrder: "asc" },
          }),
          prisma.ledgerInventoryItem.findUnique({
            where: {
              dailyLedgerId_productId: {
                dailyLedgerId: downstreamLedger!.id,
                productId: product.id,
              },
            },
            select: { carryoverStatus: true },
          }),
          prisma.ledgerInventoryCarryoverDetail.findFirst({
            where: {
              ledgerInventoryItem: {
                dailyLedgerId: downstreamLedger!.id,
                productId: product.id,
              },
            },
            select: { status: true, message: true },
          }),
        ]);

      return { targetItem, targetLots, downstream, downstreamDetail };
    })
    .toEqual({
      targetItem: {
        inventoryAmount: 200,
        carryoverStatus: "PREVIOUS_CARRYOVER",
      },
      targetLots: [{ unitPrice: 50, remainingAmount: 200 }],
      downstream: { carryoverStatus: "CARRYOVER_RECHECK_REQUIRED" },
      downstreamDetail: {
        status: "CARRYOVER_RECHECK_REQUIRED",
        message:
          "원천 장부가 수정되어 이월 수량과 FIFO 원가 근거를 다시 확인해야 합니다.",
      },
    });
});

test("이월 재확인으로 과재고가 생기면 제출한 행 사유로 조정을 함께 저장한다", async ({
  page,
}) => {
  const { targetLedger, product } = await seedClosedCarryoverStoryData({
    sourceQuantity: 2,
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${targetLedger.id}?tab=inventory`);

  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  await inventoryPanel.getByLabel("새 이월 근거 확인 후 재계산").check();
  await inventoryPanel
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("원천 감소 후 실제 재고 차이 확인");
  await fillHqEditReason(inventoryPanel, "원천 감소분과 실제 재고 재확인");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();

  await expect
    .poll(async () => {
      const [item, adjustment, fifo] = await Promise.all([
        prisma.ledgerInventoryItem.findUnique({
          where: {
            dailyLedgerId_productId: {
              dailyLedgerId: targetLedger.id,
              productId: product.id,
            },
          },
          select: {
            previousQuantity: true,
            currentQuantity: true,
            carryoverStatus: true,
          },
        }),
        prisma.ledgerInventoryAdjustment.findUnique({
          where: {
            dailyLedgerId_productId: {
              dailyLedgerId: targetLedger.id,
              productId: product.id,
            },
          },
          select: { reason: true, afterQuantity: true },
        }),
        prisma.ledgerInventoryFifoLot.aggregate({
          where: { dailyLedgerId: targetLedger.id, productId: product.id },
          _sum: { remainingQuantity: true },
        }),
      ]);

      return {
        item: item
          ? {
              previousQuantity: item.previousQuantity.toString(),
              currentQuantity: item.currentQuantity?.toString(),
              carryoverStatus: item.carryoverStatus,
            }
          : null,
        adjustment: adjustment
          ? {
              reason: adjustment.reason,
              afterQuantity: adjustment.afterQuantity.toString(),
            }
          : null,
        fifoRemaining: fifo._sum.remainingQuantity?.toString(),
      };
    })
    .toEqual({
      item: {
        previousQuantity: "2",
        currentQuantity: "4",
        carryoverStatus: "PREVIOUS_CARRYOVER",
      },
      adjustment: {
        reason: "원천 감소 후 실제 재고 차이 확인",
        afterQuantity: "4",
      },
      fifoRemaining: "4",
    });
});

test("본사 상세 매출 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  const totalSalesInput = salesPanel.getByLabel("총매출");

  await expect(salesPanel).toBeVisible();
  await clearControlValue(totalSalesInput);
  await salesPanel.getByRole("button", { name: "저장" }).click();

  await expect(
    salesPanel.getByText("총매출은 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(totalSalesInput).toBeFocused();
});

test("조회 전용 본사는 장부 상세를 볼 수 있지만 원본 입력 탭을 저장할 수 없다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHqViewer(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(
    page.getByRole("heading", { name: "스토리4-3 검토대기점 장부 상세" }),
  ).toBeVisible();
  await expect(page.getByText("수정 action")).toBeVisible();
  await expect(page.getByText("조회 전용").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "매출/결제" })).toHaveCount(0);
  await expect(page.getByLabel("총매출")).toHaveCount(0);
  await expect(page.getByLabel("본사 수정 사유")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "본사 마감" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
});

test("지점장 direct URL은 본사 ClosePreflight 상세 없이 차단된다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsStoreManager(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "본사 마감" })).toHaveCount(0);
  await expect(page.getByText("ClosePreflight")).toHaveCount(0);
  await expect(page.getByText("영업 매출/결제")).toHaveCount(0);
  await expect(page.getByText("마감 확정")).toHaveCount(0);
});

test("stale token 본사 원본 저장은 충돌 정보를 보여주고 서버 최신값을 유지한다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel).toBeVisible();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      totalSalesAmount: 77777,
      cashAmount: 16000,
      cardAmount: 60000,
      otherPaymentAmount: 777,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await replaceKrwControlValue(salesPanel.getByLabel("총매출"), "45000");
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "15000");
  await replaceKrwControlValue(salesPanel.getByLabel("카드"), "25000");
  await replaceKrwControlValue(salesPanel.getByLabel("기타 결제수단"), "5000");
  await fillHqEditReason(salesPanel, "stale 매출 저장 확인");
  await salesPanel.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("매출/결제")).toBeVisible();
  await expect(conflictDialog.getByText("본사 수정 중")).toBeVisible();
  await expect(conflictDialog.getByText("최신 상태 재확인 필요")).toBeVisible();
  await expect(conflictDialog.getByText("내 입력값").first()).toBeVisible();
  await expect(conflictDialog.getByText("서버 최신값").first()).toBeVisible();
  await expect(conflictDialog.getByText("총매출")).toBeVisible();
  await expect(conflictDialog.getByText("45000")).toBeVisible();
  await expect(conflictDialog.getByText("77777")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      totalSalesAmount: true,
      cashAmount: true,
      cardAmount: true,
      otherPaymentAmount: true,
    },
  });
  expect(current).toEqual({
    totalSalesAmount: 77777,
    cashAmount: 16000,
    cardAmount: 60000,
    otherPaymentAmount: 777,
  });
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.sales_payment.updated",
          reason: "stale 매출 저장 확인",
        },
      }),
    )
    .toBe(0);
});

test("본사는 장부를 마감한 뒤 마스터 수정 권한으로 원본 편집을 계속할 수 있다", async ({
  page,
}) => {
  const { actorId, ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  const closeButton = page.getByRole("button", { name: "본사 마감" });
  await expect(closeButton).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).not.toBeVisible();

  await closeButton.click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "조건명" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "필요한 조치" }),
  ).toBeVisible();
  await expect(page.getByText("기준값 설정 전").first()).toBeVisible();
  await expect(page.getByText("확정 이상 감지")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "마감 확정" }).click();
  await expect(
    page.getByText("마감 요청이 실패했습니다.", { exact: false }),
  ).not.toBeVisible();

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: {
          status: true,
          closedById: true,
          closedAt: true,
          updatedById: true,
        },
      });

      return current;
    })
    .toMatchObject({
      status: "HEADQUARTERS_CLOSED",
      closedById: actorId,
      updatedById: actorId,
    });

  await expect(
    page.getByText("마감 상태 유지 · 마스터 수정", { exact: true }),
  ).toBeVisible();
  const closedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { closedAt: true },
  });
  expect(closedLedger.closedAt).not.toBeNull();
  const reviewSummary = page.getByRole("region", { name: "검토 상태 요약" });
  await expect(reviewSummary.getByText("본사 마감 정보")).toBeVisible();
  await expect(reviewSummary.getByText("본사 관리자")).toBeVisible();
  await expect(
    reviewSummary.getByText(formatKstDateTimeForTest(closedLedger.closedAt!)),
  ).toBeVisible();
  await expect(page.getByLabel("총매출", { exact: true })).toBeEnabled();

  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("근무인원", { exact: true })).toBeEnabled();
  const correctionPanel = page.getByRole("region", { name: "정정 기록" });
  await expect(correctionPanel).toBeVisible();
  await expect(
    correctionPanel.getByText(
      "원본 장부 값은 보존하고 정정 이력만 추가합니다.",
    ),
  ).toBeVisible();
  await expect(correctionPanel.getByLabel("정정 대상")).toBeVisible();
  await expect(correctionPanel.getByLabel("정정값")).toBeVisible();
  await expect(correctionPanel.getByLabel("정정 사유")).toBeVisible();

  await expect
    .poll(async () => {
      const ledgerStatus = await prisma.auditLog.findFirst({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
        select: { before: true, after: true, actorId: true },
      });

      return ledgerStatus;
    })
    .toMatchObject({
      actorId,
    });

  const closedAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.closed",
    },
    select: { before: true, after: true },
  });

  expect(closedAudit?.before).not.toBeNull();
  expect(closedAudit?.after).not.toBeNull();

  const reloadedLedger = await prisma.ledgerInventoryItem.findFirst({
    where: { dailyLedgerId: ledger.id, productId: product.id },
    select: { updatedAt: true },
  });

  expect(reloadedLedger?.updatedAt).toBeTruthy();
  expect(reloadedLedger?.updatedAt).not.toBe(null);
});

test("본사 마감 중복 요청은 감사 로그를 한 번만 남긴다", async ({
  page,
  context,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  const secondPage = await context.newPage();
  const ledgerPath = `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`;

  await Promise.all([page.goto(ledgerPath), secondPage.goto(ledgerPath)]);
  await page.getByRole("button", { name: "본사 마감" }).click();
  await secondPage.getByRole("button", { name: "본사 마감" }).click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();
  await expect(
    secondPage.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();

  await Promise.all([
    page.getByRole("button", { name: "마감 확정" }).click(),
    secondPage.getByRole("button", { name: "마감 확정" }).click(),
  ]);

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { status: true, closedById: true, closedAt: true },
      });

      return current;
    })
    .toMatchObject({
      status: "HEADQUARTERS_CLOSED",
      closedById: actorId,
    });

  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
      }),
    )
    .toBe(1);

  await secondPage.close();
});

test("stale token 본사 마감은 conflict dialog와 본사 수정 중 안내를 보여준다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  await page.getByRole("button", { name: "본사 마감" }).click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "본사 마감 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await page.getByRole("button", { name: "마감 확정" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("본사 마감").first()).toBeVisible();
  await expect(conflictDialog.getByText("본사 수정 중")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { status: true, closedById: true, closedAt: true },
  });
  expect(current).toEqual({
    status: "IN_REVIEW",
    closedById: null,
    closedAt: null,
  });
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
      }),
    )
    .toBe(0);
});

test("ClosePreflight 사유 필요 항목은 사유 입력 후 개별 마감을 허용한다", async ({
  page,
}) => {
  const ledger = await seedPreflightBlockedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("button", { name: "본사 마감" }).click();

  await expect(
    page.getByRole("columnheader", { name: "조건명" }),
  ).toBeVisible();
  const salesRow = page
    .getByRole("row")
    .filter({ hasText: "영업 매출/결제" })
    .filter({ hasText: "기존 입력 단계에서 보완" })
    .first();
  await expect(salesRow).toBeVisible();
  await expect(salesRow.getByText("사유 필요")).toBeVisible();
  await expect(salesRow.getByText("기존 입력 단계에서 보완")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "사유 입력 필요" }),
  ).toBeDisabled();
  await expect(page.getByLabel("마감 예외 사유")).toBeVisible();

  await page
    .getByLabel("마감 예외 사유")
    .fill("필수 누락 항목은 검토 후 개별 마감으로 승인");
  const confirmCloseButton = page
    .getByRole("dialog", { name: "장부를 마감합니다" })
    .getByRole("button", { name: "마감 확정", exact: true });
  await expect(confirmCloseButton).toBeEnabled();
  await confirmCloseButton.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByText("마감 요청이 실패했습니다.", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.getByText("마감 상태 유지 · 마스터 수정", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { status: true },
      });

      return current?.status;
    })
    .toBe("HEADQUARTERS_CLOSED");

  const closedAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.closed",
    },
    select: { reason: true, before: true, after: true },
  });

  expect(closedAudit?.reason).toBe(
    "필수 누락 항목은 검토 후 개별 마감으로 승인",
  );
  expect(closedAudit?.before).toMatchObject({
    preflight: {
      exceptionReason: "필수 누락 항목은 검토 후 개별 마감으로 승인",
    },
  });
  expect(closedAudit?.after).toMatchObject({
    preflight: {
      exceptionReason: "필수 누락 항목은 검토 후 개별 마감으로 승인",
    },
  });
});

test("본사 손실 수정은 1.25에서 1.26으로 Decimal 저장한다", async ({
  page,
}) => {
  const { actorId, ledger, product } = await seedEditableStoryData();
  const lossItem = await prisma.ledgerLossItem.findFirstOrThrow({
    where: { dailyLedgerId: ledger.id, productId: product.id },
  });

  await prisma.ledgerLossItem.update({
    where: { id: lossItem.id },
    data: { quantity: 1.25 },
  });

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all&tab=losses`,
  );

  const lossPanel = page.getByRole("tabpanel").filter({ hasText: "손실 항목" });
  await expect(lossPanel).toBeVisible();
  await replaceControlValue(lossPanel.getByLabel("박스단위 수량"), "1.26");
  await fillHqEditReason(lossPanel, "손실 수량 소수 보정");
  await lossPanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () => {
      const current = await prisma.ledgerLossItem.findUnique({
        where: { id: lossItem.id },
        select: { quantity: true },
      });

      return current?.quantity.toString();
    })
    .toBe("1.26");

  const saved = await prisma.ledgerLossItem.findUniqueOrThrow({
    where: { id: lossItem.id },
    select: { quantity: true, updatedById: true },
  });
  expect(saved.quantity.toNumber()).toBe(1.26);
  expect(saved.updatedById).toBe(actorId);
});
