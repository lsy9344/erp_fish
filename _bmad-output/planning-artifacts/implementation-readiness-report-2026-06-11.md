---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
assessmentStatus: NEEDS WORK
includedFiles:
  prd:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md
  architecture:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\architecture.md
  epics:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\epics.md
  ux:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\DESIGN.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\EXPERIENCE.md
missingDocuments: []
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-11
**Project:** erp_fish

## Step 1: Document Discovery

### PRD Files Found

**Whole Documents:**
- prds/prd-erp_fish-2026-05-28-2/prd.md (123,181 bytes, modified 2026-06-11 11:48:25)

**Sharded Documents:**
- Folder: prds/prd-erp_fish-2026-05-28-2/
  - prd.md

### Architecture Files Found

**Whole Documents:**
- architecture.md (58,086 bytes, modified 2026-06-11 13:21:01)

**Sharded Documents:**
- None found

### Epics & Stories Files Found

**Whole Documents:**
- epics.md (118,576 bytes, modified 2026-06-11 15:25:12)

**Sharded Documents:**
- None found

### UX Design Files Found

**Whole Documents:**
- ux-designs/ux-erp_fish-2026-05-28/DESIGN.md (19,113 bytes, modified 2026-06-11 13:02:24)
- ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md (42,786 bytes, modified 2026-06-11 13:04:03)

**Sharded Documents:**
- Folder: ux-designs/ux-erp_fish-2026-05-28/
  - DESIGN.md
  - EXPERIENCE.md

### Issues Found

- No duplicate whole/sharded document formats were found.
- Discovery correction: PRD and UX files were discovered from epics.md input document metadata after the initial top-level pattern search missed nested planning-artifact folders.

## Step 2: PRD Analysis

### Functional Requirements

FR1: 역할 기반 로그인 - 사용자는 본사 사용자 또는 지점장 역할로 로그인할 수 있다.

FR2: 지점 접근 제한 - 지점장은 자기 지점의 일일 장부만 조회하고 입력할 수 있다.

FR3: 입력/수정 이력 기록 - 시스템은 주요 입력과 수정에 대해 입력자, 수정자, 수정 시각, 변경 전 값, 변경 후 값을 기록한다.

FR4: 지점+일자 장부 생성 - 본사 사용자와 지점장은 지점+일자 기준으로 일일 장부를 열 수 있다.

FR5: 단계형 입력 흐름 - 일일 장부 입력은 매출/결제, 비용, 매입, 재고, 손실/폐기/떨이, 근무인원/특이사항, 검토/제출 순서의 7단계 흐름으로 제공된다.

FR6: 매출/결제 입력 - 입력자는 총매출, 현금, 카드, 기타 결제수단, 매출차액 관련 값을 입력할 수 있다.

FR7: 비용 입력 - 입력자는 비용 항목, 금액, 메모를 입력할 수 있다.

FR8: 매입 입력 - 입력자는 품목, 규격, 단가, 수량, 매입금액을 입력할 수 있다.

FR9: 품목 단위 재고 입력 - 입력자는 품목, 규격, 단가, 전일재고, 매입, 판매/차감, 당일재고, 재고금액, 수량을 다룰 수 있다.

FR10: 재고 조정 기록 - 본사 사용자와 지점장은 시스템 계산 재고와 실제 재고가 다를 때 재고 조정을 기록할 수 있다.

FR11: 손실/폐기/떨이 입력 - 입력자는 손실, 폐기, 떨이 항목을 품목, 수량, 금액, 처리 유형, 사유/특이사항과 함께 입력할 수 있다.

FR12: 근무인원/특이사항 입력 - 입력자는 근무인원과 근무 관련 특이사항을 기록할 수 있다.

FR13: 핵심 지표 계산 - 시스템은 매출, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 평균재고, 평균매출, 매출대비 재고비율, 최고매출품목, 최고매출품목 매출액, 매출차액, 재고/손실 관련 지표를 계산한다.

