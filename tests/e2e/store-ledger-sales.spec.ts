import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "store-gangnam";
const SELECTED_LEDGER_DATE = "2026-06-02";

test.beforeEach(async () => {
  await cleanupSelectedLedger();
});

test.afterAll(async () => {
  await cleanupSelectedLedger();
  await prisma.$disconnect();
});

async function cleanupSelectedLedger() {
  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID, closingDate },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      targetType: "DailyLedger",
      targetId: { in: ledgerIds },
    },
  });
  await prisma.dailyLedger.deleteMany({
    where: { id: { in: ledgerIds } },
  });
}

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
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

async function seedSelectedLedger(status: DailyLedgerStatus = "IN_PROGRESS") {
  const actorId = await getManagerUserId();
  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);

  return prisma.dailyLedger.create({
    data: {
      storeId: STORE_ID,
      closingDate,
      status,
      totalSalesAmount: 41000,
      cashAmount: 12000,
      cardAmount: 28000,
      otherPaymentAmount: 1000,
      workerCount: 2,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

test("지점장은 오늘 장부에서 매출/결제 단계를 본다", async ({ page }) => {
  await loginAsStoreManager(page);

  await expect(page.getByText("오늘 장부", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "강남점" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "1단계: 매출/결제" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("상태 입력중")).toBeVisible();
  await expect(page.getByLabel("영업일")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "현금", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "카드", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ).toBeVisible();
});

test("지점장은 선택 날짜 장부를 열고 재방문 시 같은 장부를 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await expect(page.getByText("2026년 6월 2일 화요일")).toBeVisible();
  await expect(page.getByText("상태 입력중")).toBeVisible();

  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("22222");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("12000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("10000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("222");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);
  const ledgerCount = await prisma.dailyLedger.count({
    where: { storeId: STORE_ID, closingDate },
  });
  expect(ledgerCount).toBe(1);

  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toHaveValue("22,222");

  await page.goto(
    `/app/store-entry/inventory?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toHaveAttribute("href", new RegExp(`date=${SELECTED_LEDGER_DATE}`));
});

test("지점장은 stale version 저장 충돌 시 새로고침 안내를 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await prisma.dailyLedger.updateMany({
    where: {
      storeId: STORE_ID,
      closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
    },
    data: { version: { increment: 1 } },
  });

  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("33333");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("13000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("20000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("333");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("main")
      .getByText(
        "장부가 다른 곳에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
      ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

test("지점장은 매출/결제 금액을 저장하고 재방문 시 유지된다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });
  const cash = page.getByRole("textbox", { name: "현금", exact: true });
  const card = page.getByRole("textbox", { name: "카드", exact: true });
  const other = page.getByRole("textbox", {
    name: "기타 결제수단",
    exact: true,
  });
  const save = page.getByRole("button", { name: "저장" });

  await total.fill("10000");
  await cash.fill("3000");
  await card.fill("2000");
  await other.fill("1000");

  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();
  await save.click();

  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  await page.reload();
  await expect(total).toHaveValue("10,000");
  await expect(cash).toHaveValue("3,000");
  await expect(card).toHaveValue("2,000");
  await expect(other).toHaveValue("1,000");
  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();
  await expect(save).toBeVisible();

  await page.goto("/app/store-entry/inventory?storeId=store-gangnam");
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toBeVisible();

  await page.goto("/app/store-entry/losses?storeId=store-gangnam");
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toBeVisible();
});

test("지점장은 0 뒤에 금액을 입력해도 원 단위 천 단위 형식으로 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });

  await total.fill("05000");

  await expect(total).toHaveValue("5,000");
  await expect(page.getByText("표시: 5,000원")).toBeVisible();
});

test("지점장은 본사마감 장부에서 원본 매출/결제 입력을 수정할 수 없다", async ({
  page,
}) => {
  await seedSelectedLedger("HEADQUARTERS_CLOSED");
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByText("상태 본사마감")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "현금", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "카드", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("지점장은 권한 없는 지점 URL로 이동하면 권한 없음 화면만 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  await page.goto("/app/store-entry?storeId=store-hongdae");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  await expect(page.getByText("홍대점")).toHaveCount(0);
});

test("390px에서 매출/결제 키패드 입력성과 터치 타깃이 충족된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsStoreManager(page);

  const numericInputs = [
    page.getByRole("textbox", { name: "총매출", exact: true }),
    page.getByRole("textbox", { name: "현금", exact: true }),
    page.getByRole("textbox", { name: "카드", exact: true }),
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ];

  for (const input of numericInputs) {
    await expect(input).toHaveAttribute("inputmode", "numeric");
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  const submit = page.getByRole("button", { name: "저장" });
  const submitBox = await submit.boundingBox();
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);
  expect(submitBox?.width).toBeGreaterThanOrEqual(44);

  const dateInput = page.getByLabel("영업일");
  const dateInputBox = await dateInput.boundingBox();
  expect(dateInputBox?.height).toBeGreaterThanOrEqual(36);
  expect(dateInputBox?.width).toBeGreaterThanOrEqual(120);
  await expect(page.getByText("상태 입력중")).toBeVisible();

  for (const href of [
    "/app/store-entry?storeId=store-gangnam",
    "/app/store-entry/inventory?storeId=store-gangnam",
    "/app/store-entry/losses?storeId=store-gangnam",
  ]) {
    const link = page.locator(`a[href="${href}"]:visible`).first();
    await expect(link).toBeVisible();
    const linkBox = await link.boundingBox();
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
  }
});

test("저장 실패 시 한국어 오류와 재시도 동작이 표시된다", async ({ page }) => {
  await loginAsStoreManager(page);

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

  await page.getByRole("textbox", { name: "총매출", exact: true }).fill("3000");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("1000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("500");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("main")
      .getByText("저장에 실패했습니다. 다시 시도해 주세요."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();

  await page.unroute("**/*");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();
});
