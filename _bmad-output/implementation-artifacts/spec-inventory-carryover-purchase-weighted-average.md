---
title: "전일 재고와 당일 매입의 재고 평균단가 표시"
type: "bugfix"
created: "2026-08-04"
status: "done"
baseline_commit: "a0a66fd6f0a9ece516a29d6d878726dc2941f6dc"
context:
  - "{project-root}/docs/reference_from_customer/2026-07-16_수정요청_및_재고저장_오류_정리.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 같은 품목의 전일 재고와 당일 매입이 한 행으로 합쳐져도 당일 매입가만 표시된다. 전일 1개 10,000원과 당일 1개 20,000원이 있어도 기대하는 평균단가 15,000원을 볼 수 없다.

**Approach:** 재고 단계의 표시용 단가를 `(전일 잔여 재고금액 + 당일 매입금액) ÷ 전체 수량`의 수량가중평균으로 계산한다. 실제 FIFO lot, 재고금액, 매출원가와 저장 정책은 유지한다.

## Boundaries & Constraints

**Always:** 원 단위로 반올림한다. 전일 금액은 원천 장부의 FIFO 결과인 `inventoryAmount`를 사용하고, 원천 마감수량과 현재 전일수량이 일치할 때만 신뢰한다. 월초 스냅샷은 수량×단가를 사용한다. 결과는 `purchasePrice`에만 담아 `재고 평균단가`로 표시하며 원금액은 응답에 노출하지 않는다.

**Ask First:** DB 변경, 과거 데이터 보정, FIFO 계산 변경 또는 추가 원가 노출이 필요하면 중단하고 승인받는다.

**Never:** 단순 산술평균을 쓰지 않는다. 현재 장부의 판매 후 재고금액을 전일 시작 금액으로 쓰지 않는다. 평균값을 저장 단가·FIFO lot·재고금액에 덮어쓰지 않는다. 기존 미커밋 파일을 건드리지 않는다.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| 기본 | 전일 1개·10,000원 + 당일 1개·20,000원 | `재고 평균단가 · 당일 · 15,000원/1박스` | N/A |
| 수량 차이 | 전일 2개·20,000원 + 당일 1개·20,000원 | 13,333원 | 원 단위 반올림 |
| 한쪽만 존재 | 전일 또는 당일만 존재 | 기존 당일·최근·이월·월초 표시 유지 | N/A |
| 저장 후 | 당일 판매로 현재고 감소 | 저장 전과 같은 시작 평균 표시 | 현재 잔여금액 사용 금지 |
| 근거 부족 | 원천 금액 없음/수량 불일치 | 기존 표시로 폴백 | 부분 평균 금지 |
| 소수 수량 | 소수 둘째 자리 수량 | 가중평균 후 원 단위 반올림 | 비정상 값은 폴백 |

</frozen-after-approval>

## Code Map

- `src/features/inventory/purchase-price.ts` -- 표시 평균 순수 계산.
- `src/features/inventory/queries.ts` -- 원천 장부 금액 조회와 평균 우선 적용.
- `src/features/inventory/types.ts` -- 평균 표시 kind.
- `src/features/inventory/components/inventory-step-client.tsx` -- 사용자 라벨.
- `src/features/inventory/response-shaping.ts` -- 기존 민감정보 차단 경계.
- `tests/unit/ledger-inventory.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`, `tests/e2e/store-ledger-inventory.spec.ts` -- 계산·보안·화면 회귀.

## Tasks & Acceptance

**Execution:**

- [x] `src/features/inventory/purchase-price.ts` -- 안전한 수량가중평균 helper를 추가한다.
- [x] `src/features/inventory/queries.ts` -- 이월 원천 장부의 수량·재고금액을 일괄 조회하고 근거가 완전할 때만 평균을 적용한다.
- [x] `src/features/inventory/types.ts`, `src/features/inventory/components/inventory-step-client.tsx` -- 평균 kind와 `재고 평균단가` 라벨을 추가한다.
- [x] 단위·응답·E2E 테스트에 사용자 예시, 가중평균, 저장 후 기준 유지, 불완전 근거 폴백을 추가한다.

**Acceptance Criteria:**

- Given 전일 1개 10,000원과 당일 1개 20,000원, when 재고 단계를 열면, then 15,000원이 표시된다.
- Given 전일과 당일 수량이 다를 때, when 계산하면, then 금액합계÷수량합계가 표시된다.
- Given 저장으로 FIFO 잔량이 변했을 때, when 재조회하면, then 시작 평균은 유지되고 실제 FIFO 재고금액은 기존 방식으로 저장된다.
- Given 전일 근거가 불완전할 때, when 조회하면, then 기존 단가로 폴백하고 민감 원금액은 노출되지 않는다.

## Spec Change Log

## Design Notes

표시 평균은 한 행에서 가격을 비교하기 위한 운영값이며 회계 재고평가를 대체하지 않는다. 1개가 판매돼 FIFO 잔여금액이 20,000원이 되어도 당일 시작 평균은 15,000원을 유지한다.

## Verification

**Commands:**

- `pnpm test:unit:file tests/unit/ledger-inventory.test.mjs`
- `pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs`
- `pnpm typecheck && pnpm lint`
- `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts --grep "재고 평균단가"`
- `git diff --check`

## Suggested Review Order

**평균단가 근거와 계산**

- 당일 매입 품목만 원천 근거를 조회해 평균 표시를 조립한다.
  [`queries.ts:1345`](../../src/features/inventory/queries.ts#L1345)

- 원천 장부와 월초 스냅샷을 매장·일자 범위 안에서 검증한다.
  [`queries.ts:1380`](../../src/features/inventory/queries.ts#L1380)

- 소수 수량을 정수화해 안전한 수량가중평균을 계산한다.
  [`purchase-price.ts:43`](../../src/features/inventory/purchase-price.ts#L43)

**화면과 응답 경계**

- 평균값을 저장 원가와 구분되는 새 표시 종류로 제한한다.
  [`types.ts:15`](../../src/features/inventory/types.ts#L15)

- 사용자가 의미를 오해하지 않도록 재고 평균단가로 표시한다.
  [`inventory-step-client.tsx:2122`](../../src/features/inventory/components/inventory-step-client.tsx#L2122)

**회귀 검증**

- 계산·소수·불완전 근거·안전 범위를 단위 테스트한다.
  [`ledger-inventory.test.mjs:744`](../../tests/unit/ledger-inventory.test.mjs#L744)

- 전일·월초·폴백·저장 후 FIFO 비변경을 실제 화면에서 검증한다.
  [`store-ledger-inventory.spec.ts:837`](../../tests/e2e/store-ledger-inventory.spec.ts#L837)

- 평균만 전달되고 원금액은 차단되는지 확인한다.
  [`sensitive-response-shaping.test.mjs:516`](../../tests/unit/sensitive-response-shaping.test.mjs#L516)
