# 마감 장부 편집 기능 main 병합 기록

> **역사 기록:** 아래 핸드오프는 `77abaf8`에서 main 병합이 완료되기 전 작성된 문서입니다. 현재 실행 절차로 사용하지 말고 당시 충돌 해결·검증 배경을 확인하는 용도로만 보존합니다.

아래 내용은 병합 당시 이어받는 에이전트/작업자에게 전달한 원문입니다.

---

## 임무

`/home/noah/Desktop/project/dev_busi/erp_fish` 저장소에서 리뷰 완료된 기능 브랜치 `feat/sales-payment-field-reorder`(HEAD `a0a66fd`)를 `main`(origin/main `339c17c`)에 병합하고, CI가 통과하도록 필요한 수정을 한 뒤 push하여 Vercel 재배포까지 완료하세요. **단순 병합은 불가능합니다.** main에 같은 기능의 구버전이 이미 들어가 있어 충돌 해결과 마이그레이션 정리가 필요합니다. 사용자가 승인한 방식은 "우리(리뷰 통과) 버전으로 main의 구현을 교체 통합"입니다.

## 절대 건드리지 말 것

- 메인 워크트리(`/home/noah/Desktop/project/dev_busi/erp_fish`)의 미커밋 변경 2건: `docs/meeting/0725_meeting.md`, `package.json` — 커밋·수정·stash 모두 금지.
- 언트래킹 파일들(`DESIGN.md`, `codegraph.json`, `scripts/reset-branch-operational-data.mjs`, `.pi-subagents/`, `.qoder/`)도 그대로 둘 것.

## 배경 (리뷰 루프 결과)

브랜치 `feat/sales-payment-field-reorder`는 `20e1a4d..a0a66fd` 31커밋으로 DESIGN.md 기능을 구현했고, 부모 오케스트레이션 리뷰 3라운드를 통과했습니다:

- 기능: 관리자 홈 매출 3지표 단순화, `LEDGER_CLOSED_EDIT`(OWNER/HQ_ADMIN) 기반 마감 장부 마스터 편집(기존 편집 화면 재사용, 마감 상태·최초 마감 정보 보존, 사유·감사·충돌 토큰 유지), 재고 탭 판매가격 편집→예상매출·마진·손실 재계산, 정정 supersede와 직접저장↔정정 충돌 직렬화, 다음 날 이월 재확인(수량+FIFO 원가).
- 라운드 3까지 수정 완료: 정정 읽기 스냅샷 통일, 총매출 정정 보존(제출 계약과 일치 — 이월 매출 제외가 핵심, `a0a66fd`), 본사+지점 충돌 응답의 타 지점 정보 노출 차단(존재 여부도 노출 안 함), 빈 손실 사유 정정 차단, 동시성·권한 회귀 테스트.
- 최종 검증(브랜치 단독 기준): typecheck·lint exit 0, prettier 깨끗, 단위 667/667, 대상 E2E(hq-ledger-corrections) 10/10, 라운드3 리뷰어 독립 실행 대상 E2E 38/38 + store-ledger-conflicts 5/5.

## 핵심 문제: main에 병렬 구현이 이미 존재

