# Investigation: 이월 공백 시 활성 품목 전체 표시 근거

## Hand-off Brief

1. **What happened.** 진수산 재고 화면에서 매입/이월이 없는 `갑오징어 12미`가 보이는 것은, 전일/월초 근거가 없을 때 활성 품목 전체를 수동 확인 후보로 펼치는 기존 재고 입력 계약 때문이다.
2. **Where the case stands.** Concluded. Story 2.4의 수동 입력 fallback이 시작점이고, Story 2.5/commit `36a8c66`에서 `이월 공백` 상태와 "0과 근거 부족 구분" 계약으로 굳어진 것이 확인됐다.
3. **What's needed next.** 운영 의도가 바뀌었다면 "매입/이월/기존 저장이 없는 활성 품목은 숨김"으로 요구사항을 바꾸고 테스트를 갱신해야 한다.

## Case Info

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Ticket           | N/A                                                                   |
| Date opened      | 2026-06-25                                                            |
| Status           | Concluded                                                             |
| System           | Windows, Next.js/Prisma app, Neon DB                                  |
| Evidence sources | Source code, unit/e2e tests, git history, live DB read-only checks    |

## Problem Statement

사용자 질문: "로직이 전일 장부나 월초 스냅샷이 없으면 활성 품목 전체를 이월 공백, 수량 0으로 펼쳐 보여주는 컨셉으로 된 이유는? 근거를 찾아줘. 뭔가 이유가 있을거같아"

## Evidence Inventory

| Source                    | Status    | Notes                                      |
| ------------------------- | --------- | ------------------------------------------ |
| Source code               | Available | `getCarryoverBases`, `getActiveProductBases` 확인 필요 |
| Unit/e2e tests            | Available | `ledger-inventory`, `store-ledger-inventory` 확인 필요 |
| Git history               | Available | 관련 라인 blame/log 확인 필요              |
| Product/spec docs         | Partial   | `project-context.md` 없음                  |
| Live Neon DB              | Available | 진수산 데이터는 전 턴에서 읽기 전용 확인   |

## Investigation Backlog

| # | Path to Explore                          | Priority | Status      | Notes |
| - | ---------------------------------------- | -------- | ----------- | ----- |
| 1 | 코드에서 활성 품목 전체 표시 조건 확인   | High     | Done        | `queries.ts` |
| 2 | 테스트명/주석에서 의도 확인              | High     | Done        | unit/e2e |
| 3 | git blame/log로 도입 커밋 확인           | High     | Done        | rationale |
| 4 | 문서/WO 주석에서 요구사항 확인           | Medium   | Done        | docs/comments |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-05-30T02:19:20+09:00 | 최초 재고 workflow 구현. 자동 이월 불가 시에도 active products 기반 수동 입력 fallback이 들어감. | commit `ef00d0e` | Confirmed |
| 2026-06-12T03:30:45+09:00 | Story 2.5에서 `이월 공백`, `검토 필요`, `이월 재확인 필요` 상태를 추가하고 "0과 근거 부족 구분" 테스트를 추가함. | commit `36a8c66` | Confirmed |
| 2026-06-18T11:46:56+09:00 | `getActiveProductBases` 기본 base 구조가 안정화됨. | commit `82ac7f7` | Confirmed |
| 2026-06-24T23:38:16+09:00 | 이월 공백/근거 부족 상태에서는 마스터 단가를 재고 평가 단가로 쓰지 않도록 변경함. | commit `f2e3da3` | Confirmed |

## Confirmed Findings

### Finding 1: 현재 코드는 전일 장부와 월초 스냅샷이 없을 때 활성 품목 전체를 `CARRYOVER_EMPTY` base로 만든다.

**Evidence:** `src/features/inventory/queries.ts:899`, `src/features/inventory/queries.ts:904`, `src/features/inventory/queries.ts:916`, `src/features/inventory/queries.ts:942`

**Detail:** `getCarryoverBases`의 최종 fallback은 `getActiveProductBases(tx, { carryoverStatus: CARRYOVER_EMPTY })`를 호출하고, `getActiveProductBases`는 `isActive: true` 제품을 전부 읽어 `previousQuantity: 0`으로 반환한다.

