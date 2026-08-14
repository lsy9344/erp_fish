import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.beforeEach(async () => {
  await cleanupStory14Users();
});

test.afterAll(async () => {
  await cleanupStory14Users();
  await prisma.$disconnect();
});

async function cleanupStory14Users() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        startsWith: "story14-",
      },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      OR: [
        { createdById: { in: userIds } },
        { updatedById: { in: userIds } },
        { submittedById: { in: userIds } },
        { closedById: { in: userIds } },
      ],
    },
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
          { actorId: { in: userIds } },
        ],
      },
    });
    await prisma.correctionRecord.deleteMany({
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

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          targetType: "User",
          targetId: {
            in: userIds,
          },
        },
        {
          actorId: {
            in: userIds,
          },
        },
      ],
    },
  });
  await prisma.userStoreAssignment.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });
  await prisma.session.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });
  await prisma.account.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });
}

function userRow(page: Page, email: string): Locator {
  return page.locator("tbody tr").filter({ hasText: email });
}

async function openCreateUserDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "사용자 추가" });

  await expect(async () => {
    await page.getByRole("button", { name: "사용자 추가" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function openEditUserDialog(page: Page, email: string) {
  const row = userRow(page, email);
  const dialog = page.getByRole("dialog", { name: "사용자 정보 수정" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "수정" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function assignStoreManagerProfile(page: Page, email: string) {
  const row = userRow(page, email);
  const dialog = await openEditUserDialog(page, email);

  await dialog.getByLabel(/지점장/).check();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("지점장");
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 사용자/권한 목록과 역할/상태 필터를 볼 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await expect(page).toHaveURL(/\/app\/dashboard/);

  await page.goto("/app/master-data/users");

  await expect(page).toHaveURL(/\/app\/master-data\/users/);
  await expect(
    page.getByRole("heading", { name: "사용자/권한 관리" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "이름" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "로그인 식별자" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "역할" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "연결 지점" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "hq@example.com" }),
  ).toBeVisible();

  await page.getByLabel("역할 필터").selectOption("STORE_MANAGER");
  await expect(page).toHaveURL(/role=STORE_MANAGER/);

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page).toHaveURL(/role=STORE_MANAGER/);
  await expect(page).toHaveURL(/status=active/);
});

test("본사는 지점장 계정을 만들고 배정 변경과 비활성 처리를 즉시 반영한다", async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const email = `story14-manager-${suffix}@example.com`;
  const managerName = `스토리14 지점장 ${suffix}`;

  const hqContext = await browser.newContext();
  const hqPage = await hqContext.newPage();
  await login(hqPage, "hq@example.com");
  await hqPage.goto("/app/master-data/users");

  const createDialog = await openCreateUserDialog(hqPage);
  await createDialog.getByLabel("이름").fill(managerName);
  await createDialog.getByLabel("로그인 식별자").fill(email);
  await createDialog.getByLabel("초기 비밀번호").fill("correct-password");
  await createDialog
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await createDialog.getByLabel("강남점").check();
  await createDialog.getByLabel("서초점").check();
  await createDialog.getByRole("button", { name: "저장" }).click();

  await expect(hqPage.getByRole("cell", { name: email })).toBeVisible();
  await expect(userRow(hqPage, email)).toContainText("지점장");
  await expect(userRow(hqPage, email)).toContainText("강남점");
  await expect(userRow(hqPage, email)).toContainText("서초점");
  await assignStoreManagerProfile(hqPage, email);

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, email);
  await expect(managerPage).toHaveURL(/\/app\/store-entry/);
  await expect(
    managerPage.getByRole("heading", { name: "강남점" }),
  ).toBeVisible();

  const assignmentDialog = await openEditUserDialog(hqPage, email);
  await assignmentDialog.getByLabel("강남점").uncheck();
  await assignmentDialog.getByRole("button", { name: "저장" }).click();

  await expect(userRow(hqPage, email)).not.toContainText("강남점");
  await expect(userRow(hqPage, email)).toContainText("서초점");

  await managerPage.goto("/app/store-entry?storeId=store-gangnam");
  await expect(managerPage).toHaveURL(/\/app\/unauthorized/);
  await expect(
    managerPage.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();

  await managerPage.goto("/app/store-entry?storeId=store-seocho");
  await expect(
    managerPage.getByRole("heading", { name: "서초점" }),
  ).toBeVisible();

  await userRow(hqPage, email).getByLabel("활성 상태").selectOption("inactive");
  await userRow(hqPage, email)
    .getByRole("button", { name: "상태 적용" })
    .click();

  await expect
    .poll(async () => {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { isActive: true },
      });

      return user?.isActive;
    })
    .toBe(false);
  await expect(userRow(hqPage, email)).toContainText("비활성");

  await managerPage.goto("/app/store-entry");
  await expect(managerPage).toHaveURL(/\/login/);
  await expect(managerPage.getByText("강남점")).toHaveCount(0);
  await expect(managerPage.getByText("서초점")).toHaveCount(0);

  await managerPage.getByLabel("로그인 식별자").fill(email);
  await managerPage.getByLabel("비밀번호").fill("correct-password");
  await managerPage.getByRole("button", { name: "로그인" }).click();
  await expect(managerPage.locator("#login-error")).toHaveText(
    "로그인 식별자 또는 비밀번호가 올바르지 않습니다.",
  );

  const createdUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  expect(createdUser?.id).toBeTruthy();

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "User",
      targetId: createdUser?.id,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(auditLogs.map((log) => log.action)).toEqual(
    expect.arrayContaining([
      "user.created",
      "user.store_assignments_changed",
      "user.deactivated",
    ]),
  );
  expect(auditLogs.at(-1)?.before).toBeTruthy();
  expect(auditLogs.at(-1)?.after).toBeTruthy();

  const createdAudit = auditLogs.find((log) => log.action === "user.created");
  const assignmentAudit = auditLogs
    .filter((log) => log.action === "user.store_assignments_changed")
    .at(-1);
  const deactivatedAudit = auditLogs.find(
    (log) => log.action === "user.deactivated",
  );

  expect(createdAudit?.after).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    isActive: true,
    storeNames: expect.arrayContaining(["강남점", "서초점"]),
    actorContext: {
      actorRole: "HEADQUARTERS",
      requiredAction: "USER_PERMISSION_MANAGE",
    },
  });
  expect(createdAudit?.after).not.toHaveProperty("initialPassword");
  expect(createdAudit?.after).not.toHaveProperty("passwordHash");
  expect(assignmentAudit?.before).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    storeNames: expect.arrayContaining(["강남점", "서초점"]),
  });
  expect(assignmentAudit?.after).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    storeNames: ["서초점"],
    actorContext: {
      actorRole: "HEADQUARTERS",
      requiredAction: "USER_PERMISSION_MANAGE",
    },
  });
  expect(deactivatedAudit?.before).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    isActive: true,
    storeNames: ["서초점"],
  });
  expect(deactivatedAudit?.after).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    isActive: false,
    storeNames: ["서초점"],
  });

  await managerContext.close();
  await hqContext.close();
});

