import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.beforeEach(async () => {
  await cleanupStory54Data();
});

test.afterAll(async () => {
  await cleanupStory54Data();
  await prisma.$disconnect();
});

type CodeGroup = "PAYMENT_METHOD" | "EXPENSE_ITEM" | "LOSS_TYPE";

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    tableName,
  );

  return rows.length > 0;
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function cleanupStory54Data() {
  const hasCodes = await tableExists("LedgerInputCode");

  if (!hasCodes) {
    return;
  }

  const codes = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "LedgerInputCode" WHERE name LIKE $1 OR name LIKE $2`,
    "스토리54%",
    "story54%",
  );
  const codeIds = codes.map((code) => code.id);

  if (codeIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      targetType: "LedgerInputCode",
      targetId: { in: codeIds },
    },
  });
  await prisma.$executeRawUnsafe(
    `DELETE FROM "LedgerInputCode" WHERE id = ANY($1)`,
    codeIds,
  );
}

async function seedCode(params: {
  group: CodeGroup;
  name: string;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const id = randomUUID();
  const actorId = await getHeadquartersUserId();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "LedgerInputCode" ("id", "group", "name", "displayOrder", "isActive", "createdAt", "updatedAt", "updatedById")
     VALUES ($1, $2::"LedgerInputCodeGroup", $3, $4, $5, NOW(), NOW(), $6)`,
    id,
    params.group,
    params.name,
    params.displayOrder ?? 10,
    params.isActive ?? true,
    actorId,
  );

  return id;
}

function codeRow(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 코드 관리 목록과 검색, 그룹, 상태 필터를 볼 수 있다", async ({
  page,
}) => {
  await seedCode({
    group: "PAYMENT_METHOD",
    name: "스토리54 현금",
    displayOrder: 1,
  });
  await seedCode({
    group: "EXPENSE_ITEM",
    name: "스토리54 식대",
    displayOrder: 2,
  });
  await seedCode({
    group: "LOSS_TYPE",
    name: "스토리54 폐기",
    displayOrder: 3,
    isActive: false,
  });

  await login(page, "hq@example.com");
  await page
    .getByRole("list")
    .getByRole("link", { name: "코드 관리", exact: true })
    .click();

  await expect(page).toHaveURL(/\/app\/master-data\/codes/);
  await expect(page.getByRole("heading", { name: "코드 관리" })).toBeVisible();
  await expect(
    page.getByText(
      "현재 매출/결제 입력은 기존 현금, 카드, 기타 결제수단 고정 필드로 저장됩니다.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "결제수단" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "비용 항목" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "손실 유형" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "그룹" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "코드명" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "표시 순서" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "스토리54 현금" })).toBeVisible();
  await expect(codeRow(page, "스토리54 폐기")).toContainText("비활성");

  await page.getByLabel("코드 검색").fill("현금");
  await page.getByRole("button", { name: "검색" }).click();

  await expect(page).toHaveURL(/q=%ED%98%84%EA%B8%88/);
  await expect(page.getByRole("cell", { name: "스토리54 현금" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "스토리54 식대" })).toHaveCount(
    0,
  );

  await page.getByLabel("그룹 필터").selectOption("EXPENSE_ITEM");
  await expect(page).toHaveURL(/group=EXPENSE_ITEM/);
  await expect(page.getByText("조건에 맞는 코드가 없습니다.")).toBeVisible();

  await page.getByLabel("코드 검색").fill("");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page).toHaveURL(/group=EXPENSE_ITEM/);
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.getByRole("cell", { name: "스토리54 식대" })).toBeVisible();

  await page.getByLabel("상태 필터").selectOption("inactive");
  await expect(page).toHaveURL(/status=inactive/);
  await expect(page.getByText("조건에 맞는 코드가 없습니다.")).toBeVisible();
});

test("본사는 코드가 없어도 세 코드 그룹을 확인하고 선택할 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/codes");

  const groupList = page.getByLabel("코드 그룹 빠른 필터");

  await expect(
    groupList.getByRole("button", { name: "결제수단" }),
  ).toBeVisible();
  await expect(
    groupList.getByRole("button", { name: "비용 항목" }),
  ).toBeVisible();
  await expect(
    groupList.getByRole("button", { name: "손실 유형" }),
  ).toBeVisible();

  await groupList.getByRole("button", { name: "손실 유형" }).click();
  await expect(page).toHaveURL(/group=LOSS_TYPE/);
  await expect(page.getByText("조건에 맞는 코드가 없습니다.")).toBeVisible();
});

