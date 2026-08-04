---
title: '리뷰 완료 마감 장부 편집 구현을 main에 교체 통합·배포'
type: 'chore'
created: '2026-08-04'
status: 'done'
baseline_commit: '339c17c14f714b6bdb739be215250a02c16e009b'
context:
  - '{project-root}/docs/handoffs/closed-ledger-edit-merge-2026-08-04.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `main`에는 마감 장부 편집 기능의 병렬 구버전이 이미 배포되어 있고, 리뷰 완료 브랜치 `feat/sales-payment-field-reorder`에는 이후 보완 6개를 포함한 최종 구현이 있다. 두 구현은 30개 파일에서 충돌하며 중복 Prisma 마이그레이션 때문에 단순 병합 시 배포가 실패한다.

**Approach:** `origin/main@339c17c` 기반 통합 워크트리에서 `a0a66fd` 전체를 병합하되 리뷰 완료 브랜치 구현을 우선하고, main의 무관한 리포트·지점 KPI 변경과 이미 적용된 마이그레이션 이력은 보존한다. 로컬 검증과 독립 리뷰 후 main에 push하고 GitHub CI와 Vercel 운영 배포를 끝까지 확인한다.

## Boundaries & Constraints

**Always:** 루트 워크트리의 커밋된 `a0a66fd` 전체와 후속 6개 커밋을 포함한다. 기능 충돌은 브랜치 구현을 기준으로 해결하고 `de3043e`, `99490ff`, `a9246d6`, `339c17c`의 무관 변경을 함께 보존한다. main의 `20260731112000...`, main 내용의 `20260731120000...`만 유지하며 스키마는 그 결과와 일치시킨다. 모든 필수 검증은 exit 0이어야 한다.

**Ask First:** 충돌 해결만으로 끝나지 않고 제품 동작이나 승인된 구현 로직을 새로 바꿔야 할 때, 또는 운영 DB에서 실패 기록 정상화 외의 스키마·데이터 변경이 필요할 때 중단하고 사용자에게 보고한다.

**Never:** 루트 워크트리의 `docs/meeting/0725_meeting.md`, `package.json`을 수정·stash·커밋하지 않는다. 루트의 `DESIGN.md`, `codegraph.json`, `scripts/reset-branch-operational-data.mjs`, `.pi-subagents/`, `.qoder/`, 핸드오프 파일을 병합 커밋에 넣지 않는다. 브랜치의 중복 마이그레이션 `20260803120000...`, `20260803130000...`을 배포하지 않는다. 이월 사항 2건은 수정하지 않는다.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 정상 통합 | main `339c17c`, feature `a0a66fd` | 리뷰 완료 기능과 main 무관 변경이 함께 존재하는 merge commit | 필수 검증 후에만 push |
| 중복 migration | 운영 DB에 main migration 적용, 브랜치 preview 실패 기록 존재 | main migration 파일·체크섬 유지, 중복 파일 제거, 실패 기록만 rolled-back 정상화 | 상태 재확인 실패 시 push 중단 |
| 코드 충돌 | 같은 기능의 병렬 구현 30건 | 브랜치 구현 우선, main KPI·라벨·리포트 변경 보존 | 로직 재설계가 필요하면 사용자 보고 |
| 배포 실패 | CI 또는 Vercel 실패 | 로그 원인 수정 후 재검증·재push | 운영 데이터 변경이 필요하면 중단 |

</frozen-after-approval>

## Code Map

- `prisma/migrations/20260731112000_add_closed_ledger_edit_and_correction_supersede/migration.sql` -- 운영 적용된 enum·supersede 통합 이력
- `prisma/migrations/20260731120000_add_ledger_closed_edit_permission/migration.sql` -- 운영 적용된 OWNER/HQ_ADMIN 권한 이력
- `prisma/schema.prisma` -- migration 결과와 기능 모델의 합집합
- `src/features/{corrections,inventory,ledger,losses,dashboard}` -- 병렬 구현 교체와 main 무관 변경 보존의 핵심
- `tests/e2e`, `tests/unit` -- 브랜치 회귀 검증과 main KPI·라벨 검증의 결합
- `.github/workflows/ci.yml`, `vercel.json` -- CI와 migration 선행 운영 배포 계약

## Tasks & Acceptance

**Execution:**
- [x] `/tmp/erp-merge-integration` -- feature를 merge하고 30개 충돌을 승인 원칙대로 해결한다.
- [x] `prisma/migrations`, `prisma/schema.prisma` -- main 이력을 유지하고 브랜치 중복 migration을 삭제하며 스키마를 일치시킨다.
- [x] `src/features/**`, `tests/**` -- 구버전 helper와 참조를 제거하고 main KPI·라벨·리포트 변경을 보존한다.
- [x] 통합 워크트리 -- 필수 로컬 검증을 모두 통과시키고 병합 결과를 리뷰 가능한 상태로 만든다.