test("역할 변경은 기존 세션의 접근 범위에 즉시 반영되고 감사 로그를 남긴다", async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const email = `story14-role-${suffix}@example.com`;
  const managerName = `스토리14 역할변경 ${suffix}`;

  const hqContext = await browser.newContext();
  const hqPage = await hqContext.newPage();
  await login(hqPage, "hq@example.com");
  await hqPage.goto("/app/master-data/users");

  const createDialog = await openCreateUserDialog(hqPage);
  await createDialog.getByLabel("이름").fill(managerName);
  await createDialog.getByLabel("로그인 식별자").fill(email);
  await createDialog.getByLabel("초기 비밀번호").fill("correct-password");
  await createDialog
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await createDialog.getByLabel("강남점").check();
  await createDialog.getByRole("button", { name: "저장" }).click();
  await expect(hqPage.getByRole("cell", { name: email })).toBeVisible();
  await assignStoreManagerProfile(hqPage, email);

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, email);
  await expect(managerPage).toHaveURL(/\/app\/store-entry/);

  const roleDialog = await openEditUserDialog(hqPage, email);
  await roleDialog
    .getByLabel("역할", { exact: true })
    .selectOption("HEADQUARTERS");
  await roleDialog.getByRole("button", { name: "저장" }).click();
  await expect(userRow(hqPage, email)).toContainText("본사");
  await expect(userRow(hqPage, email)).not.toContainText("강남점");

  await managerPage.goto("/app");
  await expect(managerPage).toHaveURL(/\/app\/unauthorized/);
  await expect(
    managerPage.getByRole("link", { name: "사용자/권한", exact: true }),
  ).toHaveCount(0);

  const createdUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  expect(createdUser?.id).toBeTruthy();

  const roleChangeAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "User",
      targetId: createdUser?.id,
      action: "user.role_changed",
    },
  });
  expect(roleChangeAudit).toBeTruthy();
  expect(roleChangeAudit?.before).toMatchObject({
    name: managerName,
    email,
    role: "STORE_MANAGER",
    isActive: true,
    storeNames: ["강남점"],
  });
  expect(roleChangeAudit?.after).toMatchObject({
    name: managerName,
    email,
    role: "HEADQUARTERS",
    isActive: true,
    storeNames: [],
    actorContext: {
      actorRole: "HEADQUARTERS",
      requiredAction: "USER_PERMISSION_MANAGE",
    },
  });

  await managerContext.close();
  await hqContext.close();
});

