import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "store-story-4-3-corrections";
const STORY_MARKER = "story-4-3-test";
const PRODUCT_NAME = "스토리4-3 정정 광어";

test.beforeEach(async () => {
  await cleanupStoryFourThreeData();
});

test.afterAll(async () => {
  await cleanupStoryFourThreeData();
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsHq(page: Page) {
  await login(page, "hq@example.com");
}

async function loginAsManager(page: Page) {
  await login(page, "manager@example.com");
}

async function replaceControlValue(
  control: ReturnType<Page["getByLabel"]>,
  value: string,
) {
  await control.click();
  await control.press("Control+A");
  await control.pressSequentially(value);
  await expect(control).toHaveValue(value);
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

async function seedClosedLedger() {
  const actorId = await getHeadquartersUserId();
  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "스토리4-3 정정점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: PRODUCT_NAME,
      category: "냉동",
      spec: "1kg",
      defaultUnitPrice: 100,
      updatedById: actorId,
    },
  });

  const ledger = await prisma.dailyLedger.create({
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
      closedAt: new Date(),
    },
  });

  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 100,
      previousQuantity: 10,
      purchasedQuantity: 0,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 800,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return { actorId, ledger, inventoryItem };
}

async function cleanupStoryFourThreeData() {
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    const correctionRecords = await prisma.correctionRecord.findMany({
      where: { dailyLedgerId: { in: ledgerIds } },
      select: { id: true },
    });
    const correctionRecordIds = correctionRecords.map((record) => record.id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetType: "DailyLedger", targetId: { in: ledgerIds } },
          {
            targetType: "CorrectionRecord",
            targetId: { in: correctionRecordIds },
          },
        ],
      },
    });
    await prisma.correctionRecord.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  await prisma.userStoreAssignment.deleteMany({
    where: { storeId: STORE_ID },
  });
  await prisma.store.deleteMany({
    where: { id: STORE_ID },
  });
  await prisma.product.deleteMany({
    where: { name: PRODUCT_NAME },
  });
}

test("본사는 본사 마감 장부에 정정 기록을 추가하고 원본 값은 보존한다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedClosedLedger();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const metricArea = page.locator('section[aria-label="장부 주요 숫자"]');
  const correctionPanel = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "정정 기록" }) });

  await expect(correctionPanel).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    correctionPanel.getByText("정정 기록이 없습니다."),
  ).toBeVisible();
  await expect(correctionPanel.getByLabel("정정 대상")).toBeEnabled();
  await expect(correctionPanel.getByLabel("정정값")).toBeEnabled();
  await expect(correctionPanel.getByLabel("정정 사유")).toBeEnabled();
  await expect(
    correctionPanel.getByRole("button", { name: "정정 기록 저장" }),
  ).toBeEnabled();
  await expect(correctionPanel.getByLabel("정정 대상")).toHaveValue("0");
  await expect(page.getByLabel("총매출", { exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("근무인원", { exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "매출/결제" }).click();

  await replaceControlValue(correctionPanel.getByLabel("정정값"), "45000");
  await replaceControlValue(
    correctionPanel.getByLabel("정정 사유"),
    "회의 전 매출 정정",
  );
  await correctionPanel.getByRole("button", { name: "정정 기록 저장" }).click();
  await expect(
    correctionPanel.getByText("정정 기록이 저장됐습니다."),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(metricArea).toContainText("원본");
  await expect(metricArea).toContainText("정정 반영");
  await expect(metricArea).toContainText("₩10,000");
  await expect(metricArea).toContainText("₩45,000");

  await expect
    .poll(async () => {
      const records = await prisma.correctionRecord.findMany({
        where: { dailyLedgerId: ledger.id },
        orderBy: { createdAt: "asc" },
        select: {
          targetType: true,
          targetId: true,
          fieldKey: true,
          originalValue: true,
          previousAppliedValue: true,
          correctedValue: true,
          reason: true,
          createdById: true,
        },
      });

      return records;
    })
    .toMatchObject([
      {
        targetType: "PAYMENT_FIELD",
        targetId: ledger.id,
        fieldKey: "totalSalesAmount",
        originalValue: { kind: "money", value: 10000 },
        previousAppliedValue: { kind: "money", value: 10000 },
        correctedValue: { kind: "money", value: 45000 },
        reason: "회의 전 매출 정정",
        createdById: actorId,
      },
    ]);

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { totalSalesAmount: true },
      });

      return current?.totalSalesAmount;
    })
    .toBe(10000);

  const firstCorrection = await prisma.correctionRecord.findFirstOrThrow({
    where: { dailyLedgerId: ledger.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const firstAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "CorrectionRecord",
      targetId: firstCorrection.id,
      action: "correction.created",
    },
    select: { actorId: true, reason: true },
  });

  expect(firstAudit).toMatchObject({
    actorId,
    reason: "회의 전 매출 정정",
  });

  await expect(correctionPanel.getByText("회의 전 매출 정정")).toBeVisible();
  await replaceControlValue(correctionPanel.getByLabel("정정값"), "47000");
  await replaceControlValue(
    correctionPanel.getByLabel("정정 사유"),
    "최종 집계 반영",
  );
  await correctionPanel.getByRole("button", { name: "정정 기록 저장" }).click();
  await expect(metricArea).toContainText("₩47,000");
  await expect(correctionPanel).toContainText("회의 전 매출 정정");
  await expect(correctionPanel).toContainText("최종 집계 반영");
  await expect(correctionPanel).toContainText("원본값");
  await expect(correctionPanel).toContainText("이전 반영값");
  await expect(correctionPanel).toContainText("정정값");
  await expect(correctionPanel).toContainText("10000");
  await expect(correctionPanel).toContainText("45000");
  await expect(correctionPanel).toContainText("47000");

  await expect
    .poll(async () => {
      const latest = await prisma.correctionRecord.findFirst({
        where: { dailyLedgerId: ledger.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          previousAppliedValue: true,
          correctedValue: true,
          reason: true,
        },
      });

      return latest;
    })
    .toMatchObject({
      previousAppliedValue: { kind: "money", value: 45000 },
      correctedValue: { kind: "money", value: 47000 },
      reason: "최종 집계 반영",
    });
});

