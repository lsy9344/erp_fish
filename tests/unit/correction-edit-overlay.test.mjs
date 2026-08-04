import assert from "node:assert/strict";
import test from "node:test";

const overlayUrl = new URL(
  "../../src/features/corrections/edit-overlay.ts",
  import.meta.url,
);
const schemaUrl = new URL(
  "../../src/features/corrections/schemas.ts",
  import.meta.url,
);

function appliedValue(overrides) {
  return {
    key: "k",
    correctionId: "c1",
    targetLabel: "t",
    originalValue: null,
    previousAppliedValue: null,
    correctedValue: null,
    reason: "r",
    createdAt: "2026-08-03T00:00:00.000Z",
    createdBy: null,
    ...overrides,
  };
}

test("derived sales total uses active payment corrections but ignores totalSales correction", async () => {
  const { getDerivedSalesFormTotal } = await import(overlayUrl.href);
  const ledger = {
    id: "ledger-1",
    totalSalesAmount: 0,
    carryoverSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: null,
    workMemo: null,
  };
  const values = [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "PAYMENT_FIELD",
      targetId: "ledger-1",
      fieldKey: "cashAmount",
      latestAppliedValue: { kind: "money", value: 50, label: "현금" },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "PAYMENT_FIELD",
      targetId: "ledger-1",
      fieldKey: "totalSalesAmount",
      latestAppliedValue: { kind: "money", value: 100, label: "총매출" },
    }),
  ];

  // 폼을 건드리지 않고 저장하면 활성 현금 정정이 반영된 50과 같으므로
  // 총매출 정정(100)을 supersede하지 않는다.
  const untouchedBaseline = getDerivedSalesFormTotal(ledger, values, 0);
  assert.equal(untouchedBaseline, 50);
  assert.equal(50 !== untouchedBaseline, false);

  // 현금을 0으로 저장하면 폼의 파생 총매출이 실제로 바뀌므로 정정을 대체한다.
  assert.equal(0 !== untouchedBaseline, true);
});

test("ledger edit overlay applies active payment/ledger-field corrections except derived total", async () => {
  const { applyCorrectionOverlayToLedgerFields, applyExpenseRowOverlay } =
    await import(overlayUrl.href);

  const ledger = {
    id: "ledger-1",
    totalSalesAmount: 10000,
    carryoverSalesAmount: 0,
    cashAmount: 4000,
    cardAmount: 6000,
    otherPaymentAmount: 0,
    workerCount: 2,
    workMemo: null,
  };
  const values = [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "PAYMENT_FIELD",
      targetId: "ledger-1",
      fieldKey: "cashAmount",
      latestAppliedValue: { kind: "money", value: 45000, label: "현금" },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "PAYMENT_FIELD",
      targetId: "ledger-1",
      fieldKey: "totalSalesAmount",
      latestAppliedValue: { kind: "money", value: 51000, label: "총매출" },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "LEDGER_FIELD",
      targetId: "ledger-1",
      fieldKey: "workerCount",
      latestAppliedValue: { kind: "quantity", value: 3, label: "근무인원" },
    }),
    // 다른 장부의 정정은 적용되지 않는다.
    appliedValue({
      dailyLedgerId: "ledger-2",
      targetType: "PAYMENT_FIELD",
      targetId: "ledger-2",
      fieldKey: "cashAmount",
      latestAppliedValue: { kind: "money", value: 1, label: "현금" },
    }),
  ];

  // 폼 초기값: 파생 총매출은 제외하고 현금·근무인원만 반영.
  const formOverlay = applyCorrectionOverlayToLedgerFields(ledger, values, {
    includeDerivedTotal: false,
  });
  assert.equal(formOverlay.cashAmount, 45000);
  assert.equal(formOverlay.workerCount, 3);
  assert.equal(formOverlay.cardAmount, 6000);
  assert.equal(formOverlay.totalSalesAmount, 10000);

  // 감사 payload: 파생 총매출까지 유효값 반영.
  const auditOverlay = applyCorrectionOverlayToLedgerFields(ledger, values, {
    includeDerivedTotal: true,
  });
  assert.equal(auditOverlay.totalSalesAmount, 51000);

  // 정정이 없으면 원본을 그대로 반환.
  assert.equal(
    applyCorrectionOverlayToLedgerFields(ledger, [], {
      includeDerivedTotal: true,
    }),
    ledger,
  );

  // 지출 행 overlay는 행 id 기준으로 금액·메모만 교체.
  const rows = [
    {
      id: "e1",
      ledgerInputCodeId: "c",
      ledgerInputCodeName: "수도",
      amount: 1000,
      memo: null,
    },
    {
      id: "e2",
      ledgerInputCodeId: "c",
      ledgerInputCodeName: "전기",
      amount: 2000,
      memo: "원본",
    },
  ];
  const expenseValues = [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "EXPENSE_ROW",
      targetId: "e1",
      fieldKey: "amount",
      latestAppliedValue: {
        kind: "money",
        value: 1500,
        label: "지출 1 · 금액",
      },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "EXPENSE_ROW",
      targetId: "e2",
      fieldKey: "memo",
      latestAppliedValue: {
        kind: "text",
        value: "정정 메모",
        label: "지출 2 · 메모",
      },
    }),
  ];
  const overlaidRows = applyExpenseRowOverlay(rows, "ledger-1", expenseValues);
  assert.equal(overlaidRows[0].amount, 1500);
  assert.equal(overlaidRows[1].amount, 2000);
  assert.equal(overlaidRows[1].memo, "정정 메모");
});

