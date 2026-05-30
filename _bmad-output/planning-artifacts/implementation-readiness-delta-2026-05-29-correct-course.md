# Implementation Readiness Delta: Correct Course 반영 확인

**프로젝트:** erp_fish  
**작성일:** 2026-05-29  
**대상 변경:** `sprint-change-proposal-2026-05-29-readiness-fixes.md` 승인안 직접 반영  
**검토 범위:** `implementation-readiness-report-2026-05-29.md`의 blocker 2개  
**결론:** 승인된 blocker 2개는 산출물에서 해소됨

## 1. Blocker Recheck

### CR-1: Story 4.5가 Epic 5 리포트 기능에 의존

**상태:** 해소됨

변경 내용:

- Story 4.5 제목을 `관제판이 정정 반영값을 기본으로 사용한다`로 변경했다.
- Story 4.5의 user story에서 리포트 숫자 갱신 요구를 제거했다.
- `리포트용 계산 데이터` AC를 Story 4.5에서 제거했다.
- 정정 저장 후 갱신 대상은 `장부 상세와 관제판 경로`로 제한했다.
- 계산 불가 상태 판단 대상은 `관제판`으로 제한했다.
- FR21 coverage map은 Epic 4와 Epic 5의 책임을 분리하도록 수정했다.

증거:

- `epics.md`: Story 4.5 제목과 user story가 관제판 중심으로 변경됨.
- `epics.md`: FR21 coverage map이 `Epic 4는 장부 상세와 관제판`, `Epic 5는 리포트`로 분리됨.
- `epics.md`: `리포트용 계산 데이터`, `관련 장부 상세, 관제판, 리포트 경로`, `관제판 또는 리포트` 문구가 Story 4.5에서 제거됨.

### MA-1: `코멘트` 탭/comment surface가 PRD/Architecture 소유권 없이 존재

**상태:** 해소됨

변경 내용:

- `epics.md`의 UX-DR26에서 `코멘트` 탭을 제거했다.
- `epics.md` Story 1.2의 모바일 하단 탭과 서버 권한 검사 대상에서 `코멘트`를 제거했다.
- `EXPERIENCE.md` 지점장 IA에서 `본사 코멘트` 행을 제거했다.
- `EXPERIENCE.md` 모바일/태블릿 하단 탭 정의를 `장부 / 재고 / 손실` 3개로 정리했다.
- `key-inventory.html` mockup의 하단 탭에서 `코멘트` 탭을 제거했다.

증거:

- `epics.md`: UX-DR26과 Story 1.2가 `장부, 재고, 손실`만 언급함.
- `EXPERIENCE.md`: 지점장 IA와 내비게이션 구조가 3개 탭으로 정리됨.
- `key-inventory.html`: 모바일 mockup 하단 탭이 `장부`, `재고`, `손실` 3개만 표시함.

## 2. Remaining Non-Blockers

다음 항목은 기존 readiness report의 non-blocker로 유지한다.

- UX key flow의 `Skeleton 1초 이하` 문구는 aspirational scenario copy로 보고, 공식 성능 목표는 `10개 내외 지점 기준 3초`를 유지한다.
- primary/warning 색상 대비 검증은 implementation acceptance에서 WCAG 2.2 AA 기준으로 확인한다.
- Story 1.5, Story 2.2, Story 5.5는 구현 추정 때 크면 분리한다.

## 3. Targeted Readiness Result

**결론:** `implementation-readiness-report-2026-05-29.md`가 지적한 blocker 2개는 직접 수정으로 해소되었다.

**권장 다음 단계:** 전체 implementation readiness workflow를 다시 실행해 최종 상태를 공식 보고서로 갱신한다.
