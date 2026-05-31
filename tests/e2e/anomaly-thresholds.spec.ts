import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.beforeEach(async () => {
  await cleanupAnomalyThresholdData();
});

test.afterAll(async () => {
  await cleanupAnomalyThresholdData();
  await prisma.$disconnect();
});

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    tableName,
  );

  return rows.length > 0;
}

async function cleanupAnomalyThresholdData() {
  const hasThresholds = await tableExists("AnomalyThresholdSetting");

  await prisma.auditLog.deleteMany({
    where: { targetType: "AnomalyThresholdSetting" },
  });

  if (!hasThresholds) {
    return;
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "AnomalyThresholdSetting"`);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 이상 신호 기준값을 저장하고 감사 이력을 남긴다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page
    .getByRole("list")
    .getByRole("link", { name: "이상 신호 기준값", exact: true })
    .click();

  await expect(page).toHaveURL(/\/app\/master-data\/anomaly-thresholds/);
  await expect(
    page.getByRole("heading", { name: "이상 신호 기준값" }),
  ).toBeVisible();
  await expect(
    page.getByText("아직 기준값이 저장되지 않았습니다."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "기준일 정책 확인 필요. 입력한 값은 전체 지점 관제판에 공통 적용됩니다.",
    ),
  ).toBeVisible();

  await page.getByLabel("매출 하락률").fill("12.5");
  await page.getByLabel("이익률 하락폭").fill("3.75");
  await page.getByLabel("매출차액 금액").fill("1,000");
  await page.getByLabel("손실액").fill("50,000");
  await page.getByLabel("재고 차이 기준").fill("7");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("기준값을 저장했습니다.")).toBeVisible();
  await expect(page.getByText("마지막 저장")).toBeVisible();

  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          salesDropRateBps: number;
          grossMarginDropBps: number;
          salesDifferenceAmount: number;
          lossAmount: number;
          inventoryDifferenceQuantity: number;
        }>
      >(
        `SELECT "salesDropRateBps", "grossMarginDropBps", "salesDifferenceAmount", "lossAmount", "inventoryDifferenceQuantity"
         FROM "AnomalyThresholdSetting" WHERE "scope" = 'GLOBAL'`,
      );

      return rows[0] ?? null;
    })
    .toEqual({
      salesDropRateBps: 1250,
      grossMarginDropBps: 375,
      salesDifferenceAmount: 1000,
      lossAmount: 50000,
      inventoryDifferenceQuantity: 7,
    });

  const auditLogs = await prisma.auditLog.findMany({
    where: { targetType: "AnomalyThresholdSetting" },
    orderBy: { createdAt: "asc" },
  });

  expect(auditLogs).toHaveLength(1);
  expect(auditLogs[0]?.action).toBe("threshold.updated");
  expect(auditLogs[0]?.actorId).toBeTruthy();
  expect(auditLogs[0]?.before).toBeNull();
  expect(auditLogs[0]?.after).toMatchObject({
    salesDropRateBps: 1250,
    grossMarginDropBps: 375,
    salesDifferenceAmount: 1000,
    lossAmount: 50000,
    inventoryDifferenceQuantity: 7,
  });

  await page.reload();
  await expect(page.getByLabel("매출 하락률")).toHaveValue("12.5");
  await expect(page.getByLabel("이익률 하락폭")).toHaveValue("3.75");
  await expect(page.getByLabel("매출차액 금액")).toHaveValue("1,000");
  await expect(page.getByLabel("손실액")).toHaveValue("50,000");
  await expect(page.getByLabel("재고 차이 기준")).toHaveValue("7");
});

test("기준값 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/anomaly-thresholds");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("매출 하락률은 0.0% 이상 100.0% 이하로 입력해 주세요."),
  ).toBeVisible();
  await expect(
    page.getByText("이익률 하락폭은 0.0% 이상 100.0% 이하로 입력해 주세요."),
  ).toBeVisible();
  await expect(
    page.getByText("매출차액 금액은 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("매출 하락률")).toBeFocused();
  await expect(page.getByLabel("매출 하락률")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("지점장은 이상 신호 기준값 URL에서 데이터를 볼 수 없다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await page.goto("/app/master-data/anomaly-thresholds");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "이상 신호 기준값" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("매출 하락률")).toHaveCount(0);
});
