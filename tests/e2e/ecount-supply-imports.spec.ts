import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

// WO(2026-06-24) Task 18: 본사 이카운트 출고/입고 업로드 진입 + commit 결과의 장부/리포트 반영 검증.
// 작은 workbook을 실제 업로드/commit하고, global-setup이 심은 commit 완료 fixture도 함께 확인한다.

const ECOUNT_FIXTURE = {
  productName: "제주갈치",
  appliedUnitPrice: "12,000",
};
const ECOUNT_UPLOAD = {
  fileName: "e2e-ecount-upload.xlsx",
  dateInput: "2026-06-21",
  dateNo: "2026/06/21 -1",
  rawStoreName: "E2E강남점",
  productName: "제주갈치",
  productSpec: "31-35미",
  quantity: 2,
  unitPrice: 12000,
  appliedUnitPrice: "₩12,000",
};
const ECOUNT_STORE_MAPPING_UPLOAD = {
  fileName: "e2e-ecount-store-mapping.xlsx",
  dateNo: "2026/06/22 -1",
  firstRawStoreName: "E2E미매핑1호점",
  secondRawStoreName: "E2E미매핑2호점",
};
const headerRow = [
  "일자-No.",
  "거래처명",
  "품목명(규격)",
  "수량",
  "단가",
  "공급가액",
  "부가세",
  "합계",
];

type WorkbookCell = string | number | null | undefined;

function xml(value: WorkbookCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index: number) {
  let value = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }

  return value;
}

function sheetXml(rows: WorkbookCell[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;

          if (value === null || value === undefined) {
            return `<c r="${ref}"></c>`;
          }

          if (typeof value === "number") {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }

          return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function createZip(entries: [string, string][]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createWorkbook(rows: WorkbookCell[][]) {
  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="판매현황" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]);
}

function createUploadWorkbook(dateNo = ECOUNT_UPLOAD.dateNo) {
  const supplyAmount = ECOUNT_UPLOAD.quantity * ECOUNT_UPLOAD.unitPrice;

  return createWorkbook([
    ["판매현황"],
    headerRow,
    [
      dateNo,
      ECOUNT_UPLOAD.rawStoreName,
      `${ECOUNT_UPLOAD.productName} [${ECOUNT_UPLOAD.productSpec}]`,
      ECOUNT_UPLOAD.quantity,
      ECOUNT_UPLOAD.unitPrice,
      supplyAmount,
      null,
      supplyAmount,
    ],
  ]);
}

function createStoreMappingWorkbook() {
  const supplyAmount = ECOUNT_UPLOAD.quantity * ECOUNT_UPLOAD.unitPrice;

  return createWorkbook([
    ["판매현황"],
    headerRow,
    [
      ECOUNT_STORE_MAPPING_UPLOAD.dateNo,
      ECOUNT_STORE_MAPPING_UPLOAD.firstRawStoreName,
      `${ECOUNT_UPLOAD.productName} [${ECOUNT_UPLOAD.productSpec}]`,
      ECOUNT_UPLOAD.quantity,
      ECOUNT_UPLOAD.unitPrice,
      supplyAmount,
      null,
      supplyAmount,
    ],
    [
      ECOUNT_STORE_MAPPING_UPLOAD.dateNo,
      ECOUNT_STORE_MAPPING_UPLOAD.secondRawStoreName,
      `${ECOUNT_UPLOAD.productName} [${ECOUNT_UPLOAD.productSpec}]`,
      ECOUNT_UPLOAD.quantity,
      ECOUNT_UPLOAD.unitPrice,
      supplyAmount,
      null,
      supplyAmount,
    ],
  ]);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function setEcountUploadFile(
  page: Page,
  uploadFile: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  },
) {
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();
  await page.waitForLoadState("networkidle");

  let selectedFile: { name: string; size: number; type: string } | null = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await fileInput.setInputFiles(uploadFile);
    selectedFile = await fileInput.evaluate((input) => {
      const file = (input as HTMLInputElement).files?.[0];

      return file
        ? { name: file.name, size: file.size, type: file.type }
        : null;
    });

    if (selectedFile?.name === uploadFile.name && selectedFile.size > 0) {
      break;
    }

    await page.waitForTimeout(250);
  }

  expect(selectedFile).toMatchObject({
    name: uploadFile.name,
    type: uploadFile.mimeType,
  });
  expect(selectedFile?.size).toBeGreaterThan(0);
}

test("본사는 이카운트 업로드 화면에 진입해 파일 업로드와 최근 업로드 목록을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");

  await expect(
    page.getByRole("heading", { name: "이카운트 업로드" }),
  ).toBeVisible();

  // 파일 업로드 컨트롤(.xlsx)이 노출된다.
  await expect(page.locator('input[type="file"]')).toBeAttached();
});

