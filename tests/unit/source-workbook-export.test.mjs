import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { buildBundledReportXlsx } from "../../src/features/reports/export.ts";

import {
  SOURCE_WORKBOOK_HEADERS,
  buildSourceWorkbookSheet,
  buildSourceWorkbookPersonnelSheet,
  getSourceWorkbookTrendDateRanges,
} from "../../src/features/reports/source-workbook-export.ts";

test("source workbook uses the customer's 23 input columns", () => {
  assert.deepEqual(
    [...SOURCE_WORKBOOK_HEADERS],
    [
      "일자",
      "요일",
      "매장",
      "매출",
      "매출이익",
      "마진율",
      "영업이익",
      "인당생산성",
      "근무인원",
      "팀장",
      "팀장",
      ...Array.from({ length: 11 }, () => "팀원"),
      "매출차액",
    ],
  );
  assert.equal(SOURCE_WORKBOOK_HEADERS.length, 23);
});

test("downloaded input cells keep real blanks, numeric rates, and cached errors", async () => {
  const source = buildSourceWorkbookSheet({
    historicalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-06-01",
        rawCells: {
          values: [
            "2026-06-01",
            "월",
            "강서수산",
            1000,
            300,
            0.3,
            { error: "#REF!" },
            500,
            2,
          ],
        },
        roles: [],
      },
    ],
    operationalFacts: [],
  });
  const bytes = await buildBundledReportXlsx([source]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("입력");
  assert.ok(sheet.getCell("A2").value instanceof Date);
  assert.equal(sheet.getCell("D2").value, 1000);
  assert.equal(sheet.getCell("F2").value, 0.3);
  assert.equal(sheet.getCell("F2").numFmt, "0.0%");
  assert.deepEqual(sheet.getCell("G2").value, { error: "#REF!" });
  assert.equal(sheet.getCell("L2").value, null);
  assert.equal(sheet.getCell("W2").value, null);
});

test("operational facts take date precedence and historical cached cells stay intact", () => {
  const sheet = buildSourceWorkbookSheet({
    historicalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-06-01",
        rawCells: {
          values: [
            { kind: "date", iso: "2026-06-01T00:00:00.000Z" },
            "월",
            "0",
            { formula: "1+1", result: 3927400 },
            { error: "#REF!" },
            null,
            { formula: "7+8", result: 15 },
            100,
            2,
            "과거팀장",
            null,
            "과거팀원",
            ...Array.from({ length: 10 }, () => null),
            null,
          ],
        },
        roles: [
          { role: "LEAD", slotNumber: 1, originalName: "과거팀장" },
          { role: "MEMBER", slotNumber: 1, originalName: "과거팀원" },
        ],
      },
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-05-31",
        rawCells: {
          values: [
            "2026-05-31",
            "일",
            "강서수산",
            10,
            { error: "#REF!" },
            null,
            { formula: "7+8", result: 15 },
          ],
        },
        roles: [],
      },
    ],
    operationalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-06-01",
        salesAmount: 99,
        grossProfit: 20,
        grossMarginRate: 20 / 99,
        operatingProfit: 10,
        productivity: 49.5,
        workerCount: 2,
        salesDifference: 3,
        roles: [
          { role: "역할 미기록", slotNumber: null, originalName: "운영팀장" },
          { role: "역할 미기록", slotNumber: null, originalName: "운영팀원" },
        ],
      },
    ],
  });

  assert.equal(sheet.name, "입력");
  assert.deepEqual(
    sheet.columns.map((column) => column.label),
    [...SOURCE_WORKBOOK_HEADERS],
  );
  assert.equal(sheet.rows.length, 2);

  const operational = sheet.rows.find(
    (row) => row.storeName === "강서수산" && row.salesAmount === 99,
  );
  assert.equal(operational?.salesAmount, 99);
  assert.equal(operational?.lead1, null);
  assert.equal(operational?.member1, null);

  const historical = sheet.rows.find((row) => row.salesAmount === 10);
  assert.equal(historical?.storeName, "강서수산");
  assert.deepEqual(historical?.grossProfit, { error: "#REF!" });
  assert.equal(historical?.grossMarginRate, null);
  assert.equal(historical?.operatingProfit, 15);

  const withoutPersonnel = buildSourceWorkbookSheet({
    historicalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-05-31",
        rawCells: {
          values: [
            "2026-05-31",
            "일",
            "강서수산",
            10,
            null,
            null,
            null,
            null,
            1,
            "직원",
          ],
        },
        roles: [{ role: "LEAD", slotNumber: 1, originalName: "직원" }],
      },
    ],
    operationalFacts: [],
    includePersonnel: false,
  });
  assert.equal(withoutPersonnel.rows[0]?.lead1, null);
});

