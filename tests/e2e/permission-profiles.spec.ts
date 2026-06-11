import { expect, test, type Page } from "@playwright/test";
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
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("지정 지점 본사 프로파일은 배정 지점만 직접 열 수 있다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();

  await page.goto("/app/store-entry?storeId=store-seocho");

  await expect(page).toHaveURL(/\/app\/store-entry\?storeId=store-seocho/);
  await expect(page.getByRole("heading", { name: "서초점" })).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);

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
    "매입 기준",
    "이상 신호 기준값",
    "코드 관리",
    "사용자/권한",
    "변경 이력",
    "설정",
  ]) {
    await expect(
      page.getByRole("link", { name: hiddenMenuItem, exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.getByText("서초점")).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const dashboardHtml = await page.content();
  expect(dashboardHtml).toContain("서초점");
  expect(dashboardHtml).not.toContain("강남점");
  expect(dashboardHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/daily");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  await expect(page.getByText("서초점")).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const dailyReportHtml = await page.content();
  expect(dailyReportHtml).toContain("서초점");
  expect(dailyReportHtml).not.toContain("강남점");
  expect(dailyReportHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/comparison");

  await expect(
    page.getByRole("heading", { name: "기간 비교 리포트" }),
  ).toBeVisible();
  await expect(page.getByText("서초점")).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  const comparisonReportHtml = await page.content();
  expect(comparisonReportHtml).toContain("서초점");
  expect(comparisonReportHtml).not.toContain("강남점");
  expect(comparisonReportHtml).not.toContain("store-gangnam");

  await page.goto("/app/reports/monthly");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(page.getByText("서초점")).toBeVisible();
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
    await page.goto("/app/dashboard");

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp/);
    await expect(
      page.getByRole("heading", { name: "ERP Fish 로그인" }),
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
    await page.goto("/app/reports/daily");

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

test("DB에서 본사 지점 배정이 제거되면 같은 세션 다음 지점 요청에서 차단된다", async ({
  page,
}) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });

  await login(page, "hq-assigned@example.com");
  await page.goto("/app/store-entry?storeId=store-seocho");
  await expect(page.getByRole("heading", { name: "서초점" })).toBeVisible();

  await prisma.userStoreAssignment.delete({
    where: {
      userId_storeId: {
        userId: user.id,
        storeId: "store-seocho",
      },
    },
  });

  try {
    await page.goto("/app/store-entry?storeId=store-seocho");

    await expect(page).toHaveURL(/\/app\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: "접근 권한이 없습니다." }),
    ).toBeVisible();
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
  expect(assignedHq?.storeAssignments.map(({ storeId }) => storeId)).toEqual([
    "store-seocho",
  ]);

  expect(manager?.permissionProfiles[0]?.profile).toMatchObject({
    code: "STORE_MANAGER",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
  });
  expect(manager?.storeAssignments.map(({ storeId }) => storeId)).toEqual([
    "store-gangnam",
    "store-seocho",
  ]);
});