### Finding 2: 테스트가 "manual and empty carryover states should still show active products"를 계약으로 고정한다.

**Evidence:** `tests/unit/ledger-inventory.test.mjs:878`, `tests/unit/ledger-inventory.test.mjs:881`

**Detail:** unit test는 `getActiveProductBases` 존재를 확인하며 메시지로 수동/이월 공백 상태에서도 active products를 보여야 한다고 적는다.

### Finding 3: E2E 테스트는 "전일 근거가 없으면 이월 공백을 표시하고 0과 근거 부족을 구분한다"를 검증한다.

**Evidence:** `tests/e2e/store-ledger-inventory.spec.ts:436`, `tests/e2e/store-ledger-inventory.spec.ts:444`

**Detail:** 테스트는 전일 근거 없는 상황에서 새로 만든 활성 품목 행이 보이고 `이월 공백` badge/label이 표시되는지 확인한다.

### Finding 4: Story 2.5 인수조건이 동작의 직접 근거다.

**Evidence:** `_bmad-output/implementation-artifacts/2-5-재고-입력과-이월-상태-표시.md:26`, `_bmad-output/implementation-artifacts/2-5-재고-입력과-이월-상태-표시.md:40`, `_bmad-output/implementation-artifacts/2-5-재고-입력과-이월-상태-표시.md:59`

**Detail:** Story 2.5는 전일 장부가 없거나 근거가 부족하면 `이월 공백`을 보여주고, 부족한 근거를 0으로 오해하지 않게 해야 한다고 적는다. 또한 정책 미정 항목은 0이나 정상값처럼 대체하지 말라고 적는다.

### Finding 5: Story 2.4에서 자동 이월 불가 시에도 수동 입력 가능해야 한다는 전제가 있었다.

**Evidence:** `_bmad-output/implementation-artifacts/2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md:34`, `_bmad-output/implementation-artifacts/2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md:37`, `_bmad-output/implementation-artifacts/2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md:148`, `_bmad-output/implementation-artifacts/2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md:149`

**Detail:** 자동 이월이 불가해도 사용자가 수동으로 재고를 입력할 수 있어야 한다는 요구가 있었고, review patch에는 이전 장부 재고 행이 없어서 화면이 빈 목록이 되는 문제와 신규 활성 품목이 재고 화면에 나타나지 않는 문제가 명시됐다.

### Finding 6: 후속 FIFO 정책 문서는 "모든 재고품목"과 "근거 부족 행은 제외가 아니라 상태값" 원칙을 강화했다.

**Evidence:** `_bmad-output/planning-artifacts/policy-decisions/7-4-fifo-적용-범위와-재고-원가-처리-순서.md:38`, `_bmad-output/planning-artifacts/policy-decisions/7-4-fifo-적용-범위와-재고-원가-처리-순서.md:52`, `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md:26`

**Detail:** 이 정책은 재고/FIFO 후보에서 품목을 제외하지 않고, 근거가 불완전하면 계산값 대신 상태값으로 반환한다는 방향을 반복한다.

## Deduced Conclusions

### Deduction 1: 원래 의도는 "없는 품목을 0으로 확정"이 아니라 "첫 입력/근거 부족 상황에서도 수동 확인할 품목 후보를 놓치지 않기"였다.

**Based on:** Finding 1, 2, 3, 4, 5

**Reasoning:** 자동 이월 근거가 없으면 화면이 비어버리거나 신규 활성 품목이 빠지는 문제를 막으려면, 사용자가 직접 확인할 후보 목록이 필요하다. 그래서 active products를 펼치되, Story 2.5에서 `이월 공백` 상태를 붙여 "0 확정"과 구분하도록 변경했다.

**Conclusion:** 현재 화면이 진수산의 `갑오징어 12미`를 보여주는 것은 데이터가 있어서가 아니라 "수동 확인 후보를 숨기지 않는" 정책의 결과다.

### Deduction 2: 현재 운영 관점에서는 정책의 UX가 어긋난다.

**Based on:** Finding 1, 4, 진수산 DB 확인

**Reasoning:** 지점별 매입/이월/저장 행이 없는 활성 품목까지 모두 보이면 사용자는 "왜 이 품목이 내 지점 재고에 있지?"라고 해석한다. `이월 공백` badge가 있어도 행 자체가 재고 대상처럼 보인다.

