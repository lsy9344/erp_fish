# Sprint Change Proposal: 2026-06-08 운영 기능 보완 범위 반영

**프로젝트:** erp_fish  
**작성일:** 2026-06-10  
**진행 방식:** Incremental  
**트리거 문서:** `_bmad-output/planning-artifacts/briefs/brief-erp_fish-2026-06-08/agent-implementation-context.md`  
**상태:** 승인됨  
**승인된 증분 변경안:** Increment 1 - CAP-1~CAP-18을 추가 Epic 6~11로 분류하고 `epics.md`에 반영; Increment 2 - PRD에 2026-06-10 추가 구현 범위 반영; Increment 3 - Architecture/UX/Design에 추가 범위 반영; Increment 4 - sprint-status에 Epic 6~11 backlog 반영  
**Increment 1 승인:** 2026-06-10, 사용자 명시 승인 `a`  
**Increment 2 승인:** 2026-06-10, 사용자 명시 승인 `A`  
**Increment 3 승인:** 2026-06-10, 사용자 명시 승인 `a`  
**Increment 4 승인:** 2026-06-10, 사용자 명시 승인 `a`
**최종 승인:** 2026-06-10, 사용자 명시 승인 `a`, `yes`

## 1. Issue Summary

2026-06-08 회의와 고객 제공 엑셀 확인 결과, ERP Fish 1차 MVP에 포함된 `지점 일일 장부 입력`, `본사 관제`, `본사 마감/정정`, `기본 리포트`만으로는 실제 운영 엑셀의 업무 범위를 충분히 대체하기 어렵다는 점이 확인되었다.

핵심 문제는 완전한 신규 제품 전환이 아니라, 기존 엑셀에 있던 운영 기능 중 MVP에서 빠졌거나 얇게 구현된 영역을 웹 ERP의 정식 기능으로 복원하고 보완해야 한다는 점이다.

근거 문서는 다음과 같다.

- `docs/meeting/change.md`
- `docs/reference_from_customer/desc.md`
- `docs/reference_from_customer/feature_analysis.md`
- `_bmad-output/planning-artifacts/briefs/brief-erp_fish-2026-06-08/agent-implementation-context.md`
- `_bmad-output/planning-artifacts/briefs/brief-erp_fish-2026-06-08/agent-change-request.md`

이번 변경은 기존 Epic 1~5가 이미 `done` 상태인 상황에서 들어온 범위 확장이다. 따라서 기존 MVP Epic을 직접 뒤섞기보다, CAP-1~CAP-18을 추가 Epic 6~11로 분리해 후속 구현과 검수 기준을 명확히 한다.

## 2. Impact Analysis

### Epic Impact

**Epic 1~5: 기존 MVP 기준선**

기존 Epic 1~5는 완료된 MVP 기준선으로 유지한다. 다만 새 기능이 기존 권한, 장부 원본 보존, 감사 로그, shared calculation, 마감 후 정정 원칙을 깨지 않아야 한다.

**Epic 6: 품목 정규화와 매입/FIFO 재고 기반**

CAP-5, CAP-6, CAP-7의 데이터 구조 의존성이 가장 크다. 품목명/규격 정규화, 이카운트 업로드, FIFO 재고 금액은 순서가 바뀌면 재작업 위험이 크므로 먼저 묶어 구현해야 한다.

**Epic 7: 본사 통합 재고와 상품별 관리자 분석**

CAP-4, CAP-8은 Epic 6의 정규화와 FIFO 기반을 사용해 본사 재고 판단과 상품별 분석으로 확장된다.

**Epic 8: 지점장 권한, 마감, 손실, 입력 흐름 보완**

CAP-13~CAP-18은 기존 화면과 정책을 바꾸는 보완 성격이다. 특히 민감 회계 지표 숨김은 UI가 아니라 서버 응답부터 제한해야 한다.

**Epic 9: 직원 마스터와 인사/급여 정산 참고 자료**

CAP-1, CAP-9는 기존 FR-12의 단순 근무인원 입력을 직원 선택과 월간 근무일수 집계로 확장한다. 급여는 실제 지급 확정이 아니라 정산 참고 자료로 제한한다.

**Epic 10: 리포트 고도화와 월 손익계산서**

CAP-2, CAP-3, CAP-10은 기존 Epic 5의 기본 리포트를 엑셀 보고 양식 수준으로 확장한다. 정정 반영값과 shared server calculation 원칙은 계속 유지한다.

**Epic 11: 외부 알림과 AI 제외 원칙**

CAP-11은 LINE Messaging API 또는 텔레그램 알림을 추가한다. CAP-12는 데이터 구조 확장만 허용하고 AI 기능 구현은 명확히 제외한다.

### Artifact Conflicts

**PRD**

기존 PRD의 1차 제외 범위에는 직원 상세 관리, 특수기간 비교, 이카운트 연동, 알림 등이 제외로 남아 있다. 이번 변경은 PRD의 1차 MVP 설명과 충돌하므로, 다음 increment에서 PRD를 “MVP 기준선 + 추가 구현 범위” 구조로 보강해야 한다.

