import type { CorrectionAppliedValue, CorrectionValue } from "./types";

/**
 * DESIGN.md D9: 편집 화면은 현재 적용 중인 정정값을 반영한 값을 보여준다.
 * 마스터가 마감 장부를 직접 수정할 때 편집 폼 초기값과 감사 before/after가
 * 원본값이 아닌 유효값(정정 반영값) 기준이 되도록 순수 함수로 overlay를 적용한다.
 *
 * 주의: totalSalesAmount는 매출/결제 폼에서 결제수단 합계로 파생되는 읽기 전용
 * 값이라 폼 초기값에는 적용하지 않는다(includeDerivedTotal=false). 감사 payload처럼
 * 유효값 전체가 필요한 문맥에서만 true로 적용한다.
 */

export type CorrectionOverlayValues = Iterable<CorrectionAppliedValue>;

function overlayKey(input: {
  dailyLedgerId: string;
  targetType: string;
  targetId: string;
  fieldKey: string;
}) {
  return [
    input.dailyLedgerId,
    input.targetType,
    input.targetId,
    input.fieldKey,
  ].join(":");
}

function toOverlayMap(values: CorrectionOverlayValues) {
  const map = new Map<string, CorrectionAppliedValue>();

  for (const value of values) {
    map.set(
      overlayKey({
        dailyLedgerId: value.dailyLedgerId,
        targetType: value.targetType,
        targetId: value.targetId,
        fieldKey: value.fieldKey,
      }),
      value,
    );
  }

  return map;
}

