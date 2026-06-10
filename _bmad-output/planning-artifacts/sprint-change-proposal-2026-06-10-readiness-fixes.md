# Sprint Change Proposal: 2026-06-10 구현 준비성 보정

**프로젝트:** erp_fish  
**작성일:** 2026-06-10  
**진행 방식:** Incremental  
**트리거 문서:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-10.md`  
**상태:** 승인됨 / 계획 문서 반영 완료  
**승인된 증분 변경안:** Increment 1 - CAP-13 민감 지표 제한을 즉시 보정 범위로 당김; Increment 2 - Story 11.3을 공통 가드레일로 이동; Increment 3 - Story 2.2/2.7 역할별 표시 기준 정정; Increment 4 - 공통 구현 체크리스트 추가  
**Increment 1 승인:** 2026-06-10, 사용자 명시 승인 `a`  
**Increment 2 승인:** 2026-06-10, 사용자 명시 승인 `a`  
**Increment 3 승인:** 2026-06-10, 사용자 명시 승인 `a`  
**Increment 4 승인:** 2026-06-10, 사용자 명시 승인 `a 승인합니다.`  
**최종 승인:** 2026-06-10, 사용자 명시 승인 `a 승인합니다.`

## 1. Issue Summary

`implementation-readiness-report-2026-06-10.md`는 현재 계획을 **NOT_READY_AS_IS**로 평가했다. FR1~FR29 커버리지는 100%이고 UX/Architecture 정렬도 대체로 양호하지만, 구현 계획 그대로 진행하면 지점장 권한에서 민감 회계 지표가 노출될 수 있는 충돌이 있다.

핵심 트리거는 **CR-1: 지점장 민감 회계 지표 제한이 Epic 8에 늦게 배치되어 앞선 스토리와 충돌함**이다.

구체 증거:

- `Story 2.2`는 지점장 비용/근무 단계에서 영업이익과 인당생산성을 표시하도록 요구했다.
- `Story 2.7`은 지점장 또는 본사 사용자 검토 화면에서 매출원가, 매출이익, 영업이익, 인당생산성을 표시하도록 요구했다.
- `Story 8.1`은 같은 지표를 지점장 서버 응답에서 제외해야 한다고 요구한다.
- `sprint-status.yaml` 기준 `Story 2.2`와 `Story 2.7`은 이미 `done` 상태다.
- 현재 코드와 E2E에도 지점장 화면에서 `영업이익`, `인당생산성`, `매출원가`, `매출이익` 노출을 기대하는 테스트가 남아 있다.

따라서 이번 변경은 문서 정리만이 아니라, 이미 완료된 Epic 2 흐름의 서버 응답 계약과 테스트를 보정하는 작업이다.

## 2. Impact Analysis

### Epic Impact

**Epic 2: 지점 일일 장부 입력과 검토 제출**

Epic 2는 이미 완료된 스토리가 많고, 문제 지점인 `Story 2.2`와 `Story 2.7`도 `done`이다. 기존 완료 상태를 되돌리기보다, 새 `Story 2.9`를 추가해 지점장 응답 shaping과 화면 노출을 보정한다.

**Epic 8: 지점장 권한, 마감, 손실, 입력 흐름 보완**

`Story 8.1`의 내용은 너무 늦다. 지점장 민감 지표 제한은 Epic 8의 신규 구현 기능이 아니라 Epic 2 보안 회귀를 막는 기준이다. `Story 8.1`은 추가 범위 화면까지 같은 제한을 검증/강화하는 스토리로 바꾼다.

**Epic 11: 외부 알림과 AI 제외 원칙**

`Story 11.3`은 사용자 스토리가 아니라 구현 가드레일이다. Epic 11에는 알림 설정과 알림 발송/실패 추적만 남기고, AI 기능 제외와 구조화 데이터 보존 원칙은 공통 가드레일로 이동한다.

**Epic 10 and shared implementation quality**

리포트 범위가 넓고 상태 문구/접근성 기준이 흩어져 있으므로, 구현 체크리스트를 공통 기준으로 둔다. 별도 스토리 추가는 하지 않는다.

### Artifact Conflicts

**PRD**

PRD의 CAP-13 자체는 타당하다. 요구사항 추가나 MVP 축소는 필요 없다. 다만 PRD/계획 문서에서 CAP-13을 "나중에 하는 UX 보완"처럼 해석하지 않도록, 구현 순서와 공통 원칙에서 서버 응답 제한을 선행 조건으로 명시한다.

**Epics/Stories**

수정 필요:

- `Story 2.2` AC를 역할별 표시 기준으로 정정한다.
- `Story 2.7` AC를 역할별 표시 기준과 서버 응답 shaping 기준으로 정정한다.
- `Story 2.9`를 추가한다.
- `Story 8.1`을 검증/강화 스토리로 바꾼다.
- `Story 11.3`을 제거하고 공통 구현 가드레일로 이동한다.
- 공통 구현 체크리스트를 추가한다.

**Architecture**

보강 필요:

- 지점장 응답에는 민감 회계 필드를 포함하지 않는 server-side response shaping helper 또는 동등한 mapper를 둔다.
- UI 숨김은 보조 수단이며 보안 경계가 아니다.
- AI 기능 제외와 구조화 데이터 보존을 공통 구현 원칙/Definition of Done으로 둔다.
- `확인 필요`, `계산 불가`, `데이터 부족` 같은 상태는 공통 enum/helper로 관리한다.

**UX/Design**

보강 필요:

- 지점장 검토/근무 화면에서 민감 지표가 빠진 대체 레이아웃을 유지한다.
- 접근성 기준과 토큰 적용 위치를 구현 체크리스트에 고정한다.

**Sprint Status**

수정 필요:

- `2-9-지점장-장부-입력-검토-서버-응답에서-민감-회계-지표를-차단한다: backlog` 추가
- 기존 `8-1-...` 항목명 변경
- 기존 `11-3-...` 항목 제거

## 3. Recommended Approach

권장 경로는 **Direct Adjustment + 즉시 보안 보정 스토리**다.

Rollback은 권장하지 않는다. `Story 2.2`와 `Story 2.7`은 이미 완료되어 있고, 전체 기능을 되돌리는 것보다 민감 지표 응답 shaping을 별도 보정 스토리로 처리하는 편이 작고 명확하다.

PRD MVP Review도 필요하지 않다. MVP 목표는 유지된다. 문제는 제품 목표 변경이 아니라, 추가 CAP 보안 요구가 너무 늦게 배치된 순서 문제다.

예상 범위: Moderate  
위험도: Medium  
주요 위험: 기존 완료 테스트와 화면이 지점장 노출을 기대하므로, 보정 시 테스트 업데이트와 회귀 검증이 필요하다.

## 4. Detailed Change Proposals

### Increment 1: CAP-13을 즉시 보정 범위로 당기기

**대상:** `epics.md`, `sprint-status.yaml`, 후속 story 생성 기준

**OLD**

```md
Story 8.1: 지점장 화면과 서버 응답에서 민감 회계 지표를 숨긴다
```

**NEW**

```md
Story 2.9: 지점장 장부 입력/검토 서버 응답에서 민감 회계 지표를 차단한다