test("정정 기록 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const { ledger } = await seedClosedLedger();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const correctionPanel = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "정정 기록" }) });
  const reasonInput = correctionPanel.getByLabel("정정 사유");

  await expect(correctionPanel).toBeVisible();
  await replaceControlValue(correctionPanel.getByLabel("정정값"), "45000");
  await correctionPanel.getByRole("button", { name: "정정 기록 저장" }).click();

  await expect(
    correctionPanel.getByText("정정 사유를 입력해 주세요."),
  ).toBeVisible();
  await expect(reasonInput).toBeFocused();
});

test("총매출과 이월 매출 동시 정정은 영업 매출 상한을 직렬화해 한 건만 저장한다", async ({
  page,
}) => {
  const { ledger } = await seedClosedLedger();

  await loginAsHq(page);
  const carryoverPage = await page.context().newPage();
  await Promise.all([
    page.goto(`/app/ledgers/${ledger.id}`),
    carryoverPage.goto(`/app/ledgers/${ledger.id}`),
  ]);

  const totalPanel = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "정정 기록" }) });
  const carryoverPanel = carryoverPage.getByRole("region").filter({
    has: carryoverPage.getByRole("heading", { name: "정정 기록" }),
  });

  await carryoverPanel
    .getByLabel("정정 대상")
    .selectOption({ label: "이월 매출" });
  await replaceControlValue(totalPanel.getByLabel("정정값"), "2147483647");
  await replaceControlValue(
    totalPanel.getByLabel("정정 사유"),
    "동시 총매출 상한 검증",
  );
  await replaceControlValue(carryoverPanel.getByLabel("정정값"), "1");
  await replaceControlValue(
    carryoverPanel.getByLabel("정정 사유"),
    "동시 이월 매출 상한 검증",
  );

  await Promise.all([
    totalPanel.getByRole("button", { name: "정정 기록 저장" }).click(),
    carryoverPanel.getByRole("button", { name: "정정 기록 저장" }).click(),
  ]);

  await expect
    .poll(() =>
      prisma.correctionRecord.count({ where: { dailyLedgerId: ledger.id } }),
    )
    .toBe(1);

  const records = await prisma.correctionRecord.findMany({
    where: { dailyLedgerId: ledger.id },
    select: { id: true, fieldKey: true, correctedValue: true },
  });
  const appliedTotal =
    records[0]?.fieldKey === "totalSalesAmount" ? 2_147_483_647 : 10_000;
  const appliedCarryover =
    records[0]?.fieldKey === "carryoverSalesAmount" ? 1 : 0;

  expect(appliedTotal + appliedCarryover).toBeLessThanOrEqual(2_147_483_647);
  await expect
    .poll(() =>
      prisma.auditLog.count({
        where: {
          targetType: "CorrectionRecord",
          targetId: { in: records.map((record) => record.id) },
          action: "correction.created",
        },
      }),
    )
    .toBe(1);

  await carryoverPage.close();
});

test("본사는 재고 수량을 소수점 첫째 자리로 정정하고 계산에 반영한다", async ({
  page,
}) => {
  const { ledger, inventoryItem } = await seedClosedLedger();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const metricArea = page.locator('section[aria-label="장부 주요 숫자"]');
  const correctionPanel = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "정정 기록" }) });
  const correctedValueInput = correctionPanel.getByLabel("정정값");

  await correctionPanel
    .getByLabel("정정 대상")
    .selectOption({ label: `재고 1 · ${PRODUCT_NAME} · 현재고` });
  await expect(correctedValueInput).toHaveAttribute("inputmode", "decimal");
  await replaceControlValue(correctedValueInput, "1.5");
  await replaceControlValue(
    correctionPanel.getByLabel("정정 사유"),
    "재고 소수 수량 반영",
  );
  await correctionPanel.getByRole("button", { name: "정정 기록 저장" }).click();

  await expect(
    correctionPanel.getByText("정정 기록이 저장됐습니다."),
  ).toBeVisible();
  await expect(correctionPanel).toContainText("1.5");
  await expect(metricArea).toContainText("91.5%");

  await expect
    .poll(async () => {
      const correction = await prisma.correctionRecord.findFirst({
        where: {
          dailyLedgerId: ledger.id,
          targetType: "INVENTORY_ROW",
          targetId: inventoryItem.id,
          fieldKey: "currentQuantity",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { correctedValue: true },
      });

      return correction?.correctedValue;
    })
    .toMatchObject({ kind: "quantity", value: 1.5 });
});

test("지점장은 마감 장부 정정 화면에 접근해도 정정 기록을 생성할 수 없다", async ({
  page,
}) => {
  const { ledger } = await seedClosedLedger();

  await loginAsManager(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "정정 기록" })).toHaveCount(0);
  await expect
    .poll(async () =>
      prisma.correctionRecord.count({
        where: { dailyLedgerId: ledger.id },
      }),
    )
    .toBe(0);
});
