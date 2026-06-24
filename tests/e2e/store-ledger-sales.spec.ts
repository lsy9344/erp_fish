import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import {
  PrismaClient,
  type DailyLedgerStatus,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "store-gangnam";

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

// 앱은 영업일을 "YYYY년 M월 D일 요일" (Asia/Seoul) 형식으로 렌더링한다.
function getKstDateLabel(dateParam = SELECTED_LEDGER_DATE) {
  const [year, month, day] = dateParam.split("-").map((part) => Number(part));
  const date = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12, 0, 0),
  );

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

const LOGIN_TIMEOUT_MS = 15_000;
const MAX_LOGIN_DIAGNOSTIC_EVENTS = 8;

type LoginDiagnostics = {
  authResponses: string[];
  failedRequests: string[];
  consoleMessages: string[];
};

test.beforeEach(async () => {
  await cleanupSelectedLedger();
});

test.afterAll(async () => {
  await cleanupSelectedLedger();
  await prisma.$disconnect();
});

async function cleanupSelectedLedger() {
  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID, closingDate },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      targetType: "DailyLedger",
      targetId: { in: ledgerIds },
    },
  });
  await prisma.dailyLedger.deleteMany({
    where: { id: { in: ledgerIds } },
  });
}

function formatUrlForDiagnostic(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function shouldCaptureLoginFlowUrl(value: string) {
  try {
    const { pathname } = new URL(value);

    return (
      pathname === "/login" ||
      pathname === "/app" ||
      pathname.startsWith("/app/store-entry") ||
      pathname.startsWith("/api/auth/") ||
      pathname.startsWith("/_next/action")
    );
  } catch {
    return false;
  }
}

function rememberDiagnosticEvent(events: string[], event: string) {
  events.push(event);

  if (events.length > MAX_LOGIN_DIAGNOSTIC_EVENTS) {
    events.shift();
  }
}

function captureLoginDiagnostics(page: Page) {
  const diagnostics: LoginDiagnostics = {
    authResponses: [],
    failedRequests: [],
    consoleMessages: [],
  };

  const onResponse = (response: Response) => {
    if (!shouldCaptureLoginFlowUrl(response.url())) {
      return;
    }

    rememberDiagnosticEvent(
      diagnostics.authResponses,
      `${response.status()} ${response.request().method()} ${formatUrlForDiagnostic(response.url())}`,
    );
  };
  const onRequestFailed = (request: Request) => {
    if (!shouldCaptureLoginFlowUrl(request.url())) {
      return;
    }

    rememberDiagnosticEvent(
      diagnostics.failedRequests,
      `${request.method()} ${formatUrlForDiagnostic(request.url())} ${
        request.failure()?.errorText ?? "unknown failure"
      }`,
    );
  };
  const onConsole = (message: ConsoleMessage) => {
    if (!["error", "warning"].includes(message.type())) {
      return;
    }

    rememberDiagnosticEvent(
      diagnostics.consoleMessages,
      `${message.type()}: ${message.text()}`,
    );
  };

  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("console", onConsole);

  return {
    diagnostics,
    stop() {
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      page.off("console", onConsole);
    },
  };
}

async function getLoginAlertText(page: Page) {
  const loginError = page.locator("#login-error");

  if (await loginError.isVisible({ timeout: 100 }).catch(() => false)) {
    return (await loginError.textContent({ timeout: 100 }))?.trim() ?? "";
  }

  const alertTexts = await page
    .getByRole("alert")
    .allInnerTexts()
    .catch(() => []);
  return alertTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join(" | ");
}

function hasHttpError(events: string[]) {
  return events.some((event) => /^(4|5)\d\d\s/.test(event));
}

async function buildLoginFailureMessage(
  page: Page,
  diagnostics: LoginDiagnostics,
  cause: "login-alert" | "timeout",
) {
  const alertText = await getLoginAlertText(page);
  const emailDisabled = await page
    .getByLabel("이메일")
    .isDisabled()
    .catch(() => null);
  const passwordDisabled = await page
    .getByLabel("비밀번호")
    .isDisabled()
    .catch(() => null);
  const buttonDisabled = await page
    .getByRole("button", { name: "로그인" })
    .isDisabled()
    .catch(() => null);
  const pendingControls =
    emailDisabled === true ||
    passwordDisabled === true ||
    buttonDisabled === true;
  const reason = alertText
    ? "login-alert"
    : pendingControls
      ? "login-pending"
      : diagnostics.failedRequests.length > 0
        ? "request-failed"
        : hasHttpError(diagnostics.authResponses)
          ? "auth-error"
          : cause === "timeout"
            ? "redirect-timeout"
            : cause;

  return [
    `Store manager login failed (${reason}).`,
    `URL: ${page.url()}`,
    `Login alert: ${alertText ? alertText : "(none)"}`,
    `Controls disabled: email=${String(emailDisabled)}, password=${String(
      passwordDisabled,
    )}, button=${String(buttonDisabled)}`,
    diagnostics.authResponses.length > 0
      ? `Auth/navigation responses:\n- ${diagnostics.authResponses.join("\n- ")}`
      : "Auth/navigation responses: (none captured)",
    diagnostics.failedRequests.length > 0
      ? `Failed requests:\n- ${diagnostics.failedRequests.join("\n- ")}`
      : "Failed requests: (none captured)",
    diagnostics.consoleMessages.length > 0
      ? `Console warnings/errors:\n- ${diagnostics.consoleMessages.join("\n- ")}`
      : "Console warnings/errors: (none captured)",
  ].join("\n");
}

async function waitForStoreManagerLogin(
  page: Page,
  diagnostics: LoginDiagnostics,
) {
  try {
    await page.waitForURL(/\/app\/store-entry/, {
      timeout: LOGIN_TIMEOUT_MS,
    });
    return;
  } catch {
    if (page.url().includes("/app/store-entry")) {
      return;
    }
  }

  const cause = (await getLoginAlertText(page)) ? "login-alert" : "timeout";
  throw new Error(await buildLoginFailureMessage(page, diagnostics, cause));
}

async function loginAsStoreManager(page: Page) {
  const loginDiagnostics = captureLoginDiagnostics(page);

  try {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("manager@example.com");
    await page.getByLabel("비밀번호").fill("correct-password");
    await page.getByRole("button", { name: "로그인" }).click();

    await waitForStoreManagerLogin(page, loginDiagnostics.diagnostics);
  } finally {
    loginDiagnostics.stop();
  }
}

async function getManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function seedSelectedLedger(status: DailyLedgerStatus = "IN_PROGRESS") {
  const actorId = await getManagerUserId();
  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);

  return prisma.dailyLedger.create({
    data: {
      storeId: STORE_ID,
      closingDate,
      status,
      totalSalesAmount: 41000,
      cashAmount: 12000,
      cardAmount: 28000,
      otherPaymentAmount: 1000,
      workerCount: 2,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

test("지점장은 오늘 장부에서 매출/결제 단계를 본다", async ({ page }) => {
  await loginAsStoreManager(page);

  await expect(page.getByText("오늘 장부", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "강남점" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "1단계: 매출/결제" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("상태 입력 중")).toBeVisible();
  await expect(page.getByLabel("영업일")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "현금", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "카드", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ).toBeVisible();
});

test("지점장은 선택 날짜 장부를 열고 재방문 시 같은 장부를 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await expect(page.getByText(getKstDateLabel())).toBeVisible();
  await expect(page.getByText("상태 입력 중")).toBeVisible();

  // 작성자 표시명은 1단계 첫 저장 시 필수다.
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("22222");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("12000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("10000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("222");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);
  const ledgerCount = await prisma.dailyLedger.count({
    where: { storeId: STORE_ID, closingDate },
  });
  expect(ledgerCount).toBe(1);

  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toHaveValue("22,222");

  await page.goto(
    `/app/store-entry/inventory?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toHaveAttribute("href", new RegExp(`date=${SELECTED_LEDGER_DATE}`));
});

test("작성자 표시명은 저장 후 2~7단계와 재방문에서도 유지되고 audit actor와 분리된다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("  현장 김팀장  ");
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("45678");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("12000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("30000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("3678");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByLabel("장부 저장 상태").getByText("작성자 표시명: 현장 김팀장"),
  ).toBeVisible();

  const closingDate = new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`);
  const ledger = await prisma.dailyLedger.findUniqueOrThrow({
    where: {
      storeId_closingDate: {
        storeId: STORE_ID,
        closingDate,
      },
    },
    select: { id: true, authorDisplayName: true },
  });
  expect(ledger.authorDisplayName).toBe("현장 김팀장");

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.sales_payment.updated",
    },
    orderBy: { createdAt: "desc" },
  });
  const managerUserId = await getManagerUserId();
  expect(auditLog?.actorId).toBe(managerUserId);
  expect(auditLog?.actorId).not.toBe("현장 김팀장");
  expect(auditLog?.after).toMatchObject({
    authorDisplayName: "현장 김팀장",
  });

  for (const href of [
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=cost`,
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=purchase`,
    `/app/store-entry/inventory?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
    `/app/store-entry/losses?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=work`,
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}&step=review`,
  ]) {
    await page.goto(href);
    await expect(
      page.getByText("작성자 표시명: 현장 김팀장").first(),
    ).toBeVisible();
    await expect(page.getByText("마지막 저장:").first()).toBeVisible();
  }

  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(
    page.getByRole("textbox", { name: "작성자 표시명", exact: true }),
  ).toHaveValue("현장 김팀장");
});

test("미저장 변경 상태에서 단계 이동 전 저장, 취소, 계속 편집을 선택한다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("미저장 작성자");
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("77777");

  await page.getByRole("link", { name: /2단계: 비용/ }).click();
  await expect(
    page.getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(page).toHaveURL(/step=sales|\/app\/store-entry\?/);
  await expect(
    page.getByRole("textbox", { name: "작성자 표시명", exact: true }),
  ).toHaveValue("미저장 작성자");

  await page.getByRole("link", { name: /2단계: 비용/ }).click();
  await page
    .getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })
    .getByRole("button", { name: "변경 버리고 이동" })
    .click();
  await expect(page).toHaveURL(/step=cost/);

  const discardedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: {
      storeId_closingDate: {
        storeId: STORE_ID,
        closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
      },
    },
    select: { authorDisplayName: true, totalSalesAmount: true },
  });
  expect(discardedLedger.authorDisplayName).toBeNull();
  expect(discardedLedger.totalSalesAmount).toBe(0);

  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );
  await expect(
    page.getByRole("textbox", { name: "작성자 표시명", exact: true }),
  ).toHaveValue("");

  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("미저장 작성자");
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("77777");

  await page.getByRole("link", { name: /2단계: 비용/ }).click();
  await page
    .getByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })
    .getByRole("button", { name: "저장" })
    .click();
  await expect(page).toHaveURL(/step=cost/);

  const ledger = await prisma.dailyLedger.findUniqueOrThrow({
    where: {
      storeId_closingDate: {
        storeId: STORE_ID,
        closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
      },
    },
    select: { authorDisplayName: true, totalSalesAmount: true },
  });
  expect(ledger.authorDisplayName).toBe("미저장 작성자");
  expect(ledger.totalSalesAmount).toBe(77777);
});

