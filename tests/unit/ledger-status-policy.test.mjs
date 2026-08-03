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

// DESIGN.md D5: 마감 장부 편집은 마스터(LEDGER_CLOSED_EDIT 보유) 문맥에서만
// 허용하고, 기존 일반 사용자 정책과 HOLIDAY 차단은 그대로 유지한다.
test("ledger status policy actor context only unlocks HEADQUARTERS_CLOSED for closed-edit actors", async () => {
  const {
    editableLedgerStatuses,
    getEditableLedgerStatusesForActor,
    isLedgerEditableForActor,
    closedEditRetainedStatusNotice,
    closedEditSaveSuccessMessage,
  } = await import(pathToFileURL(policyPath).href);

  // 기본 문맥(마감 편집 권한 없음)은 기존 정책과 동일하다.
  assert.equal(isLedgerEditableForActor("IN_PROGRESS"), true);
  assert.equal(isLedgerEditableForActor("IN_REVIEW"), true);
  assert.equal(isLedgerEditableForActor("HEADQUARTERS_CLOSED"), false);
  assert.equal(isLedgerEditableForActor("HOLIDAY"), false);
  assert.equal(isLedgerEditableForActor(null), false);

  // 마감 편집 문맥에서도 HEADQUARTERS_CLOSED만 추가 허용되고 HOLIDAY는 계속 불가.
  const closedActor = { closedEditAllowed: true };
  assert.equal(isLedgerEditableForActor("IN_PROGRESS", closedActor), true);
  assert.equal(isLedgerEditableForActor("IN_REVIEW", closedActor), true);
  assert.equal(
    isLedgerEditableForActor("HEADQUARTERS_CLOSED", closedActor),
    true,
  );
  assert.equal(isLedgerEditableForActor("HOLIDAY", closedActor), false);
  assert.equal(isLedgerEditableForActor("UNKNOWN", closedActor), false);
  assert.equal(isLedgerEditableForActor(null, closedActor), false);

  // CAS 상태 목록도 문맥에 따라만 확장된다.
  assert.deepEqual(
    [...getEditableLedgerStatusesForActor()],
    [...editableLedgerStatuses],
  );
  assert.deepEqual(
    [...getEditableLedgerStatusesForActor({ closedEditAllowed: false })],
    [...editableLedgerStatuses],
  );
  assert.deepEqual(
    [...getEditableLedgerStatusesForActor(closedActor)],
    ["IN_PROGRESS", "IN_REVIEW", "HEADQUARTERS_CLOSED"],
  );

  // D7 안내 문구 상수.
  assert.equal(closedEditRetainedStatusNotice, "마감 상태 유지 · 마스터 수정");
  assert.equal(
    closedEditSaveSuccessMessage,
    "마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.",
  );
});