**Acceptance Criteria:**
- Given 보호 파일이 있는 루트 워크트리, when 통합이 완료되면, then 해당 파일의 상태와 체크섬은 작업 전과 동일하다.
- Given main과 feature의 병렬 구현, when 최종 트리를 비교하면, then feature의 리뷰 완료 동작과 main의 무관 커밋이 모두 보존된다.
- Given 운영 DB와 최종 migration 트리, when `prisma migrate status`와 Vercel build가 실행되면, then 실패·대기 migration 없이 배포가 완료된다.
- Given main push, when CI와 Vercel을 조회하면, then 동일 merge SHA의 CI가 성공하고 Production 배포가 Ready이다.

## Spec Change Log

## Design Notes

충돌 파일 전체를 기계적으로 한쪽 선택하지 않는다. 기본값은 feature이지만 `prisma/schema.prisma`, `tests/e2e/meeting-0627-acceptance.spec.ts`, `tests/unit/hq-dashboard.test.mjs`처럼 두 의도가 필요한 파일은 수동 결합한다. 운영 DB 실패 기록은 SQL이 중복 컬럼 오류로 0단계에서 실패했으므로 스키마 롤백이 아니라 Prisma 메타데이터의 rolled-back 해소만 허용한다.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile` -- 의존성 설치 성공
- `pnpm db:validate`, `pnpm format:check`, `pnpm format:check:ci-docs`, `pnpm typecheck`, `pnpm lint` -- 모두 exit 0
- `pnpm test:unit`, `pnpm test:api`, `pnpm build` -- 모두 exit 0
- `node scripts/run-playwright-clean.mjs tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/permission-profiles.spec.ts tests/e2e/store-ledger-conflicts.spec.ts tests/e2e/hq-closed-ledger-sales-price.spec.ts tests/e2e/hq-ledger-edit.spec.ts tests/e2e/hq-dashboard.spec.ts` -- 대상 E2E 모두 통과
- `gh run watch <run-id> --exit-status` -- main CI 성공
- `vercel inspect <production-url>` 및 운영 `prisma migrate status` -- Production Ready, migration 정상

## Suggested Review Order

**통합 진입점과 편집 계약**

- 단일 스냅샷에서 정정 반영 편집값을 구성한다.
  [`page.tsx:158`](../../src/app/app/ledgers/%5BledgerId%5D/page.tsx#L158)

- 권한·상태·version을 묶어 마감 장부 저장을 직렬화한다.
  [`hq-edit-actions.ts:388`](../../src/features/ledger/hq-edit-actions.ts#L388)

**정정과 충돌 처리**

- 정정 생성도 장부 token을 증가시켜 직접 저장과 충돌시킨다.
  [`actions.ts:613`](../../src/features/corrections/actions.ts#L613)

- 활성 정정만 편집 폼에 적용하고 원본 이력은 보존한다.
  [`edit-overlay.ts:140`](../../src/features/corrections/edit-overlay.ts#L140)

- 정정·상세 조회를 Repeatable Read 스냅샷으로 통일한다.
  [`queries.ts:216`](../../src/features/corrections/queries.ts#L216)

**재고 가격과 이월 재확인**

- 본사 재고 저장에서 판매가격과 FIFO 영향을 함께 처리한다.
  [`hq-edit-actions.ts:265`](../../src/features/inventory/hq-edit-actions.ts#L265)

- 수량뿐 아니라 FIFO lot 근거 변화도 재확인으로 승격한다.
  [`carryover-cost-recheck.ts:92`](../../src/features/inventory/carryover-cost-recheck.ts#L92)

**스키마와 관제판**

- 권한과 supersede 필드·관계·인덱스를 운영 migration에 맞춘다.
  [`schema.prisma:471`](../../prisma/schema.prisma#L471)

- 관제판은 정정 반영값과 마감 재고 기준을 같은 스냅샷에서 계산한다.
  [`queries.ts:399`](../../src/features/dashboard/queries.ts#L399)

**회귀 검증**

- 운영매출 상한의 직렬 정정 경계를 행동 테스트로 고정한다.
  [`ledger-corrections.test.mjs:200`](../../tests/unit/ledger-corrections.test.mjs#L200)

- 과거 마감 수정이 다음 장부 재확인으로 이어지는 흐름을 검증한다.
  [`store-ledger-inventory.spec.ts:1140`](../../tests/e2e/store-ledger-inventory.spec.ts#L1140)

- UI 우회에도 서버 권한 경계가 유지되는지 검증한다.
  [`permission-profiles.spec.ts:474`](../../tests/e2e/permission-profiles.spec.ts#L474)