test("본사는 코드를 생성, 수정, 비활성 처리하고 감사 로그를 남긴다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const codeName = `스토리54 카드 ${suffix}`;
  const editedName = `스토리54 법인카드 ${suffix}`;

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/codes");

  await page.getByRole("button", { name: "코드 추가" }).click();
  await page
    .getByLabel("코드 그룹", { exact: true })
    .selectOption("PAYMENT_METHOD");
  await page.getByLabel("코드명").fill(codeName);
  await page.getByLabel("표시 순서").fill("10");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: codeName })).toBeVisible();
  await expect(codeRow(page, codeName)).toContainText("결제수단");
  await expect(codeRow(page, codeName)).toContainText("활성");
  await expect(codeRow(page, codeName)).toContainText("10");

  const createdCodes = await prisma.$queryRawUnsafe<
    Array<{ id: string; isActive: boolean }>
  >(`SELECT id, "isActive" FROM "LedgerInputCode" WHERE name = $1`, codeName);
  expect(createdCodes).toHaveLength(1);
  expect(createdCodes[0]!.isActive).toBe(true);

  await codeRow(page, codeName).getByRole("button", { name: "수정" }).click();
  await page.getByLabel("코드명").fill(editedName);
  await page.getByLabel("표시 순서").fill("3");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: editedName })).toBeVisible();
  await expect(page.getByRole("cell", { name: codeName })).toHaveCount(0);
  await expect(codeRow(page, editedName)).toContainText("3");

  const editedRow = codeRow(page, editedName);
  await editedRow.getByLabel("활성 상태").selectOption("inactive");
  await expect(
    editedRow.getByRole("button", { name: "상태 적용" }),
  ).toBeEnabled();
  await editedRow.getByRole("button", { name: "상태 적용" }).click();

  await expect(codeRow(page, editedName)).toContainText("비활성");
  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "LedgerInputCode" WHERE id = $1`,
        createdCodes[0]!.id,
      );

      return rows[0]?.isActive;
    })
    .toBe(false);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "LedgerInputCode",
      targetId: createdCodes[0]!.id,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(auditLogs.map((log) => log.action)).toEqual([
    "ledger_input_code.created",
    "ledger_input_code.updated",
    "ledger_input_code.deactivated",
  ]);
  for (const log of auditLogs) {
    expect(log.actorId).toBeTruthy();
    expect(log.targetType).toBe("LedgerInputCode");
    expect(log.targetId).toBe(createdCodes[0]!.id);
    expect(log.createdAt).toBeInstanceOf(Date);
    expect(log.after).toBeTruthy();
  }
  expect(auditLogs[0]?.before).toBeNull();
  expect(auditLogs[1]?.before).toBeTruthy();
  expect(auditLogs[2]?.before).toBeTruthy();

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page.getByRole("cell", { name: editedName })).toHaveCount(0);
});

test("코드 관리는 같은 그룹 중복을 거부하고 다른 그룹의 같은 코드명은 허용한다", async ({
  page,
}) => {
  const duplicateName = `스토리54 공통명 ${Date.now().toString(36)}`;
  await seedCode({
    group: "EXPENSE_ITEM",
    name: duplicateName,
    displayOrder: 5,
  });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/codes");

  await page.getByRole("button", { name: "코드 추가" }).click();
  await page
    .getByLabel("코드 그룹", { exact: true })
    .selectOption("EXPENSE_ITEM");
  await page.getByLabel("코드명").fill(duplicateName);
  await page.getByLabel("표시 순서").fill("15");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.locator("#ledger-input-code-name-error")).toHaveText(
    "이미 같은 그룹에 같은 코드명이 있습니다.",
  );
  await expect(page.getByLabel("코드명")).toBeFocused();
  await expect(page.getByLabel("코드명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  const duplicateRows = await prisma.ledgerInputCode.findMany({
    where: { group: "EXPENSE_ITEM", name: duplicateName },
  });
  expect(duplicateRows).toHaveLength(1);

  await page.getByLabel("코드 그룹", { exact: true }).selectOption("LOSS_TYPE");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: duplicateName })).toHaveCount(2);

  const crossGroupRows = await prisma.ledgerInputCode.findMany({
    where: { name: duplicateName },
    orderBy: { group: "asc" },
    select: { group: true, name: true },
  });
  expect(crossGroupRows).toEqual([
    { group: "EXPENSE_ITEM", name: duplicateName },
    { group: "LOSS_TYPE", name: duplicateName },
  ]);
});

test("코드 관리 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/codes");

  await page.getByRole("button", { name: "코드 추가" }).click();
  await page.getByLabel("코드명").fill(" ");
  await page.getByLabel("표시 순서").fill("-1");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("코드명을 입력해 주세요.")).toBeVisible();
  await expect(
    page.getByText("표시 순서는 0 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("코드명")).toBeFocused();
  await expect(page.getByLabel("코드명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("코드명")).toHaveAttribute(
    "aria-describedby",
    /ledger-input-code-name-error/,
  );
});

test("지점장은 코드 관리 URL에서 데이터를 볼 수 없다", async ({ page }) => {
  await seedCode({
    group: "PAYMENT_METHOD",
    name: "스토리54 지점장차단",
  });

  await login(page, "manager@example.com");

  await page.goto("/app/master-data/codes");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "코드 관리" })).toHaveCount(0);
  await expect(page.getByText("스토리54 지점장차단")).toHaveCount(0);
});
