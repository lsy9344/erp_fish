import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";

import { buildCustomerWorkbookExport } from "../../src/features/reports/customer-workbook-export.ts";
import {
  buildSourceWorkbookSheet,
  SOURCE_WORKBOOK_HEADERS,
} from "../../src/features/reports/source-workbook-export.ts";

const sheetNames = [
  "입력",
  "분석",
  "매장 별(년도)",
  "매장 별(달)",
  "매출",
  "매출이익",
  "이익률",
  "인당생산성",
  "평균 재고",
  "Sheet3",
];

async function template() {
  const workbook = new ExcelJS.Workbook();
  for (const [index, name] of sheetNames.entries())
    workbook.addWorksheet(name, { state: index >= 4 ? "hidden" : "visible" });
  const input = workbook.getWorksheet("입력");
  input.addRow(SOURCE_WORKBOOK_HEADERS);
  input.getRow(1).font = { name: "굴림", bold: true, size: 11 };
  input.getColumn(1).width = 14.625;
  input.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  input.addRow([new Date("2025-01-02T00:00:00Z"), "목", "강서수산", 100, 30]);
  input.addRow([new Date("2025-01-01T00:00:00Z"), "수", "강서수산", 150, 30]);
  input.getCell("F2").value = {
    formula: "E2/D2",
    result: 0.3,
    shareType: "shared",
    ref: "F2:F3",
  };
  input.getCell("F3").value = { sharedFormula: "F2", result: 0.2 };
  input.getCell("A2").numFmt = "yyyy/mm/dd;@";
  input.getCell("A3").numFmt = "yyyy/mm/dd;@";
  input.getCell("F2").numFmt = "0.00%";
  input.getCell("F3").numFmt = "0.0%";
  input.getRow(2).height = 25;
  input.getCell("J2").value = "old-person";
  input.getCell("A6").numFmt = "yyyy/mm/dd;@";
  input.autoFilter = "A1:W3";
  const analysis = workbook.getWorksheet("분석");
  analysis.getCell("A1").value = "강서수산";
  analysis.getCell("B1").value = {
    formula: "SUMIFS(입력!$D:$D,입력!$C:$C,A1)",
    result: -999,
  };
  analysis.getCell("C1").value = {
    formula: "AVERAGEIFS(입력!$H$2:$H$3,입력!$C$2:$C$3,A1)",
    result: -999,
  };
  analysis.getCell("G1").numFmt = "#,##0";
  analysis.getCell("H1").value = {
    formula: 'SUMIFS(입력!$D:$D,입력!$C:$C,"없는매장")',
    result: -999,
  };
  const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
  zip.file(
    "xl/charts/chart1.xml",
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:numRef><c:f>분석!$B$1</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>-999</c:v></c:pt></c:numCache></c:numRef><c:style val="13"/></c:chartSpace>',
  );
  zip.file(
    "xl/comments1.xml",
    '<comments><commentList><comment ref="J2" authorId="0"><text><t>original note</t></text></comment></commentList></comments>',
  );
  zip.file(
    "xl/drawings/vmlDrawing1.vml",
    '<xml><v:shape id="note1"><x:ClientData ObjectType="Note"><x:Anchor>9, 15, 1, 2, 11, 15, 3, 2</x:Anchor><x:Row>1</x:Row><x:Column>9</x:Column></x:ClientData></v:shape></xml>',
  );
  zip.file("xl/calcChain.xml", "<calcChain/>");
  zip.file(
    "xl/_rels/workbook.xml.rels",
    (await zip.file("xl/_rels/workbook.xml.rels").async("string")).replace(
      "</Relationships>",
      '<Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>',
    ),
  );
  zip.file(
    "[Content_Types].xml",
    (await zip.file("[Content_Types].xml").async("string")).replace(
      "</Types>",
      '<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>',
    ),
  );
  return zip.generateAsync({ type: "uint8array" });
}

function fact(date, values) {
  return {
    storeId: "gangseo",
    storeName: "강서수산",
    businessDate: date,
    rawCells: { values },
    roles: [],
  };
}

