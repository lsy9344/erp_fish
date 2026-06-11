import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";

test.afterAll(async () => {
  await cleanupStory2TwoLedger();
  await cleanupStory2TwoCodes();
  await prisma.$disconnect();
});

type ExpenseCode = {
  id: string;
  name: string;
};

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function getManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function seedExpenseCode(
  name: string,
  displayOrder: number,
  options: {
    group?: "EXPENSE_ITEM" | "PAYMENT_METHOD" | "LOSS_TYPE";
    isActive?: boolean;
  } = {},
): Promise<ExpenseCode> {
  const actorId = await getHeadquartersUserId();
  const id = randomUUID();
  const group = options.group ?? "EXPENSE_ITEM";
  const isActive = options.isActive ?? true;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "LedgerInputCode" ("id", "group", "name", "displayOrder", "isActive", "createdAt", "updatedAt", "updatedById")
     VALUES ($1, $2::"LedgerInputCodeGroup", $3, $4, $5, NOW(), NOW(), $6)`,
    id,
    group,
    name,
    displayOrder,
    isActive,
    actorId,
  );

  return { id, name };
}

async function seedWorkCodePair() {
  const suffix = randomUUID().slice(0, 8);

  const food = await seedExpenseCode(`스토리2-3 식료품 ${suffix}`, 10);
  const utility = await seedExpenseCode(`스토리2-3 비품 ${suffix}`, 20);

  return { food, utility };
}

async function cleanupStory2TwoCodes() {
  const codes = await prisma.ledgerInputCode.findMany({
    where: {
      name: {
        startsWith: "스토리2-3",
      },
    },
    select: { id: true },
  });

  const codeIds = codes.map((code) => code.id);

  if (codeIds.length === 0) {
    return;
  }

  await prisma.ledgerExpense.deleteMany({
    where: {
      ledgerInputCodeId: {
        in: codeIds,
      },
    },
  });

  await prisma.ledgerInputCode.deleteMany({
    where: {
      id: {
        in: codeIds,
      },
    },
  });
}

async function cleanupStory2TwoLedger() {
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
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test.beforeEach(async () => {
  await cleanupStory2TwoLedger();
  await cleanupStory2TwoCodes();
});

test("지점장은 비용 항목을 여러 건 저장하고 재방문 시 유지한다", async ({
  page,
}) => {
  await login(page);

  const codes = await seedWorkCodePair();

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").nth(0).selectOption(codes.food.id);
  await page.getByRole("textbox", { name: "금액" }).nth(0).fill("3000");
  await page.getByRole("textbox", { name: "메모 (선택)" }).fill("재료비");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").nth(1).selectOption(codes.utility.id);
  await page.getByRole("textbox", { name: "금액" }).nth(1).fill("5000");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "비용 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole("textbox", { name: "금액" })).toHaveCount(2);
  await expect(
    page.locator("section").filter({ hasText: "비용 합계" }),
  ).toContainText("8,000원");
  await expect(
    page.locator("section").filter({ hasText: "마지막 서버 저장 합계" }),
  ).toContainText("8,000원");
});

test("비활성 비용 코드는 기존 장부 표시만 유지되고 신규 선택지에는 없다", async ({
  page,
}) => {
  await login(page);

  const activeCode = await seedExpenseCode(
    `스토리2-3 활성 비용 ${randomUUID().slice(0, 6)}`,
    10,
  );
  const inactiveCode = await seedExpenseCode(
    `스토리2-3 비활성 과거 ${randomUUID().slice(0, 6)}`,
    20,
    { isActive: false },
  );
  const actorId = await getManagerUserId();
  const closingDate = new Date("2026-06-03T00:00:00.000Z");
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate,
      status: "IN_PROGRESS",
      totalSalesAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: null,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInputCodeId: inactiveCode.id,
      amount: 1200,
      memo: "과거 코드",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(
    `/app/store-entry?storeId=${STORY_STORE_ID}&date=2026-06-03&step=cost`,
  );

  const existingSelect = page.getByLabel("비용 항목").nth(0);
  await expect(existingSelect).toHaveValue(inactiveCode.id);
  const existingOptions = await existingSelect
    .locator("option")
    .allTextContents();
  expect(existingOptions).toContain("비용 항목 선택");
  expect(existingOptions).toContain(inactiveCode.name);
  expect(existingOptions).toContain(activeCode.name);

  await page.getByRole("button", { name: "항목 추가" }).click();
  const newLineOptions = await page
    .getByLabel("비용 항목")
    .nth(1)
    .locator("option")
    .allTextContents();

  expect(newLineOptions).toContain(activeCode.name);
  expect(newLineOptions).not.toContain(inactiveCode.name);
});

test("비용 단계 미저장 변경 이동 dialog에서 저장 후 다음 단계로 이동한다", async ({
  page,
}) => {
  await login(page);

  const code = await seedExpenseCode(
    `스토리2-3 미저장 ${randomUUID().slice(0, 6)}`,
    30,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").selectOption(code.id);
  await page.getByRole("textbox", { name: "금액" }).fill("9000");

  await page.getByRole("link", { name: /3단계: 매입/ }).click();
  await expect(
    page.getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(page).toHaveURL(/step=cost/);

  await page.getByRole("link", { name: /3단계: 매입/ }).click();
  await page
    .getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })
    .getByRole("button", { name: "저장" })
    .click();
  await expect(page).toHaveURL(/step=purchase/);

  const ledger = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORY_STORE_ID },
    orderBy: { updatedAt: "desc" },
    include: { ledgerExpenses: true },
  });
  expect(ledger.ledgerExpenses).toHaveLength(1);
  expect(ledger.ledgerExpenses[0]?.amount).toBe(9000);
});

test("비용 저장 실패 시 한국어 오류와 재시도 동작이 표시된다", async ({
  page,
}) => {
  await login(page);

  const code = await seedExpenseCode(
    `스토리2-3 재시도 ${randomUUID().slice(0, 6)}`,
    40,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").selectOption(code.id);
  await page.getByRole("textbox", { name: "금액" }).fill("4400");

  await page.route("**/*", async (route) => {
    const request = route.request();
    const nextAction = request.headers()["next-action"];

    if (
      request.method() === "POST" &&
      (request.url().includes("/app/store-entry") ||
        request.url().includes("/_next/action") ||
        Boolean(nextAction))
    ) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "저장에 실패했습니다. 다시 시도해 주세요." }),
  ).toBeVisible();
  const retryButton = page
    .getByLabel("장부 저장 상태")
    .getByRole("button", { name: "다시 시도" });
  await expect(retryButton).toBeVisible();

  await page.unroute("**/*");
  await retryButton.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "비용 항목 1건을 저장했습니다." }),
  ).toBeVisible();
});

test("지점장은 근무인원과 특이사항을 저장하고 민감 회계 지표를 보지 않는다", async ({
  page,
}) => {
  await login(page);
  const code = await seedExpenseCode(
    `스토리2-3 생산성 ${randomUUID().slice(0, 6)}`,
    30,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=sales`);
  await page.getByRole("textbox", { name: "총매출" }).fill("10000");
  await page.getByRole("textbox", { name: "현금" }).fill("7000");
  await page.getByRole("textbox", { name: "카드" }).fill("2000");
  await page.getByRole("textbox", { name: "기타 결제수단" }).fill("1000");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").selectOption(code.id);
  await page.getByRole("textbox", { name: "금액" }).fill("3000");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "비용 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  const summary = page.locator("section").filter({ hasText: "비용 합계" });

  await expect(summary).toContainText("비용 합계");
  await expect(summary).toContainText("3,000원");
  await expect(page.getByText("영업이익")).toHaveCount(0);
  await expect(page.getByText("인당생산성")).toHaveCount(0);
  await page.getByRole("textbox", { name: "근무인원" }).fill("2");
  await page
    .getByRole("textbox", { name: "특이사항 메모" })
    .fill("오전 피크타임 확인");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect(page.getByText("영업이익")).toHaveCount(0);
  await expect(page.getByText("인당생산성")).toHaveCount(0);
});

