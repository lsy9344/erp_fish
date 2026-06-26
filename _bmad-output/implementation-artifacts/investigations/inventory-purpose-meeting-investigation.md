# Investigation: docs meeting inventory purpose

## Hand-off Brief

1. **What happened.** 사용자는 `docs/meeting` 안에 판매수량 직접 입력, 재고 역산, 손실 입력 누락, 재고 조정 목적이 언급됐는지 전부 확인해 달라고 요청했다.
2. **Where the case stands.** Active; `docs/meeting` 회의록을 증거 범위로 한정한다.
3. **What's needed next.** 회의록 검색 결과를 `path:line` 근거와 함께 정리한다.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-06-26 |
| Status           | Active |
| System           | Windows / PowerShell / erp_fish workspace |
| Evidence sources | `docs/meeting` |

## Problem Statement

`docs/meeting` 경로에서 "판매수량을 직접 넣을까, 재고로 역산할까" 및 손실 입력 문제와 비슷한 내용이 언급됐는지 전부 찾는다. 특히 "재고"의 방향과 목적이 불분명한지 확인한다.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `docs/meeting` | Available | 회의록 검색 대상 |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | `docs/meeting` keyword and context search | High | In Progress | 재고, 판매수량, 손실, 폐기, 조정, POS, 역산 관련 표현 |

## Confirmed Findings

### Finding 1: `docs/meeting` contains an explicit policy for inventory-flow-based estimated sales.

**Evidence:** `docs/meeting/point-summary-policy-decisions-2026-06-22.md:28`, `docs/meeting/point-summary-policy-decisions-2026-06-22.md:31`, `docs/meeting/point-summary-policy-decisions-2026-06-22.md:32`

**Detail:** The policy says category revenue/profit is based on inventory-flow estimates because item-level POS data does not exist. It defines sales quantity as `전일 + 매입 - 당일`.

### Finding 2: The meeting transcript frames the inventory input as end-of-day remaining stock, not direct sales entry.

**Evidence:** `docs/meeting/original_text.txt:142`, `docs/meeting/original_text.txt:148`, `docs/meeting/original_text.txt:154`, `docs/meeting/original_text.txt:157`, `docs/meeting/original_text.txt:159`, `docs/meeting/original_text.txt:2499`, `docs/meeting/original_text.txt:2507`

**Detail:** The transcript says managers enter inventory after sales are done, and later says they only need to write the day's remaining stock. The old "차이" wording is interpreted as sold quantity and renamed to "당일 판매 수량."

### Finding 3: Adjustment reasons exist for quantity adjustment/mismatch, but the transcript does not define them as normal-sale reasons.

**Evidence:** `docs/meeting/original_text.txt:150`, `docs/meeting/original_text.txt:822`, `docs/meeting/original_text.txt:825`, `docs/meeting/change.md:24`

**Detail:** The adjustment reason is attached to quantity adjustment or mismatch. `change.md` later records this as required when physical inventory and ledger inventory differ.

### Finding 4: Loss/discount/waste is discussed as a separate input that must affect margin, but "loss omitted becomes sales" is not explicitly stated.

**Evidence:** `docs/meeting/original_text.txt:1011`, `docs/meeting/original_text.txt:1018`, `docs/meeting/original_text.txt:1081`, `docs/meeting/original_text.txt:1084`, `docs/meeting/original_text.txt:1086`, `docs/meeting/original_text.txt:2998`, `docs/meeting/original_text.txt:2999`, `docs/meeting/original_text.txt:3010`, `docs/meeting/original_text.txt:3148`, `docs/meeting/original_text.txt:3153`, `docs/meeting/original_text.txt:3176`

**Detail:** The customer repeatedly says loss/waste must be included because it affects margin, and the basis should be the intended sale price rather than purchase cost.

### Finding 5: Inventory also has non-sales purposes: FIFO stock value, old-stock tracking, and headquarters purchasing.

**Evidence:** `docs/meeting/original_text.txt:303`, `docs/meeting/original_text.txt:471`, `docs/meeting/original_text.txt:913`, `docs/meeting/original_text.txt:925`, `docs/meeting/original_text.txt:3051`, `docs/meeting/original_text.txt:3057`, `docs/meeting/change.md:22`, `docs/meeting/change.md:23`, `docs/meeting/change.md:25`

**Detail:** Meeting notes use "inventory" for multiple purposes, which explains why the direction can feel unclear.

## Conclusion

**Confidence:** High

`docs/meeting` supports inventory back-calculation as the intended sales-estimation model. It also supports treating loss/waste as a separate factor in margin calculation. It does not explicitly discuss the specific bug/risk that omitted loss is counted as sold, but that risk is deduced from the confirmed model.