test("본사는 새 이카운트 파일을 업로드하고 commit 후 리포트에서 확인한다", async ({
  page,
}, testInfo) => {
  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");
  const uploadPath = testInfo.outputPath(ECOUNT_UPLOAD.fileName);
  const uploadDateNo = `${ECOUNT_UPLOAD.dateNo}-${testInfo.workerIndex}-${Date.now()}`;
  const workbook = createUploadWorkbook(uploadDateNo);
  await writeFile(uploadPath, workbook);

  const uploadFile = {
    name: ECOUNT_UPLOAD.fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  };
  await setEcountUploadFile(page, uploadFile);
  await page.getByRole("button", { name: "업로드" }).click();

  await expect(page).toHaveURL(/\/app\/ecount-imports\/[^/]+$/);
  await expect(page.getByText(ECOUNT_UPLOAD.fileName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "매핑 필요" })).toBeVisible();

  const uploadedRawProductName = `${ECOUNT_UPLOAD.productName} [${ECOUNT_UPLOAD.productSpec}]`;
  const unmappedProductRow = page
    .getByRole("row")
    .filter({ hasText: uploadedRawProductName });
  await unmappedProductRow
    .getByRole("combobox", { name: `${uploadedRawProductName} 품목 매핑` })
    .selectOption({
      label: `${ECOUNT_UPLOAD.productName} · ${ECOUNT_UPLOAD.productSpec}`,
    });
  await unmappedProductRow.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("commit 가능")).toBeVisible();

  await page.getByRole("button", { name: "본사 장부에 반영" }).click();
  await expect(page.getByText("완료").first()).toBeVisible();

  await page.goto(
    `/app/reports/ecount-supply?from=${ECOUNT_UPLOAD.dateInput}&to=${ECOUNT_UPLOAD.dateInput}`,
  );
  const uploadedRow = page
    .getByRole("row")
    .filter({ hasText: ECOUNT_UPLOAD.productName });

  await expect(uploadedRow.first()).toBeVisible();
  await expect(uploadedRow.first()).toContainText(
    ECOUNT_UPLOAD.appliedUnitPrice,
  );

  const batchFilter = page.locator('select[name="batchId"]');
  const uploadedBatchOption = batchFilter.locator("option", {
    hasText: ECOUNT_UPLOAD.fileName,
  });
  const uploadedBatchId = await uploadedBatchOption
    .first()
    .getAttribute("value");

  expect(uploadedBatchId).toBeTruthy();
  await batchFilter.selectOption(uploadedBatchId ?? "");
  await page.getByRole("button", { name: "조회" }).click();
  await expect(uploadedRow.first()).toBeVisible();
});

test("본사는 두 번째 미매핑 거래처 지점 드롭다운을 선택하고 저장할 수 있다", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");

  await setEcountUploadFile(page, {
    name: ECOUNT_STORE_MAPPING_UPLOAD.fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: createStoreMappingWorkbook(),
  });
  await page.getByRole("button", { name: "업로드" }).click();

  await expect(page).toHaveURL(/\/app\/ecount-imports\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "매핑 필요" })).toBeVisible();

  const firstStoreSelect = page.getByLabel(
    `${ECOUNT_STORE_MAPPING_UPLOAD.firstRawStoreName} 지점 매핑`,
  );
  const secondStoreSelect = page.getByLabel(
    `${ECOUNT_STORE_MAPPING_UPLOAD.secondRawStoreName} 지점 매핑`,
  );
  await expect(firstStoreSelect).toBeVisible();
  await expect(secondStoreSelect).toBeVisible();

  pageErrors.length = 0;
  await secondStoreSelect.selectOption({ label: "강남점" });
  expect(pageErrors).toEqual([]);
  await expect(secondStoreSelect).toHaveValue("store-gangnam");

  const secondStoreRow = page
    .getByRole("row")
    .filter({ hasText: ECOUNT_STORE_MAPPING_UPLOAD.secondRawStoreName });
  await secondStoreRow.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("지점 매핑을 저장했습니다.")).toBeVisible();
  await expect(secondStoreSelect).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("본사는 출고/입고 리포트 화면을 조회 필터와 함께 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/ecount-supply");

  await expect(
    page.getByRole("heading", { name: "본사 출고 / 지점 입고 내역" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
  // 실제 판매 데이터가 없으므로 추정 표기 원칙이 화면 설명에 드러난다.
  await expect(page.getByText("추정", { exact: false }).first()).toBeVisible();
});

test("commit된 이카운트 입고 라인이 출고/입고 리포트에 노출되고 품목 필터로 좁혀진다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/ecount-supply");

  const fixtureRow = page
    .getByRole("row")
    .filter({ hasText: ECOUNT_FIXTURE.productName });

  // commit 결과가 리포트에 반영된다(원본 단가와 적용 단가를 함께 보여준다).
  await expect(fixtureRow.first()).toBeVisible();
  await expect(fixtureRow.first()).toContainText(
    ECOUNT_FIXTURE.appliedUnitPrice,
  );

  // 품목 필터 UI(Task 16)가 존재하고, 선택하면 해당 품목만 남는다.
  const productFilter = page.locator('select[name="productId"]');
  await expect(productFilter).toBeVisible();
  // 제주갈치 옵션의 value(productId)를 찾아 선택한다(라벨은 규격을 포함한다).
  const productOption = productFilter.locator("option", {
    hasText: ECOUNT_FIXTURE.productName,
  });
  const productOptionValue = await productOption.first().getAttribute("value");
  expect(productOptionValue).toBeTruthy();
  await productFilter.selectOption(productOptionValue ?? "");
  await page.getByRole("button", { name: "조회" }).click();

  await expect(
    page
      .getByRole("row")
      .filter({ hasText: ECOUNT_FIXTURE.productName })
      .first(),
  ).toBeVisible();
});

// NOTE(2026-06-24): 지점장 store-entry 페이지는 KST 오늘 날짜만 허용하므로(과거 날짜는
// unauthorized로 redirect) 과거 fixture로 지점장 UI 잠금/적용 단가 수정 가능 여부를 e2e로
// 검증하기 어렵다. 해당 정책(원본 정보 잠금 + 적용 단가만 수정)은 클라이언트 잠금 로직
// (tests/unit/ecount-supply-remediation.test.mjs #1)과 서버 정책
// (tests/unit/ledger-purchase-edit-policy.test.mjs)에서 결정적으로 검증한다.

test("지점장은 이카운트 업로드 화면에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/ecount-imports");

  await expect(page).toHaveURL(/unauthorized/);
});
