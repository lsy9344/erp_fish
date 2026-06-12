import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_MARKER = "story-4-3-test";
const STORE_ID = "store-story-4-3-edit";
const CLOSED_STORE_ID = "store-story-4-3-closed";
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
  await page.getByLabel("이메일").fill("hq@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsHqViewer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("hq-viewer@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
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
      cashAmount: 4000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
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
  const stores = [STORE_ID, CLOSED_STORE_ID, PREFLIGHT_BLOCKED_STORE_ID];
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
  await replaceKrwControlValue(salesPanel.getByLabel("총매출"), "45000");
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "15000");
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
      cashAmount: 15000,
      cardAmount: 25000,
      otherPaymentAmount: 5000,
    });

  await page.getByRole("tab", { name: "비용" }).click();
  const expensePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "비용 항목" });
  await expect(expensePanel).toBeVisible();
  await replaceKrwControlValue(expensePanel.getByLabel("금액"), "3000");
  await fillHqEditReason(expensePanel, "비용 원본 보완");
  await expensePanel.getByRole("button", { name: "저장" }).click();
  await expect(
    expensePanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|비용 항목 1건을 저장했습니다/ }),
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

  await page.getByRole("tab", { name: "매입" }).click();
  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 항목" });
  await expect(purchasePanel).toBeVisible();
  await replaceControlValue(purchasePanel.getByLabel("수량"), "3");
  await fillHqEditReason(purchasePanel, "매입 원본 보완");
  await purchasePanel.getByRole("button", { name: "저장" }).click();
  await expect(
    purchasePanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|매입 항목 1건을 저장했습니다/ }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerPurchaseItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { quantity: true },
      });

      return current?.quantity;
    })
    .toBe(3);

  await page.getByRole("tab", { name: "재고" }).click();
  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  await expect(inventoryPanel).toBeVisible();
  const inventoryInput = page.getByLabel(`${product.name} 당일재고`);
  await expect(inventoryInput).toBeVisible();
  await replaceControlValue(inventoryInput, "12");
  await fillHqEditReason(inventoryPanel, "재고 원본 보완");
  await inventoryPanel.getByRole("button", { name: "저장" }).click();
  await expect(
    inventoryPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerInventoryItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { currentQuantity: true },
      });

      return current?.currentQuantity;
    })
    .toBe(12);

  await page.getByRole("tab", { name: "근무" }).click();
  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무인원" });
  await expect(workPanel).toBeVisible();
  await replaceControlValue(workPanel.getByLabel("근무인원"), "5");
  await replaceControlValue(workPanel.getByLabel("특이사항 메모"), "본사 보완");
  await fillHqEditReason(workPanel, "근무 원본 보완");
  await workPanel.getByRole("button", { name: "저장" }).click();
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

  const savedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    include: {
      ledgerExpenses: true,
      ledgerPurchaseItems: true,
      ledgerInventoryItems: true,
      ledgerLossItems: true,
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
  expect(savedLedger.cashAmount).toBe(15000);
  expect(savedLedger.cardAmount).toBe(25000);
  expect(savedLedger.otherPaymentAmount).toBe(5000);
  expect(savedLedger.workerCount).toBe(5);
  expect(savedLedger.workMemo).toBe("본사 보완");
  expect(savedLedger.updatedById).toBe(actorId);
  expect(savedLedger.submittedById).toBeNull();
  expect(savedLedger.submittedAt).toBeNull();
  expect(savedLedger.ledgerExpenses[0]?.amount).toBe(3000);
  expect(savedLedger.ledgerPurchaseItems[0]?.quantity).toBe(3);
  expect(savedLedger.ledgerInventoryItems[0]?.currentQuantity).toBe(12);
  expect(savedLedger.ledgerLossItems[0]?.reason).toBe("본사 손실 확인");
  expect(auditActions.map((entry) => entry.action)).toEqual(
    expect.arrayContaining([
      "ledger.hq.sales_payment.updated",
      "ledger.hq.expenses.saved",
      "ledger.hq.purchases.saved",
      "ledger.hq.inventory.saved",
      "ledger.hq.losses.saved",
      "ledger.hq.work_info.saved",
    ]),
  );
  expect(auditActions.every((entry) => entry.actorId === actorId)).toBe(true);
  expect(auditActions.every((entry) => entry.before && entry.after)).toBe(true);
  expect(auditActions.map((entry) => entry.reason)).toEqual(
    expect.arrayContaining([
      "매출 결제 원본 보완",
      "비용 원본 보완",
      "매입 원본 보완",
      "재고 원본 보완",
      "손실 원본 보완",
      "근무 원본 보완",
    ]),
  );
});