test("full template export preserves styles and charts while replacing all data and formula caches", async () => {
  const templateBytes = await template();
  const sourceSheet = buildSourceWorkbookSheet({
    historicalFacts: [
      fact("2025-01-01", [
        null,
        "수",
        null,
        150,
        30,
        0.2,
        { error: "#REF!" },
        75,
        2,
        'new <&" name',
      ]),
      fact("2025-01-02", [null, "목", null, 100, 30, 0.3, null, 100, 1]),
      fact("2025-01-03", [null, "금", null, 200, 40, 0.2, null, 100, 2]),
    ],
    operationalFacts: [],
  });
  const result = await buildCustomerWorkbookExport({
    templateBytes,
    sourceSheet,
    additionalPersonnelSheet: {
      name: "입력_근무자상세",
      columns: [
        { key: "businessDate", label: "일자" },
        { key: "storeName", label: "매장" },
        { key: "role", label: "역할" },
        { key: "workerName", label: "근무자" },
      ],
      rows: [
        {
          businessDate: "2025-01-03",
          storeName: "강서수산",
          role: "역할 미기록",
          workerName: "ERP 직원",
        },
      ],
    },
  });
  const originalZip = await JSZip.loadAsync(templateBytes);
  const zip = await JSZip.loadAsync(result);
  assert.equal(
    await zip.file("xl/styles.xml").async("string"),
    await originalZip.file("xl/styles.xml").async("string"),
  );
  assert.equal(zip.file("xl/calcChain.xml"), null);
  assert.doesNotMatch(
    await zip.file("xl/_rels/workbook.xml.rels").async("string"),
    /calcChain/,
  );
  assert.doesNotMatch(
    await zip.file("[Content_Types].xml").async("string"),
    /calcChain/,
  );
  const inputXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.doesNotMatch(inputXml, /old-person/);
  assert.match(inputXml, /autoFilter ref="A1:W4"/);
  assert.match(await zip.file("xl/comments1.xml").async("string"), /ref="J3"/);
  assert.match(
    await zip.file("xl/drawings/vmlDrawing1.vml").async("string"),
    /<x:Row>2<\/x:Row>/,
  );
  const chart = await zip.file("xl/charts/chart1.xml").async("string");
  assert.match(chart, /<c:v>450<\/c:v>/);
  assert.match(chart, /<c:style val="13"\/>/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result, { ignoreNodes: ["dataValidations"] });
  assert.deepEqual(
    workbook.worksheets.map((s) => s.name),
    sheetNames,
  );
  assert.deepEqual(
    workbook.worksheets.map((s) => s.state),
    [
      "visible",
      "visible",
      "visible",
      "visible",
      "hidden",
      "hidden",
      "hidden",
      "hidden",
      "hidden",
      "hidden",
    ],
  );
  const input = workbook.getWorksheet("입력");
  assert.equal(
    input.getCell("A2").value.toISOString(),
    "2025-01-01T00:00:00.000Z",
  );
  assert.equal(input.getCell("J2").value, 'new <&" name');
  assert.deepEqual(input.getCell("G2").value, { error: "#REF!" });
  assert.equal(input.getCell("F2").value.result, 0.2);
  assert.equal(input.getCell("F2").value.formula, "E2/D2");
  assert.equal(input.getCell("F2").numFmt, "0.0%");
  assert.equal(input.getCell("F3").numFmt, "0.00%");
  assert.equal(input.getRow(3).height, 25);
  assert.equal(input.getCell("D5").value, null);
  assert.equal(input.getColumn(1).width, 14.625);
  assert.equal(workbook.getWorksheet("분석").getCell("B1").value.result, 450);
  assert.equal(
    workbook.getWorksheet("분석").getCell("C1").value.result,
    275 / 3,
  );
  assert.equal(workbook.getWorksheet("분석").getCell("H1").result, 0);
  assert.match(
    await zip.file("xl/worksheets/sheet2.xml").async("string"),
    /r="H1"[^>]*><f>[\s\S]*?<\/f><v>0<\/v>/,
  );
  assert.match(
    await zip.file("xl/worksheets/sheet10.xml").async("string"),
    /ERP 직원/,
  );
});

