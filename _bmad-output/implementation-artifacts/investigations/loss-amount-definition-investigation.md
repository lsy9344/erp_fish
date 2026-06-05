# Investigation: 손실/폐기 금액 정의

## Hand-off Brief

1. **What happened.** 사용자는 손실/폐기 화면의 `금액`이 손해 본 금액인지 판매한 금액인지 질문했다.
2. **Where the case stands.** Concluded. 현재 구현은 이 값을 `판매금액`이 아니라 `손실액`으로 집계하고, 재고/검토/이상 신호에도 손실 금액으로 반영한다.
3. **What's needed next.** UI 라벨을 `금액`에서 `손실액(원)`으로 바꾸고, `떨이`는 판매가/정상가/손실액 중 어떤 값을 운영 기준으로 받을지 정책을 확정해야 한다.

## Case Info

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| Ticket           | N/A                                                     |
| Date opened      | 2026-06-04                                              |
| Status           | Concluded                                               |
| System           | Windows, PowerShell, project `erp_fish`                 |
| Evidence sources | User screenshot, source code, story 2.6, planning brief |

## Problem Statement

`손실/폐기` 화면의 `금액` 필드가 얼마를 손해 봤다는 뜻인지, 얼마에 팔았다는 뜻인지 불명확하다. 특히 처리 유형이 `떨이`일 때 현재 화면이 맞는지 재검토가 필요하다.

## Evidence Inventory

| Source              | Status    | Notes |
| ------------------- | --------- | ----- |
| Loss step UI source | Available | Summary label is `총 손실액`; row field label is only `금액`. |
| Calculation source  | Available | `amount` is summed into loss totals and compared to loss thresholds. |
| Inventory source    | Available | `amount` becomes `lossAmount` in inventory flow. |
| Story 2.6           | Available | Story states actual inventory decrease and `손실 금액`. |
| Planning brief      | Available | Earlier brief listed `손실액 저장 방식` as policy risk. |

## Confirmed Findings

### Finding 1: The screen totals the field as loss amount.

**Evidence:** `src/features/losses/components/loss-step-client.tsx:334`

**Detail:** The summary card label is `총 손실액`, and it sums row `amount` values.

### Finding 2: The row label itself is ambiguous.

**Evidence:** `src/features/losses/components/loss-step-client.tsx:576`

**Detail:** The input label says only `금액`, not `손실액`, `판매금액`, or `처분금액`.

### Finding 3: Server calculations treat amount as loss amount.

**Evidence:** `src/server/calculations/inventory.ts:61`, `src/server/calculations/inventory.ts:88`

**Detail:** `summarizeLossItems` totals `amount`, and `getLossSignalCandidates` compares `item.amount` to the loss amount threshold.

### Finding 4: Inventory flow exposes the field as `lossAmount`.

**Evidence:** `src/features/inventory/queries.ts:201`, `src/features/inventory/components/inventory-step-client.tsx:510`

**Detail:** Loss `amount` is mapped to `lossAmount` and displayed as 손실/폐기 입력의 금액.

### Finding 5: Story 2.6 intended loss amount, but early planning flagged the policy as risky.

**Evidence:** `_bmad-output/implementation-artifacts/2-6-지점장이-손실-폐기-떨이를-입력하고-재고-흐름에-반영한다.md:20`, `_bmad-output/planning-artifacts/briefs/brief-erp_fish-2026-05-28/brief.md:81`

**Detail:** Story 2.6 says `손실 금액`; the earlier brief asks whether 폐기/떨이 손실액 should be stored as positive amount plus type or negative adjustment.

## Deduced Conclusions

### Deduction 1: Current `금액` means loss amount, not sale price.

**Based on:** Findings 1, 3, 4, 5

**Reasoning:** The value is named generically in the DB as `amount`, but every downstream calculation uses it as loss total / loss threshold / loss amount.

**Conclusion:** If a user enters `4000`, the system treats it as `4,000원 손실`, not `4,000원에 판매`.

### Deduction 2: The current UI is not clear enough for 떨이.

**Based on:** Findings 2 and 5

**Reasoning:** `떨이` often sounds like a sale event, so users may enter the money received. The system then interprets that number as loss, which can distort reports and anomaly signals.

**Conclusion:** At minimum the label should say `손실액(원)`. A better model may need separate `판매금액` and calculated/entered `손실액`.

## Source Code Trace

| Element       | Detail |
| ------------- | ------ |
| Origin        | `src/features/losses/components/loss-step-client.tsx:576` |
| Trigger       | User enters a loss row on `/app/store-entry/losses` |
| Condition     | `amount` is saved to `LedgerLossItem.amount` |
| Related files | `src/server/calculations/inventory.ts`, `src/features/inventory/queries.ts`, `src/features/ledger/review-queries.ts` |

## Conclusion

**Confidence:** High

The current implementation defines the field as loss amount. The UI label is ambiguous and is likely wrong for real users because `떨이` can be interpreted as sale price.

## Recommended Next Steps

### Fix direction

Rename the row field label from `금액` to `손실액(원)` and add helper text such as `판매금액이 아니라 손해 본 금액을 입력합니다.` If 떨이 reporting requires sale proceeds, add a separate `판매금액` field in a new story/spec.

### Diagnostic

Confirm the operating rule with the business owner: for 떨이, should staff enter `(정상 기준 금액 - 실제 판매금액)`, actual sale amount, or both?

## Reproduction Plan

Enter a row with 처리 유형 `떨이`, 수량 2, 금액 4000. The loss page, inventory page, review signals, and reports will treat 4000 as loss amount.
