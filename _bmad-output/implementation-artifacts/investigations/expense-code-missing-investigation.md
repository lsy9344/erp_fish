# Investigation: 비용 항목 코드 없음

## Hand-off Brief

1. **What happened.** 지점장 장부 입력의 비용 단계에서 활성 비용 항목 코드가 0개라 비용 입력 UI가 저장을 막고 안내 문구를 표시했다.
2. **Where the case stands.** 원인은 확인됨: 현재 연결 DB의 `LedgerInputCode`에는 `EXPENSE_ITEM` 활성/비활성 코드가 모두 0개다.
3. **What's needed next.** 본사 계정으로 기준정보 코드 관리 화면에서 `비용 항목` 코드를 1개 이상 등록하고 활성 상태로 둔다.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-06-04 |
| Status | Concluded |
| System | Windows, local project `erp_fish`, Prisma PostgreSQL |
| Evidence sources | Source code, Prisma schema, local DB read-only count |

## Problem Statement

사용자 보고: 지점장 로그인 후 장부 입력 중 비용 단계에서 "비용 항목 코드가 없습니다. 본사에서 비용 항목 코드가 등록되어야 합니다." 메시지가 발생했다.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| `src/features/ledger/components/expense-step-client.tsx` | Available | 오류 문구와 저장 차단 조건 확인 |
| `src/app/app/store-entry/page.tsx` | Available | 비용 코드 조회 경로 확인 |
| `src/features/master-data/code-queries.ts` | Available | 활성 `EXPENSE_ITEM` 코드만 조회함 |
| `prisma/schema.prisma` | Available | 비용 행은 `ledgerInputCodeId` 외래키를 필수로 가짐 |
| Local DB count | Available | `EXPENSE_ITEM` active 0, inactive 0 |

## Confirmed Findings

### Finding 1: 비용 단계는 코드 옵션이 0개면 안내 문구를 표시한다.

**Evidence:** `src/features/ledger/components/expense-step-client.tsx:140`, `src/features/ledger/components/expense-step-client.tsx:543`

**Detail:** `expenseCodeOptions.length > 0` 여부로 등록 코드 존재를 판단하고, 없으면 해당 메시지를 보여준다.

### Finding 2: 비용 단계의 코드 목록은 활성 비용 항목 코드만 사용한다.

**Evidence:** `src/app/app/store-entry/page.tsx:152`, `src/features/master-data/code-queries.ts:136`

**Detail:** 장부 입력 페이지는 `getActiveLedgerInputCodeOptions("EXPENSE_ITEM")` 결과를 비용 단계로 넘긴다. 이 함수는 `isActive: true`와 `group: "EXPENSE_ITEM"` 조건으로 조회한다.

### Finding 3: 현재 연결 DB에는 비용 항목 코드가 없다.

**Evidence:** Read-only Prisma count on 2026-06-04

**Detail:** `PAYMENT_METHOD`, `EXPENSE_ITEM`, `LOSS_TYPE` 모두 active 0, inactive 0으로 확인됐다.

## Deduced Conclusions

### Deduction 1: 원인은 본사 기준정보 코드 미등록이다.

**Based on:** Finding 1, Finding 2, Finding 3

**Reasoning:** 비용 단계는 활성 `EXPENSE_ITEM` 코드 목록이 비면 저장을 막는다. 해당 목록은 DB의 활성 비용 항목 코드에서만 온다. 현재 DB에는 그 코드가 없다.

**Conclusion:** 본사에서 비용 항목 코드를 등록하지 않았거나, 다른 환경에서도 같은 DB 상태라면 초기 기준정보가 아직 세팅되지 않은 것이다.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| 운영 DB 상태 | 운영 환경에서도 동일한지 최종 확정 | 운영 DB에서 `LedgerInputCode`의 `EXPENSE_ITEM` 개수 확인 |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | `src/features/ledger/components/expense-step-client.tsx:543` |
| Trigger | 비용 단계 렌더링 |
| Condition | `expenseCodeOptions.length === 0` |
| Related files | `src/app/app/store-entry/page.tsx`, `src/features/master-data/code-queries.ts`, `prisma/schema.prisma` |

## Conclusion

**Confidence:** High

현재 확인한 로컬 DB 기준으로 원인은 활성 비용 항목 코드가 하나도 없기 때문이다. 코드상 지점장 비용 입력은 본사 기준정보에 등록된 활성 `EXPENSE_ITEM` 코드를 선택해야만 저장할 수 있다.

## Recommended Next Steps

### Fix direction

본사 계정으로 `/app/master-data/codes`에 들어가 코드 그룹을 `비용 항목`으로 선택한 뒤 필요한 비용 항목을 등록한다. 등록된 코드는 기본 활성 상태로 생성된다.

### Diagnostic

운영 환경이라면 운영 DB에서 `LedgerInputCode` 중 `group = EXPENSE_ITEM`이고 `isActive = true`인 행이 1개 이상 있는지 확인한다.

## Reproduction Plan

1. `LedgerInputCode`에 활성 `EXPENSE_ITEM` 코드가 없는 상태를 만든다.
2. 지점장으로 `/app/store-entry?step=cost`에 접근한다.
3. 비용 단계에서 "비용 항목 코드가 없습니다..." 문구가 표시되고 저장/항목 추가가 비활성화되는지 확인한다.