test("input margin formulas remain formulas when their cached result is an Excel error", async () => {
  const templateBytes = await template();
  const sourceSheet = buildSourceWorkbookSheet({
    historicalFacts: [
      fact("2025-01-02", [
        null,
        "목",
        null,
        100,
        "invalid amount",
        { error: "#VALUE!" },
      ]),
    ],
    operationalFacts: [],
  });
  const result = await buildCustomerWorkbookExport({
    templateBytes,
    sourceSheet,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result, { ignoreNodes: ["dataValidations"] });
  assert.equal(workbook.getWorksheet("입력").getCell("F2").formula, "E2/D2");
  assert.deepEqual(workbook.getWorksheet("입력").getCell("F2").result, {
    error: "#VALUE!",
  });
});

test("full template export rejects missing columns and duplicate store dates", async () => {
  const templateBytes = await template();
  const sourceSheet = buildSourceWorkbookSheet({
    historicalFacts: [fact("2025-01-01", [null, "수", null, 150, 30, 0.2])],
    operationalFacts: [],
  });
  await assert.rejects(
    buildCustomerWorkbookExport({
      templateBytes,
      sourceSheet: {
        ...sourceSheet,
        columns: sourceSheet.columns.slice(0, 22),
      },
    }),
    /23개/,
  );
  await assert.rejects(
    buildCustomerWorkbookExport({
      templateBytes,
      sourceSheet: {
        ...sourceSheet,
        rows: [...sourceSheet.rows, ...sourceSheet.rows],
      },
    }),
    /중복/,
  );
});

test(
  "actual customer workbook retains all ten sheets, forty charts and styles",
  { skip: !process.env.HISTORICAL_WORKBOOK_FIXTURE },
  async () => {
    const templateBytes = new Uint8Array(
      await readFile(process.env.HISTORICAL_WORKBOOK_FIXTURE),
    );
    const original = new ExcelJS.Workbook();
    await original.xlsx.load(new Uint8Array(templateBytes).buffer, {
      ignoreNodes: ["dataValidations"],
    });
    const facts = new Map();
    original.getWorksheet("입력").eachRow((row) => {
      const date = row.getCell(1).value;
      let storeName = row.getCell(3).value;
      if (!(date instanceof Date)) return;
      if (row.number === 13955 && storeName === 0) storeName = "강서수산";
      if (typeof storeName !== "string" || !storeName.endsWith("수산")) return;
      const businessDate = date.toISOString().slice(0, 10);
      const key = `${businessDate}|${storeName}`;
      if (facts.has(key)) return;
      facts.set(key, {
        storeId: storeName,
        storeName,
        businessDate,
        rawCells: {
          values: Array.from(
            { length: 23 },
            (_, i) => row.getCell(i + 1).value,
          ),
        },
        roles: [],
      });
    });
    const sourceSheet = buildSourceWorkbookSheet({
      historicalFacts: [...facts.values()],
      operationalFacts: [],
    });
    const result = await buildCustomerWorkbookExport({
      templateBytes,
      sourceSheet,
    });
    const zip = await JSZip.loadAsync(result);
    const originalZip = await JSZip.loadAsync(templateBytes);
    assert.equal(
      Object.keys(zip.files).filter((p) =>
        /^xl\/charts\/chart\d+\.xml$/.test(p),
      ).length,
      40,
    );
    assert.equal(
      await zip.file("xl/styles.xml").async("string"),
      await originalZip.file("xl/styles.xml").async("string"),
    );
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(result, { ignoreNodes: ["dataValidations"] });
    assert.deepEqual(
      output.worksheets.map((s) => s.name),
      sheetNames,
    );
    assert.equal(
      output
        .getWorksheet("입력")
        .getCell(sourceSheet.rows.length + 1, 1)
        .value.toISOString()
        .slice(0, 10),
      "2026-09-30",
    );
  },
);
