---
title: "rev2·rev3 정산 응답 및 손실 재고 흐름 보완"
type: "bugfix"
created: "2026-07-18"
status: "done"
baseline_commit: "f6c869e72eeb8e17c1ea66ebb149add7549c0bee"
context:
  - "{project-root}/_bmad-output/planning-artifacts/policy-decisions/7-6-지점장-민감-필드-노출-차단-매트릭스.md"
  - "{project-root}/docs/rev/2026-07-17_당일현금매출_지출정산_수정_작업지시서.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 지점장 장부 조회·저장 응답이 화면에서는 제거된 마감 정산 차액 `paymentDifferenceAmount`를 여전히 전송한다. 또한 rev2의 “재고 흐름을 확인할 수 없습니다” 증상은 현재 코드와 운영 사후 데이터로 재현되지 않아, 동일 장부의 당일 매입만 있는 품목이 손실 저장 가능한지 회귀 계약이 비어 있고 오류 안내도 아직 미래 단계인 재고 단계를 가리킨다.

**Approach:** 지점장 전용 DTO와 런타임 mapper에서 차액 금액을 제거한다. 손실 경로에는 추측성 fallback을 넣지 않고, 당일 매입 근거 성공 E2E를 추가해 현재 공유 재고 조립 계약을 고정하며 무근거 실패 문구를 실제 해결 단계인 1단계 매입으로 바로잡는다.

## Boundaries & Constraints

**Always:** 본사·감사 로그의 정산 차액과 공통 계산 공식은 유지한다. 지점장 응답은 타입과 런타임 양쪽에서 민감 값을 제거한다. 손실 수량이 실제 재고를 초과하거나 근거가 전혀 없으면 기존처럼 저장을 차단한다.

**Ask First:** 재현 테스트가 현재 코드에서 실패해 재고 조립 로직 변경이 필요하거나 DB 스키마·운영 데이터 변경이 필요한 경우.

**Never:** 차액을 `null`로 보내거나 UI에서만 숨기지 않는다. 품목명 기반 fallback, `null` 재고의 0 변환, 손실 검증 우회, 새 정산 계산 추상화, 운영 데이터 수정은 하지 않는다.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                                | Expected Output / Behavior           | Error Handling           |
| --------------------- | ------------------------------------------------------------ | ------------------------------------ | ------------------------ |
| 지점장 장부 응답      | 내부 장부에 `paymentDifferenceAmount` 존재                   | 지점장 DTO에 key 자체가 없음         | 본사·감사 내부 값은 유지 |
| 당일 매입만 있는 손실 | 전일·월초·재고 행 없음, 동일 productId 당일 매입 1, 손실 0.2 | 손실 저장 성공                       | N/A                      |
| 재고 근거 없음        | 동일 productId의 이월·매입·재고 행 없음                      | 손실 저장 차단, 1단계 매입 확인 안내 | 기존 입력값 유지         |
| 재고 초과             | 재고 1, 손실 1 초과                                          | 저장 차단, 가능 수량 안내            | 기존 초과 메시지 유지    |

</frozen-after-approval>

## Code Map

- `src/features/ledger/types.ts` -- 지점장 비용·매출 응답의 compile-time 허용 필드
- `src/features/ledger/response-shaping.ts` -- 지점장 조회·저장 응답의 runtime 민감 필드 제거 경계
- `src/features/losses/quantity-error.ts` -- 무근거·초과 손실 오류 문구
- `src/features/inventory/queries.ts` -- 당일 매입을 재고 후보에 병합하는 기존 공통 경로; 테스트 실패 시에만 수정
- `tests/unit/sensitive-response-shaping.test.mjs` -- 실제 mapper 반환 shape 검증
- `tests/e2e/store-ledger-losses.spec.ts` -- 당일 매입 근거 성공과 무근거 차단 회귀

## Tasks & Acceptance

**Execution:**

