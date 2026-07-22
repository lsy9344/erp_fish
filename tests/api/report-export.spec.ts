import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { test } from "@seontechnologies/playwright-utils/api-request/fixtures";
import {
  PermissionAction,
  PrismaClient,
  StoreAccessMode,
} from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const PASSWORD = "correct-password";
const API_EXPORT_PROFILE_CODE = "API_EXPORT_ASSIGNED";
const CSV_ESCAPE_STORE_ID = "store-api-export-csv-escaping";
const CSV_ESCAPE_STORE_NAME = '=SUM(1,1), "quoted"';
const THIRTY_PERCENT_EXPORT_PATTERN =
  /30[%_-]?단가|thirty[_-]?percent|thirty[_-]?percent[_-]?unit[_-]?price|price[_-]?30|margin[_-]?30/i;
const SENSITIVE_RESPONSE_PATTERN =
  /grossProfit|grossMarginRate|operatingProfit|productivity|inventoryAmount|salesDifference|unitPrice|beforeAmount|afterAmount|differenceAmount|lot|fixedCost|unauthorized-store|store-gangnam/i;

type ForbiddenPayload = {
  error: "forbidden";
  message: "export 권한이 없습니다.";
};

type BadRequestPayload = {
  error: "bad_request";
  message: string;
};

const DAILY_HEADER = [
  "지점",
  "장부 상태",
  "영업 상태",
  "최신 반영",
  "상태 메시지",
  "장부 마감 매출",
  "이월 매출",
  "영업 매출 합계",
  "매출 상태",
  "이익률",
  "이익률 상태",
  "매출 차이",
  "매출 차이 상태",
  "손실 상태",
  "이상 신호",
];

const COMPARISON_HEADER = [
  "지점",
  "본사 마감 일수",
  "미마감 일수",
  "미입력 일수",
  "장부 마감 매출",
  "이월 매출",
  "영업 매출 합계",
  "매출 상태",
  "매출이익",
  "매출이익 상태",
  "이익률",
  "이익률 상태",
  "영업이익",
  "영업이익 상태",
  "인당생산성",
  "인당생산성 상태",
  "손실 상태",
];

const MONTHLY_HEADER = ["구분", "항목", "일자", "지점", "값", "상태", "사유"];

const INVENTORY_HEADER = [
  "지점",
  "품목",
  "분류",
  "규격",
  "전일재고",
  "매입",
  "손실",
  "남은 재고",
  "전산 재고",
  "당일 판매량",
  "재고 금액",
  "상태",
];

/*
 * Provider Contract Evidence:
 * - Route handler: src/app/api/reports/export/route.ts
 * - Auth boundary: requireExportCreateAccess() in src/server/authz.ts
 * - Data loaders: getHqDailyMeetingReport(), getHqStoreComparisonReport(), getHqMonthlyClosingAnomalyReport() in src/features/reports/queries.ts
 * - CSV and forbidden payload construction: src/features/reports/export.ts
 * - Sensitive response shaping helper: src/server/sensitive-fields.ts
 * - Status codes observed in source: 200 CSV, 400 JSON bad_request, 403 JSON forbidden
 * - Response headers observed in source: text/csv attachment + no-store on success; application/json + no-store on forbidden
 */

