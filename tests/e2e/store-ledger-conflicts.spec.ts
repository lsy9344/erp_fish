import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "store-gangnam";

// WO-A(2026-06-22): 지점장 저장/제출은 KST 오늘 날짜만 허용하므로 동적 오늘 날짜를 사용한다.
function getTodayKstDateParam(inputDate = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  return `${year}-${month}-${day}`;
}

const CONFLICT_DATE = getTodayKstDateParam();

test.beforeEach(async () => {
  await cleanupConflictLedger();
});

test.afterAll(async () => {
  await cleanupConflictLedger();
  await prisma.$disconnect();
});

async function cleanupConflictLedger() {
  const closingDate = new Date(`${CONFLICT_DATE}T00:00:00.000Z`);
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID, closingDate },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length === 0) {
    return;
  }

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

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);
}

async function getManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

test("stale sales 저장은 structured conflict dialog를 보여주고 첫 저장값을 유지한다", async ({
  page,
}) => {
  const managerId = await getManagerUserId();

  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${CONFLICT_DATE}&step=sales`,
  );
  await expect(page.getByLabel("영업일")).toHaveValue(CONFLICT_DATE);

  await prisma.dailyLedger.updateMany({
    where: {
      storeId: STORE_ID,
      closingDate: new Date(`${CONFLICT_DATE}T00:00:00.000Z`),
    },
    data: {
      totalSalesAmount: 44444,
      cashAmount: 14000,
      cardAmount: 30000,
      otherPaymentAmount: 444,
      updatedById: managerId,
      version: { increment: 1 },
    },
  });

  // 작성자 표시명은 1단계 매입으로 이동했고, 매출 저장에는 더 이상 필요치 않다.
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("33333");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("13000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("20000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("333");
  await page.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("내 입력값").first()).toBeVisible();
  await expect(conflictDialog.getByText("서버 최신값").first()).toBeVisible();
  await expect(conflictDialog.getByText("마지막 수정자:")).toBeVisible();
  await expect(conflictDialog.getByText("총매출")).toBeVisible();
  await expect(conflictDialog.getByText("33333")).toBeVisible();
  await expect(conflictDialog.getByText("44444")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "계속 편집" }),
  ).toBeVisible();

  const ledger = await prisma.dailyLedger.findFirstOrThrow({
    where: {
      storeId: STORE_ID,
      closingDate: new Date(`${CONFLICT_DATE}T00:00:00.000Z`),
    },
    select: { totalSalesAmount: true },
  });
  expect(ledger.totalSalesAmount).toBe(44444);
});

test("두 브라우저 컨텍스트의 같은 매출 필드 동시 수정은 두 번째 저장을 거부한다", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const ledgerPath = `/app/store-entry?storeId=${STORE_ID}&date=${CONFLICT_DATE}&step=sales`;

  try {
    await Promise.all([
      loginAsStoreManager(firstPage),
      loginAsStoreManager(secondPage),
    ]);
    await Promise.all([
      firstPage.goto(ledgerPath),
      secondPage.goto(ledgerPath),
    ]);
    await Promise.all([
      expect(firstPage.getByLabel("영업일")).toHaveValue(CONFLICT_DATE),
      expect(secondPage.getByLabel("영업일")).toHaveValue(CONFLICT_DATE),
    ]);

    // 작성자 표시명은 1단계 매입으로 이동했고, 매출 저장에는 더 이상 필요치 않다.
    await firstPage
      .getByRole("textbox", { name: "총매출", exact: true })
      .fill("55555");
    await firstPage
      .getByRole("textbox", { name: "현금", exact: true })
      .fill("15000");
    await firstPage
      .getByRole("textbox", { name: "카드", exact: true })
      .fill("40000");
    await firstPage
      .getByRole("textbox", { name: "기타 결제수단", exact: true })
      .fill("555");
    await firstPage.getByRole("button", { name: "저장" }).click();
    await expect(
      firstPage.getByRole("status").filter({ hasText: "저장됐습니다." }),
    ).toBeVisible();

    // 작성자 표시명은 1단계 매입으로 이동했고, 매출 저장에는 더 이상 필요치 않다.
    await secondPage
      .getByRole("textbox", { name: "총매출", exact: true })
      .fill("66666");
    await secondPage
      .getByRole("textbox", { name: "현금", exact: true })
      .fill("16000");
    await secondPage
      .getByRole("textbox", { name: "카드", exact: true })
      .fill("50000");
    await secondPage
      .getByRole("textbox", { name: "기타 결제수단", exact: true })
      .fill("666");
    await secondPage.getByRole("button", { name: "저장" }).click();

    const conflictDialog = secondPage.getByRole("dialog", {
      name: "저장 충돌이 발생했습니다",
    });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog.getByText("총매출")).toBeVisible();
    await expect(conflictDialog.getByText("66666")).toBeVisible();
    await expect(conflictDialog.getByText("55555")).toBeVisible();

    const ledger = await prisma.dailyLedger.findFirstOrThrow({
      where: {
        storeId: STORE_ID,
        closingDate: new Date(`${CONFLICT_DATE}T00:00:00.000Z`),
      },
      select: { totalSalesAmount: true, cashAmount: true, cardAmount: true },
    });
    expect(ledger).toEqual({
      totalSalesAmount: 55555,
      cashAmount: 15000,
      cardAmount: 40000,
    });
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("서로 다른 섹션 변경도 안전 병합 없이 stale 저장으로 명시 거부한다", async ({
  page,
}) => {
  const managerId = await getManagerUserId();

  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${CONFLICT_DATE}&step=sales`,
  );
  await expect(page.getByLabel("영업일")).toHaveValue(CONFLICT_DATE);

  const ledgerBefore = await prisma.dailyLedger.findUniqueOrThrow({
    where: {
      storeId_closingDate: {
        storeId: STORE_ID,
        closingDate: new Date(`${CONFLICT_DATE}T00:00:00.000Z`),
      },
    },
    select: { id: true },
  });

  await prisma.dailyLedger.update({
    where: { id: ledgerBefore.id },
    data: {
      workerCount: 7,
      workMemo: "다른 섹션 선저장",
      updatedById: managerId,
      version: { increment: 1 },
    },
  });

  // 작성자 표시명은 1단계 매입으로 이동했고, 매출 저장에는 더 이상 필요치 않다.
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("22222");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("12000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("10000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("222");
  await page.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("최신 상태 재확인 필요")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const ledgerAfter = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledgerBefore.id },
    select: { totalSalesAmount: true, workerCount: true, workMemo: true },
  });
  expect(ledgerAfter).toEqual({
    totalSalesAmount: 0,
    workerCount: 7,
    workMemo: "다른 섹션 선저장",
  });
});

test("모바일 하단 탭 이동은 미저장 변경 선택 dialog를 먼저 연다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${CONFLICT_DATE}&step=sales`,
  );

  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("12345");
  await page
    .getByRole("navigation", { name: "지점장 하단 업무" })
    .getByRole("link", { name: "재고" })
    .click();

  const unsavedDialog = page.getByRole("dialog", {
    name: "저장하지 않은 변경이 있습니다",
  });
  await expect(unsavedDialog).toBeVisible();
  await expect(
    unsavedDialog.getByRole("button", { name: "저장" }),
  ).toBeVisible();
  await expect(
    unsavedDialog.getByRole("button", { name: "변경 버리고 이동" }),
  ).toBeVisible();
  await expect(
    unsavedDialog.getByRole("button", { name: "계속 편집" }),
  ).toBeVisible();

  await unsavedDialog.getByRole("button", { name: "계속 편집" }).click();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toHaveValue("12,345");
});
