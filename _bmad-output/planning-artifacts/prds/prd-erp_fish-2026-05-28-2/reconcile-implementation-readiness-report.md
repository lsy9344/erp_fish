# Reconcile: implementation-readiness-report-2026-06-10

출처: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-10.md`

## 반영한 PRD 갭

- CR-1 / MA-6: FR-9의 “직전 마감 장부 자동 이월” 표현을 “직전 저장 장부 기반 전일재고 후보 이월 + 본사 마감 후 확정 이월”로 보정했다.
- MA-2: MVP 기본 계산과 Epic 6 FIFO 기준 원가 계산의 적용 범위를 구분해야 한다는 요구를 §4.3, FR-13, CAP-7에 반영했다.
- MA-3: MVP 근무인원 숫자가 직원별 근무 기록으로 자동 복원되지 않는다는 전환 기준을 FR-12, CAP-1, CAP-9에 반영했다.

## PRD 밖 후속 작업

- MA-1, MA-4, MA-5와 일부 Minor concern은 `epics.md`, `architecture.md`, `EXPERIENCE.md`, `sprint-status.yaml` 수정이 필요하다.
- PRD 업데이트만으로 readiness report의 `NOT_READY_AS_IS` 상태가 해소되지는 않는다.
- 다음 산출물 정렬 시 승인된 `sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md`의 Increment 1~14를 기준으로 적용한다.