test.describe("Report export API", () => {
  test.beforeEach(async () => {
    await cleanupApiExportArtifacts();
    await seedCsvEscapingStore();
  });

  test.afterAll(async () => {
    await cleanupApiExportArtifacts();
    await prisma.$disconnect();
  });

  test("[P0] rejects invalid export queries before CSV or audit creation", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const cases: Array<{
      name: string;
      params: Record<string, string>;
      message: string;
    }> = [
      {
        // WO-15(2026-06-28): xlsx는 이제 허용된다. 지원하지 않는 포맷은 pdf 등.
        name: "unsupported format",
        params: { report: "daily", date: getTodayKstInput(), format: "pdf" },
        message: "지원하지 않는 export 형식입니다.",
      },
      {
        name: "unsupported report",
        params: { report: "ledger", date: getTodayKstInput(), format: "csv" },
        message: "지원하지 않는 리포트입니다.",
      },
      {
        name: "invalid daily date",
        params: { report: "daily", date: "2026-02-30", format: "csv" },
        message: "조회 날짜를 확인해 주세요.",
      },
      {
        name: "comparison start after end",
        params: {
          report: "comparison",
          startDate: "2026-06-15",
          endDate: "2026-06-01",
          format: "csv",
        },
        message: "조회 기간을 확인해 주세요.",
      },
      {
        name: "invalid monthly month",
        params: { report: "monthly", month: "2026-13", format: "csv" },
        message: "조회 월을 확인해 주세요.",
      },
      {
        name: "invalid inventory date",
        params: { report: "inventory", date: "2026-02-30", format: "csv" },
        message: "조회 날짜를 확인해 주세요.",
      },
    ];

    for (const input of cases) {
      const response = await request.get(exportPath(input.params));
      const body = (await response.json()) as BadRequestPayload;

      expect(response.status(), input.name).toBe(400);
      expect(
        response.headers()["content-disposition"],
        input.name,
      ).toBeUndefined();
      expect(response.headers()["content-type"], input.name).toContain(
        "application/json",
      );
      expect(body, input.name).toEqual({
        error: "bad_request",
        message: input.message,
      });
      expect(JSON.stringify(body), input.name).not.toMatch(
        SENSITIVE_RESPONSE_PATTERN,
      );
      expect(JSON.stringify(body), input.name).not.toMatch(
        THIRTY_PERCENT_EXPORT_PATTERN,
      );
    }

    await expectNoReportExportAudit();
  });

  test("[P0] returns a safe forbidden payload for unauthenticated API requests", async ({
    request,
  }) => {
    const response = await request.get(
      exportPath({
        report: "daily",
        date: getTodayKstInput(),
        format: "csv",
      }),
    );
    const body = (await response.json()) as ForbiddenPayload;

    expect(response.status()).toBe(403);
    expect(body).toEqual({
      error: "forbidden",
      message: "export 권한이 없습니다.",
    });
    assertSafeForbiddenBody(body);
    await expectNoReportExportAudit();
  });

  test("[P0] keeps forbidden responses safe for users without EXPORT_CREATE", async ({
    request,
  }) => {
    for (const email of ["hq-viewer@example.com", "manager@example.com"]) {
      await signInForApi(request, email);
      const response = await request.get(
        exportPath({
          report: "monthly",
          month: getCurrentMonthInput(),
          storeId: "store-gangnam",
          format: "csv",
        }),
      );
      const body = (await response.json()) as ForbiddenPayload;

      expect(response.status(), email).toBe(403);
      expect(response.headers()["content-disposition"], email).toBeUndefined();
      expect(response.headers()["cache-control"], email).toBe("no-store");
      expect(body, email).toEqual({
        error: "forbidden",
        message: "export 권한이 없습니다.",
      });
      assertSafeForbiddenBody(body);
    }

    await expectNoReportExportAudit();
  });

  test("[P0] blocks requested store ids outside the resolved report scope", async ({
    request,
  }) => {
    await seedAssignedExporterProfile();
    await signInForApi(request, "hq-assigned@example.com");

    const response = await request.get(
      exportPath({
        report: "comparison",
        startDate: "2026-06-01",
        endDate: getTodayKstInput(),
        storeId: "store-gangnam",
        format: "csv",
      }),
    );
    const body = (await response.json()) as ForbiddenPayload;

    expect(response.status()).toBe(403);
    expect(response.headers()["content-disposition"]).toBeUndefined();
    expect(body).toEqual({
      error: "forbidden",
      message: "export 권한이 없습니다.",
    });
    assertSafeForbiddenBody(body);
    await expectNoReportExportAudit();
  });

  test("[P0] exports daily CSV with only allowlisted columns and no raw sensitive keys", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({ report: "daily", date: getTodayKstInput(), format: "csv" }),
    );
    const csv = await expectCsvResponse(
      response,
      /^erp-fish-report-daily-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsvLine(firstCsvLine(csv))).toEqual(DAILY_HEADER);
    assertCsvDoesNotExposeRawSensitiveKeys(csv);
  });

  test("[P0] exports comparison CSV with only allowlisted columns and no raw sensitive keys", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({
        report: "comparison",
        startDate: "2026-06-01",
        endDate: getTodayKstInput(),
        format: "csv",
      }),
    );
    const csv = await expectCsvResponse(
      response,
      /^erp-fish-report-comparison-2026-06-01-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    expect(parseCsvLine(firstCsvLine(csv))).toEqual(COMPARISON_HEADER);
    assertCsvDoesNotExposeRawSensitiveKeys(csv);
  });

  test("[P0] exports monthly CSV with only allowlisted columns and no raw sensitive keys", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({
        report: "monthly",
        month: getCurrentMonthInput(),
        storeId: "store-gangnam",
        format: "csv",
      }),
    );
    const csv = await expectCsvResponse(
      response,
      new RegExp(`^erp-fish-report-monthly-${getCurrentMonthInput()}\\.csv$`),
    );

    expect(parseCsvLine(firstCsvLine(csv))).toEqual(MONTHLY_HEADER);
    assertCsvDoesNotExposeRawSensitiveKeys(csv);
  });

  test("[P0] exports inventory CSV with only allowlisted columns and no raw sensitive keys", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({
        report: "inventory",
        date: getTodayKstInput(),
        format: "csv",
      }),
    );
    const csv = await expectCsvResponse(
      response,
      /^erp-fish-report-inventory-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsvLine(firstCsvLine(csv))).toEqual(INVENTORY_HEADER);
    // 장부 없는 시드 지점은 0이 아니라 "미입력"으로 노출된다.
    expect(csv).toContain("미입력");
    // CSV 인젝션 방지: 시드 지점명(=SUM...)이 이스케이프된다.
    expect(csv).toContain('"\'=SUM(1,1), ""quoted"""');
    assertCsvDoesNotExposeRawSensitiveKeys(csv);

    const auditLogs = await prisma.auditLog.findMany({
      where: { targetType: "ReportExport" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.action).toBe("report.export.created");
    expect(auditLogs[0]?.targetId).toMatch(/^inventory:/);
  });

  test("[P1] preserves attachment headers, BOM, CSV escaping, and audit creation on success", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({ report: "daily", date: getTodayKstInput(), format: "csv" }),
    );
    const csv = await expectCsvResponse(
      response,
      /^erp-fish-report-daily-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=SUM(1,1), ""quoted"""');

    const auditLogs = await prisma.auditLog.findMany({
      where: { targetType: "ReportExport" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.action).toBe("report.export.created");
    expect(auditLogs[0]?.targetId).toMatch(/^daily:/);
  });

  // WO-15(2026-06-28): xlsx 다운로드. 포맷별 Content-Type/파일명/감사 로그 format을 검증한다.
  test("[P1] exports xlsx with the spreadsheet content type, filename, and audit format", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({ report: "daily", date: getTodayKstInput(), format: "xlsx" }),
    );

    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["content-disposition"]).toContain("attachment");
    const filename =
      headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1];
    expect(filename).toMatch(/^erp-fish-report-daily-\d{4}-\d{2}-\d{2}\.xlsx$/);

    // xlsx는 ZIP 컨테이너라 "PK" 매직 바이트로 시작한다.
    const body = await response.body();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toBe(0x50); // 'P'
    expect(body[1]).toBe(0x4b); // 'K'

    const auditLogs = await prisma.auditLog.findMany({
      where: { targetType: "ReportExport" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLogs).toHaveLength(1);
    const after = auditLogs[0]?.after as { format?: string } | null;
    expect(after?.format).toBe("xlsx");
  });

  // WO-15(2026-06-28) part2: 월별 리포트 xlsx에는 "월별손익" 시트가 함께 들어간다.
  test("[P1] monthly xlsx includes the 월별손익 sheet with P&L columns", async ({
    request,
  }) => {
    await signInForApi(request, "hq@example.com");

    const response = await request.get(
      exportPath({
        report: "monthly",
        month: getCurrentMonthInput(),
        format: "xlsx",
      }),
    );
    expect(response.status()).toBe(200);

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const bytes = new Uint8Array(await response.body());
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    await workbook.xlsx.load(arrayBuffer);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toContain("월별손익");

    const pnl = workbook.getWorksheet("월별손익");
    const header = pnl?.getRow(1).values as unknown[];
    const headerLabels = header.filter((v) => typeof v === "string");
    for (const label of [
      "영업 매출 합계",
      "매입원가",
      "인건비",
      "본사조정",
      "남은금액",
    ]) {
      expect(headerLabels).toContain(label);
    }

    // 품목매출 시트는 월 마지막 날 대표값이 아니라 기간 합산이므로 조회 시작/종료일과
    // 지점, 확정 컬럼(원가/이익/손실/재고)을 모두 가진다.
    const productSales = workbook.getWorksheet("품목매출");
    expect(productSales).toBeTruthy();
    const productSalesHeader = productSales?.getRow(1).values as unknown[];
    const productSalesLabels = productSalesHeader.filter(
      (value) => typeof value === "string",
    );
    for (const label of [
      "조회 시작일",
      "조회 종료일",
      "지점",
      "품목명",
      "규격",
      "품목구분",
      "냉동/생물",
      "추정판매수량",
      "추정매출",
      "추정매입원가",
      "추정매출이익",
      "추정이익률",
      "손실수량",
      "손실금액",
      "재고수량",
    ]) {
      expect(productSalesLabels).toContain(label);
    }
  });
});

async function signInForApi(request: APIRequestContext, email: string) {
  const csrfResponse = await request.get("/api/auth/csrf");
  expect(csrfResponse.status()).toBe(200);
  const csrf = (await csrfResponse.json()) as { csrfToken: string };

  const response = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      redirect: "false",
      callbackUrl: "/app",
      json: "true",
    },
  });

  expect([200, 302]).toContain(response.status());
}

function exportPath(params: Record<string, string>) {
  return `/api/reports/export?${new URLSearchParams(params).toString()}`;
}

async function expectCsvResponse(
  response: APIResponse,
  filenamePattern: RegExp,
) {
  const headers = response.headers();
  const csv = await response.text();

  expect(response.status()).toBe(200);
  expect(headers["content-type"]).toContain("text/csv");
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["content-disposition"]).toContain("attachment");

  const filename =
    headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1];
  expect(filename).toBeDefined();
  expect(filename).toMatch(filenamePattern);

  return csv;
}

function firstCsvLine(csv: string) {
  return csv.replace(/^\uFEFF/, "").split("\r\n")[0] ?? "";
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);

    if (char === '"') {
      if (inQuotes && line.charAt(index + 1) === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);

  return values;
}

function assertSafeForbiddenBody(body: ForbiddenPayload) {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(SENSITIVE_RESPONSE_PATTERN);
  expect(serialized).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);
  expect(serialized).not.toContain("store-gangnam");
  expect(serialized).not.toContain("store-seocho");
}

function assertCsvDoesNotExposeRawSensitiveKeys(csv: string) {
  expect(csv).not.toContain("inventoryAmount");
  expect(csv).not.toContain("unitPrice");
  expect(csv).not.toContain("beforeAmount");
  expect(csv).not.toContain("afterAmount");
  expect(csv).not.toContain("differenceAmount");
  expect(csv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);
}

function getTodayKstMidnight(inputDate = new Date()) {
  const [yearText, monthText, dayText] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  if (!yearText || !monthText || !dayText) {
    throw new Error("Unable to format KST date input.");
  }

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

function getTodayKstInput() {
  return getTodayKstMidnight().toISOString().slice(0, 10);
}

function getCurrentMonthInput() {
  return getTodayKstInput().slice(0, 7);
}

async function seedCsvEscapingStore() {
  const actor = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(actor?.id).toBeTruthy();

  await prisma.store.upsert({
    where: { id: CSV_ESCAPE_STORE_ID },
    create: {
      id: CSV_ESCAPE_STORE_ID,
      name: CSV_ESCAPE_STORE_NAME,
      isActive: true,
      updatedById: actor!.id,
    },
    update: {
      name: CSV_ESCAPE_STORE_NAME,
      isActive: true,
      updatedById: actor!.id,
    },
  });
}

async function seedAssignedExporterProfile() {
  const user = await prisma.user.findUnique({
    where: { email: "hq-assigned@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  const profile = await prisma.permissionProfile.upsert({
    where: { code: API_EXPORT_PROFILE_CODE },
    create: {
      code: API_EXPORT_PROFILE_CODE,
      name: "API export assigned scope",
      isSystem: false,
      isActive: true,
      storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    },
    update: {
      name: "API export assigned scope",
      isActive: true,
      storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    },
    select: { id: true },
  });

  for (const action of [
    PermissionAction.REPORT_VIEW,
    PermissionAction.EXPORT_CREATE,
  ]) {
    await prisma.permissionProfileAction.upsert({
      where: { profileId_action: { profileId: profile.id, action } },
      create: { profileId: profile.id, action },
      update: {},
    });
  }

  await prisma.userPermissionProfile.upsert({
    where: { userId_profileId: { userId: user!.id, profileId: profile.id } },
    create: { userId: user!.id, profileId: profile.id },
    update: {},
  });
}

async function expectNoReportExportAudit() {
  await expect(
    prisma.auditLog.count({ where: { targetType: "ReportExport" } }),
  ).resolves.toBe(0);
}

async function cleanupApiExportArtifacts() {
  const profile = await prisma.permissionProfile.findUnique({
    where: { code: API_EXPORT_PROFILE_CODE },
    select: { id: true },
  });

  await prisma.auditLog.deleteMany({ where: { targetType: "ReportExport" } });
  await prisma.store.deleteMany({ where: { id: CSV_ESCAPE_STORE_ID } });

  if (profile) {
    await prisma.userPermissionProfile.deleteMany({
      where: { profileId: profile.id },
    });
    await prisma.permissionProfileAction.deleteMany({
      where: { profileId: profile.id },
    });
    await prisma.permissionProfile.delete({ where: { id: profile.id } });
  }
}
