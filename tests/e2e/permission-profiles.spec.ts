import { expect, test, type Page, type Request } from "@playwright/test";
import {
  PermissionAction,
  PrismaClient,
  StoreAccessMode,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  // 활성 세션이 있으면 /login이 리다이렉트되어 폼이 렌더링되지 않으므로
  // 사용자 전환마다 쿠키를 먼저 정리한다.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("지정 지점 본사 프로파일은 지점장 입력 화면을 직접 열 수 없다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();

  await page.goto("/app/store-entry?storeId=store-seocho");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("서초점")).toHaveCount(0);

  await page.goto("/app/store-entry?storeId=store-gangnam");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  await expect(page.getByText("장부 데이터")).toHaveCount(0);
});

test("지정 지점 본사 프로파일은 대시보드와 리포트에서 배정 지점 데이터만 받는다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");

  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();
  await expect(page.getByRole("link", { name: "홈" })).toBeVisible();
  await expect(page.getByRole("link", { name: "리포트" })).toBeVisible();
  for (const hiddenMenuItem of [
    "기준정보",
    "품목 마스터",
    "품목 참고 단가",
    "이상 신호",
    "코드 관리",
    "사용자/권한",
    "변경 이력",
  ]) {
    await expect(
      page.getByRole("link", { name: hiddenMenuItem, exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.getByTestId("hq-dashboard-row-store-seocho")).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const dashboardHtml = await page.content();
  expect(dashboardHtml).toContain("서초점");
  expect(dashboardHtml).not.toContain("강남점");
  expect(dashboardHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/daily");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  await expect(page.getByTestId("hq-report-row-store-seocho")).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const dailyReportHtml = await page.content();
  expect(dailyReportHtml).toContain("서초점");
  expect(dailyReportHtml).not.toContain("강남점");
  expect(dailyReportHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/comparison");

  await expect(
    page.getByRole("heading", { name: "기간 비교 리포트" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-comparison-row-store-seocho"),
  ).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const comparisonReportHtml = await page.content();
  expect(comparisonReportHtml).toContain("서초점");
  expect(comparisonReportHtml).not.toContain("강남점");
  expect(comparisonReportHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/monthly");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(page.getByText("서초점").first()).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const monthlyReportHtml = await page.content();
  expect(monthlyReportHtml).toContain("서초점");
  expect(monthlyReportHtml).not.toContain("강남점");
  expect(monthlyReportHtml).not.toContain("store-gangnam");
});

test("지정 지점 본사 프로파일은 권한 없는 기준정보 URL과 데이터를 받지 않는다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");

  for (const path of ["/app/master-data/stores", "/app/master-data/users"]) {
    await page.goto(path);

    await expect(page).toHaveURL(/\/app\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: "접근 권한이 없습니다." }),
    ).toBeVisible();
    await expect(page.getByText("사용자/권한")).toHaveCount(0);
    await expect(page.getByText("기준정보 데이터")).toHaveCount(0);
  }
});

test("DB에서 사용자가 비활성화되면 같은 세션 다음 요청에서 로그인으로 돌아간다", async ({
  page,
}) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });

  await login(page, "hq-assigned@example.com");
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();

  await prisma.user.update({
    where: { id: user.id },
    data: { isActive: false },
  });

  try {
    await page.goto("/app/dashboard").catch((error: unknown) => {
      if (!String(error).includes("ERR_ABORTED")) {
        throw error;
      }
    });

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp/);
    await expect(
      page.getByRole("heading", { name: "도원에스디 로그인" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "관제판" })).toHaveCount(0);
    await expect(page.getByText("서초점")).toHaveCount(0);
  } finally {
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
  }
});