test("inventory and loss edit overlays apply row-scoped quantity/amount corrections", async () => {
  const {
    applyCorrectionOverlayToInventoryEditValues,
    applyCorrectionOverlayToLossEditValues,
  } = await import(overlayUrl.href);

  const inventory = {
    id: "ledger-1",
    items: [
      { id: "row-1", currentQuantity: 5, quantity: 5 },
      { id: "row-2", currentQuantity: null, quantity: null },
    ],
  };
  const inventoryValues = [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "INVENTORY_ROW",
      targetId: "row-1",
      fieldKey: "currentQuantity",
      latestAppliedValue: {
        kind: "quantity",
        value: 4.5,
        label: "재고 1 · 현재고",
      },
    }),
  ];
  const overlaidInventory = applyCorrectionOverlayToInventoryEditValues(
    inventory,
    inventoryValues,
  );
  assert.equal(overlaidInventory.items[0].currentQuantity, 4.5);
  assert.equal(overlaidInventory.items[0].quantity, 5);
  assert.equal(overlaidInventory.items[1].currentQuantity, null);
  // 정정이 없는 데이터는 원본 반환.
  assert.equal(
    applyCorrectionOverlayToInventoryEditValues(inventory, []),
    inventory,
  );

  const loss = {
    id: "ledger-1",
    lossItems: [{ id: "loss-1", quantity: 2, amount: 4000 }],
  };
  const lossValues = [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "LOSS_ROW",
      targetId: "loss-1",
      fieldKey: "quantity",
      latestAppliedValue: {
        kind: "quantity",
        value: 3,
        label: "손실 1 · 수량",
      },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "LOSS_ROW",
      targetId: "loss-1",
      fieldKey: "amount",
      latestAppliedValue: {
        kind: "money",
        value: 5400,
        label: "손실 1 · 금액",
      },
    }),
  ];
  const overlaidLoss = applyCorrectionOverlayToLossEditValues(loss, lossValues);
  assert.equal(overlaidLoss.lossItems[0].quantity, 3);
  assert.equal(overlaidLoss.lossItems[0].amount, 5400);
});

