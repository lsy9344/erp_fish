import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const BULK_STORE_ID_PREFIX = "store-bulk-10-plus";
const BULK_STORE_NAME_PREFIX = "스토리10+";

test.afterAll(async () => {
  await prisma.$disconnect();
});

function storeRow(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name });
}

async function openCreateStoreDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "지점 추가" });

  await expect(async () => {
    await page.getByRole("button", { name: "지점 추가" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function openEditStoreDialog(page: Page, name: string) {
  const row = storeRow(page, name);
  const dialog = page.getByRole("dialog", { name: "지점 정보 수정" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "수정" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function applyStoreStatus(
  page: Page,
  name: string,
  status: "active" | "inactive",
) {
  const row = storeRow(page, name);
  const statusSelect = row.getByLabel("활성 상태");
  const applyButton = row.getByRole("button", { name: "상태 적용" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await statusSelect.selectOption(status);
    await expect(statusSelect).toHaveValue(status, { timeout: 1_000 });
    await expect(applyButton).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  await applyButton.click();
}

function formatStoreDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatStoreDateTimePattern(value: Date): RegExp {
  const formatted = formatStoreDateTime(value)
    .replace(/\bAM\b|오전/g, "__AM__")
    .replace(/\bPM\b|오후/g, "__PM__");

  return new RegExp(
    escapeRegex(formatted)
      .replace("__AM__", "(?:AM|오전)")
      .replace("__PM__", "(?:PM|오후)"),
  );
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function cleanupBulkStores() {
  const stores = await prisma.store.findMany({
    where: { id: { startsWith: BULK_STORE_ID_PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((store) => store.id);

  if (storeIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "Store",
        targetId: { in: storeIds },
      },
    });
  }

  await prisma.store.deleteMany({
    where: { id: { startsWith: BULK_STORE_ID_PREFIX } },
  });
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
    page.getByRole("columnheader", { name: "생성 시각" }),
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

  const createDialog = await openCreateStoreDialog(page);
  await createDialog.getByLabel("지점명").fill(storeName);
  await createDialog.getByRole("button", { name: "저장" }).click();

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
  await expect(storeRow(page, storeName).locator("td").nth(3)).toContainText(
    formatStoreDateTimePattern(createdStore!.createdAt),
  );

  const editDialog = await openEditStoreDialog(page, storeName);
  await editDialog.getByLabel("지점명").fill(editedName);
  await editDialog.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: editedName })).toBeVisible();
  await expect(page.getByRole("cell", { name: storeName })).toHaveCount(0);

  const renamedStore = await prisma.store.findFirst({
    where: { name: editedName },
  });
  expect(renamedStore?.id).toBe(createdStore?.id);
  await expect(storeRow(page, editedName).locator("td").nth(3)).toContainText(
    formatStoreDateTimePattern(createdStore!.createdAt),
  );
  await expect(storeRow(page, editedName).locator("td").nth(4)).toContainText(
    formatStoreDateTimePattern(renamedStore!.updatedAt),
  );

  const editedRow = storeRow(page, editedName);
  await expect(
    editedRow.getByRole("button", { name: "상태 적용" }),
  ).toBeDisabled();
  await applyStoreStatus(page, editedName, "inactive");

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
  expect(auditLogs.at(-1)?.after).toMatchObject({
    actorContext: {
      actorRole: "HEADQUARTERS",
      requiredAction: "SETTINGS_MANAGE",
    },
  });

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page.getByRole("cell", { name: editedName })).toHaveCount(0);
});

test("본사는 10개 이상 지점을 검색하고 활성 상태를 운영할 수 있다", async ({
  page,
}) => {
  await cleanupBulkStores();

  const actorId = await getHeadquartersUserId();
  const suffix = Date.now().toString(36);
  const stores = Array.from({ length: 11 }, (_, index) => {
    const sequence = String(index + 1).padStart(2, "0");

    return {
      id: `${BULK_STORE_ID_PREFIX}-${suffix}-${sequence}`,
      name: `${BULK_STORE_NAME_PREFIX} ${suffix} ${sequence}점`,
      isActive: true,
      updatedById: actorId,
    };
  });
  const firstStore = stores[0]!;
  const seventhStore = stores[6]!;
  const eleventhStore = stores[10]!;

  await prisma.store.createMany({ data: stores });

  try {
    await login(page, "hq@example.com");
    await page.goto("/app/master-data/stores");

    await page
      .getByLabel("지점 검색")
      .fill(`${BULK_STORE_NAME_PREFIX} ${suffix}`);
    await page.getByRole("button", { name: "검색" }).click();

    for (const store of stores) {
      await expect(page.getByRole("cell", { name: store.name })).toBeVisible();
      await expect(
        storeRow(page, store.name).locator("td").nth(1),
      ).toContainText("활성");
    }

    await page.getByLabel("지점 검색").fill(seventhStore.name);
    await page.getByRole("button", { name: "검색" }).click();

    await expect(
      page.getByRole("cell", { name: seventhStore.name }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: firstStore.name })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("cell", { name: eleventhStore.name }),
    ).toHaveCount(0);

    const targetRow = storeRow(page, seventhStore.name);
    await applyStoreStatus(page, seventhStore.name, "inactive");

    await expect(targetRow.locator("td").nth(1)).toContainText("비활성");

    await page.getByLabel("상태 필터").selectOption("inactive");

    await expect(page).toHaveURL(/status=inactive/);
    await expect(
      page.getByRole("cell", { name: seventhStore.name }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: firstStore.name })).toHaveCount(
      0,
    );
  } finally {
    await cleanupBulkStores();
  }
});

test("지점 관리 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/master-data/stores");

  const dialog = await openCreateStoreDialog(page);
  await dialog.getByLabel("지점명").fill("   ");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(dialog.getByText("지점명을 입력해 주세요.")).toBeVisible();
  await expect(dialog.getByLabel("지점명")).toBeFocused();
  await expect(dialog.getByLabel("지점명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByLabel("지점명")).toHaveAttribute(
    "aria-describedby",
    /store-name-error/,
  );

  await dialog.getByLabel("지점명").fill("강남점");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(
    dialog.getByText("이미 같은 이름의 지점이 있습니다."),
  ).toBeVisible();
  await expect(dialog.getByLabel("지점명")).toBeFocused();
  await expect(dialog.getByLabel("지점명")).toHaveAttribute(
    "aria-invalid",
    "true",
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

test("설정 권한이 없는 본사 사용자는 지점 관리 화면에서 차단된다", async ({
  page,
}) => {
  await login(page, "hq-viewer@example.com");

  await page.goto("/app/master-data/stores");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "지점 관리" })).toHaveCount(0);
  await expect(page.getByText("강남점")).toHaveCount(0);
});