test("DB에서 본사 프로파일 action이 제거되면 같은 세션 다음 요청에서 차단된다", async ({
  page,
}) => {
  const profile = await prisma.permissionProfile.findUniqueOrThrow({
    where: { code: "HQ_STAFF" },
    select: { id: true },
  });

  await login(page, "hq-assigned@example.com");
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();

  await prisma.permissionProfileAction.delete({
    where: {
      profileId_action: {
        profileId: profile.id,
        action: PermissionAction.REPORT_VIEW,
      },
    },
  });

  try {
    await page.goto("/app/reports/daily").catch((error: unknown) => {
      if (!String(error).includes("ERR_ABORTED")) {
        throw error;
      }
    });

    await expect(page).toHaveURL(/\/app\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: "접근 권한이 없습니다." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "아침 회의 리포트" }),
    ).toHaveCount(0);
  } finally {
    await prisma.permissionProfileAction.upsert({
      where: {
        profileId_action: {
          profileId: profile.id,
          action: PermissionAction.REPORT_VIEW,
        },
      },
      create: {
        profileId: profile.id,
        action: PermissionAction.REPORT_VIEW,
      },
      update: {},
    });
  }
});

test("DB에서 본사 지점 배정이 제거되면 같은 세션 다음 조회에서 지점 데이터가 사라진다", async ({
  page,
}) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });

  await login(page, "hq-assigned@example.com");
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();
  await expect(page.getByTestId("hq-dashboard-row-store-seocho")).toBeVisible();

  await prisma.userStoreAssignment.delete({
    where: {
      userId_storeId: {
        userId: user.id,
        storeId: "store-seocho",
      },
    },
  });

  try {
    await page.goto("/app/dashboard");

    await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();
    await expect(page.getByText("서초점")).toHaveCount(0);
  } finally {
    await prisma.userStoreAssignment.upsert({
      where: {
        userId_storeId: {
          userId: user.id,
          storeId: "store-seocho",
        },
      },
      create: {
        userId: user.id,
        storeId: "store-seocho",
      },
      update: {},
    });
  }
});

test("E2E 권한 fixture는 프로파일별 action과 지점 범위를 DB에 만든다", async () => {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [
          "hq@example.com",
          "hq-assigned@example.com",
          "hq-viewer@example.com",
          "manager@example.com",
        ],
      },
    },
    select: {
      email: true,
      permissionProfiles: {
        where: {
          profile: {
            isActive: true,
          },
        },
        select: {
          profile: {
            select: {
              code: true,
              storeAccessMode: true,
              actions: {
                select: {
                  action: true,
                },
              },
            },
          },
        },
      },
      storeAssignments: {
        select: {
          storeId: true,
        },
        orderBy: {
          storeId: "asc",
        },
      },
    },
  });
  const byEmail = new Map(users.map((user) => [user.email, user]));
  const hq = byEmail.get("hq@example.com");
  const assignedHq = byEmail.get("hq-assigned@example.com");
  const readOnlyHq = byEmail.get("hq-viewer@example.com");
  const manager = byEmail.get("manager@example.com");

  expect(
    hq?.permissionProfiles.map(({ profile }) => profile.code).sort(),
  ).toEqual(["HQ_ADMIN", "SETTINGS_ADMIN"]);
  expect(
    hq?.permissionProfiles.some(
      ({ profile }) => profile.storeAccessMode === StoreAccessMode.ALL_STORES,
    ),
  ).toBe(true);
  expect(
    hq?.permissionProfiles.flatMap(({ profile }) =>
      profile.actions.map(({ action }) => action),
    ),
  ).toEqual(expect.arrayContaining([PermissionAction.USER_PERMISSION_MANAGE]));

  expect(assignedHq?.permissionProfiles).toHaveLength(1);
  expect(assignedHq?.permissionProfiles[0]?.profile).toMatchObject({
    code: "HQ_STAFF",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
  });
  expect(
    assignedHq?.permissionProfiles[0]?.profile.actions.map(
      ({ action }) => action,
    ),
  ).toEqual(
    expect.arrayContaining([
      PermissionAction.LEDGER_EDIT,
      PermissionAction.REPORT_VIEW,
    ]),
  );
  expect(
    assignedHq?.permissionProfiles[0]?.profile.actions.map(
      ({ action }) => action,
    ),
  ).not.toContain(PermissionAction.SETTINGS_MANAGE);
  // DESIGN.md D4: 마감 장부 직접 수정 권한은 HQ_ADMIN까지만 부여하고 HQ_STAFF에는
  // 자동 부여하지 않는다.
  expect(
    hq?.permissionProfiles.flatMap(({ profile }) =>
      profile.actions.map(({ action }) => action),
    ),
  ).toEqual(expect.arrayContaining([PermissionAction.LEDGER_CLOSED_EDIT]));
  expect(
    assignedHq?.permissionProfiles[0]?.profile.actions.map(
      ({ action }) => action,
    ),
  ).not.toContain(PermissionAction.LEDGER_CLOSED_EDIT);
  expect(assignedHq?.storeAssignments.map(({ storeId }) => storeId)).toEqual([
    "store-seocho",
  ]);

  expect(readOnlyHq?.permissionProfiles).toHaveLength(1);
  expect(readOnlyHq?.permissionProfiles[0]?.profile).toMatchObject({
    code: "HQ_VIEWER",
    storeAccessMode: StoreAccessMode.ALL_STORES,
  });
  expect(
    readOnlyHq?.permissionProfiles[0]?.profile.actions.map(
      ({ action }) => action,
    ),
  ).toEqual([PermissionAction.REPORT_VIEW]);

  expect(manager?.permissionProfiles[0]?.profile).toMatchObject({
    code: "STORE_MANAGER",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
  });
  expect(manager?.storeAssignments.map(({ storeId }) => storeId)).toEqual([
    "store-gangnam",
    "store-seocho",
  ]);
});

