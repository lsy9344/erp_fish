import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

test("KRW input formatter strips leading zeroes and displays thousands separators", async () => {
  const formatPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "krw-input-format.ts",
  );
  const { formatKrwInput, parseKrwInputValue, toRawKrwInputValue } =
    await import(pathToFileURL(formatPath).href);

  assert.equal(formatKrwInput("05000"), "5,000");
  assert.equal(formatKrwInput("1,234,567"), "1,234,567");
  assert.equal(formatKrwInput("000"), "0");
  assert.equal(formatKrwInput(""), "");

  assert.equal(toRawKrwInputValue("5,000"), "5000");
  assert.equal(toRawKrwInputValue("05000"), "5000");

  assert.equal(parseKrwInputValue("5,000"), 5000);
  assert.equal(parseKrwInputValue(""), 0);
});

test("sales payment inputs display formatted KRW while submitting raw numeric values", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "sales-payment-step-client.tsx",
  );

  assert.match(source, /formatKrwInput/);
  assert.match(source, /parseKrwInputValue/);
  assert.match(source, /toRawKrwInputValue/);
  assert.match(source, /setTotalSalesAmount\(formatKrwInput/);
  assert.match(source, /totalSalesAmount:\s*toRawKrwInputValue/);
  assert.doesNotMatch(source, /sanitizeAmountInput/);
});
