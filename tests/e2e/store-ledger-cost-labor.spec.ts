import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";

// WO-A(2026-06-22): 지점장 저장/제출은 KST 오늘 날짜만 허용하므로 동적 오늘 날짜를 사용한다.
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

function getTodayKstDateParam(inputDate = new Date()) {
  return getTodayKstMidnight(inputDate).toISOString().slice(0, 10);
}

// WO-09: 비용 단계 화면에는 비용 항목 표시명(alias) 편집기가 함께 렌더링되고,
// 그 편집기에도 type="button" 저장 버튼이 있다. 비용 폼 제출 버튼은 type="submit"
// 이므로 폼 저장을 누를 때는 submit 버튼으로 한정한다.
function costSaveButton(page: Page) {
  return page.locator('button[type="submit"]').filter({ hasText: "저장" });
}

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

  const food = await seedExpenseCode(`스토리2-8 식료품 ${suffix}`, 10);
  const utility = await seedExpenseCode(`스토리2-8 비품 ${suffix}`, 20);

  return { food, utility };
}

async function cleanupStory2TwoCodes() {
  const codes = await prisma.ledgerInputCode.findMany({
    where: {
      name: {
        startsWith: "스토리2-8",
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
  await page
    .getByLabel("비용 항목", { exact: true })
    .nth(0)
    .selectOption(codes.food.id);
  await page.getByRole("textbox", { name: "금액" }).nth(0).fill("3000");
  await page.getByRole("textbox", { name: "메모 (선택)" }).fill("재료비");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page
    .getByLabel("비용 항목", { exact: true })
    .nth(1)
    .selectOption(codes.utility.id);
  await page.getByRole("textbox", { name: "금액" }).nth(1).fill("5000");

  await costSaveButton(page).click();
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

test("지점장이 비용 항목 표시명(alias)을 바꾸면 선택지에 반영되고, 비우면 본사 등록명으로 되돌아간다", async ({
  page,
}) => {
  await login(page);

  const code = await seedExpenseCode(
    `스토리2-8 alias 비용 ${randomUUID().slice(0, 6)}`,
    15,
  );
  const aliasName = `지점비용 ${randomUUID().slice(0, 6)}`;

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);

  // 비용 항목 표시명 편집기가 비용 단계에 함께 렌더링된다.
  await expect(
    page.getByRole("heading", { name: "비용 항목 표시명" }),
  ).toBeVisible();
  const aliasInput = page.getByLabel(`${code.name} 표시명`);
  await aliasInput.fill(aliasName);
  await aliasInput
    .locator("xpath=ancestor::li[1]")
    .getByRole("button", { name: "저장" })
    .click();
  await expect(page.getByText("표시명을 저장했습니다.")).toBeVisible();

  // alias는 지점 범위로 저장되고 본사 등록명은 그대로다.
  const savedAlias = await prisma.ledgerInputCodeStoreAlias.findFirst({
    where: { ledgerInputCodeId: code.id, storeId: STORY_STORE_ID },
  });
  expect(savedAlias?.displayName).toBe(aliasName);
  const canonical = await prisma.ledgerInputCode.findUniqueOrThrow({
    where: { id: code.id },
    select: { name: true },
  });
  expect(canonical.name).toBe(code.name);

  // 재방문 시 비용 항목 선택지에 alias 표시명이 보인다.
  await page.reload();
  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page
      .getByLabel("비용 항목", { exact: true })
      .nth(0)
      .locator("option", { hasText: aliasName }),
  ).toHaveCount(1);

  // 표시명을 비우고 저장하면 본사 등록명으로 되돌아간다(alias 삭제).
  const aliasInputAfter = page.getByLabel(`${aliasName} 표시명`);
  await aliasInputAfter.fill("");
  await aliasInputAfter
    .locator("xpath=ancestor::li[1]")
    .getByRole("button", { name: "저장" })
    .click();
  await expect(page.getByText("표시명을 저장했습니다.")).toBeVisible();

  const clearedAlias = await prisma.ledgerInputCodeStoreAlias.findFirst({
    where: { ledgerInputCodeId: code.id, storeId: STORY_STORE_ID },
  });
  expect(clearedAlias).toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page
      .getByLabel("비용 항목", { exact: true })
      .nth(0)
      .locator("option", { hasText: code.name }),
  ).toHaveCount(1);
});

test("비활성 비용 코드는 기존 장부 표시만 유지되고 신규 선택지에는 없다", async ({
  page,
}) => {
  await login(page);

  const activeCode = await seedExpenseCode(
    `스토리2-8 활성 비용 ${randomUUID().slice(0, 6)}`,
    10,
  );
  const inactiveCode = await seedExpenseCode(
    `스토리2-8 비활성 과거 ${randomUUID().slice(0, 6)}`,
    20,
    { isActive: false },
  );
  const actorId = await getManagerUserId();
  const closingDate = getTodayKstMidnight();
  // WO-A(2026-06-22): 오늘 장부는 페이지 진입 시 자동 생성될 수 있으므로 upsert로 만든다.
  const ledger = await prisma.dailyLedger.upsert({
    where: {
      storeId_closingDate: { storeId: STORY_STORE_ID, closingDate },
    },
    update: {
      status: "IN_PROGRESS",
      updatedById: actorId,
    },
    create: {
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

  // 기존에 남은 비용 행을 정리한 뒤 비활성 코드 행을 심는다.
  await prisma.ledgerExpense.deleteMany({
    where: { dailyLedgerId: ledger.id },
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
    `/app/store-entry?storeId=${STORY_STORE_ID}&date=${getTodayKstDateParam()}&step=cost`,
  );

  const existingSelect = page.getByLabel("비용 항목", { exact: true }).nth(0);
  await expect(existingSelect).toHaveValue(inactiveCode.id);
  const existingOptions = await existingSelect
    .locator("option")
    .allTextContents();
  expect(existingOptions).toContain("비용 항목 선택");
  expect(existingOptions).toContain(inactiveCode.name);
  expect(existingOptions).toContain(activeCode.name);

  await page.getByRole("button", { name: "항목 추가" }).click();
  const newLineOptions = await page
    .getByLabel("비용 항목", { exact: true })
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
    `스토리2-8 미저장 ${randomUUID().slice(0, 6)}`,
    30,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목", { exact: true }).selectOption(code.id);
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
    `스토리2-8 재시도 ${randomUUID().slice(0, 6)}`,
    40,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목", { exact: true }).selectOption(code.id);
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

  await costSaveButton(page).click();

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
    `스토리2-8 생산성 ${randomUUID().slice(0, 6)}`,
    30,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=sales`);
  await page.getByLabel("작성자 표시명").fill("강남점 지점장");
  await page.getByRole("textbox", { name: "총매출" }).fill("10000");
  await page.getByRole("textbox", { name: "현금" }).fill("7000");
  await page.getByRole("textbox", { name: "카드" }).fill("2000");
  await page.getByRole("textbox", { name: "기타 결제수단" }).fill("1000");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목", { exact: true }).selectOption(code.id);
  await page.getByRole("textbox", { name: "금액" }).fill("3000");
  await costSaveButton(page).click();
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
  // 근무 단계에는 "저장"과 "급여 저장"이 함께 있으므로 근무정보 저장은 exact로 한정한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect(page.getByText("영업이익")).toHaveCount(0);
  await expect(page.getByText("인당생산성")).toHaveCount(0);
});

test("지점장은 급여(인건비) 항목을 여러 건 저장하고 재방문 시 유지한다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);

  await page.getByRole("button", { name: "직원 추가" }).click();
  await page.getByLabel("직원명").nth(0).fill("홍길동");
  await page.getByLabel("급여 금액").nth(0).fill("1200000");
  await page.getByLabel("지각 (선택)").nth(0).fill("10분 지각");

  await page.getByRole("button", { name: "직원 추가" }).click();
  await page.getByLabel("직원명").nth(1).fill("김철수");
  await page.getByLabel("급여 금액").nth(1).fill("800000");
  await page.getByLabel("조퇴 (선택)").nth(1).fill("조기 퇴근");

  await page.getByRole("button", { name: "급여 저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "급여 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByLabel("직원명")).toHaveCount(2);
  await expect(page.getByLabel("직원명").nth(0)).toHaveValue("홍길동");
  await expect(page.getByLabel("급여 금액").nth(0)).toHaveValue("1,200,000");
  await expect(page.getByLabel("직원명").nth(1)).toHaveValue("김철수");
  await expect(
    page.locator("section").filter({ hasText: "급여 / 인건비" }),
  ).toContainText("2,000,000원");

  const ledger = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORY_STORE_ID },
    orderBy: { updatedAt: "desc" },
    include: { ledgerLaborItems: { orderBy: { createdAt: "asc" } } },
  });
  expect(ledger.ledgerLaborItems).toHaveLength(2);
  expect(ledger.ledgerLaborItems[0]?.workerName).toBe("홍길동");
  expect(ledger.ledgerLaborItems[0]?.amount).toBe(1200000);
  expect(ledger.ledgerLaborItems[0]?.lateMemo).toBe("10분 지각");
  expect(ledger.ledgerLaborItems[1]?.workerName).toBe("김철수");
  expect(ledger.ledgerLaborItems[1]?.earlyLeaveMemo).toBe("조기 퇴근");
});

test("근무 단계는 근무/인건비 명칭, 근무 요약, 급여 행 기준 참고 인원과 불일치 안내를 보여준다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);

  // Task 1/2: 6단계 네비게이션 명칭과 근무 요약 제목.
  await expect(
    page.getByRole("link", { name: /6단계: 근무\/인건비/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("근무 요약")).toBeVisible();
  await expect(
    page.getByText(
      "급여 행에 없는 근무자도 포함해 실제 근무한 인원을 입력합니다.",
    ),
  ).toBeVisible();

  // 근무인원 3명, 급여 행 2명 → 참고 인원 2명, 불일치 안내 노출.
  await page.getByRole("textbox", { name: "근무인원" }).fill("3");

  await page.getByRole("button", { name: "직원 추가" }).click();
  await page.getByLabel("직원명").nth(0).fill("홍길동");
  await page.getByLabel("급여 금액").nth(0).fill("1200000");

  await page.getByRole("button", { name: "직원 추가" }).click();
  await page.getByLabel("직원명").nth(1).fill("김철수");
  await page.getByLabel("급여 금액").nth(1).fill("800000");

  const laborSection = page
    .locator("section")
    .filter({ hasText: "급여 / 인건비" });
  await expect(laborSection).toContainText("급여 행 기준 참고 인원");
  await expect(laborSection).toContainText("2명");
  await expect(
    page.getByText("근무인원과 급여 행 기준 참고 인원이 다릅니다.", {
      exact: false,
    }),
  ).toBeVisible();

  // 불일치 상태에서도 근무정보 저장과 급여 저장이 모두 성공한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "급여 저장" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "급여 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  // 재방문 후 근무인원과 급여 행이 유지된다.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "근무인원" })).toHaveValue("3");
  await expect(page.getByLabel("직원명")).toHaveCount(2);
  await expect(page.getByLabel("직원명").nth(0)).toHaveValue("홍길동");
  await expect(page.getByLabel("직원명").nth(1)).toHaveValue("김철수");
  await expect(
    page.locator("section").filter({ hasText: "급여 / 인건비" }),
  ).toContainText("2명");

  const ledger = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORY_STORE_ID },
    orderBy: { updatedAt: "desc" },
    include: { ledgerLaborItems: true },
  });
  expect(ledger.workerCount).toBe(3);
  expect(ledger.ledgerLaborItems).toHaveLength(2);
});

test("급여 직원명이 비어 있으면 서버 검증 오류를 보여준다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  await page.getByRole("button", { name: "직원 추가" }).click();
  await page.getByLabel("급여 금액").fill("500000");
  await page.getByRole("button", { name: "급여 저장" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(
    page.getByText("직원명을 1~50자로 입력해 주세요."),
  ).toBeVisible();

  const ledger = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORY_STORE_ID },
    orderBy: { updatedAt: "desc" },
    include: { ledgerLaborItems: true },
  });
  expect(ledger.ledgerLaborItems).toHaveLength(0);
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
  // 근무 단계에는 "저장"과 "급여 저장"이 함께 있으므로 근무정보 저장은 exact로 한정한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect(page.getByText("인당생산성")).toHaveCount(0);
});

test("근무인원은 콤마나 소수 입력을 조용히 보정하지 않고 서버 검증 오류를 보여준다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  const workerInput = page.getByRole("textbox", { name: "근무인원" });

  await workerInput.fill("1,000");
  await page
    .getByRole("textbox", { name: "특이사항 메모" })
    .fill("검증 오류 확인");
  // 근무 단계에는 "저장"과 "급여 저장"이 함께 있으므로 근무정보 저장은 exact로 한정한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();

  await expect(workerInput).toHaveValue("1,000");
  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(
    page.getByText("근무인원은 0 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(workerInput).toBeFocused();
  await expect(workerInput).toHaveAttribute("aria-invalid", "true");
  await expect(workerInput).toHaveAttribute(
    "aria-describedby",
    "worker-count-error",
  );
  await expect(page.locator("#worker-count-error")).toContainText(
    "근무인원은 0 이상의 정수여야 합니다.",
  );

  const ledgerAfterComma = await prisma.dailyLedger.findFirstOrThrow({
    where: { storeId: STORY_STORE_ID },
    orderBy: { updatedAt: "desc" },
    select: { workerCount: true, workMemo: true },
  });
  expect(ledgerAfterComma.workerCount).toBeNull();
  expect(ledgerAfterComma.workMemo).toBeNull();

  await workerInput.fill("3.2");
  await page.getByRole("button", { name: "저장", exact: true }).click();

  await expect(workerInput).toHaveValue("3.2");
  await expect(
    page.getByText("근무인원은 0 이상의 정수여야 합니다."),
  ).toBeVisible();
});

test("비용 단계 검증 실패 시 첫 오류 필드로 포커스가 이동한다", async ({
  page,
}) => {
  await login(page);
  await seedExpenseCode(`스토리2-8 검증 ${randomUUID().slice(0, 6)}`, 50);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await costSaveButton(page).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(page.getByText("비용 항목을 선택해 주세요.")).toBeVisible();
  const expenseCodeInput = page.getByLabel("비용 항목", { exact: true });
  await expect(expenseCodeInput).toBeFocused();
  await expect(expenseCodeInput).toHaveAttribute("aria-invalid", "true");
  const describedBy = await expenseCodeInput.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText(
    "비용 항목을 선택해 주세요.",
  );
});

test("390px에서 비용/근무 단계는 숫자 키패드 및 터치 타깃이 충족된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const code = await seedExpenseCode(
    `스토리2-8 휴대 390 ${randomUUID().slice(0, 6)}`,
    40,
  );

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=cost`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("비용 항목", { exact: true }).selectOption(code.id);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page
    .getByLabel("비용 항목", { exact: true })
    .nth(1)
    .selectOption(code.id);

  const amountInput = page.getByRole("textbox", { name: "금액" }).first();
  const addLineButton = page.getByRole("button", { name: "항목 추가" });
  const deleteButton = page.getByRole("button", { name: "삭제" }).first();
  const saveButton = costSaveButton(page).first();

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
