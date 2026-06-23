import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const EXPENSE_MARKER = "E2E본사지출";
const EXPENSE_CATEGORY = `${EXPENSE_MARKER}-임차료`;
const EXPENSE_AMOUNT = 1234500;

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
    where: { category: { startsWith: EXPENSE_MARKER } },
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
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사 설정 권한 사용자는 본사 지출을 등록하고 목록에서 확인한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.goto("/app/headquarters-expenses");
  await expect(
    page.getByRole("heading", { name: "본사 지출", exact: true }),
  ).toBeVisible();

  await page.getByLabel("지출 일자").fill(getCurrentDateInput());
  await page.getByLabel("지출 분류").fill(EXPENSE_CATEGORY);
  await page.getByLabel("지출 금액(원)").fill(String(EXPENSE_AMOUNT));
  await page
    .getByLabel("메모(선택)")
    .fill(`${EXPENSE_MARKER} 메모`);
  await page.getByRole("button", { name: "지출 등록" }).click();

  await expect(page.getByText(EXPENSE_CATEGORY)).toBeVisible();

  const created = await prisma.headquartersExpense.findFirst({
    where: { category: EXPENSE_CATEGORY },
    select: { id: true, amount: true, storeId: true },
  });
  expect(created?.amount).toBe(EXPENSE_AMOUNT);
  expect(created?.storeId).toBeNull();

  const createdRow = page.getByTestId(`hq-expense-row-${created?.id}`);
  await expect(createdRow).toBeVisible();
  await expect(
    createdRow.getByText(EXPENSE_AMOUNT.toLocaleString("ko-KR"), {
      exact: false,
    }),
  ).toBeVisible();

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      targetType: "HeadquartersExpense",
      action: "headquarters-expense.created",
      targetId: created?.id,
    },
    select: { id: true },
  });
  expect(auditLog?.id).toBeTruthy();
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

test("월간 리포트는 본사 설정 권한 사용자에게 본사 지출 라인을 보여준다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.goto("/app/reports/monthly?storeId=store-gangnam");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-monthly-headquarters-expense"),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("hq-report-monthly-headquarters-expense")
      .getByText("본사 지출 합계"),
  ).toBeVisible();
});
