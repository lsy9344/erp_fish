# Epic 3 문서 감사: 구현 학습 반영 여부

생성일: 2026-06-12
프로젝트: erp_fish
범위: Epic 3 구현 학습 기반 architecture, API 문서, README, configuration 문서 점검

## 감사 기준

- Sprint status와 Epic 3 story file을 기준으로 완료 범위를 확정했다.
- 구현 코드는 `src/server/calculations`, `src/features/ledger`, `src/features/dashboard`, `src/features/reports`, `src/server/sensitive-fields.ts`, 관련 unit tests를 확인했다.
- 문서 후보는 현재 repo의 실제 문서만 대상으로 했다. PRD 원본 파일은 현재 workspace에 없고, `epics.md`와 `architecture.md`가 planning source로 존재한다.

## 업데이트 후보 목록과 판정

| 후보 문서                                         | 후보 사유                                                                                                           | 코드 대조 결과                                                                                                                                                                                                                                                                           | 판정                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `_bmad-output/planning-artifacts/architecture.md` | Story 3.2에서 store-scoped action 순서가 최소 identifier parsing -> authorization -> detailed validation으로 정착됨 | `src/features/ledger/actions.ts`, `src/features/inventory/actions.ts`, `src/features/losses/actions.ts`와 `tests/unit/ledger-validation.test.mjs`가 이 순서를 검증함. 기존 architecture 문구는 상세 schema validation이 authorization-sensitive logic보다 항상 먼저 실행되는 것처럼 읽힘 | 수정함                          |
| `_bmad-output/planning-artifacts/architecture.md` | Story 3.4에서 OQ-gated 계산 registry와 shared sensitive helper가 추가됨                                             | `src/server/calculations/policy-gates.ts`, `src/server/calculations/ledger.ts`, `src/server/sensitive-fields.ts`, `tests/unit/calculation-policy-gates.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`가 기존 Calculation Strategy와 Sensitive Field Gate 방향과 일치함      | 추가 수정 불필요                |
| `_bmad-output/planning-artifacts/epics.md`        | Epic 3 story acceptance criteria와 실제 구현 차이 가능성                                                            | Epic 3의 계산 상태, 검증, 검토 요약, OQ-gated 차단 요구는 story files와 코드가 충족함. Epic 4에도 OQ-gated 상태 유지 조건이 이미 포함됨                                                                                                                                                  | 수정 불필요                     |
| `README.md`                                       | Epic 1 회고에서 seed/E2E 안내 불일치가 과거 리스크였고 Epic 3에서도 E2E bind 제약이 반복됨                          | README는 `.env.example`, `docker-compose.yml`, `package.json`, `playwright.config.ts`와 일치함. seed password는 `.env` 값 사용으로 안내되어 있고 Playwright default DB URL/PORT override도 설명됨                                                                                        | 수정 불필요                     |
| API 문서                                          | 계산/검증 API contract 변경 가능성                                                                                  | Architecture의 API Documentation 섹션은 MVP에 public API/OpenAPI가 필요 없고 Route Handler는 true HTTP endpoint에만 둔다고 설명함. Epic 3 변경은 Server Action/query 내부 contract이며 public API 문서 대상이 아님                                                                       | 별도 API 문서 없음, 수정 불필요 |
| Configuration 문서                                | 새 env/config 필요 가능성                                                                                           | Epic 3은 계산/검증/response shaping/test 변경이며 새 env var나 config file이 없음. `.env.example`과 `src/env.js` 변경 필요 없음                                                                                                                                                          | 수정 불필요                     |

## 적용한 문서 수정

### Architecture validation/data flow

수정 파일: `_bmad-output/planning-artifacts/architecture.md`

반영 내용:

- Validation Strategy에 store-scoped mutation의 2단계 검증 순서를 추가했다.
- Process Patterns의 Validation Pattern을 "최소 access-control field parse -> shared authorization -> detailed field validation"으로 명확히 했다.
- Integration Points와 Data Flow도 실제 Server Action 흐름에 맞춰 갱신했다.

근거 코드:

- `src/features/ledger/actions.ts`: `parseLedgerStoreAccessInput(input)` 후 `requireStoreAccess(access.data.storeId)`를 실행하고, 그 다음 `parseLedgerSalesInput`, `parseLedgerExpenseInput`, `parseLedgerPurchaseInput`, `parseLedgerWorkInfoInput`, `parseLedgerSubmitInput`을 실행한다.
- `src/features/inventory/actions.ts`: inventory 저장과 조정 저장 모두 store access 최소 파싱과 authorization 후 상세 schema validation을 실행한다.
- `src/features/losses/actions.ts`: losses 저장도 같은 순서를 따른다.
- `tests/unit/ledger-validation.test.mjs`: store save actions가 상세 field validation보다 store authorization을 먼저 수행하는 정적 회귀 테스트를 포함한다.

## 폐기한 업데이트 후보

1. README E2E 안내 수정
   - 폐기 사유: README는 현재 Playwright default와 override 방법을 정확히 설명한다. Story 3의 `listen EPERM 127.0.0.1:3000`은 현재 sandbox 실행 제약이며 문서와 코드의 불일치가 아니다.

2. OQ-gated 계산 architecture 추가 수정
   - 폐기 사유: 기존 Calculation Strategy와 Sensitive Field Gate는 미확정 계산을 `확인 필요`, `계산 불가`, `데이터 부족`으로 반환하고 store manager 민감 지표를 숨긴다는 방향을 이미 설명한다. 구현된 `policy-gates.ts`는 이 방향의 구체화이며 문서 불일치는 확인되지 않았다.

3. Epic 4 plan 재작성
   - 폐기 사유: Epic 4 story에는 dashboard/ClosePreflight/HQ edit/close/correction에서 OQ-gated 계산을 유지하고 최신 계산/검증 상태를 재사용해야 한다는 acceptance criteria가 이미 있다. Epic 3 회고의 action item으로 충분하다.

## 잔여 리스크

- Architecture 문서는 현재 수정 전부터 사용자 변경 사항이 있는 dirty file이었다. 이번 감사는 검증된 불일치만 좁게 수정했고, 기존 변경 내용은 되돌리지 않았다.
- PRD 원본 경로는 planning metadata에 남아 있지만 현재 workspace에는 없어서 직접 수정 여부를 판정하지 못했다. 현재 사용 가능한 authoritative planning 문서는 `epics.md`와 `architecture.md`다.
