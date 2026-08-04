import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  return readFileSync(path.join(root, ...segments), "utf8");
}

const stepClients = [
  ["src", "features", "ledger", "components", "purchase-step-client.tsx"],
  ["src", "features", "ledger", "components", "expense-step-client.tsx"],
  ["src", "features", "ledger", "components", "sales-payment-step-client.tsx"],
  ["src", "features", "ledger", "components", "workstep-client.tsx"],
  ["src", "features", "losses", "components", "loss-step-client.tsx"],
  ["src", "features", "inventory", "components", "inventory-step-client.tsx"],
];

// DESIGN.md 구현 원칙 3: 클라이언트 prop은 입력 표시만 제어하며 기본값은 false다.
test("all HQ step clients accept closedEditAllowed with default false and actor-aware gate", () => {
  for (const segments of stepClients) {
    const source = readProjectFile(...segments);
    const name = segments[segments.length - 1];

    assert.match(
      source,
      /closedEditAllowed\?: boolean;/,
      `${name} should declare the optional closedEditAllowed prop`,
    );
    assert.match(
      source,
      /closedEditAllowed = false/,
      `${name} should default closedEditAllowed to false`,
    );
    assert.match(
      source,
      /isLedgerEditableForActor\((ledger|data)\.status, \{\s*closedEditAllowed,\s*\}\)/s,
      `${name} should gate editing through the actor-aware policy`,
    );
    assert.match(
      source,
      /closedEditRetained=\{closedEditAllowed\}/,
      `${name} should surface the retained-close notice on save success`,
    );
  }
});

test("ledger detail page derives closedEditAllowed from LEDGER_CLOSED_EDIT and closed status only", () => {
  const source = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(
    source,
    /hasActionPermission\(user\.id, PermissionAction\.LEDGER_CLOSED_EDIT\)/,
    "page should query the closed-edit permission",
  );
  assert.match(
    source,
    /closedEditAllowed\s*=\s*[\s\S]*?canEditLedger\s*&&[\s\S]*?canEditClosedLedger\s*&&[\s\S]*?ledger\.status === "HEADQUARTERS_CLOSED"/,
    "closedEditAllowed requires LEDGER_EDIT + LEDGER_CLOSED_EDIT + closed status",
  );
  assert.match(
    source,
    /isLedgerEditableForActor\(ledger\.status, \{\s*closedEditAllowed,\s*\}\)/s,
  );
  // 마감 장부에서 마감 다이얼로그가 다시 노출되지 않도록 상태를 명시 가드한다.
  assert.match(
    source,
    /ledger\.status !== "HEADQUARTERS_CLOSED" &&[\s\S]*?!isOriginalEditBlocked &&[\s\S]*?canCloseLedger/,
  );
  // 마스터 편집 가능 안내는 텍스트로 표시한다(색상만으로 전달 금지).
  assert.match(source, /closedEditRetainedStatusNotice/);
  assert.match(source, /이 장부의 업무 내용을 수정할 수 있습니다/);
  // 모든 편집 탭에 마감 편집 허용 상태를 전달한다.
  assert.equal(source.match(/closedEditAllowed=\{closedEditAllowed\}/g)?.length, 6);
});
