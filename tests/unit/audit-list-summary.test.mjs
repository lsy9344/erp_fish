import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAuditChangeSummary } from "../../src/features/audit/audit-format.ts";
import {
  auditListSummaryKeys,
  toAuditListSummary,
} from "../../src/features/audit/list-summary.ts";
import { omitSensitiveFields } from "../../src/server/sensitive-fields.ts";
import {
  parseAuditHistoryCursor,
  auditHistoryCursorWhere,
} from "../../src/features/audit/audit-pagination.ts";

function assertSummary(before, after) {
  const original = structuredClone({ before, after });
  const summary = toAuditListSummary(before, after);
  assert.equal(
    formatAuditChangeSummary(
      omitSensitiveFields(summary.before),
      omitSensitiveFields(summary.after),
      summary.rootChanged,
    ),
    formatAuditChangeSummary(
      omitSensitiveFields(before),
      omitSensitiveFields(after),
    ),
  );
  assert.deepEqual({ before, after }, original);
}

test("list projection preserves all formatter field kinds and removes screen/FIFO source copies", () => {
  for (const key of auditListSummaryKeys) {
    for (const [before, after] of [
      [0, 1.25],
      [null, false],
      ["", "새 값"],
      [[], ["권한 A", "권한 B"]],
      [
        { quantity: 1, reason: "이전 사유" },
        { quantity: 2, reason: "새 사유" },
      ],
      [
        [
          {
            productName: "광어",
            productSpec: "1kg",
            currentQuantity: null,
            quantity: 4,
            unitPrice: 500,
          },
        ],
        [
          {
            productName: "광어",
            productSpec: "1kg",
            currentQuantity: 0,
            quantity: 0,
            unitPrice: 900,
          },
        ],
      ],
    ])
      assertSummary({ [key]: before }, { [key]: after });
  }
  const value = {
    items: [
      {
        productName: "품목",
        currentQuantity: 0,
        previousQuantityDetail: { history: ["large"] },
        fifoLots: ["large"],
      },
    ],
    manualProductOptions: ["large"],
  };
  const summary = toAuditListSummary(null, value);
  assert.equal(JSON.stringify(summary).includes("large"), false);
  assertSummary(null, value);
});

test("non-object legacy roots keep formatter equality after sensitive fields are removed", () => {
  for (const [before, after] of [
    [undefined, null],
    [null, "new"],
    [[], []],
    [
      [{ productName: "품목", hiddenVersion: 1 }],
      [{ productName: "품목", hiddenVersion: 2 }],
    ],
    [
      [{ productName: "품목", unitPrice: 1 }],
      [{ productName: "품목", unitPrice: 2 }],
    ],
    [
      [null, 0, false],
      [null, 1, false],
    ],
  ])
    assertSummary(before, after);
});

test("cursor uses both descending keys and rejects malformed tokens", () => {
  const createdAt = "2026-10-24T00:00:00.000Z";
  const cursor = parseAuditHistoryCursor(`${createdAt}|same-time-id`);
  assert.deepEqual(cursor, { createdAt, id: "same-time-id" });
  assert.deepEqual(auditHistoryCursorWhere(cursor), {
    OR: [
      { createdAt: { lt: new Date(createdAt) } },
      { createdAt: new Date(createdAt), id: { lt: "same-time-id" } },
    ],
  });
  for (const token of [
    undefined,
    "",
    "bad|id",
    `${createdAt}|`,
    `${createdAt}|id|extra`,
    ["a", "b"],
    "x".repeat(513),
  ]) {
    assert.equal(parseAuditHistoryCursor(token), null);
  }
});