**Architecture**

새 범위는 데이터 모델, 업로드 API, background/scheduled job, 권한 응답 shape, FIFO/shared calculation, 외부 token 보안에 영향을 준다. 다음 increment에서 Architecture 보강이 필요하다.

**UX**

본사 IA에 전체 재고, 이카운트 업로드, 매핑 실패 검수, 직원/근무, 급여 정산, 고정비, 월 손익, 특수기간 리포트, 알림 설정이 추가되어야 한다. 지점장 IA는 본사 업로드 매입 읽기 전용과 민감 지표 숨김 상태를 반영해야 한다.

### Technical Impact

이 변경은 단순 문구 수정이 아니라 moderate~major scope expansion이다. 하지만 기존 구현 기준선과 정면 충돌하지는 않는다. 다음 원칙을 지키면 기존 결정과 함께 갈 수 있다.

- 코멘트 탭 MVP 제거 결정은 유지한다.
- Epic 4에 리포트 기능을 섞지 않는다.
- 원본 장부값, 본사 마감 후 잠금, 정정 기록, 감사 로그를 유지한다.
- 지점장 권한 제한은 서버에서 강제한다.
- AI 분석 기능은 이번 범위에 넣지 않는다.

## 3. Recommended Approach

권장 경로는 **Direct Adjustment + Backlog Expansion**이다.

롤백은 필요하지 않다. 기존 Epic 1~5는 완료된 MVP 기준선으로 유지한다. 다만 기존 PRD의 제외 범위와 새 구현 지시서가 충돌하므로, 새 CAP 범위를 추가 Epic과 후속 산출물 보강으로 정리해야 한다.

**예상 노력:** 높음  
**위험:** 중간~높음  
**일정 영향:** 기존 MVP 이후 추가 개발 범위로 약 3주 기준을 다시 관리해야 한다. 특히 CAP-5, CAP-6, CAP-7은 데이터 구조의 중심이라 먼저 확정해야 한다.

## 4. Detailed Change Proposals

### Increment 1: CAP-1~CAP-18을 추가 Epic 6~11로 반영

**상태:** 승인됨  
**대상:** `_bmad-output/planning-artifacts/epics.md`

**OLD**

```md
## Epic List

### Epic 1: 안전한 업무 공간과 기준정보 관리
...
### Epic 5: 회의와 기간/월간 리포트
...
```

**NEW**

```md
### Epic 6: 품목 정규화와 매입/FIFO 재고 기반
### Epic 7: 본사 통합 재고와 상품별 관리자 분석
### Epic 8: 지점장 권한, 마감, 손실, 입력 흐름 보완
### Epic 9: 직원 마스터와 인사/급여 정산 참고 자료
### Epic 10: 리포트 고도화와 월 손익계산서
### Epic 11: 외부 알림과 AI 제외 원칙
```

**Rationale**

CAP-1~CAP-18은 기존 MVP Epic에 섞으면 완료된 범위와 새 범위가 흐려진다. 새 Epic 6~11로 분리하면 구현 순서, 검수 기준, sprint-status 갱신을 명확하게 관리할 수 있다.

### Increment 2: PRD 보강

**상태:** 승인됨  
**대상:** `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md`

**OLD**

```md
## 6. 1차 제외 범위

다음 항목은 1차 범위에서 제외한다.
...
이 항목들은 후순위 또는 추후 검토 항목이며, 아직 확정 기능으로 보지 않는다.
```

**NEW**

```md
## 6. 1차 제외 범위

이 항목들은 1차 MVP 기준으로는 후순위 또는 추후 검토 항목이며, 1차 확정 기능으로 보지 않는다.

단, 2026-06-08 회의와 고객 제공 엑셀 확인 이후 일부 항목은 §8의 추가 구현 범위로 승격되었다.

## 8. 2026-06-10 추가 구현 범위

CAP-1~CAP-18...
```

**Rationale**

PRD의 기존 MVP 기준선은 보존하면서, 이번 변경으로 승격된 기능을 정식 PRD 범위에 넣는다. 이를 통해 `직원 마스터`, `이카운트`, `특수기간 리포트`, `알림`처럼 기존 §6에 있던 항목이 왜 후속 구현 대상이 되었는지 문서 안에서 설명된다.

### Increment 3: Architecture/UX/Design 보강

**상태:** 승인됨  
**대상:** `_bmad-output/planning-artifacts/architecture.md`, `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md`, `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/DESIGN.md`

**OLD**

```md
MVP has no required external business integrations.
...
본사 사용자 IA는 관제판, 장부 상세, 리포트, 기준정보 중심.
...
상태 배지는 장부 상태와 이상 신호 중심.
```

**NEW**