As a 본사 사용자,
I want 지점장 권한의 장부 입력/검토 응답에서 민감 회계 지표가 빠지길 원한다,
So that 이미 구현된 Epic 2 장부 흐름이 CAP-13 보안 요구와 충돌하지 않는다.

Acceptance Criteria:
- 지점장 권한으로 비용/근무 단계와 검토/제출 단계를 조회할 때 서버 응답에는 매출원가, 매출이익, 영업이익, 인당생산성이 포함되면 안 된다.
- 지점장 화면에는 현장 입력값, 비용 합계, 매출 마진율 기준이 확정된 경우의 허용 지표, 재고 금액, 확인 필요 상태만 표시한다.
- 본사 권한으로 같은 장부를 조회할 때는 본사 운영에 필요한 회계 지표를 볼 수 있다.
- 기존 Story 2.2/2.7 E2E는 지점장 노출 기대를 제거하고, 민감 지표가 보이지 않는 회귀 테스트로 바꾼다.
- 공통 응답 shaping helper 또는 동등한 서버-side mapper를 두고 UI 숨김만으로 처리하지 않는다.
```

`Story 8.1`은 다음처럼 바꾼다.

```md
Story 8.1: 지점장 민감 회계 지표 제한을 추가 범위 화면까지 검증/강화한다
```

### Increment 2: Story 11.3을 공통 가드레일로 이동

**대상:** `epics.md`, `architecture.md`, `sprint-status.yaml`

**OLD**

```md
### Story 11.3: 새 기능은 분석 가능한 구조를 남기되 AI 기능은 구현하지 않는다

