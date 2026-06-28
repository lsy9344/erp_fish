# 비용 항목명과 기타 메모 정리 (WO-18)

- 작성일: 2026-06-28
- 결론: **표준명 인프라는 이미 구현되어 있다.** WO-18은 신규 코드가 아니라, 비용 항목명이 화면·감사 로그·월별 손익에서 같은 기준을 쓰도록 연결 규칙을 고정하는 작업이다.

## 1. 현재 구현 (확인됨)

| 영역 | 위치 | 동작 |
| --- | --- | --- |
| 표준명 source | `LedgerInputCode` (group `EXPENSE_ITEM`) | 본사가 `master-data` 코드 관리 화면에서 등록/수정. enum/문자열은 DB 고정, UI 표시만 변경. |
| 지점별 표시명 | `LedgerInputCodeStoreAlias` | 본사 등록명은 유지하고, 지점 화면 표시명만 alias로 덮어쓴다(2026-06-21 결정). |
| 화면 입력 | `src/features/ledger/components/expense-step-client.tsx` | `EXPENSE_ITEM` 코드를 select로 제공. 기본값 `기타`(`__default_expense_other__`). 줄마다 `memo` 입력. |
| 예외 비용 | 같은 화면 | 표준 항목에 없으면 `기타` 선택 + `메모`로 처리. 지점 자유 입력 항목을 늘리지 않는다. |
| 저장 검증 | `src/features/ledger/actions.ts` | 활성 `EXPENSE_ITEM` 코드만 저장 허용. 미등록/비활성 코드는 거부. |
| 감사 로그 | `src/features/ledger/actions.ts` (`비용 N` 요약) | `"{ledgerInputCodeName} {amount}원 / {memo}"` — 표준명 + 메모를 그대로 사용. |

표준 시드 항목(`scripts/seed-test-data.mjs`): `임대료`, `인건비잡비`, `공과금`, `소모품`, `운반비`. 실제 운영 항목은 본사가 코드 관리 화면에서 확정한다.

## 2. 확정 연결 규칙

1. 비용 항목 **표준명의 단일 source는 `LedgerInputCode`(EXPENSE_ITEM)** 다. 화면·export·감사 로그·월별 손익은 모두 이 이름을 쓴다. 별도 비용명 테이블을 만들지 않는다.
2. 예외 비용은 `기타` 코드 + `memo`로만 처리한다. 지점 자유 텍스트 비용 항목을 새로 늘리지 않는다.
3. 지점장 화면 표시명은 `LedgerInputCodeStoreAlias`로 덮어쓸 수 있으나, **감사 로그·export·월별 손익에는 본사 등록명**을 쓴다(지점 alias는 화면 표시 전용).
4. 본사 조정값(월별 손익의 본사조정/조정사유)은 지점장 응답에 포함하지 않는다.

## 3. 월별 손익(WO-15)과의 관계

WO-15 월별 손익계산서의 조정 항목은 장부 비용과 **두 층으로 분리**한다.

- **장부 비용 (지점 입력, 일 단위)**: `EXPENSE_ITEM` 코드 + 금액 + 메모. 위 1~3 규칙을 따른다.
- **월별 조정 항목 (본사 입력, 월 단위)**: 월세, 관리비, 공과금, 세금/수수료, 포장/소모품, 배송/운반, 수선/유지보수, 기타비용, 본사조정, 조정사유, 메모.

연결 기준:

- 월별 손익의 `기타비용`/`메모`는 본사가 월 단위로 직접 넣는 항목이며, 지점 장부의 `기타 + 메모`와 **다른 입력 주체·다른 기간**이다. 둘을 한 값으로 합산하지 않는다.
- 같은 의미(예: 공과금)가 장부 비용과 월별 조정 양쪽에 있을 수 있다. 월별 손익 합산 시 **중복 집계하지 않도록** WO-15 구현에서 집계 출처를 명시한다(장부 합 vs 본사 조정 합을 컬럼으로 구분).

## 4. WO-18 범위에서 하지 않는 것

- 표준명 source를 새로 만들지 않는다(이미 `LedgerInputCode`에 있음).
- export 컬럼/월별 손익 시트는 WO-15에서 위 규칙을 소비해 구현한다. WO-18은 규칙 고정까지다.

## 5. 검증

```bash
pnpm test:unit:file tests/unit/master-data-codes.test.mjs tests/unit/ledger-cost-labor.test.mjs
```