test("personnel slots stay bounded in the input sheet", () => {
  const sheet = buildSourceWorkbookSheet({
    historicalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-06-02",
        rawCells: { values: [] },
        roles: [
          { role: "LEAD", slotNumber: 1, originalName: "팀장1" },
          { role: "LEAD", slotNumber: 2, originalName: "팀장2" },
          { role: "LEAD", slotNumber: 3, originalName: "팀장3" },
          ...Array.from({ length: 12 }, (_, index) => ({
            role: "MEMBER",
            slotNumber: index + 1,
            originalName: `팀원${index + 1}`,
          })),
        ],
      },
    ],
    operationalFacts: [],
  });

  const row = sheet.rows[0];
  assert.equal(row.lead1, "팀장1");
  assert.equal(row.lead2, "팀장2");
  assert.equal(row.member11, "팀원11");
  assert.equal(row.member12, undefined);
});

test("operational facts do not infer personnel slots", () => {
  const sheet = buildSourceWorkbookSheet({
    historicalFacts: [],
    operationalFacts: [
      {
        storeId: "store-1",
        storeName: "강서수산",
        businessDate: "2026-06-02",
        salesAmount: 1,
        grossProfit: 1,
        grossMarginRate: 1,
        operatingProfit: 1,
        productivity: 1,
        workerCount: 14,
        salesDifference: 1,
        roles: [
          { role: "역할 미기록", slotNumber: null, originalName: "운영자" },
        ],
      },
    ],
  });

  const row = sheet.rows[0];
  assert.equal(row.lead1, null);
  assert.equal(row.member1, null);
});

test("trend source windows follow the same month and season semantics as reports", () => {
  assert.deepEqual(
    getSourceWorkbookTrendDateRanges({
      unit: "month",
      year: 2026,
      fromYear: 2020,
      toYear: 2026,
      fromMonth: 6,
      toMonth: 8,
    }),
    [
      { startDate: "2026-06-01", endDate: "2026-06-30" },
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      { startDate: "2026-08-01", endDate: "2026-08-31" },
    ],
  );
  const yearlyRanges = getSourceWorkbookTrendDateRanges({
    unit: "year",
    year: 2026,
    fromYear: 2020,
    toYear: 2026,
    fromMonth: 6,
    toMonth: 8,
  });
  assert.equal(yearlyRanges.length, 7);
  assert.deepEqual(yearlyRanges[0], {
    startDate: "2020-06-01",
    endDate: "2020-08-31",
  });
  assert.deepEqual(yearlyRanges.at(-1), {
    startDate: "2026-06-01",
    endDate: "2026-08-31",
  });
  assert.equal(
    yearlyRanges.some((range) => range.startDate.endsWith("09-01")),
    false,
  );

  assert.deepEqual(
    getSourceWorkbookTrendDateRanges({
      unit: "year",
      year: 2026,
      fromYear: 2020,
      toYear: 2020,
      fromMonth: 8,
      toMonth: 6,
    }),
    [{ startDate: "2020-08-01", endDate: "2020-08-31" }],
  );
});

test("operational personnel keeps names in detail without inventing roles", () => {
  const detail = buildSourceWorkbookPersonnelSheet([
    {
      businessDate: "2026-06-01",
      storeName: "강서수산",
      role: "역할 미기록",
      slotNumber: null,
      workerName: "운영팀장",
      source: "operational",
    },
  ]);
  assert.deepEqual(detail.rows[0], {
    businessDate: "2026-06-01",
    storeName: "강서수산",
    role: "역할 미기록",
    slotNumber: null,
    workerName: "운영팀장",
    source: "ERP",
  });

  const historicalDetail = buildSourceWorkbookPersonnelSheet([
    {
      businessDate: "2026-06-01",
      storeName: "강서수산",
      role: "LEAD",
      slotNumber: 2,
      workerName: "과거팀장",
      source: "historical",
    },
  ]);
  assert.deepEqual(historicalDetail.rows[0], {
    businessDate: "2026-06-01",
    storeName: "강서수산",
    role: "팀장",
    slotNumber: 2,
    workerName: "과거팀장",
    source: "과거 엑셀",
  });
  assert.equal(historicalDetail.columns[3]?.label, "원본 칸");
});
