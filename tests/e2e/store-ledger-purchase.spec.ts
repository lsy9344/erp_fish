import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const UNAUTHORIZED_STORE_ID = "store-hongdae";

// WO-A(2026-06-22): 지점장 저장/제출 서버 액션이 KST 오늘 날짜만 허용하므로,
// 하드코딩 과거 날짜 대신 동적 KST 오늘 날짜를 사용한다.
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

const SELECTED_LEDGER_DATE = getTodayKstDateParam();

test.afterAll(async () => {
  await cleanupStoryTwoFourData();
  await prisma.$disconnect();
});

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

async function seedPurchaseOption(name: string, unitPrice: number) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${name} ${suffix}`,
      category: "생물",
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });
  const standard = await prisma.purchaseStandard.create({
    data: {
      productId: product.id,
      standardUnitPrice: unitPrice,
      referenceInfo: "위판장 기준",
      updatedById: actorId,
    },
  });

  return { product, standard };
}

async function seedPurchaseLedger(
  status: DailyLedgerStatus = "IN_PROGRESS",
  storeId = STORY_STORE_ID,
) {
  const actorId = await getManagerUserId();

  return prisma.dailyLedger.create({
    data: {
      storeId,
      closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
      status,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryTwoFourData() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "스토리2-4" } },
        { name: { startsWith: "변경된 스토리2-4" } },
      ],
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);

  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      OR: [
        { storeId: STORY_STORE_ID },
        {
          storeId: UNAUTHORIZED_STORE_ID,
          closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
        },
      ],
    },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (productIds.length > 0) {
    await prisma.storeSalesPricePlan.deleteMany({
      where: { productId: { in: productIds } },
    });
  }

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

  if (productIds.length > 0) {
    await prisma.purchaseStandard.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test.beforeEach(async () => {
  await cleanupStoryTwoFourData();
});

test("지점장은 매입 항목을 여러 건 저장하고 재방문 시 목록과 합계를 본다", async ({
  page,
}) => {
  await login(page);
  const first = await seedPurchaseOption("스토리2-4 광어", 12000);
  const second = await seedPurchaseOption("스토리2-4 우럭", 8000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  // 매입 기준 select는 UI에서 제거됐다. 품목 선택만으로 단가가 채워진다.
  await expect(page.getByLabel("매입 기준")).toHaveCount(0);
  await page
    .getByLabel("품목", { exact: true })
    .nth(0)
    .selectOption(first.product.id);
  await page.getByLabel("수량").nth(0).fill("3");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page
    .getByLabel("품목", { exact: true })
    .nth(1)
    .selectOption(second.product.id);
  await page.getByLabel("단가").nth(1).fill("9000");
  await page.getByLabel("수량").nth(1).fill("2");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByLabel("품목", { exact: true })).toHaveCount(2);
  await expect(
    page.locator("section").filter({ hasText: "매입 합계" }),
  ).toContainText("54,000원");
});

test("지점장은 3단계 매입에서 오늘 팔 가격(예상)을 입력해 판매가 계획으로 저장하고 다시 불러온다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 판매예정가", 12000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목", { exact: true }).selectOption(product.id);
  await page.getByLabel("매입 단가").fill("12000");
  await page.getByLabel("수량").fill("3");
  await page.getByLabel("오늘 팔 가격(예상)").fill("15000");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  // 매입 저장 한 번으로 StoreSalesPricePlan에 판매 예정가가 하루 1개 값으로 저장된다.
  await expect
    .poll(async () => {
      const plan = await prisma.storeSalesPricePlan.findFirst({
        where: {
          storeId: STORY_STORE_ID,
          businessDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
          productId: product.id,
        },
        select: { plannedUnitPrice: true },
      });

      return plan?.plannedUnitPrice ?? null;
    })
    .toBe(15000);

  await page.reload();

  // 재방문 시 같은 품목 행에 저장된 판매 예정가가 채워져 있다.
  await expect(page.getByLabel("오늘 팔 가격(예상)")).toHaveValue("15000");

  // 값을 비우고 다시 저장하면 해당 품목의 판매가 계획이 삭제된다.
  await page.getByLabel("오늘 팔 가격(예상)").fill("");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await expect
    .poll(() =>
      prisma.storeSalesPricePlan.count({
        where: {
          storeId: STORY_STORE_ID,
          businessDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
          productId: product.id,
        },
      }),
    )
    .toBe(0);
});

test("오늘 팔 가격을 저장한 뒤 단계 이동 시 미저장 변경 경고가 뜨지 않는다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 미저장경고", 12000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목", { exact: true }).selectOption(product.id);
  await page.getByLabel("매입 단가").fill("12000");
  await page.getByLabel("수량").fill("2");
  await page.getByLabel("오늘 팔 가격(예상)").fill("15000");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  // 저장 직후 상단 단계 네비게이션으로 이동해도 미저장 경고가 뜨지 않고 바로 넘어간다.
  // (저장 응답이 plannedUnitPrice를 채워 dirty 상태가 남지 않아야 한다.)
  await page.getByRole("link", { name: "7단계: 검토/제출" }).click();
  await expect(page.getByText("저장하지 않은 변경이 있습니다")).toHaveCount(0);
  await expect(page).toHaveURL(/step=review/);
});

test("같은 품목의 오늘 팔 가격이 행마다 다르면 매입 저장이 막힌다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 가격충돌", 10000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page
    .getByLabel("품목", { exact: true })
    .nth(0)
    .selectOption(product.id);
  await page.getByLabel("수량").nth(0).fill("1");
  await page.getByLabel("오늘 팔 가격(예상)").nth(0).fill("15000");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page
    .getByLabel("품목", { exact: true })
    .nth(1)
    .selectOption(product.id);
  await page.getByLabel("수량").nth(1).fill("2");
  await page.getByLabel("오늘 팔 가격(예상)").nth(1).fill("16000");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("같은 품목의 오늘 팔 가격은 하루에 하나만 입력해 주세요."),
  ).toBeVisible();

  // 충돌이 막혀 판매가 계획도 저장되지 않는다.
  await expect
    .poll(() =>
      prisma.storeSalesPricePlan.count({
        where: {
          storeId: STORY_STORE_ID,
          businessDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
          productId: product.id,
        },
      }),
    )
    .toBe(0);
});

test("품목 마스터가 바뀌어도 저장된 매입 항목의 원본 품목명과 규격을 유지한다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 스냅샷", 15000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목", { exact: true }).selectOption(product.id);
  await page.getByLabel("수량").fill("1");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: "변경된 스토리2-4 스냅샷",
      spec: "2kg",
    },
  });

  await page.reload();

  // 간소화(2026-07-02): 원본 스냅샷 품목명/규격은 접이식 상세의 summary에 함께 표시된다.
  // 마스터가 바뀌어도 저장된 장부 행은 원본 이름(스토리2-4 스냅샷)과 규격(1kg)을 유지한다.
  await expect(page.getByText(/상세: 스토리2-4 스냅샷/)).toBeVisible();
  await expect(page.getByText(/상세: 스토리2-4 스냅샷.*1kg/)).toBeVisible();
});

test("기준 정보 선택 없이 원문 매입 항목을 수동 저장하고 삭제할 수 있다", async ({
  page,
}) => {
  await login(page);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("원문명").fill("스토리2-4 수기 고등어");
  await page.getByLabel("구분").fill("생물");
  await page.getByLabel("규격").fill("박스");
  await page.getByLabel("단가").fill("11000");
  await page.getByLabel("수량").fill("4");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await page.reload();

  // 간소화(2026-07-02): 자유 입력 행은 원문명 입력칸에 저장값이 그대로 남는다.
  await expect(page.getByLabel("원문명")).toHaveValue("스토리2-4 수기 고등어");
  await expect(
    page.locator("section").filter({ hasText: "매입 합계" }),
  ).toContainText("44,000원");

  await page.getByRole("button", { name: "삭제" }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText("항목이 없습니다. 새 항목을 추가해 주세요."),
  ).toBeVisible();
});

test("매입 단계는 검증 오류 포커스와 390px 모바일 입력 상태를 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 모바일", 7000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(page.getByText("품목명을 입력해 주세요.")).toBeVisible();
  await expect(page.getByLabel("원문명")).toBeFocused();

  await page.getByLabel("품목", { exact: true }).selectOption(product.id);
  const unitPriceInput = page.getByLabel("단가");
  const quantityInput = page.getByLabel("수량");
  const addLineButton = page.getByRole("button", { name: "항목 추가" });
  const saveButton = page.getByRole("button", { name: "저장" }).first();

  await expect(unitPriceInput).toHaveAttribute("inputmode", "numeric");
  await expect(quantityInput).toHaveAttribute("inputmode", "decimal");

  const unitPriceBox = await unitPriceInput.boundingBox();
  const quantityBox = await quantityInput.boundingBox();
  const addLineBox = await addLineButton.boundingBox();
  const saveBox = await saveButton.boundingBox();

  expect(unitPriceBox?.height).toBeGreaterThanOrEqual(44);
  expect(quantityBox?.height).toBeGreaterThanOrEqual(44);
  expect(addLineBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);

  await quantityInput.fill("2");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();
});

test("매입 단계는 음수와 소수 셋째 자리 입력을 다른 값으로 바꾸지 않고 검증한다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-4 숫자검증", 7000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목", { exact: true }).selectOption(product.id);

  const unitPriceInput = page.getByLabel("단가");
  const quantityInput = page.getByLabel("수량");

  await unitPriceInput.fill("-1");
  await quantityInput.fill("1.555");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(unitPriceInput).toHaveValue("-1");
  await expect(quantityInput).toHaveValue("1.555");
  await expect(
    page.getByText("단가는 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "수량은 0 이상이고 소수점 둘째 자리까지 입력할 수 있습니다.",
    ),
  ).toBeVisible();
  await expect(unitPriceInput).toBeFocused();
  await expect(unitPriceInput).toHaveAttribute("aria-invalid", "true");
  const describedBy = await unitPriceInput.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText(
    "단가는 0원 이상의 정수여야 합니다.",
  );
});

test("stale version 매입 저장은 거부되고 기존 데이터가 바뀌지 않는다", async ({
  page,
}) => {
  const ledger = await seedPurchaseLedger();

  await login(page);
  await page.goto(
    `/app/store-entry?storeId=${STORY_STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=purchase`,
  );

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: { version: { increment: 1 } },
  });

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("원문명").fill("스토리2-4 stale 방어");
  await page.getByLabel("구분").fill("생물");
  await page.getByLabel("규격").fill("1kg");
  await page.getByLabel("단가").fill("12000");
  await page.getByLabel("수량").fill("1");
  await page.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("내 입력값").first()).toBeVisible();
  await expect(conflictDialog.getByText("서버 최신값").first()).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      return prisma.ledgerPurchaseItem.count({
        where: { dailyLedgerId: ledger.id },
      });
    })
    .toBe(0);
});

test("본사 마감과 휴무 장부에서는 매입 원본 저장 UI가 차단된다", async ({
  page,
}) => {
  await login(page);

  for (const status of ["HEADQUARTERS_CLOSED", "HOLIDAY"] as const) {
    await cleanupStoryTwoFourData();
    await seedPurchaseLedger(status);

    await page.goto(
      `/app/store-entry?storeId=${STORY_STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=purchase`,
    );

    await expect(
      page.getByRole("button", { name: "항목 추가" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
  }
});

test("권한 밖 지점 매입 라인은 화면에 노출되지 않는다", async ({ page }) => {
  const actorId = await getManagerUserId();
  const ledger = await seedPurchaseLedger("IN_PROGRESS", UNAUTHORIZED_STORE_ID);

  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      sourceType: "MANUAL",
      productName: "스토리2-4 권한밖 매입",
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 10000,
      quantity: 1,
      amount: 10000,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(
    `/app/store-entry?storeId=${UNAUTHORIZED_STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=purchase`,
  );

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("스토리2-4 권한밖 매입")).toHaveCount(0);
});