FR14: 입력 검증 - 시스템은 필수 입력값 누락, 결제수단 합계와 총매출 차이, 상품별 판매금액 합계와 총매출 차이, 재고/손실 이상 후보를 표시한다.

FR15: 전체 지점 관제판 - 본사 사용자는 오늘/어제 기준 전체 지점의 장부 상태를 한 화면에서 볼 수 있다.

FR16: 이상 신호 표시 - 시스템은 매출/이익률 급락, 매출차액, 재고/손실 이상을 이상 신호로 표시한다.

FR17: 이상 신호 기준값 설정 - 본사 사용자는 이상 신호 기준값을 설정할 수 있다.

FR18: 본사 직접 입력/수정 - 본사 관리자 또는 직접 수정 mutation 권한을 가진 본사 프로파일은 모든 지점의 본사 마감 전 일일 장부를 직접 입력하거나 수정할 수 있다.

FR19: 본사 마감과 원본 잠금 - 본사 관리자, 마감 담당자, 또는 마감 mutation 권한을 가진 본사 프로파일은 일일 장부를 본사 마감 처리할 수 있다.

FR20: 마감 후 정정 기록 - 본사 마감 후 오류가 발견되면 본사 관리자 또는 정정 mutation 권한을 가진 본사 프로파일은 원본을 수정하지 않고 정정 기록을 추가할 수 있다.

FR21: 정정 반영값 사용 - 관제판과 리포트의 기본 숫자는 정정 반영값을 사용한다.

FR22: 지점 마스터 관리 - 본사 사용자는 지점명과 활성/비활성 상태를 관리할 수 있다.

FR23: 사용자/권한 관리 - 본사 사용자는 본사 사용자와 지점장 계정, 지점 접근 권한을 관리할 수 있다.

FR24: 품목 마스터 관리 - 본사 사용자는 품목명, 구분, 규격, 기본 단가를 관리할 수 있다.

FR25: 매입 기준 관리 - 본사 사용자는 매입 관련 기준 또는 기본 정보를 관리할 수 있다.

FR26: 코드 관리 - 본사 사용자는 결제수단, 비용 항목, 손실 유형 같은 장부 입력 코드를 관리할 수 있다.

FR27: 일별 아침 회의 리포트 - 본사 사용자는 전체 지점의 일별 회의용 요약을 볼 수 있다.

FR28: 지점별 기간 비교 - 본사 사용자는 선택 기간의 지점별 실적을 비교할 수 있다.

FR29: 월간 지점 요약 - 본사 사용자는 지점별 월간 실적, 마감 현황, 주요 이상 항목, 손실/재고 흐름 요약을 볼 수 있다.

Total FRs: 29

### Non-Functional Requirements

NFR1: 권한 보안 - 본사 사용자와 지점장의 접근 범위는 서버 기준으로 강제되어야 한다.

NFR2: 감사 추적 - 마감, 정정, 주요 입력/수정, 기준값 변경은 누가 언제 무엇을 바꿨는지 추적 가능해야 한다.

NFR3: 데이터 보존 - 본사 마감 후 원본 장부는 보존되어야 하며, 정정 기록으로 덮어쓰면 안 된다.

NFR4: 반응형 웹 - 지점장 입력 화면은 PC, 태블릿, 모바일 웹에서 사용할 수 있어야 한다.

NFR5: 운영 속도 - 본사 관제판 기본 조회는 10개 내외 지점 기준 3초 안에 지점 목록과 이상 신호를 표시하는 것을 목표로 한다.

NFR6: 모바일 사용성 - 단계형 장부 입력의 핵심 흐름은 최소 390px 폭의 모바일 화면에서 사용할 수 있어야 한다.

NFR7: 엑셀 의존 감소 - 1차 제품은 기존 엑셀의 목적을 대체하되, 엑셀 수식이나 서식 구조를 그대로 복제하는 것을 목표로 하지 않는다.

NFR8: 운영 인수인계 - 지점, 사용자, 권한, 업로드, 마감, 알림 같은 운영자가 직접 관리할 기능은 사용 매뉴얼 또는 운영 가이드가 제공되어야 한다.