**Conclusion:** 요구가 "오늘 관련 있는 품목만 보여줘"라면 기존 정책을 바꾸는 것이 맞다.

## Hypothesized Paths

### Hypothesis 1: 활성 품목 전체 표시는 "첫 재고 입력에서 누락 없이 직접 확인하게 하려는 정책"이었다.

**Status:** Confirmed

**Theory:** 전일 장부/월초 스냅샷이 없을 때도 사용자가 모든 활성 품목을 확인하고 저장하게 하려고 전체 품목을 0 후보로 펼쳤다.

**Supporting indicators:** Story 2.4/2.5, unit/e2e tests, current source all support it.

**Would confirm:** 테스트명, 주석, 커밋 메시지에서 "manual and empty carryover states should still show active products" 같은 의도 확인.

**Would refute:** 단순 임시 구현 또는 실수임을 나타내는 커밋/이슈/테스트 부재.

**Resolution:** Confirmed by source, tests, story artifacts, and git history.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| 원 요구 문서/WO 본문 | 설계 배경 확정성 상승 | docs, git commit body, issue text 확인 |

## Source Code Trace

| Element       | Detail |
| ------------- | ------ |
| Error origin  | N/A |
| Trigger       | 4단계 재고 화면에서 기존 `LedgerInventoryItem`이 없는 장부 조회 |
| Condition     | 전일 장부와 월초 스냅샷이 없을 때 `getActiveProductBases(tx, { carryoverStatus: CARRYOVER_EMPTY })` 호출 |
| Related files | `src/features/inventory/queries.ts`, `tests/unit/ledger-inventory.test.mjs`, `tests/e2e/store-ledger-inventory.spec.ts` |

## Conclusion

**Confidence:** High

활성 품목 전체를 `이월 공백`, 수량 0으로 펼치는 동작은 우연한 버그라기보다 명시된 Story 2.4/2.5 계약과 테스트로 고정된 정책이다. 목적은 자동 이월 근거가 없을 때 화면이 비거나 신규 활성 품목이 누락되는 것을 막고, 본사가 재고 흐름 누락을 확인할 수 있게 하는 것이었다. 다만 현재 진수산 사례처럼 매입/이월/저장 행이 없는 품목까지 보이는 것은 운영 UX와 맞지 않을 수 있으므로 정책 변경 후보다.

## Recommended Next Steps

### Fix direction

운영 정책을 "관련 품목만 표시"로 바꾼다면 4단계 초기 조회에서 active product fallback을 그대로 쓰지 말고, 매입/손실/전일 후보/월초 스냅샷/기존 저장 행이 있는 품목만 기본 표시해야 한다. 별도 "전체 품목 추가" 기능이 필요하면 수동 추가 UI로 분리한다.

### Diagnostic

정책 변경 전에는 본사/지점 운영 기준을 확인해야 한다: 첫 장부 입력 시 매입도 이월도 없는 활성 품목을 아예 숨길지, 접힌 "근거 없음 후보" 영역으로 보낼지, 품목 추가 검색으로 대체할지.

## Reproduction Plan

1. 진수산 `2026-06-25`처럼 전일 장부, 월초 스냅샷, 저장 재고 행이 없는 장부를 만든다.
2. 활성 품목 `갑오징어 12미`를 만들되 해당 지점 매입/손실은 만들지 않는다.
3. 4단계 재고 화면을 열면 현재 로직은 `갑오징어 12미`를 `이월 공백`, `0` 후보로 표시한다.

## Side Findings

## Follow-up: 2026-06-25

### New Evidence

- `src/features/inventory/queries.ts` fallback path confirmed.
- `tests/unit/ledger-inventory.test.mjs` active product contract confirmed.
- `tests/e2e/store-ledger-inventory.spec.ts` "0과 근거 부족 구분" scenario confirmed.
- Story 2.4, Story 2.5, FIFO policy artifacts confirm rationale.

### Additional Findings

### Updated Hypotheses

### Backlog Changes

### Updated Conclusion

Confirmed. The behavior is intentional under the previous story contract, but likely undesirable for the current operation model.
