import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/이메일|로그인 식별자/).fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

// WO-0806 #5: 직원 관리는 계좌번호·주소·급여를 다루므로 대표(LABOR_VIEW) 전용이다.
// 이전에는 REPORT_VIEW를 가진 모든 본사 계정이 볼 수 있었다. 이 스위트가 그 경계를 고정한다.

test("대표는 인사관리 카드에서 직원 상세를 등록하고 검색할 수 있다", async ({
  page,
}) => {
  const defaultStore = await prisma.store.findFirstOrThrow({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  await login(page, "owner@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByText("인사관리 카드 등록")).toBeVisible();
  for (const fieldLabel of [
    "이름",
    "직급",
    "입사일",
    "연락처",
    "주소",
    "계좌번호",
    "하루 인건비",
    "희망 4대보험 금액",
    "기본 근무매장",
  ]) {
    await expect(page.getByLabel(fieldLabel)).toBeVisible();
  }
  // WO-0806 #1-5: 희망 현금은 인건비 리포트에서 자동계산하므로 입력란이 없다.
  await expect(page.getByLabel("희망 현금 금액")).toHaveCount(0);
  const employeeName = `검토직원-${Date.now()}`;
  await page.getByLabel("이름", { exact: true }).fill(employeeName);
  await page.getByLabel("직급", { exact: true }).fill("팀원");
  await page.getByLabel("입사일", { exact: true }).fill("2026-08-01");
  await page.getByLabel("연락처", { exact: true }).fill("010-1234-5678");
  await page
    .getByLabel("주소", { exact: true })
    .fill("서울시 강남구 테헤란로 123, 401호");
  await page
    .getByLabel("계좌번호", { exact: true })
    .fill("국민 123456-01-234567");
  await page.getByLabel("하루 인건비", { exact: true }).fill("120000");
  await page.getByLabel("희망 4대보험 금액").fill("300000");
  await expect(page.getByLabel("하루 인건비", { exact: true })).toHaveValue(
    "120,000",
  );
  await expect(page.getByLabel("희망 4대보험 금액")).toHaveValue("300,000");
  await page.getByLabel("기본 근무매장").click();
  await page
    .getByRole("option", { name: defaultStore.name, exact: true })
    .click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("직원을 추가했습니다.")).toBeVisible();
  const createdEmployee = await prisma.employee.findFirstOrThrow({
    where: { name: employeeName },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      dailyWage: true,
      desiredInsuranceAmount: true,
      storeId: true,
    },
  });
  expect(createdEmployee.dailyWage).toBe(120_000);
  expect(createdEmployee.desiredInsuranceAmount).toBe(300_000);
  expect(createdEmployee.storeId).toBe(defaultStore.id);
  const employeeAudit = await prisma.auditLog.findFirstOrThrow({
    where: {
      action: "employee.created",
      targetType: "Employee",
      targetId: createdEmployee.id,
    },
    orderBy: { createdAt: "desc" },
    select: { after: true },
  });
  expect(JSON.stringify(employeeAudit.after)).toContain("changedFields");
  expect(JSON.stringify(employeeAudit.after)).not.toContain("010-1234-5678");
  expect(JSON.stringify(employeeAudit.after)).not.toContain("123456-01-234567");

  // WO-0806 #1-7: 실제 저장된 이름을 부분 검색하고 지우면 전체 목록이 복원된다.
  const search = page.getByLabel("직원 검색");
  await search.fill(employeeName.slice(0, -2));
  const employeeRow = page.getByRole("row", { name: new RegExp(employeeName) });
  await expect(employeeRow).toContainText("팀원");
  await expect(employeeRow).toContainText("010-1234-5678");
  await expect(employeeRow).toContainText(defaultStore.name);
  await employeeRow.getByRole("button", { name: "상세" }).click();

  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("서울시 강남구 테헤란로 123, 401호");
  await expect(detail).toContainText("국민 123456-01-234567");
  await expect(detail).toContainText(/\d{4}-\d{2} 근무일수/);
  await expect(detail).toContainText(/\d{4}-\d{2} 급여 합계/);
  await expect(detail).toContainText("0일");
  await page.keyboard.press("Escape");

  await search.fill("");
  await expect(page.getByText(/명 \/ 전체 \d+명/)).toBeVisible();

  // WO-0806 #1-10/#1-13: 급여 롤업과 근무 인원 수별 평균은 제거됐다.
  await expect(page.getByText("직원별 월간 급여 롤업")).toHaveCount(0);
  await expect(page.getByText("근무 인원 수별 평균")).toHaveCount(0);
  await expect(page.getByText("월간 생산성 / 인력 배치 분석")).toBeVisible();

  await employeeRow.getByRole("button", { name: "퇴사·사용중지" }).click();
  await expect(employeeRow).toContainText("퇴사·사용중지");
  await employeeRow.getByRole("button", { name: "다시 재직" }).click();
  await expect(employeeRow).toContainText("재직");

  await employeeRow.getByRole("button", { name: "삭제" }).click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toContainText(
    "근무 기록이 하나라도 있으면 삭제하지 않고 안내만 표시합니다.",
  );
  await deleteDialog
    .getByRole("button", { name: "완전히 삭제", exact: true })
    .click();
  await expect(
    page.getByText("잘못 등록한 직원을 삭제했습니다."),
  ).toBeVisible();
  await expect(employeeRow).toHaveCount(0);
});

test("대표는 여러 매장을 다니는 직원을 근무매장 미지정으로 저장할 수 있다", async ({
  page,
}) => {
  await login(page, "owner@example.com");
  await page.goto("/app/labor/employees");

  const roamingEmployeeName = `순회직원-${Date.now()}`;
  await page.getByLabel("이름", { exact: true }).fill(roamingEmployeeName);
  await page.getByLabel("입사일", { exact: true }).fill("2026-08-02");
  await expect(page.getByLabel("기본 근무매장")).toHaveText(/미지정/);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect
    .poll(
      () =>
        prisma.employee.count({
          where: { name: roamingEmployeeName },
        }),
      { message: "근무매장 미지정 직원 저장 완료" },
    )
    .toBe(1);

  const roamingEmployee = await prisma.employee.findFirstOrThrow({
    where: { name: roamingEmployeeName },
    orderBy: { createdAt: "desc" },
    select: { id: true, storeId: true },
  });
  expect(roamingEmployee.storeId).toBeNull();

  const search = page.getByLabel("직원 검색");
  await search.fill(roamingEmployeeName);
  const roamingEmployeeRow = page.getByRole("row", {
    name: new RegExp(roamingEmployeeName),
  });
  await expect(roamingEmployeeRow).toContainText("근무매장 미지정");
  await roamingEmployeeRow.getByRole("button", { name: "삭제" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "완전히 삭제", exact: true })
    .click();
  await expect(roamingEmployeeRow).toHaveCount(0);
});

test("직원을 나중에 등록하면 같은 이름의 기존 미연결 근무기록을 안전하게 연결한다", async ({
  page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const employeeName = `사후등록직원-${marker}-b`;
  const differentlyCasedWorkerName = employeeName.replace(/b$/, "B");
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@example.com" },
    select: { id: true },
  });
  const store = await prisma.store.create({
    data: {
      name: `사후등록지점-${marker}`,
      updatedById: actor.id,
    },
    select: { id: true, name: true },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "IN_REVIEW",
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  await prisma.ledgerLaborItem.createMany({
    data: [
      {
        dailyLedgerId: ledger.id,
        workerName: differentlyCasedWorkerName,
        amount: 0,
        createdById: actor.id,
        updatedById: actor.id,
      },
      {
        dailyLedgerId: ledger.id,
        workerName: employeeName,
        amount: 77_000,
        createdById: actor.id,
        updatedById: actor.id,
      },
    ],
  });

  let createdEmployeeId: string | null = null;

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/labor/employees");
    await page.getByLabel("이름", { exact: true }).fill(employeeName);
    await page.getByLabel("입사일", { exact: true }).fill("2026-07-01");
    await page.getByLabel("하루 인건비", { exact: true }).fill("120000");
    await page.getByLabel("기본 근무매장").click();
    await page.getByRole("option", { name: store.name, exact: true }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await expect(
      page.getByText("기존 근무기록 2건을 반영했습니다."),
    ).toBeVisible();

    const createdEmployee = await prisma.employee.findFirstOrThrow({
      where: { name: employeeName },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    createdEmployeeId = createdEmployee.id;

    const laborItems = await prisma.ledgerLaborItem.findMany({
      where: { dailyLedgerId: ledger.id },
      orderBy: { amount: "asc" },
      select: { employeeId: true, workerName: true, amount: true },
    });
    expect(laborItems).toEqual([
      {
        employeeId: createdEmployee.id,
        workerName: employeeName,
        amount: 77_000,
      },
      {
        employeeId: createdEmployee.id,
        workerName: employeeName,
        amount: 120_000,
      },
    ]);
    const ledgerAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "ledger.employee_link.backfilled",
        targetType: "DailyLedger",
        targetId: ledger.id,
      },
      orderBy: { createdAt: "desc" },
      select: { before: true, after: true, reason: true },
    });
    expect(ledgerAudit.reason).toBe("직원 등록 후 기존 근무기록 자동 연결");
    expect(JSON.stringify(ledgerAudit.before)).toContain('"employeeId":null');
    expect(JSON.stringify(ledgerAudit.after)).toContain(
      '"ledgerStatusAtEdit":"IN_REVIEW"',
    );
  } finally {
    if (createdEmployeeId) {
      await prisma.auditLog.deleteMany({
        where: { targetType: "Employee", targetId: createdEmployeeId },
      });
    }
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: ledger.id },
    });
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: ledger.id },
    });
    await prisma.dailyLedger.delete({ where: { id: ledger.id } });
    if (createdEmployeeId) {
      await prisma.employee.delete({ where: { id: createdEmployeeId } });
    }
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test("직원 저장 자동 연결은 본사 마감 장부를 변경하지 않는다", async ({
  page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const employeeName = `마감보호직원-${marker}`;
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@example.com" },
    select: { id: true },
  });
  const store = await prisma.store.create({
    data: {
      name: `마감보호지점-${marker}`,
      updatedById: actor.id,
    },
    select: { id: true, name: true },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: new Date("2026-07-04T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
      closedById: actor.id,
      closedAt: new Date("2026-07-05T00:00:00.000Z"),
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  const laborItem = await prisma.ledgerLaborItem.create({
    data: {
      dailyLedgerId: ledger.id,
      workerName: employeeName,
      amount: 0,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  let createdEmployeeId: string | null = null;

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/labor/employees");
    await page.getByLabel("이름", { exact: true }).fill(employeeName);
    await page.getByLabel("입사일", { exact: true }).fill("2026-07-01");
    await page.getByLabel("하루 인건비", { exact: true }).fill("120000");
    await page.getByLabel("기본 근무매장").click();
    await page.getByRole("option", { name: store.name, exact: true }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("직원을 추가했습니다.")).toBeVisible();

    const createdEmployee = await prisma.employee.findFirstOrThrow({
      where: { name: employeeName },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    createdEmployeeId = createdEmployee.id;
    await expect
      .poll(() =>
        prisma.ledgerLaborItem.findUnique({
          where: { id: laborItem.id },
          select: { employeeId: true, amount: true },
        }),
      )
      .toEqual({ employeeId: null, amount: 0 });
  } finally {
    if (createdEmployeeId) {
      await prisma.auditLog.deleteMany({
        where: { targetType: "Employee", targetId: createdEmployeeId },
      });
    }
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: ledger.id },
    });
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: ledger.id },
    });
    await prisma.dailyLedger.delete({ where: { id: ledger.id } });
    if (createdEmployeeId) {
      await prisma.employee.delete({ where: { id: createdEmployeeId } });
    }
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test("동명이인이 있으면 기존 미연결 근무기록을 자동 연결하지 않는다", async ({
  page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const employeeName = `동명이인-${marker}`;
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@example.com" },
    select: { id: true },
  });
  const store = await prisma.store.create({
    data: {
      name: `동명이인지점-${marker}`,
      updatedById: actor.id,
    },
    select: { id: true, name: true },
  });
  const existingEmployee = await prisma.employee.create({
    data: {
      name: employeeName,
      hireDate: new Date("2026-07-01T00:00:00.000Z"),
      storeId: store.id,
    },
    select: { id: true },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: new Date("2026-07-02T00:00:00.000Z"),
      status: "IN_REVIEW",
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  const laborItem = await prisma.ledgerLaborItem.create({
    data: {
      dailyLedgerId: ledger.id,
      workerName: employeeName,
      amount: 0,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });

  let createdEmployeeId: string | null = null;

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/labor/employees");
    await page.getByLabel("이름", { exact: true }).fill(employeeName);
    await page.getByLabel("입사일", { exact: true }).fill("2026-07-01");
    await page.getByLabel("하루 인건비", { exact: true }).fill("120000");
    await page.getByLabel("기본 근무매장").click();
    await page.getByRole("option", { name: store.name, exact: true }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("직원을 추가했습니다.")).toBeVisible();

    const createdEmployee = await prisma.employee.findFirstOrThrow({
      where: { name: employeeName, id: { not: existingEmployee.id } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    createdEmployeeId = createdEmployee.id;

    await expect
      .poll(() =>
        prisma.ledgerLaborItem.findUnique({
          where: { id: laborItem.id },
          select: { employeeId: true, amount: true },
        }),
      )
      .toEqual({ employeeId: null, amount: 0 });
  } finally {
    if (createdEmployeeId) {
      await prisma.auditLog.deleteMany({
        where: { targetType: "Employee", targetId: createdEmployeeId },
      });
    }
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: ledger.id },
    });
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: ledger.id },
    });
    await prisma.dailyLedger.delete({ where: { id: ledger.id } });
    if (createdEmployeeId) {
      await prisma.employee.delete({ where: { id: createdEmployeeId } });
    }
    await prisma.employee.delete({ where: { id: existingEmployee.id } });
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test("나중에 하루 인건비를 입력하면 연결된 0원 근무기록을 보완한다", async ({
  page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const employeeName = `후입력일급-${marker}`;
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "owner@example.com" },
    select: { id: true },
  });
  const store = await prisma.store.create({
    data: {
      name: `후입력일급지점-${marker}`,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  const employee = await prisma.employee.create({
    data: {
      name: employeeName,
      hireDate: new Date("2026-07-01T00:00:00.000Z"),
      storeId: store.id,
    },
    select: { id: true },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: new Date("2026-07-03T00:00:00.000Z"),
      status: "IN_REVIEW",
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  const laborItem = await prisma.ledgerLaborItem.create({
    data: {
      dailyLedgerId: ledger.id,
      employeeId: employee.id,
      workerName: employeeName,
      amount: 0,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });

  try {
    await login(page, "owner@example.com");
    await page.goto("/app/labor/employees");
    await page.getByLabel("직원 검색").fill(employeeName);
    const employeeRow = page.getByRole("row", {
      name: new RegExp(employeeName),
    });
    await employeeRow.getByRole("button", { name: "수정" }).click();
    await page.getByLabel("하루 인건비", { exact: true }).fill("120000");
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await expect(
      page.getByText("기존 근무기록 1건을 반영했습니다."),
    ).toBeVisible();
    await expect
      .poll(() =>
        prisma.ledgerLaborItem.findUnique({
          where: { id: laborItem.id },
          select: { employeeId: true, amount: true },
        }),
      )
      .toEqual({ employeeId: employee.id, amount: 120_000 });
  } finally {
    await prisma.auditLog.deleteMany({
      where: { targetType: "Employee", targetId: employee.id },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: ledger.id },
    });
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: ledger.id },
    });
    await prisma.dailyLedger.delete({ where: { id: ledger.id } });
    await prisma.employee.delete({ where: { id: employee.id } });
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test("대표는 과거 직원을 현재 직원과 구분해 한 명씩 선택하고 역할 이력을 본다", async ({
  page,
}) => {
  const batchId = "e2e-historical-batch";
  const rawRowId = "e2e-historical-raw";
  const factId = "e2e-historical-fact";
  const employeeId = "e2e-historical-employee";

  await prisma.historicalEmployeeDailyRole.deleteMany({ where: { batchId } });
  await prisma.historicalEmployee.deleteMany({ where: { batchId } });
  await prisma.historicalDailyFact.deleteMany({ where: { batchId } });
  await prisma.historicalExcelRawRow.deleteMany({ where: { batchId } });
  await prisma.historicalExcelImportBatch.deleteMany({
    where: { id: batchId },
  });

  try {
    await prisma.historicalExcelImportBatch.create({
      data: {
        id: batchId,
        fileHash: "e2e-historical-hash",
        sourceFileName: "approved.xlsx",
        sourceFileSize: 1,
        sourceWorkbook: new Uint8Array([1]),
        status: "ACTIVE",
        sheetCount: 10,
        rawRowCount: 14_309,
        canonicalFactCount: 14_072,
        roleCount: 52_005,
        sourceNameCount: 412,
        duplicateStoreDateCount: 28,
        validationSummary: { validation: "APPROVED" },
        stagedAt: new Date(),
        activatedAt: new Date(),
      },
    });
    await prisma.historicalExcelRawRow.create({
      data: {
        id: rawRowId,
        batchId,
        sheetIndex: 1,
        sheetName: "입력",
        rowNumber: 2,
        rawCells: { cells: [] },
      },
    });
    await prisma.historicalDailyFact.create({
      data: {
        id: factId,
        batchId,
        sourceRawRowId: rawRowId,
        storeId: "store-gangnam",
        sourceStoreName: "강남점",
        businessDate: new Date("2020-01-01T00:00:00.000Z"),
        salesAmount: "1000000",
        grossProfit: "300000",
        grossMarginRate: "0.3",
        sourceOperatingProfit: "200000",
        productivity: "500000",
        workerCount: "2",
        metricStatus: {},
      },
    });
    await prisma.historicalEmployee.create({
      data: {
        id: employeeId,
        batchId,
        originalName: "과거테스트직원",
        reviewStatus: "UNLINKED",
        firstSeenWorkDate: new Date("2020-01-01T00:00:00.000Z"),
        lastSeenWorkDate: new Date("2020-01-01T00:00:00.000Z"),
        leadRoleCount: 1,
        memberRoleCount: 0,
        storeNames: ["강남점"],
      },
    });
    await prisma.historicalEmployeeDailyRole.create({
      data: {
        id: "e2e-historical-role",
        batchId,
        historicalEmployeeId: employeeId,
        dailyFactId: factId,
        sourceRawRowId: rawRowId,
        businessDate: new Date("2020-01-01T00:00:00.000Z"),
        storeId: "store-gangnam",
        role: "LEAD",
        slotNumber: 1,
        originalName: "과거테스트직원",
      },
    });

    await login(page, "owner@example.com");
    await page.goto("/app/labor/employees");
    await page.getByLabel("직원 검색").fill("과거테스트");
    const row = page.getByRole("row", { name: /과거테스트직원/ });
    await expect(row).toContainText("과거 Excel");
    await expect(row).toContainText("최초 확인 근무일");
    await page.getByLabel("직원 선택").selectOption(`historical:${employeeId}`);
    await expect(row).toContainText("선택됨");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("한 사람으로 확정한 정보가 아닙니다");
    await expect(dialog).toContainText("2020-01-01");
    await expect(dialog).toContainText("강남점");
    await expect(dialog).toContainText("매니저");
    await page.keyboard.press("Escape");

    await page.goto(
      "/app/reports/comparison?startDate=2020-01-01&endDate=2020-01-01&storeId=store-gangnam",
    );
    const comparisonRow = page.getByTestId(
      "hq-report-comparison-row-store-gangnam",
    );
    await expect(comparisonRow).toContainText("출처: 과거 Excel");
    await expect(comparisonRow).toContainText("누락:");
    await expect(comparisonRow).toContainText("1,000,000");
  } finally {
    await prisma.historicalEmployeeDailyRole.deleteMany({ where: { batchId } });
    await prisma.historicalEmployee.deleteMany({ where: { batchId } });
    await prisma.historicalDailyFact.deleteMany({ where: { batchId } });
    await prisma.historicalExcelRawRow.deleteMany({ where: { batchId } });
    await prisma.historicalExcelImportBatch.deleteMany({
      where: { id: batchId },
    });
  }
});

test("본사 관리자는 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

test("조회 전용 본사 사용자는 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

test("지점장은 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

// WO-0806 #5: 사이드바·리포트 네비게이션에서도 링크 자체가 사라져야 한다.
test("대표에게는 인건비·직원 관리 메뉴가 보인다", async ({ page }) => {
  await login(page, "owner@example.com");

  await expect(page.getByRole("link", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByRole("link", { name: "인건비 현황" })).toBeVisible();

  await page.goto("/app/reports/daily");
  await expect(
    page.getByRole("link", { name: "인건비", exact: true }),
  ).toBeVisible();
});

test("대표가 아닌 본사 계정에는 인건비·직원 관리 메뉴가 보이지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await expect(page.getByRole("link", { name: "직원 관리" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "인건비 현황" })).toHaveCount(0);

  await page.goto("/app/reports/daily");
  await expect(
    page.getByRole("link", { name: "인건비", exact: true }),
  ).toHaveCount(0);
});