As a 구현 에이전트,
I want 새 운영 데이터를 구조화해서 저장하되 AI 기능을 만들지 않길 원한다,
So that 향후 확장 가능성은 남기면서 이번 범위가 커지지 않게 할 수 있다.
```

**NEW**

```md
## 공통 구현 가드레일: 구조화 데이터 보존과 AI 기능 제외

CAP-1~CAP-18 구현 시 날짜, 지점, 직원, 품목, 금액, 상태, 이력 데이터는 조회 가능한 구조로 저장한다. 중요한 운영 데이터를 텍스트 메모에만 묻어두지 않는다.

이번 범위에는 AI 챗봇, 자연어 질의, AI API 호출, 프롬프트 저장, AI 분석 결과 저장을 포함하지 않는다. 구현 중 AI 기능처럼 보이는 요구가 생기면 별도 고도화 범위로 분리한다.
```

`sprint-status.yaml`에서는 다음 항목을 제거한다.

```yaml
11-3-새-기능은-분석-가능한-구조를-남기되-ai-기능은-구현하지-않는다: backlog
```

### Increment 3: Story 2.2/2.7 역할별 표시 기준 정정

**대상:** `epics.md`, 후속 implementation artifact 생성 기준

**Story 2.2 OLD**

```md
**Given** 총매출과 비용 합계가 저장되어 있을 때
**When** 비용 또는 근무 단계가 표시되면
**Then** 현재 입력값 기준 비용 합계와 기본 영업이익이 표시되어야 한다.

**Given** 총매출과 근무인원이 저장되어 있을 때
**When** 근무 단계가 표시되면
**Then** 인당생산성이 계산되어 표시되어야 한다
```

**Story 2.2 NEW**

```md
**Given** 지점장 권한으로 비용 또는 근무 단계가 표시될 때
**When** 총매출, 비용 합계, 근무인원이 저장되어 있으면
**Then** 비용 합계와 현장 입력 검토에 필요한 값만 표시되어야 한다
**And** 영업이익과 인당생산성은 서버 응답과 화면에 포함되면 안 된다.

**Given** 본사 권한으로 같은 장부의 비용 또는 근무 정보를 확인할 때
**When** 본사 전용 장부 상세 또는 검토 화면이 표시되면
**Then** 본사 운영에 필요한 영업이익과 인당생산성을 표시할 수 있다.
```

**Story 2.7 OLD**

```md
**Then** 총매출, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 재고금액, 매출차액이 표시되어야 한다
```

**Story 2.7 NEW**

```md
**Then** 본사 권한에는 총매출, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 재고금액, 매출차액이 표시될 수 있다
**And** 지점장 권한에는 매출원가, 매출이익, 영업이익, 인당생산성이 서버 응답과 화면에 포함되면 안 된다
**And** 지점장 권한에는 현장 입력값, 허용된 매출 마진율/재고 금액, 누락 항목, 이상 후보, 확인 필요 상태를 표시한다
**And** 계산은 서버 측 공유 계산 함수와 역할별 응답 shaping을 함께 사용해야 한다.
```

### Increment 4: 공통 구현 체크리스트 추가

**대상:** `epics.md` 또는 별도 planning artifact, 필요 시 `architecture.md`

```md
## 공통 구현 체크리스트

모든 UI/리포트/장부 화면 구현자는 다음을 확인한다.