test("근무인원 0이어도 인당생산성 라벨은 지점장에게 노출되지 않는다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  await page.getByRole("textbox", { name: "근무인원" }).fill("0");
  await page
    .getByRole("textbox", { name: "특이사항 메모" })
    .fill("안내 테스트");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect(page.getByText("인당생산성")).toHaveCount(0);
});

test("비용 단계 검증 실패 시 첫 오류 필드로 포커스가 이동한다", async ({
  page,
}) => {
  await login(page);
  await seedExpenseCode(`스토리2-3 검증 ${randomUUID().slice(0, 6)}`, 50);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(page.getByText("비용 항목을 선택해 주세요.")).toBeVisible();
  await expect(page.getByLabel("비용 항목")).toBeFocused();
});

test("390px에서 비용/근무 단계는 숫자 키패드 및 터치 타깃이 충족된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const code = await seedExpenseCode(
    `스토리2-3 휴대 390 ${randomUUID().slice(0, 6)}`,
    40,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").selectOption(code.id);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목").nth(1).selectOption(code.id);

  const amountInput = page.getByRole("textbox", { name: "금액" }).first();
  const addLineButton = page.getByRole("button", { name: "항목 추가" });
  const deleteButton = page.getByRole("button", { name: "삭제" }).first();
  const saveButton = page.getByRole("button", { name: "저장" }).first();

  await expect(amountInput).toHaveAttribute("inputmode", "numeric");
  const amountBox = await amountInput.boundingBox();
  const addLineBox = await addLineButton.boundingBox();
  const deleteBox = await deleteButton.boundingBox();
  const saveBox = await saveButton.boundingBox();

  expect(amountBox?.height).toBeGreaterThanOrEqual(44);
  expect(addLineBox?.width).toBeGreaterThanOrEqual(44);
  expect(addLineBox?.height).toBeGreaterThanOrEqual(44);
  expect(deleteBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);

  const viewportWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  const workerInput = page.getByRole("textbox", { name: "근무인원" });
  const saveWorkButton = page.getByRole("button", { name: "저장" }).first();
  await expect(workerInput).toHaveAttribute("inputmode", "numeric");

  const workerBox = await workerInput.boundingBox();
  const saveWorkBox = await saveWorkButton.boundingBox();
  expect(workerBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveWorkBox?.height).toBeGreaterThanOrEqual(44);
});
