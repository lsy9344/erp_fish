import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const EXPENSE_MARKER = "E2E본사지출";
const BATCH_MARKER = `${EXPENSE_MARKER}-batch`;
const CHOICES_MARKER = `${EXPENSE_MARKER}-choices`;
const INVALID_MARKER = `${EXPENSE_MARKER}-invalid`;
const PENDING_MARKER = `${EXPENSE_MARKER}-pending`;
const LEGACY_MARKER = `${EXPENSE_MARKER}-legacy`;
const STORE_ID = "store-gangnam";
const STORE_NAME = "강남점";
const EXPENSE_CATEGORIES = [
  "임차료",
  "전기세",
  "CCTV",
  "화재보험료",
  "교통비",
  "4대보험료",
  "수도세",
  "카드단말기사용료",
  "인터넷",
  "카드·세무수수료",
] as const;

function getCurrentDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function cleanupHeadquartersExpenses() {
  const expenses = await prisma.headquartersExpense.findMany({
    where: {
      OR: [
        { category: { startsWith: EXPENSE_MARKER } },
        { memo: { startsWith: EXPENSE_MARKER } },
      ],
    },
    select: { id: true },
  });
  const ids = expenses.map((expense) => expense.id);

  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetType: "HeadquartersExpense", targetId: { in: ids } },
    });
    await prisma.headquartersExpense.deleteMany({
      where: { id: { in: ids } },
    });
  }
}

test.beforeAll(async () => {
  await cleanupHeadquartersExpenses();
});

test.afterAll(async () => {
  await cleanupHeadquartersExpenses();
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function openHeadquartersExpenses(page: Page) {
  await login(page, "hq@example.com");
  await page.goto("/app/headquarters-expenses");
  await expect(
    page.getByRole("heading", { name: "본사 지출", exact: true }),
  ).toBeVisible();
}

function draftRow(page: Page, index: number) {
  return page.getByTestId("hq-expense-draft-row").nth(index);
}

async function chooseSelect(
  page: Page,
  scope: Locator | Page,
  label: string,
  option: string,
) {
  await scope.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function fillDraftRow(
  page: Page,
  index: number,
  values: {
    category: string;
    amount: string;
    memo: string;
    otherCategory?: string;
  },
) {
  const row = draftRow(page, index);
  await chooseSelect(page, row, "지출 분류", values.category);
  if (values.category === "기타 입력") {
    await row.getByLabel("기타 지출 내용").fill(values.otherCategory ?? "");
  }
  await row.getByLabel("지출 금액(원)").fill(values.amount);
  await row.getByLabel("메모(선택)").fill(values.memo);
  return row;
}

async function getHqUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });
  if (!user) throw new Error("Missing hq@example.com e2e fixture.");
  return user.id;
}