function readAppliedValue(
  map: Map<string, CorrectionAppliedValue>,
  input: {
    dailyLedgerId: string;
    targetType: string;
    targetId: string;
    fieldKey: string;
  },
): CorrectionValue | null {
  const applied = map.get(overlayKey(input));

  if (!applied) {
    return null;
  }

  const value = applied.latestAppliedValue as CorrectionValue | null;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function readAppliedNumber(
  map: Map<string, CorrectionAppliedValue>,
  input: {
    dailyLedgerId: string;
    targetType: string;
    targetId: string;
    fieldKey: string;
  },
): number | null {
  const value = readAppliedValue(map, input);

  return value !== null &&
    typeof value.value === "number" &&
    Number.isFinite(value.value)
    ? value.value
    : null;
}

function readAppliedString(
  map: Map<string, CorrectionAppliedValue>,
  input: {
    dailyLedgerId: string;
    targetType: string;
    targetId: string;
    fieldKey: string;
  },
): string | null {
  const value = readAppliedValue(map, input);

  return value !== null && typeof value.value === "string"
    ? value.value
    : null;
}

const paymentOverlayFieldKeys = [
  "totalSalesAmount",
  "carryoverSalesAmount",
  "cashAmount",
  "cardAmount",
  "otherPaymentAmount",
] as const;

type LedgerFieldOverlayTarget = {
  id: string;
  totalSalesAmount: number;
  carryoverSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  workMemo: string | null;
};

/**
 * 장부의 결제 필드·근무 필드에 활성 PAYMENT_FIELD/LEDGER_FIELD 정정을 적용한
 * 복사본을 만든다. 지출 행은 applyExpenseRowOverlay로 별도로 적용한다.
 * 정정이 없으면 원본을 그대로 반환한다.
 */
export function applyCorrectionOverlayToLedgerFields<
  T extends LedgerFieldOverlayTarget,
>(
  ledger: T,
  values: CorrectionOverlayValues,
  options: { includeDerivedTotal: boolean },
): T {
  const map = toOverlayMap(values);

  if (map.size === 0) {
    return ledger;
  }

  const overlay: Partial<
    Pick<
      LedgerFieldOverlayTarget,
      | "totalSalesAmount"
      | "carryoverSalesAmount"
      | "cashAmount"
      | "cardAmount"
      | "otherPaymentAmount"
      | "workerCount"
      | "workMemo"
    >
  > = {};

  for (const fieldKey of paymentOverlayFieldKeys) {
    if (fieldKey === "totalSalesAmount" && !options.includeDerivedTotal) {
      continue;
    }

    const applied = readAppliedNumber(map, {
      dailyLedgerId: ledger.id,
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey,
    });

    if (applied !== null) {
      overlay[fieldKey] = applied;
    }
  }

  const workerCount = readAppliedNumber(map, {
    dailyLedgerId: ledger.id,
    targetType: "LEDGER_FIELD",
    targetId: ledger.id,
    fieldKey: "workerCount",
  });

  if (workerCount !== null) {
    overlay.workerCount = workerCount;
  }

  const workMemo = readAppliedString(map, {
    dailyLedgerId: ledger.id,
    targetType: "LEDGER_FIELD",
    targetId: ledger.id,
    fieldKey: "workMemo",
  });

  if (workMemo !== null) {
    overlay.workMemo = workMemo;
  }

  if (Object.keys(overlay).length === 0) {
    return ledger;
  }

  return { ...ledger, ...overlay };
}

/**
 * 지출 행 목록에 EXPENSE_ROW 활성 정정(금액·메모)을 적용한다. 행 id가 정정
 * 대상과 일치하는 행만 교체되고 나머지는 그대로 반환된다.
 */
export function applyExpenseRowOverlay<T extends { id: string }>(
  rows: readonly T[],
  ledgerId: string,
  values: CorrectionOverlayValues,
): T[] {
  const map = toOverlayMap(values);

  if (map.size === 0) {
    return [...rows];
  }

  return rows.map((row) => {
    const amount = readAppliedNumber(map, {
      dailyLedgerId: ledgerId,
      targetType: "EXPENSE_ROW",
      targetId: row.id,
      fieldKey: "amount",
    });
    const memo = readAppliedString(map, {
      dailyLedgerId: ledgerId,
      targetType: "EXPENSE_ROW",
      targetId: row.id,
      fieldKey: "memo",
    });

    if (amount === null && memo === null) {
      return row;
    }

    const next: Record<string, unknown> = { ...row };

    if (amount !== null && "amount" in row) {
      next.amount = amount;
    }

    if (memo !== null && "memo" in row) {
      next.memo = memo;
    }

    return next as T;
  });
}

type InventoryOverlayTarget = {
  id: string;
  items: Array<{
    id: string;
    currentQuantity: number | null;
    quantity: number | null;
  }>;
};

/** 재고 편집 폼/감사 payload에 INVENTORY_ROW 활성 정정을 적용한다. */
export function applyCorrectionOverlayToInventoryEditValues<
  T extends InventoryOverlayTarget,
>(data: T, values: CorrectionOverlayValues): T {
  const map = toOverlayMap(values);

  if (map.size === 0) {
    return data;
  }

  let changed = false;
  const items = data.items.map((item) => {
    const currentQuantity = readAppliedNumber(map, {
      dailyLedgerId: data.id,
      targetType: "INVENTORY_ROW",
      targetId: item.id,
      fieldKey: "currentQuantity",
    });
    const quantity = readAppliedNumber(map, {
      dailyLedgerId: data.id,
      targetType: "INVENTORY_ROW",
      targetId: item.id,
      fieldKey: "quantity",
    });

    if (currentQuantity === null && quantity === null) {
      return item;
    }

    changed = true;

    return {
      ...item,
      currentQuantity: currentQuantity ?? item.currentQuantity,
      quantity: quantity ?? item.quantity,
    };
  });

  return changed ? { ...data, items } : data;
}

type LossOverlayTarget = {
  id: string;
  lossItems: Array<{
    id: string;
    quantity: number;
    amount: number;
  }>;
};

/** 손실 편집 폼/감사 payload에 LOSS_ROW 활성 정정을 적용한다. */
export function applyCorrectionOverlayToLossEditValues<
  T extends LossOverlayTarget,
>(data: T, values: CorrectionOverlayValues): T {
  const map = toOverlayMap(values);

  if (map.size === 0) {
    return data;
  }

  let changed = false;
  const lossItems = data.lossItems.map((item) => {
    const quantity = readAppliedNumber(map, {
      dailyLedgerId: data.id,
      targetType: "LOSS_ROW",
      targetId: item.id,
      fieldKey: "quantity",
    });
    const amount = readAppliedNumber(map, {
      dailyLedgerId: data.id,
      targetType: "LOSS_ROW",
      targetId: item.id,
      fieldKey: "amount",
    });

    if (quantity === null && amount === null) {
      return item;
    }

    changed = true;

    return {
      ...item,
      quantity: quantity ?? item.quantity,
      amount: amount ?? item.amount,
    };
  });

  return changed ? { ...data, lossItems } : data;
}
