# Investigation: rev2 손실 재고 흐름 차단

## Hand-off Brief

1. **What happened.** `참소라 / 중` 손실 저장이 “재고 흐름을 확인할 수 없습니다”로 차단됐지만 후속 운영 조회에는 같은 품목의 당일 매입이 존재했다.
2. **Where the case stands.** 현재 코드는 동일 `productId`의 당일 매입을 공통 재고 조립 경로에 포함하며, 당일 매입 1만 있는 품목의 손실 0.2 저장도 통과한다.
3. **Resolution.** 추측성 fallback 없이 성공 회귀 테스트를 추가했고, 무근거 오류는 실제 해결 단계인 `1단계 매입`을 안내하도록 수정했다.

## Case Info

| Field            | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| Ticket           | N/A                                                         |
| Date opened      | 2026-07-18                                                  |
| Status           | Concluded                                                   |
| System           | erp_fish 저장소, Linux                                      |
| Evidence sources | rev2 이미지, 운영 데이터 검증 기록, 손실·재고 코드와 테스트 |

## Problem Statement

사용자 요청: 기존 검토의 3번 문제인 “재고 근거가 있는데도 손실 저장이 차단될 수 있는 원인”을 파악하고 코드로 개선한다.

## Evidence Inventory

| Source                                                 | Status    | Notes                                           |
| ------------------------------------------------------ | --------- | ----------------------------------------------- |
| `docs/rev/2/KakaoTalk_20260717_130512454_01.jpg`       | Available | 참소라/중 손실 저장 차단 화면                   |
| `docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md` | Available | 같은 productId 당일 매입 1, 저장 재고 행 0 확인 |
| `src/features/losses/actions.ts`                       | Available | 손실 저장 검증 진입점                           |
| `src/features/inventory/queries.ts`                    | Available | 재고 단계 데이터 생성 경로                      |
| 이미지 촬영 시점 DB snapshot                           | Missing   | 현재 운영 조회는 사후 상태임                    |

## Investigation Backlog

| #   | Path to Explore                     | Priority | Status     | Notes                                                    |
| --- | ----------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| 1   | 오류 문자열과 손실 저장 호출부 추적 | High     | Done       | `saveLedgerLosses()` → `getInventoryStepDataInTx()` 확인 |
| 2   | 당일 매입만 있는 품목 재현 테스트   | High     | Done       | 매입 1, 손실 0.2 저장 성공 회귀 추가                     |
| 3   | 재고 스냅샷 누락 원인 수정          | High     | Not needed | 현재 공유 경로에서 누락이 재현되지 않아 로직 변경 안 함  |

## Timeline of Events

| Time       | Event                                            | Source                                  | Confidence |
| ---------- | ------------------------------------------------ | --------------------------------------- | ---------- |
| 2026-07-17 | 참소라/중 손실 저장 차단 화면 생성               | rev2 이미지                             | Confirmed  |
| 2026-07-18 | 같은 productId의 당일 매입과 저장 재고 행 확인   | 운영 데이터 검증 기록                   | Confirmed  |
| 2026-07-18 | 당일 매입만 있는 품목의 손실 저장 성공 회귀 추가 | `tests/e2e/store-ledger-losses.spec.ts` | Confirmed  |

## Confirmed Findings

### Finding 1: 후속 조회에는 같은 productId의 당일 매입이 존재한다

**Evidence:** `docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md:19-26`

**Detail:** 활성 중복 품목은 없고 당일 매입 수량은 1이며 저장 재고 행도 존재한다.

### Finding 2: 현재 공통 재고 조립 경로는 당일 매입 품목을 포함한다

**Evidence:** `src/features/inventory/queries.ts`의 `aggregatePurchases()`, `mergeActivityBases()`, `getInventoryStepDataForLedgerInTx()`

**Detail:** 손실 저장은 별도 재고 snapshot을 만들지 않고 같은 장부의 `ledgerPurchaseItems`를 `productId`로 집계한 재고 행을 사용한다. 전일·월초·저장 재고 행이 없어도 당일 매입 품목은 후보에 병합된다.

### Finding 3: 이미지 시점의 실패 원인은 현재 자료로 확정할 수 없다

**Evidence:** 이미지 촬영 직전 DB snapshot 부재, 현재 코드의 성공 회귀

**Detail:** 현재 코드에서 같은 조건이 통과하므로 품목명 fallback이나 검증 우회를 추가할 근거가 없다. 당시 매입 저장 시점, 장부 또는 `productId`가 달랐는지는 사후 데이터만으로 판별할 수 없다.

## Deduced Conclusions

현재 코드의 당일 매입 병합 로직은 정상이다. 닫을 수 있는 결함은 성공 회귀 계약 부재와 미래 단계인 재고를 가리키던 오류 안내였으며, 재고 계산 로직 변경은 불필요하다.

## Hypothesized Paths

### Hypothesis 1: 손실 저장이 당일 매입으로 만든 재고 후보를 받지 못한다

**Status:** Refuted for current code

**Theory:** 손실 저장 시점의 재고 조회가 당일 매입만 있는 품목을 누락하거나 다른 productId 키로 조립한다.

**Supporting indicators:** 후속 운영 데이터에는 동일 productId 매입이 있는데 이미지에서는 재고 행 미확인 오류가 발생했다.

**Would confirm:** 동일 fixture로 재고 조회 결과에는 행이 없고 매입 조회에는 행이 존재한다.

**Would refute:** 동일 fixture에서 손실 저장이 정상 통과한다.

**Resolution:** 동일 장부·동일 `productId` 당일 매입 1, 손실 0.2 E2E가 저장 성공을 확인한다. 이미지 당시 원인은 snapshot 부재로 미확정이다.

## Missing Evidence

| Gap                      | Impact                   | How to Obtain                       |
| ------------------------ | ------------------------ | ----------------------------------- |
| 이미지 촬영 직전 DB 상태 | 당시 행 누락 원인의 확정 | 재현 테스트로 코드 조건을 대신 검증 |

## Source Code Trace

| Element       | Detail                                                                |
| ------------- | --------------------------------------------------------------------- |
| Error origin  | `src/features/losses/actions.ts`의 손실 수량 검증                     |
| Trigger       | 손실 단계 저장 시 `getInventoryStepDataInTx()` 결과 조회              |
| Condition     | 선택 품목의 재고 행이 없거나 수량 계산 결과가 음수                    |
| Related files | `src/features/losses/actions.ts`, `src/features/inventory/queries.ts` |

## Conclusion

**Confidence:** High (현재 코드 경로), Low (이미지 당시 데이터 상태)

현재 구현은 동일 장부의 당일 매입을 손실 가능 수량에 포함한다. 역사적 장애 원인은 확정하지 못했으므로 재고 조립 로직은 바꾸지 않고 회귀 테스트와 해결 가능한 안내 문구만 보완했다.

## Recommended Next Steps

### Fix direction

추가 수정은 같은 회귀가 실패하거나 이미지 시점 DB snapshot이 확보될 때만 검토한다.

### Diagnostic

무근거 오류는 `1단계 매입에서 해당 품목의 오늘매입 저장 여부`를 확인하도록 안내한다.

## Reproduction Plan

전일재고와 월초·저장 재고 행 없이 당일 매입 1만 있는 품목에 손실 0.2를 저장하고 동일 `productId`의 손실 행을 확인한다.

## Side Findings

- 품목명 기반 fallback, `null`의 0 변환, 손실 검증 우회는 추가하지 않았다.
