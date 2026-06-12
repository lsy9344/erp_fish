# Epic 6 문서 감사: 본사 리포트와 안전한 Export

생성일: 2026-06-12
대상: Epic 6 구현 학습 기반 문서 업데이트 검증

## 검증 방법

- Sprint status와 Story 6.1-6.4 완료 기록을 읽었다.
- Epic 5 이전 회고와 Epic 6 story dev/review notes를 비교했다.
- 현재 구현 코드의 report pages, export route, export helper, audit formatter, authz helper, unit/e2e tests를 확인했다.
- 후보 문서를 읽고 실제 코드와 비교해 불일치가 있는 항목만 수정 대상으로 남겼다.

## 문서 업데이트 후보와 판정

| 문서 | 후보 사유 | 코드 대조 결과 | 판정 |
| --- | --- | --- | --- |
| `_bmad-output/planning-artifacts/architecture.md` | Epic 6에서 report export route/helper가 구현됨 | 문서는 `src/app/api/exports`와 `src/features/reports/exports.ts`를 구조로 제시하지만 실제 구현은 `src/app/api/reports/export/route.ts`와 `src/features/reports/export.ts` | 업데이트 필요 |
| `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md` | FR-27~FR-29/export 계약과 구현 범위 비교 필요 | PRD는 제품 계약으로 기간 A/B, export, 민감 필드 차단, OQ-gated 상태를 유지한다. 구현 제한은 story/retro에 기록되어 있고 PRD 자체와 충돌하지 않는다 | 수정 없음 |
| `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md` | Export와 민감 지표 차단 UX 비교 필요 | UX는 지점장 민감 지표 차단, 본사 report/export, 권한 없음 상태를 원칙으로 설명한다. 현재 구현은 이 방향과 일치한다 | 수정 없음 |
| `README.md` | E2E 실행 제약과 local test instruction 비교 필요 | README는 일반 로컬 실행법과 포트 override를 설명한다. sandbox의 `listen EPERM`은 이 환경의 제약이며 일반 README에 넣을 내용이 아니다 | 수정 없음 |
| `.env.example`, `package.json`, `playwright.config.ts` | 설정 문서/스크립트 불일치 후보 | E2E 포트와 DB 설정은 README와 충돌하지 않고, Epic 6 구현이 새 env var나 package script를 요구하지 않는다 | 수정 없음 |

## 적용한 업데이트

- `_bmad-output/planning-artifacts/architecture.md`
  - Route Handler 예시를 `/api/reports/export`와 `/api/health`로 정리했다.
  - 프로젝트 구조의 `app/api/exports`를 `app/api/reports/export`로 갱신했다.
  - `src/features/reports/exports.ts`를 실제 파일명인 `src/features/reports/export.ts`로 갱신했다.
  - FR-27~FR-29 mapping을 `src/app/api/reports/export`로 갱신했다.

## 폐기한 업데이트

- PRD FR-28을 현재 단일 기간 구현에 맞춰 낮추는 변경은 폐기했다. PRD는 목표 계약을 유지해야 하며, MVP 구현 제한은 Story 6.2와 이번 회고에 충분히 기록되어 있다.
- README에 sandbox `listen EPERM`를 추가하는 변경은 폐기했다. 이는 repo 실행 지침이 아니라 현재 자동화 환경의 제약이다.
- UX 문서의 권한 없음/export 문구 변경은 폐기했다. 현재 UX 원칙과 구현 방향이 일치한다.