```md
Architecture:
- Additional Scope Models: Employee, ProductMapping, ImportBatch, PurchaseLot, FixedCost, PayrollAdjustment, NotificationRule/DeliveryLog
- Upload/Integration Route Handlers and scheduled alert delivery
- FIFO, product analysis, hoped-sale-price loss, monthly P&L shared calculations
- Store-manager sensitive metric filtering at server response boundaries

UX:
- HQ IA: 매입 업로드, 매핑 실패 검수, 전체 재고, 상품 분석, 직원/근무, 급여 정산 참고, 고정비, 월 손익, 특수기간 리포트, 알림 설정
- Store-manager IA: 본사 업로드 매입 읽기 전용 확인
- State patterns: 확인 필요, 매핑 실패, 업로드 반영, 읽기 전용, 발송 실패, 일괄 마감 위험

Design:
- Additional status badges and row states
- Read-only upload row styling
- Resizable table handle rule
```

**Rationale**

Epic 6~11은 데이터 모델, API 경계, 계산 책임, 권한 응답 shape, UX 메뉴, 상태 표시를 모두 바꾼다. 설계 문서가 이를 반영해야 구현 에이전트가 숨은 범위나 임시 구조를 만들지 않는다.

### Increment 4: sprint-status 갱신

**상태:** 승인됨  
**대상:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

**OLD**

```yaml
development_status:
  epic-5: in-progress
  ...
  epic-5-retrospective: done
```

**NEW**

```yaml
development_status:
  epic-6: backlog
  6-1-...: backlog
  ...
  epic-11: backlog
  11-3-...: backlog
  epic-11-retrospective: optional
```

**Rationale**

Epic 6~11이 `epics.md`와 PRD/Architecture/UX에 반영되었으므로, 구현 추적 파일에도 backlog 상태로 등록해야 다음 story 생성과 sprint-status 조회가 같은 기준을 사용한다.

## 5. Implementation Handoff

**변경 범위 분류:** Major

**이유:** CAP-5/6/7은 데이터 모델과 계산 기준을 바꾸고, CAP-11은 외부 연동과 스케줄러가 필요하다. CAP-13은 서버 권한 응답 shape에 영향을 준다.

**권장 라우팅:**

- Product/PM: PRD 추가 범위와 제외 범위 충돌 정리
- Architect: 데이터 모델, API, scheduler, authorization, shared calculation 보강
- UX Designer: IA, 상태 패턴, 대형 테이블, 권한별 화면 보강
- Developer: Epic 6부터 구현 시작. 정규화 → 이카운트 업로드 → FIFO 순서 우선

## 6. Checklist Status

- [x] 1.1 Triggering story/context identified: 2026-06-08 운영 기능 보완 요청
- [x] 1.2 Core problem defined: MVP 이후 추가 운영 범위 확장
- [x] 1.3 Supporting evidence gathered: 회의 문서, 고객 엑셀 분석, agent implementation context
- [x] 2.1 Current epic impact assessed: Epic 1~5 완료 기준선 유지
- [x] 2.2 Epic-level changes identified: Epic 6~11 추가
- [x] 2.3 Remaining epics reviewed: 새 CAP는 추가 backlog로 분리
- [x] 2.4 New epics needed: 필요
- [x] 2.5 Priority/order considered: 정규화 → 업로드 → FIFO → 재고/권한 → 직원/리포트/알림
- [x] 3.1 PRD conflicts: §8 추가 구현 범위와 §10 Open Questions로 보강 완료
- [x] 3.2 Architecture conflicts: 추가 데이터 모델, upload/integration 경계, scheduler, shared calculation, 권한 응답 제한 보강 완료
- [x] 3.3 UX conflicts: 본사/지점장 IA, 추가 상태 패턴, 읽기 전용 매입, 리사이징 테이블, Design 상태 배지 보강 완료
- [N/A] 3.4 Deployment/CI impact: 구현 전 산출물 조정 단계
- [x] 4.1 Direct Adjustment evaluated: viable
- [N/A] 4.2 Rollback evaluated: 구현 롤백 대상 없음
- [x] 4.3 MVP Review evaluated: MVP 기준선은 유지, 추가 범위로 분리
- [x] 4.4 Recommended path selected: Direct Adjustment + Backlog Expansion
- [x] 5.1 Issue summary created
- [x] 5.2 Epic impact documented
- [x] 5.3 Recommended path documented
- [x] 5.4 PRD MVP impact/action plan: MVP 기준선은 유지하고 추가 범위를 분리 반영
- [x] 5.5 Agent handoff plan: Epic 6부터 Developer/Architect/UX 순서로 핸드오프 권장
- [x] 6.1 Checklist completion reviewed: 적용 가능한 항목 검토 완료
- [x] 6.2 Sprint Change Proposal accuracy verified: Increment 1~4 반영 및 검증 완료
- [x] 6.3 User approval obtained: 2026-06-10 사용자 명시 승인 `a`, `yes`
- [x] 6.4 sprint-status.yaml updated: Epic 6~11과 Story 6.1~11.3 backlog 반영 완료
- [x] 6.5 Next steps and handoff plan confirmed: Major scope, PM/Architect/UX/Developer 핸드오프