test("지점장은 stale version 저장 충돌 시 저장 충돌 dialog를 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByLabel("영업일")).toHaveValue(SELECTED_LEDGER_DATE);
  await prisma.dailyLedger.updateMany({
    where: {
      storeId: STORE_ID,
      closingDate: new Date(`${SELECTED_LEDGER_DATE}T00:00:00.000Z`),
    },
    data: { version: { increment: 1 } },
  });

  // 작성자 표시명은 1단계 첫 저장 시 필수다.
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await page
    .getByRole("textbox", { name: "총매출", exact: true })
    .fill("33333");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("13000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("20000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("333");
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
  await expect(
    conflictDialog.getByRole("button", { name: "계속 편집" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("장부 저장 상태").getByRole("alert"),
  ).toBeVisible();
});

test("지점장은 매출/결제 금액을 저장하고 재방문 시 유지된다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });
  const cash = page.getByRole("textbox", { name: "현금", exact: true });
  const card = page.getByRole("textbox", { name: "카드", exact: true });
  const other = page.getByRole("textbox", {
    name: "기타 결제수단",
    exact: true,
  });
  const save = page.getByRole("button", { name: "저장" });

  // 작성자 표시명은 1단계 첫 저장 시 필수다.
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await total.fill("10000");
  await cash.fill("3000");
  await card.fill("2000");
  await other.fill("1000");

  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();
  await save.click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.reload();
  await expect(total).toHaveValue("10,000");
  await expect(cash).toHaveValue("3,000");
  await expect(card).toHaveValue("2,000");
  await expect(other).toHaveValue("1,000");
  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();

  await cash.fill("12,000");
  await expect(page.getByText(/결제 합계 차액.*-5,000원/)).toBeVisible();
  await expect(save).toBeVisible();

  await page.goto("/app/store-entry/inventory?storeId=store-gangnam");
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toBeVisible();

  await page.goto("/app/store-entry/losses?storeId=store-gangnam");
  await expect(
    page.getByRole("link", { name: /1단계: 매출\/결제.*저장됨/ }),
  ).toBeVisible();
});

test("지점장은 0 뒤에 금액을 입력해도 원 단위 천 단위 형식으로 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });

  await total.fill("05000");

  await expect(total).toHaveValue("5,000");
  await expect(page.getByText("표시: 5,000원")).toBeVisible();
});

