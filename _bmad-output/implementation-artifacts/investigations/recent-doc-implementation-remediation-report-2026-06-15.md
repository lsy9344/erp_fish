# 최근 문서 구현 감사 조치 보고서

## 문서 정보

| 항목 | 내용 |
| --- | --- |
| 작성일 | 2026-06-15 |
| 상태 | 조치 완료 |
| 기준 감사 문서 | `_bmad-output/implementation-artifacts/investigations/recent-doc-implementation-audit-investigation.md` |
| 기준 개선 문서 | `_bmad-output/implementation-artifacts/investigations/recent-doc-implementation-improvement-directions.md` |
| 범위 | Confirmed Findings 1~5 조치 및 검증 |

## 결론

최근 문서 감사에서 확인된 5개 불일치를 모두 조치했다. 지점장 민감 필드 노출, 매입 행 정정 미반영, 기간 비교 리포트 stale 위험, story-automator 범위 초과, Story 2.4a/status 누락을 각각 코드와 문서에 반영했다.

## 조치 요약

| Finding | 조치 상태 | 주요 변경 |
| --- | --- | --- |
| 1. 지점장 검토 응답 민감 필드 노출 | 완료 | 지점장 review summary 계약과 화면에서 `grossMarginRate`, `inventoryAmount`, `이익률`, `재고금액`을 제거했다. |
| 2. `PURCHASE_ROW` 정정 미반영 | 완료 | shared correction overlay가 매입 행 금액 정정을 적용하도록 `purchaseItems` 입력과 적용 로직을 추가했다. |
| 3. 기간 비교 리포트 revalidation 누락 | 완료 | 장부 저장, 본사 수정, 재고, 손실, 마감 경로에 `/app/reports/comparison` revalidation을 추가했다. |
| 4. story-automator 범위 초과 | 완료 | 기존 broad orchestration을 `SUPERSEDED`로 표시하고 G6 범위의 새 preflight/orchestration/snapshot을 만들었다. |
| 5. Story 2.4a/status 누락 | 완료 | `epics.md`에 Story 2.4a를 Story 2.5 앞에 추가하고 `sprint-status.yaml` 및 migration 문서로 상태 기준을 연결했다. |

## 변경 파일

### 코드

- `src/features/ledger/review-types.ts`
- `src/features/ledger/response-shaping.ts`
- `src/features/ledger/components/review-summary-client.tsx`
- `src/server/calculations/ledger.ts`
- `src/features/dashboard/queries.ts`
- `src/features/reports/queries.ts`
- `src/features/ledger/actions.ts`
- `src/features/ledger/hq-edit-actions.ts`
- `src/features/ledger/hq-close-actions.ts`
- `src/features/inventory/actions.ts`
- `src/features/inventory/hq-edit-actions.ts`
- `src/features/losses/actions.ts`
- `src/features/losses/hq-edit-actions.ts`

### 테스트

- `tests/unit/ledger-review.test.mjs`
- `tests/unit/ledger-correction-calculations.test.mjs`
- `tests/unit/hq-dashboard.test.mjs`
- `tests/unit/hq-reports.test.mjs`
- `tests/e2e/store-ledger-review.spec.ts`

### 문서/자동화 산출물

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/story-status-migration-2026-06-15.md`
- `_bmad-output/story-automator/orchestration-1-20260611-080819.md`
- `_bmad-output/story-automator/preflight-1-20260611T075952Z.md`
- `_bmad-output/story-automator/preflight-g6-20260615T121435.md`
- `_bmad-output/story-automator/orchestration-g6-20260615-121435.md`
- `_bmad-output/story-automator/policy-snapshots/20260615-121435-g6-scope.json`
- `_bmad-output/story-automator/_tmp_context.json`
- `_bmad-output/story-automator/_tmp_range.json`

## 검증 기록

| 검증 | 결과 |
| --- | --- |
| `node --experimental-strip-types --test tests/unit/ledger-review.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-dashboard.test.mjs tests/unit/hq-reports.test.mjs` | 통과, 52/52 |
| `pnpm typecheck` | 통과 |
| `pnpm test:unit` | 통과, 179/179 |
| `PORT=3101 pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts` | 통과, 4/4 |
| `PORT=3102 pnpm test:e2e -- tests/e2e/hq-reports.spec.ts` | 통과, 11/11 |
| `PORT=3104 pnpm test:e2e -- tests/e2e/hq-ledger-corrections.spec.ts` | 통과, 4/4. `PURCHASE_ROW:amount` 정정 저장, 원본 매입 금액 보존, 정정 반영값 표시를 포함했다. |
| Playwright CLI browser check on `/app/store-entry?storeId=store-gangnam&step=review` | 통과, 화면에는 `총매출`/`결제 차액`이 있고 `이익률`/`재고금액`은 없었다. |

두 E2E spec을 한 번에 실행한 시도는 제한 시간에 걸렸다. 같은 spec들을 포트와 실행을 나누어 다시 검증했고 둘 다 통과했다.

## 검토 보완 조치

2026-06-15 추가 검토에서 나온 보완사항을 반영했다.

- `tests/e2e/hq-ledger-corrections.spec.ts`에 실제 매입 행 금액 정정 E2E를 추가했다.
- `_bmad-output/story-automator/_tmp_epic.json`과 `_bmad-output/story-automator/_tmp_stories_complexity.json`을 G6 구현 범위 34개 story로 맞췄다. 두 파일은 `2.4a`를 포함하고 `7.x`/`8.x`를 포함하지 않는다.
- `_bmad-output/story-automator/_tmp_context.json`의 story count와 marker path를 G6 범위 및 POSIX-style ignore path에 맞췄다.
- `.gitignore`의 story-automator marker ignore 패턴을 `.agents/.story-automator-active`로 수정했다.

## 남은 주의점

- 기존 worktree에는 이번 작업 전부터 unrelated modified/untracked 파일이 있었다. 이 보고서는 조치 범위 파일만 기록한다.
- 새 `sprint-status.yaml`의 새 story 상태는 기존 done 파일만으로 자동 완료 처리하지 않는다. 각 새 AC는 코드, 테스트, 런타임 근거로 다시 확인해야 한다.
- superseded broad story-automator 산출물은 이력 보존을 위해 남겼다. 구현 자동화 재개 기준은 G6 orchestration이다.
