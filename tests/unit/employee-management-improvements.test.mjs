import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);
  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);
  return readFileSync(filePath, "utf8");
}

test("employee money inputs format commas without changing the stored number", async () => {
  const helperPath = path.join(
    root,
    "src",
    "features",
    "labor",
    "employee-form-values.ts",
  );
  assert.ok(
    existsSync(helperPath),
    "employee money input helpers should exist",
  );

  const { formatWonInput, parseWonInput } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(formatWonInput("120000"), "120,000");
  assert.equal(formatWonInput("1,234"), "1,234");
  assert.equal(formatWonInput("12만원"), "12");
  assert.equal(formatWonInput(""), "");
  assert.equal(parseWonInput("120,000"), 120_000);
  assert.equal(parseWonInput(""), null);
});

test("employee daily wage is snapshotted only for a new linked labor row", async () => {
  const snapshotPath = path.join(
    root,
    "src",
    "features",
    "labor",
    "labor-amount-snapshot.ts",
  );
  assert.ok(existsSync(snapshotPath), "labor snapshot helper should exist");

  const { getHqLaborSnapshotAmount, getStoreManagerLaborSnapshotAmount } =
    await import(pathToFileURL(snapshotPath).href);

  assert.equal(
    getStoreManagerLaborSnapshotAmount({
      carriedAmount: undefined,
      employeeId: "employee-a",
      dailyWage: 120_000,
    }),
    120_000,
  );
  assert.equal(
    getStoreManagerLaborSnapshotAmount({
      carriedAmount: 0,
      employeeId: "employee-a",
      dailyWage: 120_000,
    }),
    0,
  );
  assert.equal(
    getHqLaborSnapshotAmount({
      hasExistingRow: false,
      enteredAmount: 0,
      employeeId: "employee-b",
      dailyWage: 150_000,
    }),
    150_000,
  );
  assert.equal(
    getHqLaborSnapshotAmount({
      hasExistingRow: true,
      enteredAmount: 130_000,
      employeeId: "employee-b",
      dailyWage: 150_000,
    }),
    130_000,
  );
});

test("employee management exposes store, explicit status actions, and safe delete", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-management-client.tsx",
  );

  assert.match(pageSource, /storeOptions=/);
  assert.match(clientSource, /FieldGroup/);
  assert.match(clientSource, /FieldLabel[^]*기본 근무매장/);
  assert.match(clientSource, /<Select/);
  assert.match(clientSource, /<SelectGroup>/);
  assert.match(clientSource, /activateEmployee/);
  assert.match(clientSource, /deleteEmployee/);
  assert.match(clientSource, /<AlertDialog/);
  assert.match(clientSource, /재직/);
  assert.match(clientSource, /퇴사[^]*사용중지/);
  assert.doesNotMatch(
    clientSource,
    /const payload = \{ \.\.\.form, isActive: true \}/,
  );
});

test("ledger employee choices display a disambiguating label", () => {
  const workStepSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );

  assert.match(workStepSource, /label: string/);
  assert.match(workStepSource, /isActive: boolean/);
  assert.match(workStepSource, /\{option\.label\}/);
  assert.match(workStepSource, /disabled=\{!option\.isActive\}/);
  assert.match(workStepSource, /기본 근무매장/);
});