- `origin/main`의 `27134e2`(8/3 11:39, "feat(admin): home sales cell redesign and master edit of closed ledgers")가 같은 DESIGN.md 기능의 **다른 구현**을 포함합니다. 파일 구성이 다릅니다: `src/features/ledger/edit-correction-overlay.ts`, `src/features/ledger/hq-mutation.ts`, `src/features/corrections/operating-sales-validation.ts`.
- 우리 브랜치의 base는 그 이전(`0f47c8f`, 7/31)이라 같은 기능을 독립 재구현한 상태입니다.
- 시범 병합 결과 **30개 파일 충돌** 확인됨 (마이그레이션, `prisma/schema.prisma`, 핵심 액션, 테스트 다수).
- **치명 이슈 — 마이그레이션 중복**:
  - main 보유: `20260731112000_add_closed_ledger_edit_and_correction_supersede`(enum `LEDGER_CLOSED_EDIT` + `CorrectionRecord.supersededAt/supersededById/supersedeReason` + 인덱스 + FK), `20260731120000_add_ledger_closed_edit_permission`(OWNER/HQ_ADMIN grant, `ON CONFLICT DO NOTHING`).
  - 브랜치 보유: `20260731120000_add_ledger_closed_edit_permission`(**이름은 같은데 내용이 enum ALTER** — 충돌), `20260803120000_add_correction_superseded_at`(컬럼 추가, main 것과 중복), `20260803130000_grant_ledger_closed_edit_permission`(grant 중복).
  - 양쪽이 병합된 채 배포되면 Vercel 빌드의 `prisma migrate deploy`가 실패하거나 이력이 깨집니다.
- **배포 상태 가정**: `27134e2`가 이미 프로덕션에 배포되어 해당 마이그레이션이 실 DB에 적용됐다고 가정하고 작업합니다(사용자 미확인 — 가능하면 Vercel 대시보드/DB에서 `prisma_migrations` 이력으로 확인). 적용이 확인되면 main의 마이그레이션 2개를 그대로 유지하는 것이 정답입니다.

## 진행 절차 (승인된 Plan A)