- [x] `tests/unit/sensitive-response-shaping.test.mjs` -- fixture의 `paymentDifferenceAmount` key가 mapper 결과에서 제거되는 실패 테스트 추가
- [x] `src/features/ledger/types.ts`, `src/features/ledger/response-shaping.ts` -- 지점장 DTO와 mapper에서 차액 금액 제거
- [x] `tests/e2e/store-ledger-losses.spec.ts` -- 동일 장부 당일 매입만 있는 품목의 손실 저장 성공 회귀 추가
- [x] `src/features/losses/quantity-error.ts`, `tests/unit/ledger-losses.test.mjs` -- 무근거 안내를 “1단계 매입에서 오늘매입 저장 여부 확인”으로 변경
- [x] `_bmad-output/implementation-artifacts/investigations/*.md`, 관련 rev 작업계획 -- 확인된 원인·검증 결과와 폐기된 정산 문구를 정리

**Acceptance Criteria:**

- Given 지점장 조회 또는 저장 응답, when 안전 mapper가 실행되면, then `paymentDifferenceAmount` key와 값이 모두 없다.
- Given 본사/감사 계산, when 정산 요약을 만들면, then `총매출-(현금+카드+기타+지출)` 공식과 내부 차액 값이 유지된다.
- Given 당일 매입 1만 있는 품목, when 손실 0.2를 저장하면, then 성공하고 손실 행이 동일 productId로 저장된다.
- Given 재고 근거가 없는 품목, when 손실을 저장하면, then 차단되며 1단계 매입 확인 안내가 표시된다.

## Spec Change Log

## Verification

**Commands:**

- `pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs tests/unit/ledger-cost-labor.test.mjs tests/unit/ledger-losses.test.mjs` -- 관련 단위 테스트 실패 0
- `pnpm typecheck` -- 타입 오류 0
- `pnpm lint` -- lint 오류 0
- `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-losses.spec.ts --grep "당일 매입|재고 근거"` -- 성공·차단 시나리오 통과
- `git diff --check` -- whitespace 오류 0

**Results (2026-07-18):**

- 관련 단위 테스트 31개 통과
- `pnpm typecheck`, `pnpm lint`, `git diff --check` 통과
- 관련 코드·테스트·작업계획 Prettier 검사 통과
- Playwright는 로컬 PostgreSQL `localhost:5432` 미기동(`P1001`)으로 실행 전 global setup에서 중단

## Suggested Review Order

**지점장 정산 응답 경계**

- 서버 반환 직전 차액 금액을 제거해 네트워크 누출을 막는다.
  [`response-shaping.ts:11`](../../src/features/ledger/response-shaping.ts#L11)

- 타입에서도 차액 필드를 제외해 호출부의 재노출을 차단한다.
  [`types.ts:96`](../../src/features/ledger/types.ts#L96)

- 런타임 mapper 결과에서 key 자체가 없는지 고정한다.
  [`sensitive-response-shaping.test.mjs:660`](../../tests/unit/sensitive-response-shaping.test.mjs#L660)

**손실 재고 흐름**

- 무근거 오류를 실제 해결 단계인 1단계 매입으로 안내한다.
  [`quantity-error.ts:17`](../../src/features/losses/quantity-error.ts#L17)

- 당일 매입만 있는 품목의 손실 저장 성공을 재현한다.
  [`store-ledger-losses.spec.ts:615`](../../tests/e2e/store-ledger-losses.spec.ts#L615)

- 근거 없는 품목은 계속 차단하고 새 안내를 검증한다.
  [`store-ledger-losses.spec.ts:660`](../../tests/e2e/store-ledger-losses.spec.ts#L660)

**판정 기록**

- 현재 코드와 역사적 증상을 구분해 추측성 fallback을 배제한다.
  [`rev2-loss-inventory-flow-investigation.md:1`](investigations/rev2-loss-inventory-flow-investigation.md#L1)

- 폐기된 정산 문구의 재구현을 명시적으로 금지한다.
  [`2026-07-17-rev2-rev3-review-fixes.md:25`](../../docs/superpowers/plans/2026-07-17-rev2-rev3-review-fixes.md#L25)
