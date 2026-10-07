import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const PAST_WAGE_REASON = "1월 과거 근무기록 정산";
const APPLY_REASON = "본사 요청에 따른 과거 일급 재정산";

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function shiftDate(dateInput, days) {
  const date = new Date(`${dateInput}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function employeeUpdateInput(overrides = {}) {
  return {
    name: "홍길동",
    hireDate: "2026-01-02",
    dailyWage: 120_000,
    ...overrides,
  };
}

function pastWagePeriod(overrides = {}) {
  return {
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    reason: PAST_WAGE_REASON,
    ...overrides,
  };
}

function makeTransactionMock({ targets = [], ledgers = [] } = {}) {
  const calls = {
    ledgerFindMany: [],
    queryRaw: [],
    laborUpdateMany: [],
    dailyLedgerUpdateMany: [],
    auditCreateMany: [],
  };
  let findManyCall = 0;

  return {
    calls,
    dailyLedger: {
      async findMany(input) {
        calls.ledgerFindMany.push(input);
        findManyCall += 1;
        return findManyCall === 1 ? targets : ledgers;
      },
      async updateMany(input) {
        calls.dailyLedgerUpdateMany.push(input);
        return { count: input.where.id.in.length };
      },
    },
    ledgerLaborItem: {
      async updateMany(input) {
        calls.laborUpdateMany.push(input);
        return { count: input.where.id.in.length };
      },
    },
    auditLog: {
      async createMany(input) {
        calls.auditCreateMany.push(input);
        return { count: input.data.length };
      },
    },
    async $queryRaw(input) {
      calls.queryRaw.push(input);
      return [];
    },
  };
}

async function importEmployeeUpdateSchema() {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "labor",
    "employees-schemas.ts",
  );

  return import(pathToFileURL(schemaPath).href);
}

async function importPastWageHelper() {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "labor",
    "employee-past-wage.ts",
  );

  return import(pathToFileURL(helperPath).href);
}

async function importTodayHelper() {
  const datePath = assertProjectFile("src", "features", "ledger", "date.ts");

  return import(pathToFileURL(datePath).href);
}

async function applyPastWage(applyEmployeePastWageInTx, tx, overrides = {}) {
  return applyEmployeePastWageInTx({
    tx,
    employeeId: "employee-1",
    amount: 120_000,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    reason: PAST_WAGE_REASON,
    storeIds: ["store-1"],
    actorId: "actor-1",
    canEditClosedLedgers: false,
    ...overrides,
  });
}

test("employeeUpdateSchema validates real dates and keeps the past range optional", async () => {
  const { employeeUpdateSchema } = await importEmployeeUpdateSchema();
  const { getTodayKstInput } = await importTodayHelper();
  const today = getTodayKstInput();
  const tomorrow = shiftDate(today, 1);

  const withoutRange = employeeUpdateSchema.parse(employeeUpdateInput());
  assert.equal(Object.hasOwn(withoutRange, "pastWagePeriod"), false);

  const zeroWage = employeeUpdateSchema.parse(
    employeeUpdateInput({
      dailyWage: 0,
      pastWagePeriod: pastWagePeriod({
        reason: `  ${PAST_WAGE_REASON}  `,
      }),
    }),
  );
  assert.equal(zeroWage.dailyWage, 0);
  assert.equal(zeroWage.pastWagePeriod.reason, PAST_WAGE_REASON);

  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({
        pastWagePeriod: pastWagePeriod({
          startDate: "2026-02-31",
          endDate: "2026-03-01",
        }),
      }),
    ).success,
    false,
    "calendar-invalid range dates must be rejected",
  );
  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({
        pastWagePeriod: pastWagePeriod({
          startDate: "2026-01-03",
          endDate: "2026-01-02",
        }),
      }),
    ).success,
    false,
    "a reversed range must be rejected",
  );
  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({
        pastWagePeriod: pastWagePeriod({
          startDate: today,
          endDate: tomorrow,
        }),
      }),
    ).success,
    false,
    "a range ending after today must be rejected",
  );
  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({
        dailyWage: null,
        pastWagePeriod: pastWagePeriod(),
      }),
    ).success,
    false,
    "a selected range requires an explicit daily wage, including zero",
  );

  const missingReason = pastWagePeriod();
  delete missingReason.reason;
  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({ pastWagePeriod: missingReason }),
    ).success,
    false,
    "a selected range requires a reason",
  );
  assert.equal(
    employeeUpdateSchema.safeParse(
      employeeUpdateInput({
        pastWagePeriod: pastWagePeriod({ reason: "   " }),
      }),
    ).success,
    false,
    "a blank reason must be rejected",
  );
});

test("past wage query scopes employee, stores, date boundaries, and excludes holidays without versioning a no-op", async () => {
  const { applyEmployeePastWageInTx } = await importPastWageHelper();
  const tx = makeTransactionMock({
    targets: [{ id: "ledger-1" }],
    // The second read represents the amount != requested amount filter.
    ledgers: [{ id: "ledger-1", status: "IN_PROGRESS", ledgerLaborItems: [] }],
  });

  const result = await applyPastWage(applyEmployeePastWageInTx, tx, {
    storeIds: ["store-1", "store-2"],
  });

  assert.deepEqual(result, { ok: true, data: { updatedLaborItemCount: 0 } });
  assert.equal(tx.calls.ledgerFindMany.length, 2);
  const firstQuery = tx.calls.ledgerFindMany[0];
  assert.deepEqual(firstQuery.where.storeId, { in: ["store-1", "store-2"] });
  assert.equal(
    firstQuery.where.closingDate.gte.toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(
    firstQuery.where.closingDate.lte.toISOString(),
    "2026-01-31T23:59:59.999Z",
  );
  assert.deepEqual(firstQuery.where.ledgerLaborItems, {
    some: { employeeId: "employee-1" },
  });
  assert.deepEqual(firstQuery.where.status.in, [
    "IN_PROGRESS",
    "IN_REVIEW",
    "HEADQUARTERS_CLOSED",
  ]);
  assert.equal(firstQuery.where.status.in.includes("HOLIDAY"), false);
  assert.deepEqual(firstQuery.orderBy, { id: "asc" });
  assert.equal(tx.calls.laborUpdateMany.length, 0);
  assert.equal(tx.calls.dailyLedgerUpdateMany.length, 0);
  assert.equal(tx.calls.auditCreateMany.length, 0);
});

test("closed-ledger denial happens after the lock read and before any writes", async () => {
  const { applyEmployeePastWageInTx } = await importPastWageHelper();
  const tx = makeTransactionMock({
    targets: [{ id: "ledger-closed" }],
    ledgers: [
      {
        id: "ledger-closed",
        status: "HEADQUARTERS_CLOSED",
        ledgerLaborItems: [{ id: "labor-1", amount: 80_000 }],
      },
    ],
  });

  const result = await applyPastWage(applyEmployeePastWageInTx, tx, {
    amount: 100_000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "FORBIDDEN");
  assert.equal(tx.calls.queryRaw.length, 1);
  assert.equal(tx.calls.laborUpdateMany.length, 0);
  assert.equal(tx.calls.dailyLedgerUpdateMany.length, 0);
  assert.equal(tx.calls.auditCreateMany.length, 0);
});

test("multiple labor rows accept zero and batch one version bump plus before/after audits per ledger", async () => {
  const { applyEmployeePastWageInTx } = await importPastWageHelper();
  const tx = makeTransactionMock({
    targets: [{ id: "ledger-a" }, { id: "ledger-b" }],
    ledgers: [
      {
        id: "ledger-a",
        status: "IN_REVIEW",
        ledgerLaborItems: [
          { id: "labor-a1", amount: 80_000 },
          { id: "labor-a2", amount: 90_000 },
        ],
      },
      {
        id: "ledger-b",
        status: "HEADQUARTERS_CLOSED",
        ledgerLaborItems: [{ id: "labor-b1", amount: 70_000 }],
      },
    ],
  });

  const result = await applyPastWage(applyEmployeePastWageInTx, tx, {
    amount: 0,
    reason: APPLY_REASON,
    canEditClosedLedgers: true,
  });

  assert.deepEqual(result, { ok: true, data: { updatedLaborItemCount: 3 } });
  assert.equal(tx.calls.laborUpdateMany.length, 1);
  assert.deepEqual(tx.calls.laborUpdateMany[0].where, {
    id: { in: ["labor-a1", "labor-a2", "labor-b1"] },
    employeeId: "employee-1",
  });
  assert.deepEqual(tx.calls.laborUpdateMany[0].data, {
    amount: 0,
    updatedById: "actor-1",
  });

  assert.equal(tx.calls.dailyLedgerUpdateMany.length, 1);
  assert.deepEqual(tx.calls.dailyLedgerUpdateMany[0].where, {
    id: { in: ["ledger-a", "ledger-b"] },
  });
  assert.deepEqual(tx.calls.dailyLedgerUpdateMany[0].data, {
    version: { increment: 1 },
    updatedById: "actor-1",
  });

  assert.equal(tx.calls.auditCreateMany.length, 1);
  const audits = tx.calls.auditCreateMany[0].data;
  const expectedAudits = [
    {
      targetId: "ledger-a",
      status: "IN_REVIEW",
      closedEdit: false,
      before: [
        { id: "labor-a1", amount: 80_000 },
        { id: "labor-a2", amount: 90_000 },
      ],
      after: [
        { id: "labor-a1", amount: 0 },
        { id: "labor-a2", amount: 0 },
      ],
    },
    {
      targetId: "ledger-b",
      status: "HEADQUARTERS_CLOSED",
      closedEdit: true,
      before: [{ id: "labor-b1", amount: 70_000 }],
      after: [{ id: "labor-b1", amount: 0 }],
    },
  ];
  assert.equal(audits.length, expectedAudits.length);
  for (const [index, expected] of expectedAudits.entries()) {
    const audit = audits[index];
    assert.deepEqual(
      { targetId: audit.targetId, reason: audit.reason },
      { targetId: expected.targetId, reason: APPLY_REASON },
    );
    assert.deepEqual(audit.before, { laborItems: expected.before });
    assert.deepEqual(audit.after, {
      laborItems: expected.after,
      ledgerStatusAtEdit: expected.status,
      closedEdit: expected.closedEdit,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  }
});
