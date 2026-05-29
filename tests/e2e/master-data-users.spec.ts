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

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 사용자/권한 목록과 역할/상태 필터를 볼 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await expect(page).toHaveURL(/\/app\/dashboard/);

  await page.getByRole("link", { name: "사용자/권한", exact: true }).click();

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

  await hqPage.getByRole("button", { name: "사용자 추가" }).click();
  await hqPage.getByLabel("이름").fill(managerName);
  await hqPage.getByLabel("로그인 식별자").fill(email);
  await hqPage.getByLabel("초기 비밀번호").fill("correct-password");
  await hqPage
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await hqPage.getByLabel("강남점").check();
  await hqPage.getByLabel("서초점").check();
  await hqPage.getByRole("button", { name: "저장" }).click();

  await expect(hqPage.getByRole("cell", { name: email })).toBeVisible();
  await expect(userRow(hqPage, email)).toContainText("지점장");
  await expect(userRow(hqPage, email)).toContainText("강남점");
  await expect(userRow(hqPage, email)).toContainText("서초점");

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, email);
  await expect(managerPage).toHaveURL(/\/app\/store-entry/);
  await expect(
    managerPage.getByRole("heading", { name: "강남점" }),
  ).toBeVisible();

  await userRow(hqPage, email).getByRole("button", { name: "수정" }).click();
  await hqPage.getByLabel("강남점").uncheck();
  await hqPage.getByRole("button", { name: "저장" }).click();

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

  await managerPage.getByLabel("이메일").fill(email);
  await managerPage.getByLabel("비밀번호").fill("correct-password");
  await managerPage.getByRole("button", { name: "로그인" }).click();
  await expect(managerPage.locator("#login-error")).toHaveText(
    "이메일 또는 비밀번호가 올바르지 않습니다.",
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

  await managerContext.close();
  await hqContext.close();
});

test("역할 변경은 기존 세션의 메뉴와 접근 범위에 즉시 반영되고 감사 로그를 남긴다", async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const email = `story14-role-${suffix}@example.com`;
  const managerName = `스토리14 역할변경 ${suffix}`;

  const hqContext = await browser.newContext();
  const hqPage = await hqContext.newPage();
  await login(hqPage, "hq@example.com");
  await hqPage.goto("/app/master-data/users");

  await hqPage.getByRole("button", { name: "사용자 추가" }).click();
  await hqPage.getByLabel("이름").fill(managerName);
  await hqPage.getByLabel("로그인 식별자").fill(email);
  await hqPage.getByLabel("초기 비밀번호").fill("correct-password");
  await hqPage
    .getByLabel("역할", { exact: true })
    .selectOption("STORE_MANAGER");
  await hqPage.getByLabel("강남점").check();
  await hqPage.getByRole("button", { name: "저장" }).click();
  await expect(hqPage.getByRole("cell", { name: email })).toBeVisible();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, email);
  await expect(managerPage).toHaveURL(/\/app\/store-entry/);

  await userRow(hqPage, email).getByRole("button", { name: "수정" }).click();
  await hqPage.getByLabel("역할", { exact: true }).selectOption("HEADQUARTERS");
  await hqPage.getByRole("button", { name: "저장" }).click();
  await expect(userRow(hqPage, email)).toContainText("본사");
  await expect(userRow(hqPage, email)).not.toContainText("강남점");

  await managerPage.goto("/app");
  await expect(managerPage).toHaveURL(/\/app\/dashboard/);
  await expect(
    managerPage.getByRole("link", { name: "사용자/권한", exact: true }),
  ).toBeVisible();

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

  await managerContext.close();
  await hqContext.close();
});

test("본사는 자기 계정 비활성화나 강등을 할 수 없고 오류를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/users");

  await userRow(page, "hq@example.com")
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByLabel("역할", { exact: true }).selectOption("STORE_MANAGER");
  await page.getByLabel("강남점").check();
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText(
      "현재 로그인한 본사 계정의 권한은 직접 낮추거나 비활성화할 수 없습니다.",
    ),
  ).toBeVisible();

  const dialog = page.getByRole("dialog", { name: "사용자 정보 수정" });
  await page.getByLabel("역할", { exact: true }).selectOption("HEADQUARTERS");
  await dialog.getByLabel("활성 상태").selectOption("inactive");
  await page.getByRole("button", { name: "저장" }).click();

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

  await page.getByRole("button", { name: "사용자 추가" }).click();
  await page.getByLabel("이름").fill(" ");
  await page.getByLabel("로그인 식별자").fill("bad-email");
  await page.getByLabel("초기 비밀번호").fill("short");
  await page.getByLabel("역할", { exact: true }).selectOption("STORE_MANAGER");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("이름을 입력해 주세요.")).toBeVisible();
  await expect(
    page.getByText("이메일 형식이 올바르지 않습니다."),
  ).toBeVisible();
  await expect(
    page.getByText("초기 비밀번호는 12자 이상이어야 합니다."),
  ).toBeVisible();
  await expect(
    page.getByText("지점장은 하나 이상의 활성 지점에 배정해야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("이름")).toBeFocused();
  await expect(page.getByLabel("이름")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("이름").fill("스토리14 검증");
  await page.getByLabel("로그인 식별자").fill("story14-validation@example.com");
  await page.getByLabel("초기 비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("지점장은 하나 이상의 활성 지점에 배정해야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("강남점")).toBeFocused();
  await expect(page.getByLabel("강남점")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("강남점")).toHaveAttribute(
    "aria-describedby",
    "user-store-options-error",
  );
});