test("본사 마감 장부 상세는 원본 입력 컨트롤을 비활성화하고 정정 안내를 보인다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(
    page.getByText("본사 마감된 장부", { exact: true }),
  ).toBeVisible();
  const reviewSummary = page.getByRole("region", { name: "검토 상태 요약" });
  await expect(reviewSummary.getByText("본사 마감 정보")).toBeVisible();
  await expect(reviewSummary.getByText("본사 관리자")).toBeVisible();
  await expect(
    reviewSummary.getByText(
      formatKstDateTimeForTest(new Date("2026-06-11T06:30:00.000Z")),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/정정 기록을 사용해 주세요/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "정정 기록" }),
  ).toBeVisible();
  await expect(
    page.getByText("원본 장부 값은 보존하고 정정 이력만 추가합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("총매출")).toBeDisabled();

  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("근무인원")).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "본사마감" })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "본사마감" })).toHaveCount(0);
  await expect(page.getByText("ClosePreflight")).toHaveCount(0);
  await expect(page.getByText("총매출/결제")).toHaveCount(0);
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
      cashAmount: 17000,
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
    cashAmount: 17000,
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

test("본사는 마감 버튼으로 장부를 본사마감하고 이후 원본 수정이 비활성화된다", async ({
  page,
}) => {
  const { actorId, ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  const closeButton = page.getByRole("button", { name: "본사마감" });
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
  await expect(page.getByText("기준 확인 필요").first()).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "장부를 마감합니다" })
      .getByText("확정 이상이나 확정 계산값으로 보지 않습니다.")
      .first(),
  ).toBeVisible();
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
    page.getByText("본사 마감된 장부", { exact: true }),
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
  await expect(page.getByLabel("총매출")).toBeDisabled();

  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("근무인원")).toBeDisabled();
  const correctionPanel = page.getByRole("region", { name: "정정 기록" });
  await expect(correctionPanel).toBeVisible();
  await expect(
    correctionPanel.getByText("원본 장부 값은 보존하고 정정 이력만 추가합니다."),
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

test("본사마감 중복 요청은 감사 로그를 한 번만 남긴다", async ({
  page,
  context,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  const secondPage = await context.newPage();
  const ledgerPath = `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`;

  await Promise.all([page.goto(ledgerPath), secondPage.goto(ledgerPath)]);
  await page.getByRole("button", { name: "본사마감" }).click();
  await secondPage.getByRole("button", { name: "본사마감" }).click();
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

test("stale token 본사마감은 conflict dialog와 본사 수정 중 안내를 보여준다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  await page.getByRole("button", { name: "본사마감" }).click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "본사마감 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await page.getByRole("button", { name: "마감 확정" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("본사마감").first()).toBeVisible();
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
  await page.getByRole("button", { name: "본사마감" }).click();

  await expect(
    page.getByRole("columnheader", { name: "조건명" }),
  ).toBeVisible();
  const salesRow = page.getByRole("row").filter({ hasText: "총매출/결제" });
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
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "마감 확정" }).click();

  await expect(
    page.getByText("마감 요청이 실패했습니다.", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.getByText("본사 마감된 장부", { exact: true }),
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
