import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const policyPath = path.join(
  root,
  "src",
  "features",
  "ledger",
  "status-policy.ts",
);

test("ledger status policy exposes the editable and read-only status rules", async () => {
  const {
    editableLedgerStatuses,
    getLedgerEditBlockReason,
    isLedgerEditable,
    isLedgerReadOnly,
  } = await import(pathToFileURL(policyPath).href);

  assert.deepEqual(editableLedgerStatuses, ["IN_PROGRESS", "IN_REVIEW"]);

  assert.equal(isLedgerEditable("IN_PROGRESS"), true);
  assert.equal(isLedgerEditable("IN_REVIEW"), true);
  assert.equal(isLedgerEditable("HEADQUARTERS_CLOSED"), false);
  assert.equal(isLedgerEditable("HOLIDAY"), false);
  assert.equal(isLedgerEditable("UNKNOWN"), false);

  assert.equal(isLedgerReadOnly("HEADQUARTERS_CLOSED"), true);
  assert.equal(isLedgerReadOnly("HOLIDAY"), true);
  assert.equal(isLedgerReadOnly("IN_PROGRESS"), false);

  assert.deepEqual(getLedgerEditBlockReason("HEADQUARTERS_CLOSED"), {
    code: "LEDGER_CLOSED",
    message:
      "본사 마감된 장부는 원본 항목으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
  });
  assert.deepEqual(getLedgerEditBlockReason("HOLIDAY"), {
    code: "LEDGER_NOT_EDITABLE",
    message:
      "휴무 장부는 원본 항목으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
  });
  assert.deepEqual(getLedgerEditBlockReason("ARCHIVED"), {
    code: "LEDGER_NOT_EDITABLE",
    message: "수정할 수 없는 장부 상태입니다.",
  });
});

test("ledger status policy centralizes context-specific block messages", async () => {
  const { getLedgerEditBlockReason } = await import(
    pathToFileURL(policyPath).href
  );

  assert.deepEqual(
    getLedgerEditBlockReason("HEADQUARTERS_CLOSED", "submit-review"),
    {
      code: "LEDGER_CLOSED",
      message: "본사 마감된 장부는 검토 대기로 제출할 수 없습니다.",
    },
  );
  assert.deepEqual(getLedgerEditBlockReason("HOLIDAY", "submit-review"), {
    code: "LEDGER_NOT_EDITABLE",
    message: "휴무 장부는 검토 대기로 제출할 수 없습니다.",
  });
  assert.deepEqual(
    getLedgerEditBlockReason("HEADQUARTERS_CLOSED", "inventory-adjustment"),
    {
      code: "LEDGER_CLOSED",
      message:
        "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    },
  );
  assert.deepEqual(getLedgerEditBlockReason("HOLIDAY", "loss-entry"), {
    code: "LEDGER_NOT_EDITABLE",
    message:
      "휴무 장부는 원본 손실 입력으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
  });
  assert.deepEqual(getLedgerEditBlockReason("HOLIDAY", "hq-close"), {
    code: "LEDGER_NOT_EDITABLE",
    message: "휴무 장부는 본사 마감할 수 없습니다.",
  });
});