// DESIGN.md D4/D5: LEDGER_CLOSED_EDIT가 없는 HQ_STAFF는 마감 장부 상세에서 원본
// 입력이 계속 차단되고 마스터 안내도 볼 수 없다.
test("HQ_STAFF는 마감 장부 상세에서 원본 입력을 수정할 수 없다", async ({
  page,
}) => {
  const closedStoreId = "store-perm-closed-edit";
  const staffUser = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: "hq@example.com" },
    select: { id: true },
  });
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-");
  const closingDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  await prisma.store.upsert({
    where: { id: closedStoreId },
    create: {
      id: closedStoreId,
      name: "권한 검증 마감점",
      isActive: true,
      updatedById: adminUser.id,
    },
    update: {},
  });
  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: { userId: staffUser.id, storeId: closedStoreId },
    },
    create: { userId: staffUser.id, storeId: closedStoreId },
    update: {},
  });
  await prisma.dailyLedger.deleteMany({
    where: { storeId: closedStoreId },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: closedStoreId,
      closingDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 10000,
      cashAmount: 4000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      createdById: adminUser.id,
      updatedById: adminUser.id,
      closedById: adminUser.id,
      closedAt: new Date(),
    },
  });

  try {
    await login(page, "hq-assigned@example.com");
    await page.goto(`/app/ledgers/${ledger.id}`);

    await expect(
      page.getByText("본사 마감된 장부", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("마감 상태 유지 · 마스터 수정")).toHaveCount(0);
    await expect(page.getByLabel("총매출", { exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "근무" }).click();
    await expect(page.getByLabel("근무인원", { exact: true })).toBeDisabled();
  } finally {
    await prisma.dailyLedger.deleteMany({
      where: { storeId: closedStoreId },
    });
    await prisma.userStoreAssignment.deleteMany({
      where: { storeId: closedStoreId },
    });
    await prisma.store.deleteMany({ where: { id: closedStoreId } });
  }
});

