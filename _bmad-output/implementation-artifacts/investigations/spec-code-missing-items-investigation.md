# Investigation: Spec-Code Missing Items

## Hand-off Brief

1. **What happened.** 사용자는 2026-06-27/28 회의 정리 사양과 실제 코드 사이의 최종 누락 항목을 확인해 달라고 요청했다.
2. **Where the case stands.** Active. 기준 문서는 `docs/meeting_0627/cross-document-gap-review-2026-06-28.md`, `docs/meeting_0627/implementation-work-order-2026-06-27.md`, `docs/meeting_0627/client-review-checklist-2026-06-28.md`로 잡았다.
3. **What's needed next.** 실제 코드와 테스트를 영역별로 대조해 Confirmed 누락만 최종 보고한다.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-06-30 |
| Status | Active |
| System | Windows / PowerShell / `C:\Code\Project\erp_fish` |
| Evidence sources | 회의 정리 문서, 실제 소스 코드, 테스트 파일, git status |

## Problem Statement

기존 사양서 정리문서 기준으로 실제 코드에 반영되지 않은 최종 누락 항목을 찾는다.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| `docs/meeting_0627/cross-document-gap-review-2026-06-28.md` | Available | 최종 정책 결정 기준 |
| `docs/meeting_0627/implementation-work-order-2026-06-27.md` | Available | 작업 항목과 검수 기준 |
| `docs/meeting_0627/client-review-checklist-2026-06-28.md` | Available | 고객 검수 체크리스트 |
| Source code | In Progress | 영역별 코드 대조 중 |
| Tests | In Progress | 사양을 막거나 확인하는 테스트 대조 중 |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | 본사 홈 이중 매출/마진 및 마진 반전 | High | In Progress | WO-14 |
| 2 | 인건비/지점장 권한 UX | High | Open | WO-10/11 |
| 3 | 월별 손익/리포트/재고 리포트 | High | Open | WO-15 |
| 4 | 냉동/생물/장기재고 기준 | Medium | Open | WO-16 |
| 5 | 비용 항목 명칭 연동 | Medium | Open | WO-18 |

## Confirmed Findings

### Finding 1: 본사 홈 WO-14가 부분 구현 상태다

**Evidence:** `docs/meeting_0627/implementation-work-order-2026-06-27.md:1565`, `docs/meeting_0627/implementation-work-order-2026-06-27.md:1569`, `src/features/dashboard/types.ts:78`, `src/features/dashboard/types.ts:81`, `src/features/dashboard/types.ts:88`, `tests/unit/hq-dashboard.test.mjs:388`

**Detail:** 장부/분석 매출과 이익률 일부는 들어갔지만, 사양의 `salesBasisDifferenceAmount`/`salesBasisDifferenceRate`가 없다. 마진 반전 표시 요구는 2026-06-30 지시로 삭제됐다.

### Finding 2: 지점장 인건비 UX는 급여 차단만으로는 충분하지 않다

**Evidence:** `docs/meeting_0627/implementation-work-order-2026-06-27.md:612`, `src/features/ledger/components/workstep-client.tsx:538`, `src/features/ledger/components/workstep-client.tsx:670`, `src/features/ledger/components/workstep-client.tsx:728`

**Detail:** 급여액은 제거됐지만, 근무자 선택만 하는 UX가 아니다. 매입 단가/금액 노출 항목은 2026-06-30 지시로 생략한다.

### Finding 3: WO-15 리포트/xlsx는 이름보다 내용이 부족하다

**Evidence:** `docs/meeting_0627/implementation-work-order-2026-06-27.md:962`, `docs/meeting_0627/implementation-work-order-2026-06-27.md:966`, `src/app/api/reports/export/route.ts:296`, `src/app/api/reports/export/route.ts:298`, `src/features/reports/export.ts:79`, `src/features/reports/export.ts:88`, `src/features/reports/export.ts:473`

**Detail:** xlsx 5시트 번들은 있으나 확정 컬럼과 맞지 않고, `품목매출`은 월간 집계가 아니라 월 마지막 날 일별 리포트 대표값이다.

### Finding 4: 장기재고/냉동 생물 기준은 이번 처리 범위에서 생략한다

**Evidence:** `docs/meeting_0627/implementation-work-order-2026-06-27.md:766`, `docs/meeting_0627/implementation-work-order-2026-06-27.md:1539`, `prisma/schema.prisma:404`, `prisma/schema.prisma:406`, `src/features/ledger/ecount-supply-mapping.ts:6`, `src/features/notifications/morning-summary.ts:9`

**Detail:** 품목별 예외 기준, 기준표 마스터 적재, 사양상 알림 노출값까지는 구현되지 않았지만, 2026-06-30 지시로 이번 처리 범위에서 생략한다.

### Finding 5: WO-17 검증표 산출물은 이번 처리 범위에서 생략한다

**Evidence:** `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md:31`, `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md:37`, `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md:41`

**Detail:** `AE4/AE5/C5/C17`은 확인됐지만, 하위 셀의 현재 값/기대 값/차이/조치가 아직 작성되지 않았다. 2026-06-30 지시로 이번 처리 범위에서 생략한다.

## Conclusion

**Confidence:** Medium

2026-06-30 사용자 결정 반영 후 진행 항목은 본사 홈 WO-14의 차이 금액/차이율, 지점장 인건비 UX, 월별 손익/xlsx/리포트 필터/조정사유·메모 보완이다. 월별 손익/xlsx/리포트 필터/조정사유·메모 보완 계획은 `docs/meeting_0627/monthly-report-pnl-design-plan-2026-06-30.md`에 작성했다. WO-17 검증표, 지점장 매입 단가/금액, 장기재고/냉동 생물 기준, 본사 홈 마진율 반전 표시는 이번 처리 범위에서 제외한다.
