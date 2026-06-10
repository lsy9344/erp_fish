# Validation Report — ERP Fish PRD

- **PRD:** `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- **Rubric:** `C:\Code\Project\erp_fish\.agents\skills\bmad-prd\assets\prd-validation-checklist.md`
- **Run at:** 2026-06-10T17:06:51+09:00
- **Grade:** Poor

## Overall verdict

이 PRD는 "본사 관제탑"이라는 중심축, 장부 상태 모델, 본사 마감/정정 원칙, 지점장 입력 흐름을 잘 잡고 있어 MVP 방향 공유용으로는 충분하다. 다만 §8의 추가 구현 범위가 §6의 제외 범위와 겹치고, CAP 요구사항들이 성공 지표·완료 기준·Open Questions에 충분히 연결되지 않아 에픽/스토리 작성자는 범위와 우선순위를 다시 해석해야 한다.

추가 비판 리뷰는 더 보수적으로 판단했다. 문서가 `final` 상태이지만 핵심 회계·재고·권한·리포트 정책이 아직 열려 있고, MVP/추가 범위/계약 조건이 한 문서 안에 섞여 있어 현재 상태를 "구현 착수 가능한 최종 PRD"로 보기 어렵다.

## Dimension verdicts

- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — adequate
- Scope honesty — adequate
- Downstream usability — adequate
- Shape fit — adequate

## Findings by severity

### Critical (4)

**[Adversarial]** — `final` 상태가 미해결 핵심 결정과 충돌함 (§frontmatter, §10)  
문서 frontmatter는 `status: "final"`이지만 §10에는 매출차액 기준, `30%단가`, 품목/규격 분리, 이월/이카운트/FIFO 정책, 지점장 마진율 등 스토리 작성 전 또는 Epic 구현 전 필수 결정이 남아 있다.  
Fix: 문서 상태를 낮추거나, pre-implementation gate 표를 만들어 owner, due date, affected FR/CAP를 연결한다.

**[Rubric + Adversarial]** — MVP 제외와 추가 구현 범위가 충돌함 (§6, §7.2, §8)  
§6은 텔레그램 알림, 이카운트 연동, 특수 기간 비교, 직원 마스터 등을 제외하지만 §8은 같은 축을 추가 구현 범위로 다시 포함한다. release boundary가 없어서 계약·견적·스토리 기준이 흔들린다.  
Fix: `MVP required`, `post-MVP committed`, `post-MVP candidate`, `excluded`, `contract/ops`로 나누는 release matrix를 추가하고 각 FR/CAP가 하나의 release에만 속하게 한다.

**[Adversarial]** — ERP 회계 계산 규칙이 충분히 닫히지 않음 (§4.3)  
매출원가, 매출이익, 이익률, 영업이익, 재고금액, 평균매출, 매출차액 등의 공식은 있으나 rounding, negative values, zero denominator, VAT, returns/refunds, correction recalculation, FIFO 전환 시 coexistence가 없다.  
Fix: KPI별 canonical calculation spec을 만들고 예시, edge case, precision/rounding, 서버 계산 책임을 명시한다.

**[Adversarial]** — 재고 이월 정책에 위험한 빈틈이 남음 (FR-9, §3.1, CAP-7)  
전일재고 후보와 확정 이월 기준은 있지만 휴무/건너뛴 날/late close/closed day correction/month boundary/여러 번 저장된 같은 날에 대한 상태 전이가 부족하다.  
Fix: normal day, holiday, missing prior day, late close, correction after close, month transition 시나리오별 state machine과 예시를 추가한다.

### High (12)

**[Adversarial]** — 권한 모델이 너무 거침 (FR-1~FR-3, FR-18~FR-26, CAP-13)  
본사 사용자와 지점장만으로 direct edit, close, correction, threshold, master, upload, batch close 권한을 설명하기 어렵다.  
Fix: 대표, 본사 관리자, 본사 스텝, read-only, uploader, closer, settings admin 등 action/screen/API/data scope별 permission matrix를 추가한다.

**[Adversarial]** — 일괄 마감은 잠금 위험에 비해 완료 기준이 약함 (CAP-15)  
eligible states, validation error close 가능 여부, 휴무/누락 포함 여부, partial failure, dry run, reason required가 없다.  
Fix: preflight, confirmation summary, partial failure, rollback policy, audit fields를 정의한다.

**[Adversarial]** — 정정 기록 모델이 감사성을 충분히 지키지 못함 (FR-20, FR-21)  
delta인지 replacement인지, multiple correction ordering, void, report/export display, permission, reason/approval이 불명확하다.  
Fix: correction semantics, lifecycle, ordering, permission, display, calculation rules를 정의한다.

**[Adversarial]** — 감사 로그 요구사항이 테스트 가능하지 않음 (FR-3, FR-18~FR-26, CAP-6, CAP-15)  
event taxonomy, required fields, retention, export/search, immutability가 없다.  
Fix: create/edit/close/correction/upload/settings/permission/batch close event contract를 만든다.

**[Adversarial]** — 이카운트 업로드에 파일 계약과 실패 정책이 없음 (CAP-6)  
supported file version, required columns, duplicate detection, idempotency, re-upload, parse failure, branch/date matching, manual line coexistence가 없다.  
Fix: upload contract, preview/commit flow, rollback, accepted/rejected samples를 추가한다.

**[Adversarial]** — 지점 매입 직접 입력 정책과 업로드 기본 정책이 충돌함 (FR-8, CAP-6)  
FR-8은 지점장/본사 입력을 말하고 CAP-6은 본사 업로드 기본과 지점장 조회 중심을 말한다.  
Fix: release별로 branch editable, branch read-only, emergency-only 중 하나를 확정한다.

**[Adversarial]** — 민감 지표 숨김이 API/보고서 단위까지 닫히지 않음 (CAP-13, FR-13, FR-28, FR-29)  
마진율과 재고 금액이 원가·이익을 역추정할 수 있는데 노출 기준이 명확하지 않다.  
Fix: role별 source field, derived metric, report/export/API response visibility를 정의한다.

**[Rubric]** — 추가 구현 범위의 성공 지표가 없음 (§8, §9)  
CAP-1~CAP-19가 넓게 추가되었지만 §9는 MVP FR 중심이다. 업로드, FIFO, 알림, 월 손익이 어떤 결과를 만들어야 성공인지 부족하다.  
Fix: CAP 묶음별 operational outcome과 counter-metric을 §9에 추가한다.

**[Adversarial]** — 성공 지표가 대부분 기능 완료 체크에 가깝다 (§9)  
meeting prep time, branch submission rate, data quality threshold, Excel fallback rate, unresolved anomaly count가 없다.  
Fix: 실제 운영 결과를 측정하는 target metric을 추가한다.

**[Adversarial]** — 아침 회의 workflow에 cutoff/freshness 규칙이 없다 (§1, FR-15, FR-27)  
지점 제출 마감, 8 AM 기본 조회일, late submission 표시, stale data 표시가 없다.  
Fix: operational timing과 freshness labels를 정의한다.

**[Adversarial]** — 리포트 요구사항이 layout/data contract와 연결되지 않음 (FR-27~FR-29, CAP-2~CAP-4, CAP-10)  
required columns, filters, grouping, exports, sort, chart, period comparison, unclosed/corrected/holiday aggregate rules가 없다.  
Fix: 주요 리포트별 field/filter/aggregation/example spec을 만든다.

**[Rubric]** — CAP 우선순위와 phase 논리가 드러나지 않음 (§8)  
CAP 번호와 배치가 구현 순서나 의존성을 설명하지 않는다.  
Fix: 각 CAP에 `phase`, `depends on`, `priority rationale`를 붙이거나 별도 구현 순서 표를 둔다.

### Medium (15)

**[Rubric]** — CAP별 Open Questions 연결이 약함 (§8, §10)  
CAP-7/OQ-7/OQ-17, CAP-14/OQ-9, CAP-11/OQ-13/OQ-16 같은 연결이 문서에서 직접 보이지 않는다.  
Fix: 각 CAP 끝에 `Blockers/Open Questions` 줄을 붙인다.

**[Rubric]** — 외부 알림과 보안 완료 기준이 검증 가능하지 않음 (CAP-11)  
재시도 횟수, 실패 상태 노출, 운영자 확인 화면, 토큰 저장/회전 기준이 없다.  
Fix: retry, failure visibility, secret storage, permission, audit log 기준을 추가한다.

**[Rubric + Adversarial]** — 분석 확장성/AI 대비 구조화 요구가 너무 넓음 (CAP-12)  
어떤 데이터가 구조화 필드이고 어떤 데이터가 자유 메모인지 불명확하다.  
Fix: special notes, work assignment, abnormal events, tags의 최소 구조화 필드 목록을 정의한다.

**[Rubric]** — 계약/운영 조건이 제품 요구사항과 같은 레벨에 있음 (CAP-19)  
서버 운영/유지보수 계약 조건이 CAP 요구사항처럼 보인다.  
Fix: `운영/계약 결정사항` 섹션으로 분리하고, 제품 요구사항에는 시스템 동작만 남긴다.

**[Rubric]** — CAP 요구사항이 FR/SM/UJ에 연결되지 않아 추출 비용이 큼 (§4, §8, §9)  
CAP-6/FR-8/FR-25, CAP-13/FR-13/FR-28/FR-29, CAP-15/FR-19 같은 연결이 없다.  
Fix: CAP별 `Related FR`, `Related SM`, `Related OQ`를 추가한다.

**[Rubric]** — PRD가 MVP spec과 extension annex 사이에 걸쳐 있음 (§0, §6, §8)  
§0은 1차 제품 범위라고 하면서 2026-06-10 승인 추가 구현 범위도 포함한다.  
Fix: 문서 제목이나 §0에 `MVP baseline + approved extension`이라고 명명하고 §8을 extension annex처럼 구성한다.

**[Adversarial]** — 인증 기본 보안 통제가 부족함 (FR-1)  
password policy, reset, session timeout, failed login, lock/disable, MFA decision, credential rotation이 없다.  
Fix: baseline authentication/account lifecycle 요구사항을 추가한다.

**[Adversarial]** — 운영 NFR이 실제 운영 기준으로는 얇음 (§5, CAP-19)  
availability, backup/restore, DR, browser support, upload size, concurrency, retention, monitoring이 없다.  
Fix: measurable operational NFR을 추가하고 계약 조건과 runtime behavior를 분리한다.

**[Adversarial]** — 데이터 마이그레이션 제외가 리포트 기대치를 보호하지 못함 (§6, §9, OQ-5)  
월간/기간/전년/특수기간 리포트가 충분한 신규 데이터 전에는 어떻게 보일지 없다.  
Fix: insufficient data state와 최소 seed/import 필요 여부를 정의한다.

**[Adversarial]** — 모바일 7단계 입력 workflow가 느슨함 (FR-5)  
autosave, validation timing, unsaved warnings, step completion, error recovery, large inventory table mobile support가 없다.  
Fix: mobile workflow acceptance criteria를 추가한다.

**[Adversarial]** — 직원/급여 범위가 구조적으로 불명확함 (§2.3, FR-12, §8.1)  
employee master ownership, duplicate names, permission, privacy가 없다.  
Fix: employee data ownership, identifiers, duplicates, privacy, release boundary를 정의한다.

**[Adversarial]** — 알림 피로 제어가 없다 (CAP-11)  
recipient management, opt-out, thresholds, suppression, duplicate prevention, escalation, test send가 없다.  
Fix: alert configuration과 delivery control을 정의한다.

**[Adversarial]** — 마스터 데이터 lifecycle이 부족함 (FR-22~FR-26)  
uniqueness, effective dates, de-duplicate, aliases, delete/deactivate, past ledger display rules가 없다.  
Fix: create/edit/deactivate/merge/alias/effective date/historical display rules를 추가한다.

**[Rubric]** — 일부 무거운 조회의 성능 기준이 없음 (§5, §8)  
통합 재고, 기간 비교, FIFO 근거 조회 등은 10개 지점 3초 기준만으로 부족하다.  
Fix: 조회 유형별 기준 데이터량과 target response time을 추가한다.

**[Rubric]** — §8 CAP 순서가 downstream 참조성을 떨어뜨림 (§8)  
CAP 번호가 섹션 순서와 맞지 않아 추적이 어렵다.  
Fix: CAP 목록 표에 번호, 제목, 섹션, phase를 정리한다.

### Low (5)

**[Rubric]** — `지점`과 `매장` 용어가 섞임 (§3, §8.5, addendum §2)  
제품 표준 용어는 `지점`인데 일부 보고/계약 문장에 `매장`이 남아 있다.  
Fix: 표준 용어는 `지점`으로 통일하고 원본 문서의 `매장=지점` 매핑을 설명한다.

**[Adversarial]** — "기존 Excel 수준"은 안전하지 않은 shorthand임 (CAP-3, addendum)  
Excel 공식이 검증되지 않았는데 기존 Excel parity가 요구처럼 읽힌다.  
Fix: Excel parity는 예시로 두고 명시적 report requirement로 바꾼다.

**[Adversarial]** — 한국어 업무 용어와 구현 용어가 섞임 (§4, §8)  
mutation, trace, API response 같은 용어가 비즈니스 독자에게 숨은 구현 전제를 만들 수 있다.  
Fix: glossary에 정의하거나 비즈니스 언어로 바꾼다.

**[Rubric]** — CAP ID는 모두 있으나 숫자 순서가 문서 순서와 다름 (§8)  
참조할 때 혼란이 생길 수 있다.  
Fix: CAP 목록 표로 보완한다.

**[Rubric]** — 성능 기준이 MVP 관제판 중심으로만 보임 (§5)  
무거운 extension 화면의 기준은 별도 보강이 필요하다.  
Fix: extension 화면별 performance target을 추가한다.

## Mechanical notes

- FR ID는 FR-1~FR-29까지 연속이고 중복이 보이지 않는다.
- UJ ID는 UJ-1~UJ-4까지 연속이며 각 여정에 주체가 있다.
- SM ID는 SM-1~SM-5와 SM-C1~SM-C2로 구분되어 있고 주요 SM은 관련 FR을 참조한다.
- CAP ID는 CAP-1~CAP-19가 모두 존재하지만 문서 순서가 숫자 순서와 다르다.
- Assumptions Index는 inline `[ASSUMPTION]` 태그가 없다는 현재 상태와 맞다.
- §10 Open Questions는 결정 등급과 담당/재확인 시점을 갖고 있어 downstream 사용성이 좋아졌다.

## Reviewer files

- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-adversarial-general.md`
