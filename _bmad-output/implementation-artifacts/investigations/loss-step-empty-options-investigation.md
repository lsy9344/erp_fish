# Investigation: 손실/폐기 단계 선택지 없음

## Hand-off Brief

1. **What happened.** 지점장 입력의 손실/폐기 단계에서 "선택 가능한 active 품목 또는 active 손실 유형이 없습니다." 문구가 표시된다는 사용자 보고가 있었다.
2. **Where the case stands.** Concluded. 화면 문구의 출처와 조건이 확인됐고, 현재 DB에는 active 품목 7개가 있으나 `LOSS_TYPE` 손실 유형 코드가 0개다.
3. **What's needed next.** 본사 계정으로 `코드 관리`에서 코드 그룹 `손실 유형`을 하나 이상 추가하고 활성 상태로 둔다.

## Case Info

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Ticket           | N/A                                                                   |
| Date opened      | 2026-06-04                                                            |
| Status           | Active                                                                |
| System           | Windows, PowerShell, project `erp_fish`                               |
| Evidence sources | User-reported UI text, source code, version control, planning stories |

## Problem Statement

사용자는 지점장 입력 페이지의 `손실/폐기` 단계에서 다음 문구가 왜 발생하는지, 이 페이지가 무엇을 하는 페이지인지, 본인이 어떻게 해야 하는지 질문했다.

```text
손실 항목
선택 가능한 active 품목 또는 active 손실 유형이 없습니다.
항목이 없습니다. 새 항목을 추가해 주세요.
```

## Evidence Inventory

| Source                         | Status    | Notes                                                             |
| ------------------------------ | --------- | ----------------------------------------------------------------- |
| UI exact text search           | Available | Exact strings found in `src/features/losses/components/loss-step-client.tsx`. |
| Planning story 2.6             | Available | 손실/폐기/떨이 입력은 active 품목과 active 손실 유형을 선택지로 사용해야 한다. |
| Runtime database contents      | Available | active products = 7, active `LOSS_TYPE` codes = 0. |

## Investigation Backlog

| # | Path to Explore                      | Priority | Status | Notes |
| - | ------------------------------------ | -------- | ------ | ----- |
| 1 | Loss step component props and guards | High     | Done   | `hasOptions` requires both product and loss type options. |
| 2 | Store-entry losses page/query path   | High     | Done   | page calls `getLossStepData`; query filters active products and active `LOSS_TYPE` codes. |
| 3 | Seed/master-data definitions         | Medium   | Done   | seed creates headquarters user only, not loss type codes. |

## Timeline of Events

| Time       | Event                                      | Source | Confidence |
| ---------- | ------------------------------------------ | ------ | ---------- |
| 2026-06-04 | User reported empty options in loss step UI | User   | Confirmed  |

## Confirmed Findings

### Finding 1: The exact warning text is rendered by the loss step client.

**Evidence:** `src/features/losses/components/loss-step-client.tsx:392`

**Detail:** The component contains the exact text reported by the user.

### Finding 2: The add button requires both active product options and active loss type options.

**Evidence:** `src/features/losses/components/loss-step-client.tsx:300`

**Detail:** `hasOptions` is true only when `data.productOptions.length > 0` and `data.lossTypeOptions.length > 0`.

### Finding 3: Loss step options are loaded from active products and active `LOSS_TYPE` codes.

**Evidence:** `src/features/losses/queries.ts:64`, `src/features/losses/queries.ts:75`

**Detail:** Products use `where: { isActive: true }`; loss type codes use `where: { isActive: true, group: "LOSS_TYPE" }`.

### Finding 4: Current database has no loss type codes.

**Evidence:** Local Prisma count query on 2026-06-04

**Detail:** Active products = 7, total products = 7, active `LOSS_TYPE` codes = 0, total `LOSS_TYPE` codes = 0.

## Deduced Conclusions

### Deduction 1: The observed empty state is caused by missing loss type master data.

**Based on:** Finding 2, Finding 3, Finding 4

**Reasoning:** The UI requires both active product options and active loss type options. The database has active products but no `LOSS_TYPE` codes at all, so `data.lossTypeOptions.length` is 0 and `hasOptions` is false.

**Conclusion:** The page is behaving as designed for the current data setup; the missing setup is at least one active 손실 유형 code.

## Hypothesized Paths

### Hypothesis 1: Active products or active loss type codes are missing.

**Status:** Confirmed

**Theory:** The loss item form disables adding rows when either product options or loss type options are empty.

**Supporting indicators:** The UI text explicitly mentions active products and active loss types.

**Would confirm:** Source code shows the empty-state condition depends on product/loss type option lengths, and page queries source those options from active master data.

**Would refute:** Source code shows the message is rendered for an unrelated validation or permission condition.

**Resolution:** Confirmed by source trace and local DB counts.

## Missing Evidence

| Gap                         | Impact                                      | How to Obtain |
| --------------------------- | ------------------------------------------- | ------------- |
| Current database master data | Resolved | Queried with Prisma on 2026-06-04 |

## Source Code Trace

| Element       | Detail                                                   |
| ------------- | -------------------------------------------------------- |
| Error origin  | `src/features/losses/components/loss-step-client.tsx:392` |
| Trigger       | User opens 지점장 입력 `손실/폐기` step                   |
| Condition     | `data.productOptions.length === 0` or `data.lossTypeOptions.length === 0` |
| Related files | `src/app/app/store-entry/losses/page.tsx`, `src/features/losses/queries.ts`, `src/features/losses/actions.ts`, `src/app/app/master-data/codes/page.tsx`, `src/app/app/master-data/products/page.tsx` |

## Conclusion

**Confidence:** High

The observed screen is caused by missing active `LOSS_TYPE` master data. Current DB has active products but no 손실 유형 codes, and the loss step requires both options before adding a loss row.

## Recommended Next Steps

### Fix direction

No code fix is required for this specific state. Add active 손실 유형 codes through headquarters code management.

### Diagnostic

If the message still appears after adding a 손실 유형, verify the code status is active and the group is exactly `손실 유형` / `LOSS_TYPE`.

## Reproduction Plan

1. Open `/app/store-entry/losses`.
2. With no active `LOSS_TYPE` code, observe the warning and disabled add button.
3. Add an active `LOSS_TYPE` code in `/app/master-data/codes`.
4. Reload `/app/store-entry/losses`; the add button should become usable if active products still exist.

## Side Findings

## Follow-up: 2026-06-04

### New Evidence

### Additional Findings

### Updated Hypotheses

### Backlog Changes

### Updated Conclusion