1. 통합 워크트리에서 작업: `/tmp/erp-merge-integration`에 이미 `merge/closed-ledger-edit-v2` 브랜치가 `origin/main`(`339c17c`) 기반으로 생성되어 있습니다. (없으면 `git worktree add /tmp/erp-merge-integration origin/main` 후 브랜치 생성.)
2. `git merge feat/sales-payment-field-reorder` 실행 → 충돌 30건 해결. 해결 원칙:
   - **기능 코드·테스트 충돌은 브랜치(ours 아님, 브랜치 쪽 = theirs) 내용 우세**로 해결. 브랜치가 3라운드 리뷰 통과 버전입니다.
   - main의 **무관 커밋 보존**: `339c17c`(지점장 KPI 카드 #7 — `review-summary-client.tsx`, `response-shaping.ts`, `review-types.ts`, 관련 테스트), `99490ff`·`de3043e`(리포트 차트), `a9246d6`(meeting-0627 예상매출 라벨断언). 이 변경이 충돌 파일 안에 섞여 있으면 함께 살릴 것.
   - `tests/e2e/meeting-0627-acceptance.spec.ts`, `tests/unit/hq-dashboard.test.mjs`처럼 양쪽 다 수정한 테스트는 의도가 둘 다 반영되도록 병합(라벨 단언은 main 쪽, 기능 검증은 브랜치 쪽).
3. **마이그레이션 정리(필수)**:
   - 최종 트리에 남길 것: main의 `20260731112000_add_closed_ledger_edit_and_correction_supersede`, main 버전 `20260731120000_add_ledger_closed_edit_permission`(grant).
   - 삭제할 것: 브랜치의 `20260731120000_add_ledger_closed_edit_permission`(enum ALTER 버전 — 동명 디렉터리 충돌 시 main 내용 채택), `20260803120000_add_correction_superseded_at`, `20260803130000_grant_ledger_closed_edit_permission`.
   - `prisma/schema.prisma`는 양쪽 합집합으로 해결하되, 최종 스키마가 위 마이그레이션 결과(enum 값, superseded 필드·인덱스·FK)와 정확히 일치해야 함. 해결 후 `pnpm db:validate` 확인.
4. **구버전 잔재 제거**: 병합 후 main 쪽 구파일(`src/features/ledger/edit-correction-overlay.ts`, `src/features/ledger/hq-mutation.ts`, `src/features/corrections/operating-sales-validation.ts`)이 남습니다. 임포트 참조를 확인해 새 구현으로 대체된 것이면 파일 삭제. main 쪽 전용 테스트 `tests/unit/closed-ledger-correction-foundation.test.mjs`도 확인 — 삭제된 모듈을 검증하면 제거하거나 새 구현 기준으로 이관.
5. `DESIGN.md`는 main에서 트래킹 중인 버전을 유지(브랜치 쪽은 언트래킹이었음).

## 검증 (병합 커밋 전, 전부 exit 0 필수)

워크트리에서 `pnpm install` 후:

- `pnpm db:validate`
- `pnpm format:check` (CI가 prettier 체크함) 및 `pnpm format:check:ci-docs`
- `pnpm typecheck`, `pnpm lint`
- `pnpm test:unit` (브랜치 기준 667건)
- `pnpm test:api`
- `pnpm build` (production build)
- E2E 최소 범위: `node scripts/run-playwright-clean.mjs tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/permission-profiles.spec.ts tests/e2e/store-ledger-conflicts.spec.ts tests/e2e/hq-closed-ledger-sales-price.spec.ts tests/e2e/hq-ledger-edit.spec.ts tests/e2e/hq-dashboard.spec.ts`
- 깨지는 항목은 충돌 해결 오류일 가능성이 높으니 해당 파일 재검토. 구현 로직 자체를 바꾸는 수정이 필요해지면 멈추고 사용자에게 보고.
- 통과 후 병합 커밋 생성(merge commit 메시지: 무엇을 교체 통합했는지 한국어로 요약).

## 푸시·CI·재배포

- `git push origin merge/closed-ledger-edit-v2:main` (또는 메인 워크트리에서 main을 fast-forward 불가 병합 후 push — 단 메인 워크트리의 미커밋 파일 주의. push 자체는 워크트리에서 가능).
- push 시 GitHub Actions(`.github/workflows/ci.yml`)가 main에서 실행하는 잡: `fast-checks`, `build`, `api-tests`, `playwright-full`(4 샤드). `gh auth`는 되어 있음(`lsy9344`). `gh run watch` 또는 `gh run list --workflow ci.yml`로 모니터링.
- CI 실패 시: 로그 분석 → 통합 워크트리에서 수정 → 추가 커밋 → 재 push → 재확인. (사용자 지시: "ci 에러 발생하면 해결해서 재배포")
- Vercel은 main push로 자동 재배포됩니다(`vercel.json` buildCommand가 `pnpm db:migrate && pnpm run build` — 배포 중 마이그레이션 자동 실행). 배포 순서 제약(마이그레이션 선반영)이 빌드 안에 포함되어 있으므로 별도 수동 마이그레이션 불필요. 배포 상태는 Vercel 대시보드 또는 `gh`/로그로 확인.
- Slack 알림 잡이 있어 성공/실패가 자동 전파됩니다.

## 완료 보고 형식

- 병합 커밋 SHA, 충돌 해결 요약(어느 쪽을 왜 택했는지)
- 마이그레이션 최종 목록과 삭제한 것
- 검증 명령별 exit code
- CI run URL과 결과, Vercel 배포 상태
- 남은 위험과 이월 사항

## 이월 사항 (병합과 무관, 건드리지 말 것)

- 사용자 결정 대기 2건: (1) `src/features/ledger/ecount-supply-commit.ts`가 `LEDGER_CLOSED_EDIT` 없이 마감 장부 변경 가능(기존 경로, 차단/허용 제품 결정 필요), (2) FIFO 이월 재확인 경고가 다음 날 재고 재저장 시 사라지는 동작의 의도 확인.
- 비차단 개선 후보: permission-profiles HQ 재고 e2e의 180초 제한 근접(분리 권장), 손실 충돌 경로 결과 기반 E2E 보강, 대시보드/리포트 읽기 스냅샷 통일, 소스 grep 단위 테스트 행동화.

---

생성 시각 기준 상태: 브랜치 `feat/sales-payment-field-reorder`는 `origin`에 push됨. 통합 워크트리 `/tmp/erp-merge-integration`(브랜치 `merge/closed-ledger-edit-v2`) 생성 완료, 병합 미실행.
