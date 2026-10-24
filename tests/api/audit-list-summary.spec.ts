import { expect, test } from "@playwright/test";
import { PrismaClient, type Prisma } from "../../generated/prisma/index.js";
import {
  auditListSummaryKeys,
  toAuditListSummary,
} from "../../src/features/audit/list-summary";
import {
  formatAuditChangeSummary,
  formatAuditJsonValue,
} from "../../src/features/audit/audit-format";
import type { AuditHistoryItem } from "../../src/features/audit/audit-queries";
import {
  defaultSensitiveFieldKeys,
  omitSensitiveFields,
} from "../../src/server/sensitive-fields";

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

test("legacy page ID arrays remain typed SQL parameters", async () => {
  const ids = ["fixture-first", "fixture-second"];
  const [row] = await prisma.$queryRaw<
    Array<{ allowed: boolean; denied: boolean }>
  >`
    SELECT 'fixture-first' = ANY(${ids}::text[]) AS allowed,
           'not-selected' = ANY(${ids}::text[]) AS denied`;
  expect(row).toEqual({ allowed: true, denied: false });
});

test("SQL version 1 and the reference projection preserve every formatter field and redaction rule", async () => {
  const pairs: Array<[Prisma.JsonValue, Prisma.JsonValue]> =
    auditListSummaryKeys.map((key) => [
      {
        [key]: [
          {
            productName: "광어",
            productSpec: "1kg",
            currentQuantity: null,
            quantity: 4,
            unitPrice: 500,
            fifoLots: ["omitted"],
          },
        ],
      },
      {
        [key]: [
          {
            productName: "광어",
            productSpec: "1kg",
            currentQuantity: 0,
            quantity: 0,
            unitPrice: 900,
            fifoLots: ["changed"],
          },
        ],
      },
    ]);
  pairs.push(
    [
      null,
      { name: "삭제된 품목 당시 이름", manualProductOptions: ["omitted"] },
    ],
    [
      [{ productName: "광어", hiddenVersion: 1 }],
      [{ productName: "광어", hiddenVersion: 2 }],
    ],
    [
      [{ productName: "광어", unitPrice: 1 }],
      [{ productName: "광어", unitPrice: 2 }],
    ],
  );
  for (const [before, after] of pairs) {
    const [row] = await prisma.$queryRaw<
      Array<{
        before: Prisma.JsonValue;
        after: Prisma.JsonValue;
        summary: ReturnType<typeof toAuditListSummary>;
      }>
    >`SELECT ${JSON.stringify(before)}::jsonb AS before, ${JSON.stringify(after)}::jsonb AS after,
      audit_list_summary_v1(${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb) AS summary`;
    expect(row!.summary).toEqual(toAuditListSummary(row!.before, row!.after));
    expect(
      formatAuditChangeSummary(
        omitSensitiveFields(row!.summary.before) as Prisma.JsonValue,
        omitSensitiveFields(row!.summary.after) as Prisma.JsonValue,
        row!.summary.rootChanged,
      ),
    ).toBe(
      formatAuditChangeSummary(
        omitSensitiveFields(row!.before) as Prisma.JsonValue,
        omitSensitiveFields(row!.after) as Prisma.JsonValue,
      ),
    );
  }
  const fields = [
    ...defaultSensitiveFieldKeys,
    "custom_Unit_Price",
    "myLot",
    "lot_value",
    "prefixinventoryAmountValue",
  ];
  const value = {
    nested: fields.map((key) => ({ [key]: 123, reason: "보존" })),
  };
  const [redacted] = await prisma.$queryRaw<Array<{ value: Prisma.JsonValue }>>`
    SELECT audit_list_redacted_v1(${JSON.stringify(value)}::jsonb) AS value`;
  expect(redacted!.value).toEqual(omitSensitiveFields(value));
});

test("inventory list DB result excludes raw source copies and records serialized byte proxies", async () => {
  const snapshot = {
    id: "fixture-ledger",
    items: Array.from({ length: 40 }, (_, index) => ({
      productName: `품목 ${index}`,
      productSpec: "1kg",
      currentQuantity: 8,
      fifoLots: Array.from({ length: 3 }, () => ({
        unitPrice: 500,
        remainingQuantity: 8,
      })),
      previousQuantityDetail: {
        history: Array.from({ length: 30 }, (_, day) => ({
          ledgerId: `day-${day}`,
          previousQuantity: 8,
          purchasedQuantity: 4,
        })),
      },
    })),
    manualProductOptions: Array.from({ length: 300 }, (_, index) => ({
      productName: `선택 ${index}`,
    })),
  };
  const raw = JSON.stringify(snapshot);
  const [row] = await prisma.$queryRaw<Array<{ summary: Prisma.JsonValue }>>`
    SELECT audit_list_summary_v1(${raw}::jsonb, ${raw}::jsonb) AS summary`;
  const originalBytes = Buffer.byteLength(
    JSON.stringify({ before: snapshot, after: snapshot }),
  );
  const listDbResultBytes = Buffer.byteLength(JSON.stringify(row));
  expect(listDbResultBytes).toBeLessThan(originalBytes * 0.2);
  expect(JSON.stringify(row)).not.toMatch(
    /fifoLots|manualProductOptions|previousQuantityDetail/,
  );
  const listItem: AuditHistoryItem = {
    id: "fixture-audit",
    createdAt: "2026-10-24T00:00:00.000Z",
    actorId: "fixture-actor",
    actorName: "시험 작성자",
    targetType: "DailyLedger",
    targetTypeLabel: "장부",
    targetName: "시험 장부",
    action: "ledger.inventory.saved",
    actionLabel: "재고 저장",
    reasonText: "-",
    changeSummaryText: "-",
    ledgerDetailHref: null,
  };
  const safeSnapshot = omitSensitiveFields(snapshot) as Prisma.JsonValue;
  const originalAppModelBytes = Buffer.byteLength(
    JSON.stringify({
      items: [
        {
          ...listItem,
          beforeText: formatAuditJsonValue(safeSnapshot),
          afterText: formatAuditJsonValue(safeSnapshot),
        },
      ],
    }),
  );
  const listAppModelBytes = Buffer.byteLength(
    JSON.stringify({ items: [listItem] }),
  );
  expect(listAppModelBytes).toBeLessThan(originalAppModelBytes * 0.2);
  console.log(
    JSON.stringify({
      event: "audit_list_bytes",
      fixture: "synthetic",
      originalBytes,
      listDbResultBytes,
      originalAppModelBytes,
      listAppModelBytes,
      billingBytes: false,
    }),
  );
});