// DESIGN.md 테스트 계획 3: UI를 우회해도 서버 게이트가 마감 장부 저장을 막는지
// 프로파일별로 검증한다. OWNER는 허용, HQ_STAFF/CLOSE_MANAGER/SETTINGS_ADMIN/
// STORE_MANAGER는 거부·DB 불변, HOLIDAY는 차단.
test("마감 장부 저장의 서버 권한 경계는 UI 우회 시에도 유지된다", async ({
  page,
}) => {
  // 7개 시나리오(로그인·저장·직접 호출)를 순차 수행하므로 예산을 늘린다.
  test.setTimeout(180_000);
  const storeId = "store-perm-closed-server";
  const outOfScopeStoreId = "store-perm-conflict-out-of-scope";
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: "hq@example.com" },
    select: { id: true },
  });
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-");
  const closingDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  await prisma.store.upsert({
    where: { id: storeId },
    create: {
      id: storeId,
      name: "서버 권한 검증 마감점",
      isActive: true,
      updatedById: adminUser.id,
    },
    update: {},
  });

  const staffUser = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });
  const closeManagerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "close-manager@example.com" },
    select: { id: true },
  });
  const managerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  for (const userId of [staffUser.id, closeManagerUser.id, managerUser.id]) {
    await prisma.userStoreAssignment.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId },
      update: {},
    });
  }

  await prisma.dailyLedger.deleteMany({ where: { storeId } });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId,
      closingDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 10000,
      cashAmount: 4000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      createdById: adminUser.id,
      updatedById: adminUser.id,
      closedById: adminUser.id,
      closedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const holidayLedger = await prisma.dailyLedger.create({
    data: {
      storeId,
      closingDate: new Date(closingDate.getTime() - 86400000),
      status: "HOLIDAY",
      totalSalesAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 0,
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  const outOfScopeStore = await prisma.store.upsert({
    where: { id: outOfScopeStoreId },
    create: {
      id: outOfScopeStoreId,
      name: "충돌 응답 범위 밖 지점",
      isActive: true,
      updatedById: adminUser.id,
    },
    update: {},
  });
  const outOfScopeLedger = await prisma.dailyLedger.create({
    data: {
      storeId: outOfScopeStore.id,
      closingDate,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 987654,
      cashAmount: 987654,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      createdById: adminUser.id,
      updatedById: adminUser.id,
      closedById: adminUser.id,
      closedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  });
  const outOfScopeProduct = await prisma.product.create({
    data: {
      name: "범위 밖 재고 민감값",
      category: "테스트",
      spec: "1kg",
      defaultUnitPrice: 987654,
      updatedById: adminUser.id,
    },
  });
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: outOfScopeLedger.id,
      productId: outOfScopeProduct.id,
      productName: outOfScopeProduct.name,
      productCategory: outOfScopeProduct.category,
      productSpec: outOfScopeProduct.spec,
      unitPrice: 987654,
      previousQuantity: 1,
      currentQuantity: 1,
      quantity: 1,
      inventoryAmount: 987654,
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  async function snapshotLedger(id: string) {
    return prisma.dailyLedger.findUniqueOrThrow({
      where: { id },
      select: {
        version: true,
        updatedAt: true,
        updatedById: true,
        cashAmount: true,
        status: true,
        closedAt: true,
        closedById: true,
      },
    });
  }

  // UI 차단 속성(disabled)을 제거하고 저장 버튼 클릭 대신 폼을 직접 제출해
  // 요청이 반드시 서버 action까지 도달하게 한다. React가 리렌더링마다 disabled를
  // 다시 붙이므로 버튼 클릭은 불안정하다.
  async function bypassUiAndSubmitSales(
    page: Page,
    ledgerId: string,
    cashValue: string,
  ) {
    await page.goto(`/app/ledgers/${ledgerId}?tab=sales`);
    const panel = page.locator('[data-ledger-detail-panel="sales"]');
    await panel
      .locator("[disabled]")
      .evaluateAll((elements) =>
        elements.forEach((element) => element.removeAttribute("disabled")),
      );
    await panel.getByLabel("현금", { exact: true }).fill(cashValue);
    await panel.getByLabel("본사 수정 사유").fill("서버 권한 경계 검증");
    await panel
      .locator("form")
      .filter({ has: page.getByLabel("본사 수정 사유") })
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  }

  async function bypassUiAndSubmitInventory(page: Page, ledgerId: string) {
    await page.goto(`/app/ledgers/${ledgerId}?tab=inventory`);
    const panel = page.locator('[data-ledger-detail-panel="inventory"]');
    await panel
      .locator("[disabled]")
      .evaluateAll((elements) =>
        elements.forEach((element) => element.removeAttribute("disabled")),
      );
    await panel.getByLabel("본사 수정 사유").fill("서버 권한 경계 검증");
    await panel
      .locator("form")
      .last()
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  }

  try {
    // 1) HQ_STAFF: LEDGER_EDIT는 있지만 LEDGER_CLOSED_EDIT가 없다. 편집 패널이
    // 렌더링되므로 disabled를 제거해 폼 제출을 서버까지 도달하게 한다. 서버가 상태
    // 게이트에서 거부하고 DB는 변하지 않는다.
    const beforeStaff = await snapshotLedger(ledger.id);
    await login(page, "hq-assigned@example.com");
    await bypassUiAndSubmitSales(page, ledger.id, "4100");
    await expect(
      page.getByText("원본 항목으로 수정할 수 없습니다").first(),
    ).toBeVisible();
    expect(await snapshotLedger(ledger.id)).toEqual(beforeStaff);

    // 2) OWNER: seed 기본 권한으로 마감 장부 저장이 허용된다. 이 저장에서 서버
    // action id를 확보해 이후 직접 호출 검증에 쓴다. 상태·최초 마감 정보는 유지.
    await login(page, "owner@example.com");
    let capturedActionId: string | null = null;
    page.on("request", (request) => {
      const nextAction = request.headers()["next-action"];

      if (request.method() === "POST" && nextAction) {
        capturedActionId = nextAction;
      }
    });
    await bypassUiAndSubmitSales(page, ledger.id, "4400");
    await expect(
      page.getByText("마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다."),
    ).toBeVisible();
    const afterOwner = await snapshotLedger(ledger.id);
    expect(afterOwner.cashAmount).toBe(4400);
    expect(afterOwner.status).toBe("HEADQUARTERS_CLOSED");
    expect(afterOwner.closedById).toBe(adminUser.id);
    expect(afterOwner.closedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(afterOwner.version).toBe(beforeStaff.version + 1);
    expect(capturedActionId).toBeTruthy();

    // UI를 거치지 않는 서버 action 직접 호출 헬퍼. 확보한 action id로 현재 장부
    // 토큰 기준 payload를 POST한다.
    async function rawSalesSave(
      cashAmount: string,
      options: {
        ledgerId?: string;
        storeId?: string;
        ledgerUpdatedAt?: string;
      } = {},
    ) {
      const targetLedgerId = options.ledgerId ?? ledger.id;
      const targetStoreId = options.storeId ?? storeId;
      const fresh = await snapshotLedger(targetLedgerId);

      return {
        before: fresh,
        response: await page.request.post(`/app/ledgers/${targetLedgerId}`, {
          headers: {
            "Next-Action": capturedActionId!,
            "Content-Type": "text/plain;charset=UTF-8",
          },
          data: JSON.stringify([
            {
              ledgerId: targetLedgerId,
              storeId: targetStoreId,
              closingDate: closingDate.toISOString().slice(0, 10),
              version: fresh.version,
              ledgerUpdatedAt:
                options.ledgerUpdatedAt ?? fresh.updatedAt.toISOString(),
              totalSalesAmount: "10000",
              carryoverSalesAmount: "0",
              cashAmount,
              cardAmount: "6000",
              otherPaymentAmount: "0",
              reason: "서버 권한 경계 검증",
            },
          ]),
        }),
      };
    }

    // 3) OWNER 직접 호출 양성 대조: 같은 경로로 OWNER는 저장이 성공해야 이후
    // 거부 검증이 무의미한 실패가 아님을 보장한다.
    const ownerRaw = await rawSalesSave("4450");
    expect(ownerRaw.response.status()).toBeLessThan(400);
    await expect
      .poll(async () => (await snapshotLedger(ledger.id)).cashAmount)
      .toBe(4450);

    // 4) HQ 재고 충돌도 실제 장부의 지점 범위를 확인하고 최신 메타를 숨긴다.
    let capturedInventoryActionId: string | null = null;
    const captureInventoryAction = (request: Request) => {
      const nextAction = request.headers()["next-action"];

      if (request.method() === "POST" && nextAction) {
        capturedInventoryActionId = nextAction;
      }
    };
    page.on("request", captureInventoryAction);
    await bypassUiAndSubmitInventory(page, ledger.id);
    await page.waitForTimeout(1_000);
    page.off("request", captureInventoryAction);
    expect(capturedInventoryActionId).toBeTruthy();

    const outOfScopeInventoryResponse = await page.request.post(
      `/app/ledgers/${outOfScopeLedger.id}?tab=inventory`,
      {
        headers: {
          "Next-Action": capturedInventoryActionId!,
          "Content-Type": "text/plain;charset=UTF-8",
        },
        data: JSON.stringify([
          {
            ledgerId: outOfScopeLedger.id,
            storeId,
            closingDate: closingDate.toISOString().slice(0, 10),
            version: 1,
            ledgerUpdatedAt: "not-a-date",
            items: [],
            reason: "서버 권한 경계 검증",
          },
        ]),
      },
    );
    const outOfScopeInventoryBody = await outOfScopeInventoryResponse.text();
    expect(outOfScopeInventoryResponse.status()).not.toBeGreaterThanOrEqual(
      500,
    );
    expect(outOfScopeInventoryBody).not.toContain("987654");
    expect(outOfScopeInventoryBody).toContain("unknown");
    expect(outOfScopeInventoryBody).toContain('"lastModifiedBy":null');

    // 5) 충돌 응답도 실제 장부의 지점 범위를 확인한다. 배정 지점만 볼 수 있는
    // HQ_STAFF가 다른 지점 장부 id와 잘못된 토큰을 보내도 serverValues에
    // 다른 지점의 민감한 금액(987654)을 받지 않는다.
    await login(page, "hq-assigned@example.com");
    const outOfScopeRaw = await rawSalesSave("1", {
      ledgerId: outOfScopeLedger.id,
      storeId,
      ledgerUpdatedAt: "not-a-date",
    });
    expect(outOfScopeRaw.response.status()).not.toBeGreaterThanOrEqual(500);
    expect(await outOfScopeRaw.response.text()).not.toContain("987654");
    expect(await snapshotLedger(outOfScopeLedger.id)).toEqual(
      outOfScopeRaw.before,
    );

    // 5) CLOSE_MANAGER: LEDGER_EDIT 자체가 없어 직접 호출이 거부되고 DB는 불변.
    await login(page, "close-manager@example.com");
    const closeManagerRaw = await rawSalesSave("4500");
    expect(closeManagerRaw.response.status()).not.toBeGreaterThanOrEqual(500);
    expect(await snapshotLedger(ledger.id)).toEqual(closeManagerRaw.before);

    // 6) SETTINGS_ADMIN: REPORT_VIEW만 있어 직접 호출이 거부되고 DB는 불변.
    await login(page, "settings-admin@example.com");
    const settingsRaw = await rawSalesSave("4600");
    expect(settingsRaw.response.status()).not.toBeGreaterThanOrEqual(500);
    expect(await snapshotLedger(ledger.id)).toEqual(settingsRaw.before);

    // 7) HQ_READONLY: 조회 권한만 있어 직접 호출이 거부되고 DB는 불변.
    await login(page, "hq-readonly@example.com");
    const readonlyRaw = await rawSalesSave("4650");
    expect(readonlyRaw.response.status()).not.toBeGreaterThanOrEqual(500);
    expect(await snapshotLedger(ledger.id)).toEqual(readonlyRaw.before);

    // 8) STORE_MANAGER: 화면 자체가 미승인이고 직접 호출도 거부된다.
    await login(page, "manager@example.com");
    await page.goto(`/app/ledgers/${ledger.id}`);
    await expect(page).toHaveURL(/\/app\/unauthorized/);
    const managerRaw = await rawSalesSave("4700");
    expect(managerRaw.response.status()).not.toBeGreaterThanOrEqual(500);
    expect(await snapshotLedger(ledger.id)).toEqual(managerRaw.before);

    // 9) HOLIDAY: OWNER 권한이어도 휴무 장부는 서버에서 차단된다.
    const beforeHoliday = await snapshotLedger(holidayLedger.id);
    await login(page, "owner@example.com");
    await bypassUiAndSubmitSales(page, holidayLedger.id, "1000");
    await expect(
      page.getByText("휴무 장부는 원본 항목으로 수정할 수 없습니다").first(),
    ).toBeVisible();
    expect(await snapshotLedger(holidayLedger.id)).toEqual(beforeHoliday);
  } finally {
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: outOfScopeLedger.id },
    });
    await prisma.product.delete({ where: { id: outOfScopeProduct.id } });
    await prisma.dailyLedger.deleteMany({
      where: { storeId: { in: [storeId, outOfScopeStoreId] } },
    });
    await prisma.userStoreAssignment.deleteMany({
      where: { storeId: { in: [storeId, outOfScopeStoreId] } },
    });
    await prisma.store.deleteMany({
      where: { id: { in: [storeId, outOfScopeStoreId] } },
    });
  }
});