NFR9: 운영 대응 - 서버 세팅, 장애 대응, 시인성 개선 요청 같은 운영 업무는 제품 기능과 별도 계약 범위로 관리하되, 시스템 설계 시 운영 담당자가 점검할 수 있는 로그와 설정 화면을 남겨야 한다.

NFR10: 지원 환경 - 본사 화면은 최신 Chrome/Edge 데스크톱 브라우저를 기준으로 검증하고, 지점장 입력 화면은 모바일 Chrome/Safari 최신 버전에서 핵심 7단계 입력 흐름을 검증한다.

NFR11: 백업/복구 - 일일 장부, 마감, 정정, 감사 로그, 업로드 이력은 운영 백업 대상이며, 제품은 복구 대상 데이터를 식별 가능하게 저장해야 한다. 영업시간 데이터 변경의 RPO는 1시간 이내, 영업시간 장애의 RTO는 4시간 이내를 목표로 한다.

NFR12: 감사/업로드 보존 - 감사 로그, 업로드 원본 파일, 파싱 결과, preview/commit/void 이력은 최소 24개월 보존해야 한다.

NFR13: 복구 훈련 - 오픈 전 최소 1회 장부, 마감 이벤트, 정정 이벤트, 업로드 원본, 업로드 이력, 감사 로그 검색을 포함한 복구 리허설을 수행해야 한다.

NFR14: 동시 사용 - 10개 내외 지점의 지점장 동시 입력과 본사 사용자 복수 조회를 기본 운영 규모로 보고, 동시 저장 충돌은 edit token과 충돌 해결 규칙을 따른다.

NFR15: 모니터링 - 업로드 실패, 알림 실패, 마감 실패, 권한 오류, 서버 계산 오류는 운영자가 확인할 수 있는 로그 또는 상태 화면에 남아야 한다.

Total NFRs: 15

### Additional Requirements

- PRD 상태는 draft이며, 구현 게이트 G1~G6가 닫히기 전까지 그대로 최종 에픽/스토리 생성 가능한 PRD로 보면 안 된다.
- G1 릴리스 경계: MVP, 승인 추가 구현, 계약/운영, 후순위 범위 분류가 승인되어야 한다.
- G2 계산 정책: §4.3 계산 공통 규칙과 관련 Open Questions가 확정되어야 한다.
- G3 재고 이월/FIFO 정책: FR9, CAP6, CAP7, OQ7, OQ15, OQ17 정책이 구현 전 확정되어야 한다.
- G4 권한/감사 계약: 권한 프로파일 x action 매트릭스와 감사 이벤트 계약서가 필요하다.
- G5 회의/리포트 데이터 계약: FR15, FR27~FR29, CAP2~CAP4, CAP10의 컬럼, 필터, 집계, 정정/미마감 처리 기준이 필요하다.
- G6 스토리 추출 통제: `mvp-story-extraction-checklist.md` 승인본에 따라 implementation story, discovery story, blocked 상태를 구분해야 한다.
- 승인 추가 구현 범위는 CAP1~CAP19로 정리되어 있으며, 일부 CAP는 OQ 또는 정책 산출물 승인 전 구현 스토리로 승격하면 안 된다.
- 후순위/명시 제외 범위에는 POS/카드 매출 자동 연동, AI 이미지 식별, 과거 엑셀 데이터 일괄 이관, 실제 급여 지급 확정, AI 화면/API/프롬프트/분석 결과 저장이 포함된다.

### PRD Completeness Assessment

PRD는 FR 29개, 전역 비기능 요구사항, CAP 19개, 구현 게이트, Open Questions를 포함해 범위는 넓게 정리되어 있다. 다만 문서 상태가 draft이고, G1~G6 및 여러 OQ가 구현 전 조건으로 남아 있어 모든 요구사항을 바로 구현 스토리로 전환할 수 있는 상태는 아니다.

## Step 3: Epic Coverage Validation