test("본사 지출은 같은 날짜와 지점의 3건을 검토 후 한 번에 저장한다", async ({
  page,
}) => {
  await openHeadquartersExpenses(page);

  const today = getCurrentDateInput();
  const expenseDate = `${today.slice(0, 8)}${today.endsWith("01") ? "02" : "01"}`;
  await page.getByLabel("지출 일자").fill(expenseDate);
  await chooseSelect(page, page, "귀속 지점(선택)", STORE_NAME);

  await fillDraftRow(page, 0, {
    category: "임차료",
    amount: "1234500",
    memo: `${BATCH_MARKER}-1`,
  });
  await expect(draftRow(page, 0).getByLabel("지출 금액(원)")).toHaveValue(
    "1,234,500",
  );
  await expect(draftRow(page, 0).getByLabel("기타 지출 내용")).toHaveCount(0);

  await page.getByRole("button", { name: "내역 추가" }).click();
  await fillDraftRow(page, 1, {
    category: "전기세",
    amount: "234,567",
    memo: `${BATCH_MARKER}-2`,
  });
  await expect(draftRow(page, 1).getByLabel("기타 지출 내용")).toHaveCount(0);

  await page.getByRole("button", { name: "내역 추가" }).click();
  await fillDraftRow(page, 2, {
    category: "기타 입력",
    otherCategory: `${BATCH_MARKER}-기타항목`,
    amount: "345678",
    memo: `${BATCH_MARKER}-3`,
  });
  await expect(draftRow(page, 2).getByLabel("기타 지출 내용")).toHaveValue(
    `${BATCH_MARKER}-기타항목`,
  );

  await expect(page.getByLabel("지출 일자")).toHaveValue(expenseDate);
  await expect(
    page.getByRole("combobox", { name: "귀속 지점(선택)" }),
  ).toHaveText(STORE_NAME);
  await expect(page.getByTestId("hq-expense-draft-row")).toHaveCount(3);

  await page.getByRole("button", { name: "입력 내역 확인" }).click();
  const reviewDialog = page.getByRole("dialog");
  await expect(
    reviewDialog.getByRole("heading", { name: "본사 지출 저장 확인" }),
  ).toBeVisible();
  await expect(reviewDialog).toContainText(expenseDate);
  await expect(reviewDialog).toContainText(STORE_NAME);
  await expect(reviewDialog).toContainText("임차료");
  await expect(reviewDialog).toContainText("전기세");
  await expect(reviewDialog).toContainText(`${BATCH_MARKER}-기타항목`);
  await expect(reviewDialog).toContainText("1,234,500");
  await expect(reviewDialog).toContainText("234,567");
  await expect(reviewDialog).toContainText("345,678");
  await expect(reviewDialog).toContainText("1,814,745");

  await reviewDialog.getByRole("button", { name: "돌아가서 수정" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("hq-expense-draft-row")).toHaveCount(3);
  await expect(draftRow(page, 0).getByLabel("메모(선택)")).toHaveValue(
    `${BATCH_MARKER}-1`,
  );
  await expect(draftRow(page, 1).getByLabel("지출 금액(원)")).toHaveValue(
    "234,567",
  );

  await page.getByRole("button", { name: "입력 내역 확인" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "3건 전체 저장" })
    .click();

  await expect(page.getByTestId("hq-expense-draft-row")).toHaveCount(1);
  await expect(page.getByLabel("지출 일자")).toHaveValue(expenseDate);
  await expect(
    page.getByRole("combobox", { name: "귀속 지점(선택)" }),
  ).toHaveText(STORE_NAME);
  const created = await prisma.headquartersExpense.findMany({
    where: { memo: { startsWith: BATCH_MARKER } },
    orderBy: { amount: "asc" },
    select: {
      id: true,
      expenseDate: true,
      storeId: true,
      category: true,
      amount: true,
      memo: true,
    },
  });
  expect(created).toHaveLength(3);
  expect(created.map((expense) => expense.amount)).toEqual([
    234567, 345678, 1234500,
  ]);
  for (const expense of created) {
    expect(expense.expenseDate.toISOString().slice(0, 10)).toBe(expenseDate);
    expect(expense.storeId).toBe(STORE_ID);
    expect(expense.memo).toMatch(/^E2E본사지출-batch-/);
  }
  expect(
    await prisma.auditLog.count({
      where: {
        targetType: "HeadquartersExpense",
        action: "headquarters-expense.created",
        targetId: { in: created.map((expense) => expense.id) },
      },
    }),
  ).toBe(3);

  for (const expense of created) {
    const row = page.getByTestId(`hq-expense-row-${expense.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(expense.amount.toLocaleString("ko-KR"));
  }
});

test("지출 분류 선택지는 고정되고 기타 입력에서만 추가 분류명을 받는다", async ({
  page,
}) => {
  await openHeadquartersExpenses(page);
  const row = draftRow(page, 0);
  const categorySelect = row.getByRole("combobox", { name: "지출 분류" });

  await categorySelect.click();
  for (const category of EXPENSE_CATEGORIES) {
    await expect(
      page.getByRole("option", { name: category, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("option", { name: "기타 입력", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "임차료", exact: true }).click();
  await expect(row.getByLabel("기타 지출 내용")).toHaveCount(0);

  await categorySelect.click();
  await page.getByRole("option", { name: "기타 입력", exact: true }).click();
  await expect(row.getByLabel("기타 지출 내용")).toBeVisible();
  await row.getByLabel("기타 지출 내용").fill(`${CHOICES_MARKER}-직접입력`);
  await expect(row.getByLabel("기타 지출 내용")).toHaveValue(
    `${CHOICES_MARKER}-직접입력`,
  );
});

test("내역 추가와 삭제는 행 번호와 삭제 라벨을 다시 매긴다", async ({
  page,
}) => {
  await openHeadquartersExpenses(page);

  await page.getByRole("button", { name: "내역 추가" }).click();
  await page.getByRole("button", { name: "내역 추가" }).click();
  await expect(page.getByTestId("hq-expense-draft-row")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "지출 내역 1 삭제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "지출 내역 2 삭제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "지출 내역 3 삭제" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "지출 내역 2 삭제" }).click();
  await expect(page.getByTestId("hq-expense-draft-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "지출 내역 1 삭제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "지출 내역 2 삭제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "지출 내역 3 삭제" }),
  ).toHaveCount(0);
});

test("잘못된 배치 행은 검토와 저장을 막고 해당 금액만 aria-invalid 처리한다", async ({
  page,
}) => {
  await openHeadquartersExpenses(page);
  await fillDraftRow(page, 0, {
    category: "임차료",
    amount: "1000",
    memo: `${INVALID_MARKER}-valid`,
  });
  await page.getByRole("button", { name: "내역 추가" }).click();
  await chooseSelect(page, draftRow(page, 1), "지출 분류", "전기세");
  await draftRow(page, 1)
    .getByLabel("메모(선택)")
    .fill(`${INVALID_MARKER}-invalid`);

  await page.getByRole("button", { name: "입력 내역 확인" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(draftRow(page, 0).getByLabel("지출 금액(원)")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(draftRow(page, 1).getByLabel("지출 금액(원)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(draftRow(page, 1).getByLabel("지출 금액(원)")).toBeFocused();
  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  expect(
    await prisma.headquartersExpense.count({
      where: { memo: { startsWith: INVALID_MARKER } },
    }),
  ).toBe(0);
});

test("단건 수정은 레거시 분류를 기타 입력으로 열고 대기 중인 초안을 보존한다", async ({
  page,
}) => {
  const userId = await getHqUserId();
  const expenseDate = getCurrentDateInput();
  const legacyCategory = `${LEGACY_MARKER}-기존분류`;
  const legacy = await prisma.headquartersExpense.create({
    data: {
      expenseDate: new Date(`${expenseDate}T00:00:00.000Z`),
      storeId: STORE_ID,
      category: legacyCategory,
      amount: 7777,
      memo: `${LEGACY_MARKER}-before`,
      createdById: userId,
      updatedById: userId,
    },
    select: { id: true },
  });

  await openHeadquartersExpenses(page);
  await fillDraftRow(page, 0, {
    category: "임차료",
    amount: "8888",
    memo: `${PENDING_MARKER}-draft`,
  });

  const legacyRow = page.getByTestId(`hq-expense-row-${legacy.id}`);
  await legacyRow.getByRole("button", { name: "수정" }).click();
  await expect(page.getByText("본사 지출 수정", { exact: true })).toBeVisible();
  const editRow = draftRow(page, 0);
  await expect(editRow.getByRole("combobox", { name: "지출 분류" })).toHaveText(
    "기타 입력",
  );
  await expect(editRow.getByLabel("기타 지출 내용")).toHaveValue(
    legacyCategory,
  );
  await expect(editRow.getByLabel("지출 금액(원)")).toHaveValue("7,777");

  await page.getByRole("button", { name: "취소" }).click();
  await expect(page.getByText("본사 지출 등록", { exact: true })).toBeVisible();
  await expect(
    draftRow(page, 0).getByRole("combobox", { name: "지출 분류" }),
  ).toHaveText("임차료");
  await expect(draftRow(page, 0).getByLabel("지출 금액(원)")).toHaveValue(
    "8,888",
  );
  await expect(draftRow(page, 0).getByLabel("메모(선택)")).toHaveValue(
    `${PENDING_MARKER}-draft`,
  );

  await legacyRow.getByRole("button", { name: "수정" }).click();
  const editAgain = draftRow(page, 0);
  await editAgain
    .getByLabel("기타 지출 내용")
    .fill(`${LEGACY_MARKER}-수정분류`);
  await editAgain.getByLabel("지출 금액(원)").fill("9090");
  await editAgain.getByLabel("메모(선택)").fill(`${LEGACY_MARKER}-after`);
  await page.getByRole("button", { name: "수정 저장" }).click();

  await expect(page.getByText("본사 지출 등록", { exact: true })).toBeVisible();
  await expect(
    draftRow(page, 0).getByRole("combobox", { name: "지출 분류" }),
  ).toHaveText("임차료");
  await expect(draftRow(page, 0).getByLabel("지출 금액(원)")).toHaveValue(
    "8,888",
  );
  await expect(draftRow(page, 0).getByLabel("메모(선택)")).toHaveValue(
    `${PENDING_MARKER}-draft`,
  );

  const updated = await prisma.headquartersExpense.findUnique({
    where: { id: legacy.id },
    select: { category: true, amount: true, memo: true, storeId: true },
  });
  expect(updated).toEqual({
    category: `${LEGACY_MARKER}-수정분류`,
    amount: 9090,
    memo: `${LEGACY_MARKER}-after`,
    storeId: STORE_ID,
  });
  await expect(
    prisma.auditLog.count({
      where: {
        targetType: "HeadquartersExpense",
        action: "headquarters-expense.updated",
        targetId: legacy.id,
      },
    }),
  ).resolves.toBe(1);
});

test("지점장은 본사 지출 화면과 사이드바 메뉴에 접근할 수 없다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await expect(page.getByRole("link", { name: "본사 지출" })).toHaveCount(0);

  await page.goto("/app/headquarters-expenses");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("지출 등록")).toHaveCount(0);
});

test("설정 권한 없는 본사 사용자는 본사 지출 화면에서 차단된다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");

  await expect(page.getByRole("link", { name: "본사 지출" })).toHaveCount(0);

  await page.goto("/app/headquarters-expenses");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("월간 리포트는 본사 설정 권한 사용자에게 순이익 계산의 본사지출을 보여준다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.goto("/app/reports/monthly?storeId=store-gangnam");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  // 본사지출은 별도 섹션이 아니라 월간 핵심 성과의 순이익 계산 칸으로 들어간다.
  await expect(
    page.getByTestId("hq-report-monthly-headquarters-expense"),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "본사지출 이 지점 귀속분" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: "순이익 영업이익 − 인건비 − 본사지출",
    }),
  ).toBeVisible();
});
