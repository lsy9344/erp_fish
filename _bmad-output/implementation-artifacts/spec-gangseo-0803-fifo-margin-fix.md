---
title: "강서수산 8월 3일 FIFO 이익률 엑셀 일치 보정"
type: "bugfix"
created: "2026-08-08"
status: "done"
baseline_commit: "56644be8b6bb1b0286d5f41cc2e584c14dd4d639"
context:
  - "{project-root}/docs/handoffs/2026-08-07-gangseo-0803-margin-discrepancy-HANDOFF.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 강서수산 2026-08-03 장부에서 0수량 품목의 빈 FIFO lot 하나가 전체 장부를 행 단가 폴백으로 전환해 원가가 1,612,170원으로 계산된다. 실제 FIFO 합계 1,622,480원도 생합 수량과 활문어 적용 단가가 엑셀 장부와 달라 엑셀 원가 1,627,730원에 5,250원 부족하다.

**Approach:** 0수량·0흐름 행의 빈 lot는 FIFO 소비·잔액 0원 근거로 인정하고, 본사 재고 입력을 소수 둘째 자리까지 허용한다. 운영 DB에서는 생합 수량을 0.89로 보정하고 7/31 활문어 2개 매입의 원본 단가 14,000원은 보존한 채 장부 적용 단가만 18,000원으로 감사 기록과 함께 보정한 뒤 7/31→8/1→8/3 FIFO를 순차 재생성한다.

## Boundaries & Constraints

**Always:** 모든 계산 화면은 FIFO lot 합계를 우선 사용한다. ECOUNT 원본 단가·원본 행·sourceUnitPrice는 변경하지 않는다. 운영 보정은 단일 트랜잭션, 사전조건 검증, 명시적 감사 로그, 순차 FIFO 재생성을 포함한다. 최종 8/3 수치는 원가 1,627,730원, 이익 639,270원, 이익률 28.20%여야 한다.

**Ask First:** 사전조건과 현재 운영 데이터가 조사값에서 달라졌거나, 7/31·8/1·8/3 외 장부를 수정해야 하거나, 목표 수치를 맞추기 위해 추가 품목 보정이 필요하면 중단한다.

**Never:** 오징어 25미A alias를 변경하지 않는다. 8/3 ECOUNT 원문은 `오징어 [25미]`이므로 25미A로 강제 재매핑하지 않는다. FIFO 순서를 엑셀에 맞추기 위해 바꾸지 않으며, 원본 ECOUNT 14,000원을 삭제하거나 덮어쓰지 않는다.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| 정상 FIFO | 유효 lot 행들과 0수량·빈 lot 행이 공존 | 유효 lot 소비액 합계 사용, 0수량 행은 0원 | N/A |
| 실제 근거 누락 | 비제로 수량 흐름인데 lot 없음 | 기존 행 단가 폴백 유지 | 부분 FIFO 금지 |
| HQ 정밀 수량 | 당일재고 `0.89` | 둘째 자리 그대로 저장·FIFO 반영 | 셋째 자리 이상 거부 |
| 운영 보정 | 활문어 원본 14,000, 적용 14,000 | 원본 보존, 적용 18,000 및 감사 이력 | 사전조건 불일치 시 전체 롤백 |

</frozen-after-approval>

## Code Map