### Epic FR Coverage Extracted

FR1: Epic 1 - 역할 기반 로그인

FR2: Epic 1 - 지점 접근 제한

FR3: Epic 1 - 입력/수정/권한 변경 감사 이력

FR4: Epic 2 - 지점+일자 장부 생성

FR5: Epic 2 - 7단계 장부 입력 흐름

FR6: Epic 2 - 매출/결제 입력, OQ-1 판정은 discovery

FR7: Epic 2 - 비용 입력

FR8: Epic 2 - MVP 수동 매입 입력

FR9: Epic 2 - 재고 입력과 이월 상태, OQ 의존 계산은 discovery

FR10: Epic 2 - 재고 조정 기록

FR11: Epic 2 - 손실/폐기/떨이 입력

FR12: Epic 2 - 근무인원/특이사항 입력

FR13: Epic 3 - 승인된 기본 계산, OQ 의존 계산은 discovery

FR14: Epic 3 - 입력 검증과 계산 상태 표시

FR15: Epic 4 - 전체 지점 관제판

FR16: Discovery/Policy Track - 이상 신호 판정 기준 OQ-1

FR17: Epic 5 + Discovery/Policy Track - 기준값 설정 구조와 OQ-1 정책

FR18: Epic 4 - 본사 직접 입력/수정

FR19: Epic 4 - 본사 마감과 원본 잠금

FR20: Epic 4 - 마감 후 정정 기록

FR21: Epic 4 - 정정 반영값 사용

FR22: Epic 5 - 지점 마스터 관리

FR23: Epic 1 - 사용자/권한 관리

FR24: Epic 5 + Discovery/Policy Track - 품목 마스터와 OQ-3 정규화

FR25: Epic 5 - 매입 기준 관리

FR26: Epic 5 - 코드 관리

FR27: Epic 6 - 일별 아침 회의 리포트

FR28: Epic 6 - 지점별 기간 비교와 export

FR29: Epic 6 - 월간 지점 요약과 export

Total FRs in epics coverage map: 29

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --------- | --------------- | ------------- | ------ |
| FR1 | 역할 기반 로그인 | Epic 1 | Covered |
| FR2 | 지점 접근 제한 | Epic 1 | Covered |
| FR3 | 입력/수정 이력 기록 | Epic 1 | Covered |
| FR4 | 지점+일자 장부 생성 | Epic 2 | Covered |
| FR5 | 단계형 입력 흐름 | Epic 2 | Covered |
| FR6 | 매출/결제 입력 | Epic 2 + OQ-1 discovery | Covered with gated slice |
| FR7 | 비용 입력 | Epic 2 | Covered |
| FR8 | 매입 입력 | Epic 2 | Covered |
| FR9 | 품목 단위 재고 입력 | Epic 2 + OQ-dependent discovery | Covered with gated slice |
| FR10 | 재고 조정 기록 | Epic 2 | Covered |
| FR11 | 손실/폐기/떨이 입력 | Epic 2 | Covered |
| FR12 | 근무인원/특이사항 입력 | Epic 2 | Covered |
| FR13 | 핵심 지표 계산 | Epic 3 + OQ-dependent discovery | Covered with gated slice |
| FR14 | 입력 검증 | Epic 3 | Covered |
| FR15 | 전체 지점 관제판 | Epic 4 | Covered |
| FR16 | 이상 신호 표시 | Discovery/Policy Track only | Not implementation-ready |
| FR17 | 이상 신호 기준값 설정 | Epic 5 + Discovery/Policy Track | Covered with gated slice |
| FR18 | 본사 직접 입력/수정 | Epic 4 | Covered |
| FR19 | 본사 마감과 원본 잠금 | Epic 4 | Covered |
| FR20 | 마감 후 정정 기록 | Epic 4 | Covered |
| FR21 | 정정 반영값 사용 | Epic 4 | Covered |
| FR22 | 지점 마스터 관리 | Epic 5 | Covered |
| FR23 | 사용자/권한 관리 | Epic 1 | Covered |
| FR24 | 품목 마스터 관리 | Epic 5 + OQ-3 discovery | Covered with gated slice |
| FR25 | 매입 기준 관리 | Epic 5 | Covered |
| FR26 | 코드 관리 | Epic 5 | Covered |
| FR27 | 일별 아침 회의 리포트 | Epic 6 | Covered |
| FR28 | 지점별 기간 비교 | Epic 6 | Covered |
| FR29 | 월간 지점 요약 | Epic 6 | Covered |