test("본사는 자기 계정 비활성화나 강등을 할 수 없고 오류를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/users");

  const dialog = await openEditUserDialog(page, "hq@example.com");
  await dialog
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await dialog.getByLabel("강남점").check();
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText(
      "현재 로그인한 본사 계정의 권한은 직접 낮추거나 비활성화할 수 없습니다.",
    ),
  ).toBeVisible();

  await dialog.getByLabel("역할", { exact: true }).selectOption("HEADQUARTERS");
  await dialog.getByLabel("활성 상태").selectOption("inactive");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText(
      "현재 로그인한 본사 계정의 권한은 직접 낮추거나 비활성화할 수 없습니다.",
    ),
  ).toBeVisible();
});

test("사용자/권한 관리 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/users");

  const dialog = await openCreateUserDialog(page);
  await dialog.getByLabel("이름").fill(" ");
  await dialog.getByLabel("로그인 식별자").fill(" ");
  await dialog.getByLabel("초기 비밀번호").fill("123");
  await dialog
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(dialog.getByText("이름을 입력해 주세요.")).toBeVisible();
  await expect(
    dialog.getByText("로그인 식별자를 입력해 주세요."),
  ).toBeVisible();
  await expect(
    dialog.getByText("초기 비밀번호는 4자 이상이어야 합니다."),
  ).toBeVisible();
  await expect(
    dialog.getByText("지점장은 하나 이상의 활성 지점에 배정해야 합니다."),
  ).toBeVisible();
  await expect(dialog.getByLabel("이름")).toBeFocused();
  await expect(dialog.getByLabel("이름")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await dialog.getByLabel("이름").fill("스토리14 검증");
  await dialog.getByLabel("로그인 식별자").fill("story14-validation");
  await dialog.getByLabel("초기 비밀번호").fill("1234");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(
    dialog.getByText("지점장은 하나 이상의 활성 지점에 배정해야 합니다."),
  ).toBeVisible();
  await expect(dialog.getByLabel("강남점")).toBeFocused();
  await expect(dialog.getByLabel("강남점")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByLabel("강남점")).toHaveAttribute(
    "aria-describedby",
    "user-store-options-error",
  );
});

