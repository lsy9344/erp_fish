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
