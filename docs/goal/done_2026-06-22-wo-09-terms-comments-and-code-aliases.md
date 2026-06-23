# WO-09 Terms, Comments, and Code Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make user-facing wording easier to change and extend store-specific code display aliases beyond the currently limited loss-type path.

**Architecture:** Keep developer comments in code, but centralize user-facing Korean labels/messages by feature. Use store-specific aliases for input codes where branch wording can differ from headquarters registered code names.

**Tech Stack:** TypeScript constants/modules, existing `LedgerInputCodeStoreAlias`, feature components.

---

## Current Evidence

- Inventory has `src/features/inventory/terms.ts`.
- Store-specific alias infrastructure exists through `LedgerInputCodeStoreAlias`.
- Current alias editor is focused on loss type display names.
- Many user-facing strings still live inline across components/actions.

## Desired Behavior

- Common user-facing labels are easy to edit in one feature-local terms file.
- Store managers can override display names for relevant input codes they use.
- Headquarters still owns actual code creation, activation, and canonical names.
- Existing validation messages become simpler where users complained about wording.

## Files

- Modify: `src/features/inventory/terms.ts`
- Create: `src/features/ledger/terms.ts`
- Create: `src/features/losses/terms.ts`
- Create: `src/features/master-data/code-alias-terms.ts`
- Modify: `src/features/master-data/components/loss-type-alias-editor.tsx`
- Create or modify: `src/features/master-data/components/input-code-alias-editor.tsx`
- Modify: `src/features/ledger/components/expense-step-client.tsx`
- Modify: `src/features/losses/components/loss-step-client.tsx`
- Modify: `src/features/master-data/code-queries.ts`
- Modify: `tests/unit/code-store-alias.test.mjs`
- Modify: `tests/unit/ledger-losses.test.mjs`
- Modify: `tests/e2e/store-ledger-cost-labor.spec.ts`
- Modify: `tests/e2e/store-ledger-losses.spec.ts`

## Terms Files Pattern

Use simple named exports, not a dynamic CMS:

```ts
export const ledgerTerms = {
  paymentDifference: "결제 합계 차액",
  costStep: "비용",
  workerCount: "근무인원",
  workMemo: "특이사항 메모",
} as const;
```

Avoid over-generalizing. Keep one terms file per feature when the strings are used only there.

## Code Alias Scope

Use existing `LedgerInputCodeStoreAlias` for:

- `EXPENSE_ITEM` display names in expense step.
- `LOSS_TYPE` display names in loss step.

Do not use aliases for:

- Payment fixed fields unless payment methods become code-driven.
- Product names.
- Purchase standard names.

## Task Checklist

- [ ] Move repeated inventory wording into `inventoryTerms` if not already there.
- [ ] Add `ledgerTerms` for cost/work/review labels used in ledger components.
- [ ] Add `lossTerms` for reason, quantity, and validation labels.
- [ ] Generalize `LossTypeAliasEditor` into `InputCodeAliasEditor`.
- [ ] Render alias editor for loss types and expense items where store managers need local wording.
- [ ] Update code query to apply aliases for `EXPENSE_ITEM` as well as `LOSS_TYPE`.
- [ ] Keep headquarters code management showing canonical names.
- [ ] Replace harsh validation text with simple wording where users see it.
- [ ] Add tests that alias display applies by store and canonical code remains unchanged.

## Specific Wording Improvements

Current message example:

```text
포크오징어 / M2 손실 수량을 저장할 수 없습니다. 입력한 총 손실 수량 2이(가) 현재 차감 가능 수량 0보다 큽니다. 재고 흐름: 전일재고 0 + 오늘매입 0.
```

Recommended simpler message:

```text
포크오징어 / M2 손실 수량이 재고보다 많습니다. 입력 수량 2개, 손실 가능 수량 0개입니다. 전일재고 0개 + 오늘매입 0개를 확인해 주세요.
```

Use this as the target style for similar messages.

## Acceptance Criteria

- Inventory, expense, loss, and review labels use feature terms modules where practical.
- Store manager can override expense item and loss type display names for their own store.
- Headquarters canonical code names are unchanged by store alias edits.
- Validation messages use simple words and concrete numbers.
- Tests cover alias application and clearing aliases.

## Verification Commands

```powershell
pnpm test:unit:file tests/unit/code-store-alias.test.mjs tests/unit/ledger-losses.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-losses.spec.ts
```

