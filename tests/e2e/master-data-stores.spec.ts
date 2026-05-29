import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

function storeRow(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 기준정보에서 지점 목록과 검색 필터를 볼 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.getByRole("link", { name: "기준정보" }).click();

  await expect(page).toHaveURL(/\/app\/master-data\/stores/);
  await expect(page.getByRole("heading", { name: "지점 관리" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "지점명" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정자" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "강남점" })).toBeVisible();
  await expect(storeRow(page, "폐점")).toBeVisible();
  await expect(storeRow(page, "폐점").locator("td").nth(1)).toContainText(
    "비활성",
  );

  await page.getByLabel("지점 검색").fill("서초");
  await page.getByRole("button", { name: "검색" }).click();

  await expect(page).toHaveURL(/q=%EC%84%9C%EC%B4%88/);
  await expect(page.getByRole("cell", { name: "서초점" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "강남점" })).toHaveCount(0);

  await page.getByLabel("상태 필터").selectOption("inactive");

  await expect(page).toHaveURL(/q=%EC%84%9C%EC%B4%88/);
  await expect(page).toHaveURL(/status=inactive/);
  await expect(page.getByText("조건에 맞는 지점이 없습니다.")).toBeVisible();
});

test("본사는 지점을 생성하고 이름과 활성 상태를 수정할 수 있다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const storeName = `스토리13 테스트점 ${suffix}`;
  const editedName = `스토리13 수정점 ${suffix}`;

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/stores");

  await page.getByRole("button", { name: "지점 추가" }).click();
  await page.getByLabel("지점명").fill(storeName);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: storeName })).toBeVisible();
  await expect(storeRow(page, storeName).locator("td").nth(1)).toContainText(
    "활성",
  );
  await expect(
    storeRow(page, storeName).getByRole("button", { name: "상태 적용" }),
  ).toBeDisabled();

  const createdStore = await prisma.store.findFirst({
    where: { name: storeName },
  });
  expect(createdStore?.id).toBeTruthy();

  await storeRow(page, storeName).getByRole("button", { name: "수정" }).click();
  await page.getByLabel("지점명").fill(editedName);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: editedName })).toBeVisible();
  await expect(page.getByRole("cell", { name: storeName })).toHaveCount(0);

  const renamedStore = await prisma.store.findFirst({
    where: { name: editedName },
  });
  expect(renamedStore?.id).toBe(createdStore?.id);

  const editedRow = storeRow(page, editedName);
  await expect(
    editedRow.getByRole("button", { name: "상태 적용" }),
  ).toBeDisabled();
  await editedRow.getByLabel("활성 상태").selectOption("inactive");
  await expect(
    editedRow.getByRole("button", { name: "상태 적용" }),
  ).toBeEnabled();
  await editedRow.getByRole("button", { name: "상태 적용" }).click();

  await expect(storeRow(page, editedName).locator("td").nth(1)).toContainText(
    "비활성",
  );
  await expect(
    storeRow(page, editedName).getByRole("button", { name: "상태 적용" }),
  ).toBeDisabled();
  await expect(storeRow(page, editedName)).toContainText("본사 관리자");

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "Store",
      targetId: createdStore?.id,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(auditLogs.map((log) => log.action)).toEqual([
    "store.created",
    "store.updated",
    "store.deactivated",
  ]);
  expect(auditLogs.at(-1)?.actorId).toBeTruthy();
  expect(auditLogs.at(-1)?.before).toBeTruthy();
  expect(auditLogs.at(-1)?.after).toBeTruthy();

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page.getByRole("cell", { name: editedName })).toHaveCount(0);
});

test("지점 관리 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/stores");

  await page.getByRole("button", { name: "지점 추가" }).click();
  await page.getByLabel("지점명").fill("   ");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("지점명을 입력해 주세요.")).toBeVisible();
  await expect(page.getByLabel("지점명")).toBeFocused();
  await expect(page.getByLabel("지점명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("지점명")).toHaveAttribute(
    "aria-describedby",
    /store-name-error/,
  );
});

test("지점장은 지점 관리 화면에서 지점 데이터를 볼 수 없다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await page.goto("/app/master-data/stores");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "지점 관리" })).toHaveCount(0);
  await expect(page.getByText("강남점")).toHaveCount(0);
  await expect(page.getByText("기준정보 데이터")).toHaveCount(0);
});