- `src/server/calculations/ledger.ts` -- FIFO 완전성 및 매출원가·재고금액 계산.
- `src/features/inventory/schemas.ts` -- 본사/지점 재고 수량 정밀도 계약.
- `src/features/inventory/components/inventory-step-client.tsx` -- 둘째 자리 bulk 입력과 단독 조정의 첫째 자리 전송 차단.
- `src/lib/validation.ts` -- 둘째 자리 수량 공통 검증과 크기 비례 tolerance helper.
- `src/features/inventory/fifo-lots.ts` -- 장부별 FIFO snapshot 재생성.
- `scripts/repair-gangseo-0803-fifo.mjs` -- 승인 Neon host 제한과 8/3 FIFO postcondition 검증.
- `tests/unit/calculation-policy-gates.test.mjs` -- FIFO 선택과 폴백 회귀 테스트.
- `tests/unit/ledger-inventory.test.mjs` -- 재고 입력 schema·client UX 회귀 테스트.
- `tests/unit/ledger-validation.test.mjs` -- 수량 tolerance와 repair 안전성 정적 테스트.
- `docs/handoffs/2026-08-07-gangseo-0803-margin-discrepancy-HANDOFF.md` -- 조사 결론과 보정 결과.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/calculations/ledger.ts` -- 0수량·0흐름 빈 lot만 0원 FIFO 근거로 처리한다.
- [x] `src/features/inventory/schemas.ts` -- HQ 재고 저장도 소수 둘째 자리까지 허용한다.
- [x] 관련 unit tests -- 혼합 FIFO/빈 행, 실제 lot 누락 폴백, HQ 둘째 자리 입력을 검증한다.
- [x] 운영 DB -- 승인된 두 데이터 보정과 감사 기록, 순차 FIFO 재생성을 Serializable 트랜잭션으로 수행하고 독립 재조회로 검증했다.
- [x] 핸드오프 문서 -- 확정 원인·반박된 매핑 가설·최종 검증값을 기록한다.

**Acceptance Criteria:**
- Given 0수량 빈 lot 행이 있는 장부, when 원가를 계산하면, then 다른 품목의 FIFO 소비액이 유지된다.
- Given 비제로 재고 흐름에 lot가 없을 때, when 원가를 계산하면, then 부분 FIFO가 아니라 기존 안전 폴백을 사용한다.
- Given 본사가 생합 0.89를 저장할 때, when FIFO를 재생성하면, then 소비액은 13,950원이다.
- Given 승인된 활문어 적용 단가 보정 후, when 8/3 장부를 재계산하면, then 엑셀과 원가·이익·이익률이 일치한다.

## Spec Change Log

## Design Notes

빈 lot 자체가 근거 누락을 뜻하지는 않는다. `previousQuantity + purchasedQuantity = currentQuantity = 0`인 행은 생성할 lot도 소비할 금액도 없으므로 완전한 0원 근거다. 반대로 비제로 흐름인데 lot가 없으면 전체 안전 폴백을 유지한다.

## Verification

**Commands:**
- `node --experimental-strip-types --test tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-validation.test.mjs` -- 통과(67개).
- `pnpm exec eslint scripts/repair-gangseo-0803-fifo.mjs src/features/inventory/components/inventory-step-client.tsx src/lib/validation.ts src/features/inventory/schemas.ts src/server/calculations/ledger.ts tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-validation.test.mjs` -- 변경 파일 lint 통과.
- `pnpm typecheck` 및 `pnpm lint` -- pre-existing `tmp/q-*.ts` 조사 스크립트의 Prisma schema/unsafe 타입 오류로 실패. 변경 파일 오류는 없었다.
- 운영 읽기 전용 재조회 -- 통과: 8/3 재고행 33건, 비제로 흐름의 빈 FIFO lot 0건, 생합 inventoryAmount 40,050원, 원가 1,627,730원, 이익 639,270원, 이익률 28.20%, FIFO 재고 2,537,080원.
- `node --experimental-strip-types scripts/repair-gangseo-0803-fifo.mjs` -- 이전 승인 보정이 이미 적용된 DB라 expected version 9/received 10에서 읽기 전용 사전조건으로 중단했고, 이번 작업에서 `--apply`는 실행하지 않았다.
- `git diff --check` -- whitespace 오류 없음.

## Suggested Review Order

**FIFO 계산 기준**

- 0수량 빈 lot만 완전한 0원 근거로 인정한다.
  [`ledger.ts:410`](../../src/server/calculations/ledger.ts#L410)

- HQ와 지점 저장 수량을 둘째 자리까지 같은 계약으로 검증한다.
  [`schemas.ts:21`](../../src/features/inventory/schemas.ts#L21)

**운영 보정 안전성**

- 커밋 전 전체 FIFO·원본 보존·목표 수치를 단언한다.
  [`repair-gangseo-0803-fifo.mjs:181`](../../scripts/repair-gangseo-0803-fifo.mjs#L181)

- 버전 충돌을 차단하고 세 장부를 순차 재생성한다.
  [`repair-gangseo-0803-fifo.mjs:787`](../../scripts/repair-gangseo-0803-fifo.mjs#L787)

- 승인된 Neon 대상과 이중 확인 플래그만 쓰기를 허용한다.
  [`repair-gangseo-0803-fifo.mjs:913`](../../scripts/repair-gangseo-0803-fifo.mjs#L913)

**입력 UX와 검증**

- 둘째 자리 bulk 저장과 첫째 자리 단독 조정을 명확히 구분한다.
  [`inventory-step-client.tsx:145`](../../src/features/inventory/components/inventory-step-client.tsx#L145)

- 큰 수량에서도 둘째 자리 판정 오차를 방지한다.
  [`validation.ts:149`](../../src/lib/validation.ts#L149)

- zero-flow FIFO와 실제 lot 누락 폴백을 회귀 검증한다.
  [`calculation-policy-gates.test.mjs:201`](../../tests/unit/calculation-policy-gates.test.mjs#L201)

- HQ·지점 수량 정밀도와 빈 입력 계약을 검증한다.
  [`ledger-inventory.test.mjs:373`](../../tests/unit/ledger-inventory.test.mjs#L373)

- 운영 스크립트의 FIFO 완전성과 대상 DB 방어를 정적으로 검증한다.
  [`ledger-validation.test.mjs:180`](../../tests/unit/ledger-validation.test.mjs#L180)

**조사 및 운영 기록**

- 반박된 가설과 최종 DB 보정 결과를 한 문서에서 추적한다.
  [`HANDOFF.md:129`](../../docs/handoffs/2026-08-07-gangseo-0803-margin-discrepancy-HANDOFF.md#L129)
