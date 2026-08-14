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
  await page.getByLabel("로그인 식별자").fill(email);
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

// WO(2026-08-14): 안 쓰거나 잘못 만든 지점 삭제. 전용 삭제 권한
// (MASTER_DATA_DELETE)이 있어야 하고, 실적 기록이 남은 지점은 사유와 함께 막힌다.
const DELETE_FIXTURE_PREFIX = "store-delete-fixture";
const EMPTY_STORE_ID = `${DELETE_FIXTURE_PREFIX}-empty`;
const EMPTY_STORE_NAME = "스토리삭제 빈지점";
const IN_USE_STORE_ID = `${DELETE_FIXTURE_PREFIX}-in-use`;
const IN_USE_STORE_NAME = "스토리삭제 사용중지점";

async function cleanupDeleteFixtures() {
  await prisma.headquartersExpense.deleteMany({
    where: { storeId: { startsWith: DELETE_FIXTURE_PREFIX } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      targetType: "Store",
      targetId: { startsWith: DELETE_FIXTURE_PREFIX },
    },
  });
  await prisma.store.deleteMany({
    where: { id: { startsWith: DELETE_FIXTURE_PREFIX } },
  });
}

async function seedDeleteFixtures() {
  await cleanupDeleteFixtures();

  const hqUserId = await getHeadquartersUserId();

  await prisma.store.create({
    data: { id: EMPTY_STORE_ID, name: EMPTY_STORE_NAME, isActive: true },
  });
  await prisma.store.create({
    data: { id: IN_USE_STORE_ID, name: IN_USE_STORE_NAME, isActive: true },
  });
  // 본사 지출은 storeId가 SetNull이라 그냥 지우면 소리 없이 주인을 잃는다.
  // 삭제가 막혀야 하는 대표 사례다.
  await prisma.headquartersExpense.create({
    data: {
      expenseDate: new Date("2026-01-05T00:00:00.000Z"),
      storeId: IN_USE_STORE_ID,
      category: "스토리삭제-임차료",
      amount: 100000,
      createdById: hqUserId,
      updatedById: hqUserId,
    },
  });
}

async function confirmStoreDelete(page: Page, name: string) {
  const row = storeRow(page, name);
  const dialog = page.getByRole("dialog", { name: "지점 삭제" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  await dialog.getByTestId("store-delete-confirm").click();

  return dialog;
}

test("삭제 권한 계정은 기록 없는 지점을 삭제하고, 기록 있는 지점은 사유와 함께 막힌다", async ({
  page,
}) => {
  await seedDeleteFixtures();

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/master-data/stores");
    await expect(
      page.getByRole("heading", { name: "지점 관리" }),
    ).toBeVisible();

    const inUseDialog = await confirmStoreDelete(page, IN_USE_STORE_NAME);

    await expect(inUseDialog.getByRole("alert")).toContainText("본사 지출");
    await expect(inUseDialog.getByRole("alert")).toContainText("비활성");
    await inUseDialog.getByRole("button", { name: "취소" }).click();
    await expect(storeRow(page, IN_USE_STORE_NAME)).toBeVisible();
    expect(await prisma.store.count({ where: { id: IN_USE_STORE_ID } })).toBe(
      1,
    );

    const emptyDialog = await confirmStoreDelete(page, EMPTY_STORE_NAME);

    await expect(emptyDialog).toBeHidden();
    await expect(storeRow(page, EMPTY_STORE_NAME)).toHaveCount(0);
    expect(await prisma.store.count({ where: { id: EMPTY_STORE_ID } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "store.deleted", targetId: EMPTY_STORE_ID },
      }),
    ).toBe(1);
  } finally {
    await cleanupDeleteFixtures();
  }
});

test("삭제 권한이 없는 설정 관리자는 지점 삭제 버튼을 볼 수 없다", async ({
  page,
}) => {
  await seedDeleteFixtures();

  try {
    await login(page, "hq@example.com");
    await page.goto("/app/master-data/stores");

    const row = storeRow(page, EMPTY_STORE_NAME);

    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "수정" })).toBeVisible();
    await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(0);
  } finally {
    await cleanupDeleteFixtures();
  }
});

// 대표 권한 묶음(급여·개인정보 조회 포함) 없이 삭제만 받은 계정도 지울 수 있어야 한다.
// 운영의 `dowon` 계정과 같은 모양이다.
test("대표가 아니어도 삭제 권한을 받은 설정 관리자는 지점을 삭제한다", async ({
  page,
}) => {
  await seedDeleteFixtures();

  try {
    await login(page, "settings-admin@example.com");
    await page.goto("/app/master-data/stores");

    const dialog = await confirmStoreDelete(page, EMPTY_STORE_NAME);

    await expect(dialog).toBeHidden();
    await expect(storeRow(page, EMPTY_STORE_NAME)).toHaveCount(0);
    expect(await prisma.store.count({ where: { id: EMPTY_STORE_ID } })).toBe(0);
  } finally {
    await cleanupDeleteFixtures();
  }
});