### Missing Requirements

No PRD FR identifiers are missing from the epics coverage map.

Coverage caveat: FR16 is mapped only to Discovery/Policy Track, not to a numbered implementation epic. FR6, FR9, FR13, FR17, and FR24 also contain gated or discovery slices. These are not identifier-level coverage gaps, but they are implementation-readiness risks.

### Coverage Statistics

- Total PRD FRs: 29
- FRs present in epics coverage map: 29
- Identifier-level coverage percentage: 100%
- FRs with gated or discovery-only slices: 6
- FRs directly covered by numbered implementation epics without a stated discovery split: 23

## Step 4: UX Alignment Assessment

### UX Document Status

Found.

- UX design tokens/style document: ux-designs/ux-erp_fish-2026-05-28/DESIGN.md
- UX experience spine: ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md

Both UX documents are marked draft and updated on 2026-06-11. They reference the latest PRD, MVP story extraction checklist, and root mockup inputs.

### UX to PRD Alignment

- Aligned: UX keeps the same main actors as PRD: 본사 사용자 and 지점장, while also reflecting the PRD's more detailed permission profiles.
- Aligned: UX covers PRD user journeys UJ-1 through UJ-4 through dashboard scan, mobile ledger entry, HQ correction before close, and post-close correction flow.
- Aligned: UX uses the PRD's 7-step ledger input flow: 매출/결제, 비용, 매입, 재고, 손실/폐기/떨이, 근무인원/특이사항, 검토/제출.
- Aligned: UX treats OQ-bound calculations, FIFO, alerts, sensitive metric exposure, and gated extension surfaces as not-final behavior.
- Aligned: UX preserves PRD security intent: store-manager sensitive fields must be blocked at server response/export/cache/notification surfaces, not only hidden in UI.
- Aligned: UX supports PRD state language for 미입력, 입력중, 검토대기, 본사마감, 휴무, 기준 확인 필요, 데이터 부족, 계산 불가, 검토 필요, 이월 공백, and 정정 반영 states.

### UX to Architecture Alignment

- Aligned: Architecture selects Create T3 App, Next.js, Tailwind, and shadcn/ui, matching UX's shadcn/ui + Tailwind foundation.
- Aligned: Architecture supports HQ desktop dashboard, store-manager mobile step-by-step flow, ledger detail pages, audit history, correction records, and shared server calculations.
- Aligned: Architecture includes server-side authorization, response shaping, append-only audit/correction records, optimistic concurrency/version checks, and shared calculation modules needed by UX patterns.
- Aligned: Architecture explicitly supports 390px mobile input, dashboard performance target, shadcn primitives, feature-owned composition components, and resizable tables where justified.
- Aligned: Architecture maps FR1~FR29 to feature folders and server helpers, giving UX surfaces a clear implementation home.

### Alignment Issues

- No critical UX/PRD/Architecture contradiction was found.
- Important handoff gap: UX names several concrete components and interaction contracts, including `ClosePreflight`, `CorrectionPanel`, `SaveConflictDialog`, `SignalChip`, sticky mobile inventory headers, and keyboard-operable resizing handles. Architecture supports these concerns at a pattern level, but not every UX-named component is mapped one-by-one. Implementation stories should preserve these UX contracts explicitly.
- Important handoff gap: UX requires WCAG 2.2 AA and notes that primary/warning color overrides need contrast verification. Architecture mentions accessibility patterns, but color contrast verification should be added to frontend acceptance criteria.

### Warnings