- 접근성: WCAG 2.2 AA, 키보드 이동, `aria-label`, `scope="col"`, Dialog focus trap을 확인한다.
- 상태 문구: `확인 필요`, `계산 불가`, `데이터 부족`은 공통 상태 enum 또는 공통 표시 helper를 사용한다.
- 디자인 토큰: `DESIGN.md`의 primary/accent/warning 오버라이드, light/dark 색상 쌍, tabular-nums, radius 규칙을 `globals.css` 또는 지정된 테마 파일에서 적용한다.
- 범위 경계: MVP와 추가 구현 범위를 섞지 않는다. 직원/급여, 특수기간, 이카운트, FIFO, 알림은 Epic 6~11 순서를 따른다.
- Epic 10 리포트 구현 전에는 기간 비교, 연도/월별, 특수기간, 월 손익, 엑셀 항목 매칭의 우선순위를 다시 확인한다.
```

이 변경은 `sprint-status.yaml`에 별도 story를 추가하지 않는다.

## 5. Implementation Handoff

**Change scope:** Moderate

**Route to:** Product Owner / Developer agents

**Responsibilities:**

- Product Owner or planning agent: `epics.md`, `architecture.md`, `sprint-status.yaml`를 승인된 증분에 맞게 수정한다.
- Developer agent: 새 `Story 2.9`를 생성하고 구현한다.
- Developer agent: 지점장 비용/근무/검토 화면의 응답 shaping과 E2E를 보정한다.
- Reviewer: 지점장 권한으로 민감 지표가 서버 응답과 화면 모두에서 빠지는지 확인한다.

**Success criteria:**

- 지점장 권한으로 `매출원가`, `매출이익`, `영업이익`, `인당생산성`이 장부 입력/검토 응답에 포함되지 않는다.
- 본사 권한은 필요한 회계 지표를 계속 볼 수 있다.
- `Story 11.3`은 backlog story가 아니라 공통 구현 가드레일로 남는다.
- `sprint-status.yaml`이 새 `Story 2.9`, 변경된 `Story 8.1`, 제거된 `Story 11.3`와 일치한다.
- 공통 구현 체크리스트가 후속 story 생성과 리뷰에서 참조 가능하다.

## 6. Checklist Progress

- [x] 1.1 Triggering story identified: `Story 2.2`, `Story 2.7`, `Story 8.1`
- [x] 1.2 Core problem defined: CAP-13 late placement causes server response/security conflict
- [x] 1.3 Supporting evidence collected: readiness report, sprint status, code/test evidence
- [x] 2.1 Current epic impact assessed: Epic 2 needs immediate correction story
- [x] 2.2 Epic-level changes identified: add Story 2.9, reframe Story 8.1
- [x] 2.3 Remaining epics reviewed: Epic 11 story cleanup, Epic 10 caution
- [x] 2.4 Future epic invalidation checked: no epic invalidated
- [x] 2.5 Priority/order checked: CAP-13 must move before Epic 8
- [x] 3.1 PRD conflicts checked: no MVP reduction, CAP-13 interpretation clarified
- [x] 3.2 Architecture conflicts checked: response shaping and guardrails needed
- [x] 3.3 UI/UX conflicts checked: sensitive metric layout and accessibility checklist needed
- [x] 3.4 Other artifacts checked: sprint-status update required
- [x] 4.1 Direct Adjustment evaluated: viable
- [x] 4.2 Rollback evaluated: not viable
- [x] 4.3 PRD MVP Review evaluated: not needed
- [x] 4.4 Recommended path selected: Direct Adjustment + immediate security correction story
- [x] 5.1 Issue summary created
- [x] 5.2 Epic/artifact impact documented
- [x] 5.3 Recommended path documented
- [x] 5.4 MVP impact/action plan documented
- [x] 5.5 Agent handoff plan documented
- [x] 6.1 Final checklist review
- [x] 6.2 Proposal accuracy verification
- [x] 6.3 Explicit final approval
- [x] 6.4 sprint-status.yaml update
- [x] 6.5 Confirm handoff plan

## 7. Next Step

승인된 내용에 맞춰 `epics.md`, `architecture.md`, `sprint-status.yaml`를 수정했다. 다음 실행 단계는 새 `Story 2.9` 생성과 구현이다.
