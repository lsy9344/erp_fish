import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const EMPLOYEE_NAME = "WO05 순환 직원";

test.beforeEach(async () => {
  await cleanupEmployeeData();
});

test.afterAll(async () => {
  await cleanupEmployeeData();
  await prisma.$disconnect();
});

async function cleanupEmployeeData() {
  await prisma.ledgerLaborItem.updateMany({
    where: { employee: { name: EMPLOYEE_NAME } },
    data: { employeeId: null },
  });
  await prisma.employee.deleteMany({ where: { name: EMPLOYEE_NAME } });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 직원을 추가하고 월간 급여 롤업 영역을 본다", async ({ page }) => {
  test.setTimeout(60_000);

  await login(page, "hq@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByText("직원별 월간 급여 롤업")).toBeVisible();

  await page.getByLabel("이름").fill(EMPLOYEE_NAME);
  await page.getByLabel("입사일").fill("2026-01-02");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("직원을 추가했습니다.")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: EMPLOYEE_NAME }).first(),
  ).toBeVisible();

  await expect
    .poll(async () => prisma.employee.count({ where: { name: EMPLOYEE_NAME } }))
    .toBe(1);
});

test("지점장은 직원 관리 화면을 직접 열 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");

  await page.goto("/app/labor/employees");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

// WO-D(2026-06-22): REPORT_VIEW만 가진 본사 조회 전용 사용자는 직원을 볼 수는 있어도
// 추가/수정/비활성화 폼과 버튼은 노출되지 않는다.
test("조회 전용 본사 사용자는 직원을 보지만 수정 폼이 없다", async ({
  page,
}) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  // 조회 안내 문구가 보이고, 추가/수정 폼 입력은 없어야 한다.
  await expect(page.getByText("직원 정보는 조회만 가능합니다.")).toBeVisible();
  await expect(page.getByLabel("이름")).toHaveCount(0);
  await expect(page.getByLabel("입사일")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
});