// WO(2026-08-14): 안 쓰거나 잘못 만든 계정 삭제. 전용 삭제 권한
// (MASTER_DATA_DELETE)이 있어야 하고, 변경 이력이나 장부가 남은 계정은 사유와 함께 막힌다.
const DELETE_FIXTURE_EMAIL = "story14-delete-fixture@example.com";

async function seedDeleteFixtureUser() {
  await prisma.user.deleteMany({ where: { email: DELETE_FIXTURE_EMAIL } });
  await prisma.user.create({
    data: {
      name: "스토리14 삭제대상",
      email: DELETE_FIXTURE_EMAIL,
      role: "STORE_MANAGER",
      isActive: true,
    },
  });
}

async function confirmUserDelete(page: Page, email: string) {
  const row = userRow(page, email);
  const dialog = page.getByRole("dialog", { name: "사용자 삭제" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  await dialog.getByTestId("user-delete-confirm").click();

  return dialog;
}

test("삭제 권한 계정은 쓰이지 않은 계정을 삭제하고, 이력이 있는 계정은 사유와 함께 막힌다", async ({
  page,
}) => {
  await seedDeleteFixtureUser();

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/master-data/users");
    await expect(
      page.getByRole("heading", { name: "사용자/권한 관리" }),
    ).toBeVisible();

    // hq@example.com은 다른 테스트에서 감사 이력을 남긴 계정이라 삭제가 막힌다.
    const inUseDialog = await confirmUserDelete(page, "hq@example.com");

    await expect(inUseDialog.getByRole("alert")).toContainText("비활성");
    await inUseDialog.getByRole("button", { name: "취소" }).click();
    expect(
      await prisma.user.count({ where: { email: "hq@example.com" } }),
    ).toBe(1);

    const freshDialog = await confirmUserDelete(page, DELETE_FIXTURE_EMAIL);

    await expect(freshDialog).toBeHidden();
    await expect(userRow(page, DELETE_FIXTURE_EMAIL)).toHaveCount(0);
    expect(
      await prisma.user.count({ where: { email: DELETE_FIXTURE_EMAIL } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "user.deleted", targetType: "User" },
      }),
    ).toBeGreaterThan(0);
  } finally {
    await prisma.user.deleteMany({ where: { email: DELETE_FIXTURE_EMAIL } });
  }
});

test("삭제 권한이 있어도 자기 계정은 삭제할 수 없다", async ({ page }) => {
  await login(page, "owner@example.com");
  await page.goto("/app/master-data/users");

  const selfDialog = await confirmUserDelete(page, "owner@example.com");

  await expect(selfDialog.getByRole("alert")).toContainText(
    "현재 로그인한 계정은 삭제할 수 없습니다.",
  );
  await selfDialog.getByRole("button", { name: "취소" }).click();
  expect(
    await prisma.user.count({ where: { email: "owner@example.com" } }),
  ).toBe(1);
});

test("삭제 권한이 없는 본사 사용자는 계정 삭제 버튼을 볼 수 없다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/users");

  const row = userRow(page, "owner@example.com");

  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "수정" })).toBeVisible();
  await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(0);
});

// 대표 권한 묶음(급여·개인정보 조회 포함) 없이 삭제만 받은 계정도 지울 수 있어야 한다.
// 운영의 `dowon` 계정과 같은 모양이다.
test("대표가 아니어도 삭제 권한을 받은 설정 관리자는 계정을 삭제한다", async ({
  page,
}) => {
  await seedDeleteFixtureUser();

  try {
    await login(page, "settings-admin@example.com");
    await page.goto("/app/master-data/users");

    const dialog = await confirmUserDelete(page, DELETE_FIXTURE_EMAIL);

    await expect(dialog).toBeHidden();
    await expect(userRow(page, DELETE_FIXTURE_EMAIL)).toHaveCount(0);
    expect(
      await prisma.user.count({ where: { email: DELETE_FIXTURE_EMAIL } }),
    ).toBe(0);
  } finally {
    await prisma.user.deleteMany({ where: { email: DELETE_FIXTURE_EMAIL } });
  }
});