test("지점장은 본사 마감 장부에서 원본 매출/결제 입력을 수정할 수 없다", async ({
  page,
}) => {
  await seedSelectedLedger("HEADQUARTERS_CLOSED");
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  await expect(page.getByText("상태 본사 마감")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "현금", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "카드", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "작성자 표시명", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("지점장은 권한 없는 지점 URL로 이동하면 권한 없음 화면만 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  await page.goto("/app/store-entry?storeId=store-hongdae");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  await expect(page.getByText("홍대점")).toHaveCount(0);
});

test("매출/결제 단계는 필수 금액 오류를 입력과 연결하고 첫 오류로 포커스한다", async ({
  page,
}) => {
  await loginAsStoreManager(page);
  await page.goto(
    `/app/store-entry?storeId=${STORE_ID}&date=${SELECTED_LEDGER_DATE}`,
  );

  const totalSalesInput = page.getByRole("textbox", {
    name: "총매출",
    exact: true,
  });

  // 작성자 표시명을 채워 총매출 오류만 남도록 한다(첫 오류 포커스 검증 목적).
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await totalSalesInput.fill("");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "입력값을 확인해 주세요." }),
  ).toBeVisible();
  await expect(
    page.getByText("총매출은 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(totalSalesInput).toBeFocused();
  await expect(totalSalesInput).toHaveAttribute("aria-invalid", "true");
  await expect(totalSalesInput).toHaveAttribute(
    "aria-describedby",
    "total-sales-amount-error",
  );
  await expect(page.locator("#total-sales-amount-error")).toContainText(
    "총매출은 0원 이상의 정수여야 합니다.",
  );
});

test("390px에서 매출/결제 키패드 입력성과 터치 타깃이 충족된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsStoreManager(page);

  const numericInputs = [
    page.getByRole("textbox", { name: "총매출", exact: true }),
    page.getByRole("textbox", { name: "현금", exact: true }),
    page.getByRole("textbox", { name: "카드", exact: true }),
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ];

  for (const input of numericInputs) {
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
    await expect(input).toHaveAttribute("inputmode", "numeric");
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  const submit = page.getByRole("button", { name: "저장" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
  const submitBox = await submit.boundingBox();
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);
  expect(submitBox?.width).toBeGreaterThanOrEqual(44);

  // 작성자 표시명은 1단계 첫 저장 시 필수다.
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await page.getByRole("textbox", { name: "총매출", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("0");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("0");
  await submit.click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  const nextStep = page.getByRole("button", { name: "다음 단계로 →" });
  await expect(nextStep).toBeVisible();
  await expect(nextStep).toBeEnabled();
  const nextStepBox = await nextStep.boundingBox();
  expect(nextStepBox?.height).toBeGreaterThanOrEqual(44);
  expect(nextStepBox?.width).toBeGreaterThanOrEqual(44);

  const authorInput = page.getByRole("textbox", {
    name: "작성자 표시명",
    exact: true,
  });
  await expect(authorInput).toBeVisible();
  const authorInputBox = await authorInput.boundingBox();
  expect(authorInputBox?.height).toBeGreaterThanOrEqual(44);
  expect(authorInputBox?.width).toBeGreaterThanOrEqual(44);

  const dateInput = page.getByLabel("영업일");
  await expect(dateInput).toBeVisible();
  const dateInputBox = await dateInput.boundingBox();
  expect(dateInputBox?.height).toBeGreaterThanOrEqual(36);
  expect(dateInputBox?.width).toBeGreaterThanOrEqual(120);
  await expect(page.getByText("상태 입력 중")).toBeVisible();
  await expect(page.getByText("작성자 표시명:").first()).toBeVisible();
  await expect(page.getByText("마지막 저장:").first()).toBeVisible();

  const viewportWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );

  for (const step of [
    {
      name: /1단계: 매출\/결제/,
      href: /\/app\/store-entry\?storeId=store-gangnam&date=\d{4}-\d{2}-\d{2}&step=sales/,
    },
    {
      name: /4단계: 재고/,
      href: /\/app\/store-entry\/inventory\?storeId=store-gangnam&date=\d{4}-\d{2}-\d{2}/,
    },
    {
      name: /5단계: 손실\/폐기/,
      href: /\/app\/store-entry\/losses\?storeId=store-gangnam&date=\d{4}-\d{2}-\d{2}/,
    },
  ]) {
    const link = page.getByRole("link", { name: step.name }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", step.href);
    const linkBox = await link.boundingBox();
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
  }
});

test("저장 실패 시 한국어 오류와 재시도 동작이 표시된다", async ({ page }) => {
  await loginAsStoreManager(page);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const nextAction = request.headers()["next-action"];

    if (
      request.method() === "POST" &&
      (request.url().includes("/app/store-entry") ||
        request.url().includes("/_next/action") ||
        Boolean(nextAction))
    ) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  // 작성자 표시명은 1단계 첫 저장 시 필수다.
  await page
    .getByRole("textbox", { name: "작성자 표시명", exact: true })
    .fill("현장 김팀장");
  await page.getByRole("textbox", { name: "총매출", exact: true }).fill("3000");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("1000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("500");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "저장에 실패했습니다. 다시 시도해 주세요." }),
  ).toBeVisible();
  const retryButton = page
    .getByLabel("장부 저장 상태")
    .getByRole("button", { name: "다시 시도" });
  await expect(retryButton).toBeVisible();

  await page.unroute("**/*");
  await retryButton.click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
});
