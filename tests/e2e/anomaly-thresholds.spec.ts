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
  await prisma.auditLog.deleteMany({
    where: { targetType: "LongStockThresholdSetting" },
  });

  if (await tableExists("LongStockThresholdSetting")) {
    await prisma.$executeRawUnsafe(`DELETE FROM "LongStockThresholdSetting"`);
  }

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

function historyRow(page: Page, text: string) {
  return page.locator("tbody tr").filter({ hasText: text });
}

test("본사는 이상 신호 기준값을 저장하고 감사 이력을 남긴다", async ({
  page,
}) => {
  test.setTimeout(60_000);

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

  // WO-01(2026-06-22): 재고 오차 허용 범위 제로화. 재고 차이 기준 입력 필드는 더 이상 없다.
  await expect(page.getByLabel("재고 차이 기준")).toHaveCount(0);
  await expect(page.getByText(/재고 오차 허용 범위는 제로화/)).toBeVisible();

  await page.getByLabel("마진률").fill("12.5");
  await page.getByLabel("변경 사유").fill("Story 5.5 기준값 최초 저장");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("기준값을 저장했습니다.")).toBeVisible();
  await expect(
    page
      .getByText(/마지막 변경:/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByLabel("활성 상태")).toHaveValue("active");
  await expect(page.getByText("전체 지점").first()).toBeVisible();

  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          marginRateBps: number;
          inventoryDifferenceQuantity: number;
          isActive: boolean;
        }>
      >(
        `SELECT "marginRateBps", "inventoryDifferenceQuantity", "isActive"
         FROM "AnomalyThresholdSetting" WHERE "scope" = 'GLOBAL'`,
      );

      return rows[0] ?? null;
    })
    .toEqual({
      marginRateBps: 1250,
      // WO-01(2026-06-22): DB 호환을 위해 컬럼은 유지하되 항상 0으로 고정한다.
      inventoryDifferenceQuantity: 0,
      isActive: true,
    });

  const auditLogs = await prisma.auditLog.findMany({
    where: { targetType: "AnomalyThresholdSetting" },
    orderBy: { createdAt: "asc" },
  });

  expect(auditLogs).toHaveLength(1);
  expect(auditLogs[0]?.action).toBe("threshold.updated");
  expect(auditLogs[0]?.reason).toBe("Story 5.5 기준값 최초 저장");
  expect(auditLogs[0]?.actorId).toBeTruthy();
  expect(auditLogs[0]?.before).toBeNull();
  expect(auditLogs[0]?.after).toMatchObject({
    targetName: "이상 신호 기준값",
    scope: "GLOBAL",
    marginRateBps: 1250,
    isActive: true,
  });
  expect(auditLogs[0]?.after).not.toHaveProperty("inventoryDifferenceQuantity");

  await page.reload();
  await expect(page.getByLabel("마진률")).toHaveValue("12.5");
  await expect(page.getByLabel("재고 차이 기준")).toHaveCount(0);

  await page.getByLabel("변경 사유").fill("값 변경 없는 재저장");
  await page.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: { targetType: "AnomalyThresholdSetting" },
      }),
    )
    .toBe(1);

  await page.getByLabel("활성 상태").selectOption("inactive");
  await page.getByLabel("변경 사유").fill("정책 확인 전 임시 비활성화");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("기준값을 저장했습니다.")).toBeVisible();
  await expect(page.getByLabel("활성 상태")).toHaveValue("inactive");
  await expect
    .poll(async () => {
      const setting = await prisma.anomalyThresholdSetting.findUnique({
        where: { scope: "GLOBAL" },
        select: { isActive: true },
      });

      return setting?.isActive;
    })
    .toBe(false);

  const updatedAuditLogs = await prisma.auditLog.findMany({
    where: { targetType: "AnomalyThresholdSetting" },
    orderBy: { createdAt: "asc" },
  });

  expect(updatedAuditLogs).toHaveLength(2);
  expect(updatedAuditLogs[1]?.action).toBe("threshold.updated");
  expect(updatedAuditLogs[1]?.reason).toBe("정책 확인 전 임시 비활성화");
  expect(updatedAuditLogs[1]?.before).toMatchObject({ isActive: true });
  expect(updatedAuditLogs[1]?.after).toMatchObject({
    targetName: "이상 신호 기준값",
    scope: "GLOBAL",
    isActive: false,
  });

  await page.goto(
    "/app/master-data/history?targetType=AnomalyThresholdSetting",
  );
  const thresholdHistoryRow = historyRow(page, "이상 신호 기준값").filter({
    hasText: "기준값 변경",
  });
  await expect(thresholdHistoryRow.first()).toBeVisible();
  await thresholdHistoryRow
    .first()
    .getByRole("button", { name: "상세 보기" })
    .click();
  await expect(page.getByRole("dialog", { name: "변경 상세" })).toBeVisible();
  // WO-05(2026-06-28): 사유는 기본 노출, 원문 JSON은 접힘 영역을 펼쳐야 보인다.
  await expect(page.getByText("정책 확인 전 임시 비활성화")).toBeVisible();
  await page.getByText("원문 변경 전/후 (JSON)").click();
  await expect(page.getByText('"isActive": false')).toBeVisible();
});

test("기준값 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/anomaly-thresholds");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("마진률은 0.0% 이상 100.0% 이하로 입력해 주세요."),
  ).toBeVisible();
  await expect(page.getByText("변경 사유를 입력해 주세요.")).toBeVisible();
  await expect(page.getByLabel("마진률")).toBeFocused();
  await expect(page.getByLabel("마진률")).toHaveAttribute(
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
  await expect(page.getByLabel("마진률")).toHaveCount(0);
});

// WO-13(2026-06-28): 본사 좌측 네비에 "장기재고 기준일" 메뉴가 있고, 품목군 기준일을
// 저장하면 목록에 보이고 감사 로그가 남는다.
test("본사는 장기재고 기준일을 품목군별로 저장하고 감사 이력을 남긴다", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await login(page, "hq@example.com");
  await page
    .getByRole("list")
    .getByRole("link", { name: "장기재고 기준일", exact: true })
    .click();

  await expect(page).toHaveURL(/\/app\/master-data\/long-stock-thresholds/);
  await expect(
    page.getByRole("heading", { name: "장기재고 기준일" }),
  ).toBeVisible();

  await page.getByLabel("품목군").fill("냉동");
  await page.getByLabel("기준일 (일 이상)").fill("30");
  await page.getByLabel("변경 사유").fill("냉동 기준 최초 등록");
  await page.getByRole("button", { name: "기준일 저장" }).click();

  await expect(page.getByText("장기재고 기준일을 저장했습니다.")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "냉동" });
  await expect(row).toContainText("30일");
  await expect(row).toContainText("활성");

  // 감사 로그가 남는다.
  const auditCount = await prisma.auditLog.count({
    where: { targetType: "LongStockThresholdSetting" },
  });
  expect(auditCount).toBeGreaterThan(0);
});

test("지점장은 장기재고 기준일 관리 URL에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");

  await page.goto("/app/master-data/long-stock-thresholds");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "장기재고 기준일" }),
  ).toHaveCount(0);
});