test("text overlays distinguish no-correction from clearing a value to null", async () => {
  const {
    applyCorrectionOverlayToLedgerFields,
    applyExpenseRowOverlay,
    applyCorrectionOverlayToLossEditValues,
  } = await import(overlayUrl.href);

  // 근무 메모: 원본값이 있는 상태를 null로 지우는 활성 정정은 폼/감사에 반영된다.
  const ledger = {
    id: "ledger-1",
    totalSalesAmount: 10000,
    carryoverSalesAmount: 0,
    cashAmount: 4000,
    cardAmount: 6000,
    otherPaymentAmount: 0,
    workerCount: 2,
    workMemo: "원본 메모",
  };
  const clearedWorkMemo = applyCorrectionOverlayToLedgerFields(
    ledger,
    [
      appliedValue({
        dailyLedgerId: "ledger-1",
        targetType: "LEDGER_FIELD",
        targetId: "ledger-1",
        fieldKey: "workMemo",
        latestAppliedValue: { kind: "text", value: null, label: "특이사항" },
      }),
    ],
    { includeDerivedTotal: false },
  );
  assert.equal(clearedWorkMemo.workMemo, null);

  // 정정이 없으면 원본 메모가 유지된다("정정 없음"과 "null로 지운 정정" 구분).
  const untouched = applyCorrectionOverlayToLedgerFields(ledger, [], {
    includeDerivedTotal: false,
  });
  assert.equal(untouched.workMemo, "원본 메모");

  // 문자열로 바꾸는 정정도 그대로 적용된다.
  const replacedWorkMemo = applyCorrectionOverlayToLedgerFields(
    ledger,
    [
      appliedValue({
        dailyLedgerId: "ledger-1",
        targetType: "LEDGER_FIELD",
        targetId: "ledger-1",
        fieldKey: "workMemo",
        latestAppliedValue: {
          kind: "text",
          value: "정정 메모",
          label: "특이사항",
        },
      }),
    ],
    { includeDerivedTotal: false },
  );
  assert.equal(replacedWorkMemo.workMemo, "정정 메모");

  // 지출 메모: null로 지우는 정정이 행에 반영된다.
  const rows = [{ id: "e1", amount: 1000, memo: "원본 메모" }];
  const clearedMemoRows = applyExpenseRowOverlay(rows, "ledger-1", [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "EXPENSE_ROW",
      targetId: "e1",
      fieldKey: "memo",
      latestAppliedValue: { kind: "text", value: null, label: "지출 1 · 메모" },
    }),
  ]);
  assert.equal(clearedMemoRows[0].memo, null);
  assert.equal(rows[0].memo, "원본 메모");

  // 손실 사유: 기존 활성 정정은 폼/감사에 반영된다. 새 손실 사유 정정은
  // 빈 값이 스키마에서 차단되므로 null overlay는 과거 데이터 호환 경로로만 둔다.
  const loss = {
    id: "ledger-1",
    lossItems: [
      { id: "loss-1", quantity: 2, amount: 4000, reason: "원본 사유" },
      { id: "loss-2", quantity: 1, amount: 1000, reason: "지울 사유" },
    ],
  };
  const overlaidLoss = applyCorrectionOverlayToLossEditValues(loss, [
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "LOSS_ROW",
      targetId: "loss-1",
      fieldKey: "reason",
      latestAppliedValue: {
        kind: "text",
        value: "정정 사유",
        label: "손실 1 · 사유",
      },
    }),
    appliedValue({
      dailyLedgerId: "ledger-1",
      targetType: "LOSS_ROW",
      targetId: "loss-2",
      fieldKey: "reason",
      latestAppliedValue: { kind: "text", value: null, label: "손실 2 · 사유" },
    }),
  ]);
  assert.equal(overlaidLoss.lossItems[0].reason, "정정 사유");
  assert.equal(overlaidLoss.lossItems[1].reason, null);
  // 정정이 없는 필드는 원본 유지.
  assert.equal(overlaidLoss.lossItems[0].quantity, 2);
});

test("loss reason corrections reject blank values at the schema boundary", async () => {
  const { correctionRecordSchema, toFieldErrors } = await import(
    schemaUrl.href
  );
  const input = {
    ledgerId: "ledger-1",
    ledgerUpdatedAt: "2026-08-03T00:00:00.000Z",
    targetType: "LOSS_ROW",
    targetId: "loss-1",
    fieldKey: "reason",
    correctedValue: { kind: "text", value: "   " },
    reason: "손실 사유 확인",
  };

  const rejected = correctionRecordSchema.safeParse(input);

  assert.equal(rejected.success, false);
  assert.deepEqual(toFieldErrors(rejected.error), {
    "correctedValue.value": ["손실 사유를 입력해 주세요."],
  });

  const accepted = correctionRecordSchema.safeParse({
    ...input,
    correctedValue: { kind: "text", value: "  정정 손실 사유  " },
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.data.correctedValue.value, "정정 손실 사유");

  const tooLong = correctionRecordSchema.safeParse({
    ...input,
    correctedValue: { kind: "text", value: "x".repeat(501) },
  });
  assert.equal(tooLong.success, false);
  assert.deepEqual(toFieldErrors(tooLong.error), {
    "correctedValue.value": ["손실 사유는 500자 이하여야 합니다."],
  });
});