- UX documentation is present, but still draft. It should be treated as aligned guidance, not a fully closed final design source while PRD gates and OQs remain open.
- Gated UX surfaces must not appear as finished navigation/features before their OQ and policy artifacts are approved.
- Store-manager sensitive metric blocking must be verified at server/API/export/cache/notification levels, not only through visual hiding.

## Step 5: Epic Quality Review

### Review Scope

- Epics reviewed: 8
- Stories reviewed: 49
- Acceptance criteria structure: All stories contain `As a`, `I want`, `So that`, and BDD-style `Given/When/Then` acceptance criteria.
- Starter template check: Passed. Architecture specifies Create T3 App, and Epic 1 Story 1 covers initial project setup from that starter, shadcn/ui initialization, environment configuration, and deployment smoke check.

### Critical Violations

No critical violation was found in implementation Epics 1~6.

Conditional critical risk: Epic 7 and Epic 8 are not product implementation epics. They are explicitly labeled Discovery/Policy and Extension Discovery/Backlog tracks. They are acceptable only if they stay out of Phase 4 implementation execution until their outputs become approved implementation stories.

### Major Issues

1. Epic 7 and Epic 8 do not deliver direct product user value by themselves.

Impact: They produce decisions, policies, and backlog readiness artifacts rather than usable product behavior. This violates normal implementation-epic standards if they are treated as build epics.

Recommendation: Keep Epic 7 and Epic 8 as discovery/policy tracks. Do not assign them to implementation agents as product delivery epics. Convert only approved outputs into separate implementation stories after OQ closure.

2. Epic 8 has oversized discovery stories that bundle multiple CAP decisions.

Examples:
- Story 8.3 combines FIFO 원가, 통합 재고, and 상품 분석 policy.
- Story 8.4 combines 민감 지표 고도화 and 희망 판매가 손실액 policy.
- Story 8.5 combines 마감 운영, 작성자 표시명, 재고 용어, and 그리드 리사이징 completion criteria.
- Story 8.6 combines 특수기간, 엑셀 매핑, and 월 손익 report contracts.

Impact: These stories can produce large, mixed decision outputs with different owners, approval paths, and implementation follow-ups. That makes closure and traceability harder.

Recommendation: Split broad Epic 8 stories by CAP or by tightly coupled decision area before execution, unless one workshop explicitly owns all included decisions and produces one approved artifact.

3. Several implementation stories include OQ-gated behavior and must preserve the gate boundaries carefully.

Examples:
- FR6, FR9, FR13, FR17, and FR24 have implementation-ready slices plus discovery/policy slices.
- FR16 is mapped to Discovery/Policy Track only.

Impact: A developer could accidentally implement provisional calculations or anomaly thresholds as final behavior.

Recommendation: Add story-level acceptance criteria that explicitly fail if OQ-bound behavior is implemented as final logic. Use `기준 확인 필요`, `데이터 부족`, or `계산 불가` states until closure artifacts are approved.

### Minor Concerns

1. Epic 1 contains a necessary technical setup story.

Assessment: This is acceptable because the Architecture requires starter setup as the first implementation story. Still, Story 1.1 is infrastructure value, not end-user product value.

Recommendation: Keep Story 1.1 first and narrowly scoped. Do not let it create all future domain models upfront beyond what the first foundation slice needs.

2. Some stories mention future flows in acceptance criteria.

Examples: early ledger stories mention post-close correction flow or later revalidation behavior.

Assessment: These are mostly guardrails, not hard forward dependencies. They should remain phrased as constraints, not as requirements to implement future UI early.

Recommendation: During story execution, reject any interpretation that requires future epic functionality to make the current story pass.

### Best Practices Compliance Checklist

| Area | Result | Notes |
| ---- | ------ | ----- |
| Epic user value | Partial | Epics 1~6 are user/product value oriented. Epics 7~8 are discovery/policy tracks, not implementation epics. |
| Epic independence | Pass with gates | Epics progress in reasonable order. No Epic N requires Epic N+1 to function. |
| Story sizing | Partial | Most implementation stories are workable. Several Epic 8 discovery stories are too broad. |
| Forward dependencies | Pass with caution | No hard forward dependency found, but some ACs mention future flows as guardrails. |
| Database/entity timing | Pass with caution | Story 1.1 sets foundation; later stories should create domain tables when first needed, not all upfront. |
| Acceptance criteria | Pass | All 49 stories use BDD-style acceptance criteria. |
| Traceability to FRs | Pass | FR coverage is explicit; gated slices are documented. |

### Overall Epic Quality Assessment

Implementation Epics 1~6 are structurally strong enough for controlled implementation, provided OQ-gated slices remain blocked or shown as explicit non-final states. Epic 7 and Epic 8 are useful planning tracks, but they should not be treated as implementation-ready product epics. Epic 8 needs decomposition before execution to avoid mixed-owner policy stories becoming too large to close cleanly.

## Summary and Recommendations

### Overall Readiness Status

NEEDS WORK.

Controlled initial implementation can start only for clearly approved foundation and MVP slices, especially MVP-S01 through MVP-S03 and implementation Epics 1~6 where OQ-gated behavior is explicitly blocked or represented as non-final states. The full artifact set is not ready for broad Phase 4 implementation because PRD/UX remain draft, gates and OQs are still open, and discovery/policy tracks could be mistaken for implementation backlog.

### Critical Issues Requiring Immediate Action

1. PRD is still draft and explicitly says it should not be treated as a final story-generation source until gates G1~G6 are closed.
2. FR16 is mapped only to Discovery/Policy Track, not a numbered implementation epic.
3. FR6, FR9, FR13, FR17, and FR24 contain gated/discovery slices that must not be implemented as final behavior before their OQs close.
4. Epic 7 and Epic 8 are discovery/policy tracks, not implementation-ready product epics.
5. Epic 8 contains several oversized mixed-CAP discovery stories that need splitting or very clear single-workshop ownership.
6. UX documents are draft and include gated surfaces that must not appear as finished product navigation before approval.
7. UX component contracts such as ClosePreflight, SaveConflictDialog, SignalChip, sticky mobile inventory headers, and resizing handles need explicit story-level acceptance criteria.
8. WCAG 2.2 AA and color contrast verification must be added to frontend acceptance criteria, especially for primary/warning token overrides.
9. Store-manager sensitive metric blocking must be verified at server/API/export/cache/notification layers, not only in UI.
10. Document discovery should include nested planning-artifact folders or input document metadata, because the initial top-level search missed PRD and UX files.

### Recommended Next Steps

1. Confirm the approved implementation subset: MVP-S01, MVP-S02, MVP-S03, and only the non-gated parts of Epics 1~6.
2. Mark Epic 7 and Epic 8 as discovery/policy-only in sprint planning so implementation agents do not build those surfaces prematurely.
3. Split broad Epic 8 stories before execution: at minimum separate Story 8.3, 8.4, 8.5, and 8.6 by CAP or owner.
4. Add OQ guard acceptance criteria to affected stories: tests should fail if provisional calculations, anomaly thresholds, FIFO values, or sensitive field exposure are treated as final.
5. Add UX implementation acceptance criteria for WCAG 2.2 AA, contrast verification, sticky mobile inventory headers, keyboard resizing handles, and modal/focus behavior.
6. Add server-level security tests for store-manager sensitive field blocking across UI data, API responses, export files, cache/shared responses, and notification templates.
7. Update document discovery conventions to scan nested PRD/UX folders and frontmatter `inputDocuments` references.

### Final Note

This assessment identified 10 issues across 5 categories: document discovery, PRD/gate readiness, FR coverage readiness, UX/architecture alignment, and epic/story quality. Address the critical gating and decomposition issues before broad implementation. Proceeding is reasonable only as controlled implementation of approved foundation and MVP slices, with discovery/policy work kept separate from product build work.

**Assessment Date:** 2026-06-11
**Assessor:** Codex using bmad-check-implementation-readiness
