# Sprint Change Proposal: 구현 준비성 Critical 3개 조정

**프로젝트:** erp_fish  
**작성일:** 2026-05-29  
**진행 방식:** Incremental  
**트리거 문서:** `implementation-readiness-report-2026-05-28.md`  
**상태:** 승인됨
**승인:** 2026-05-29, 사용자 명시 승인 `yes`

## 1. Issue Summary

구현 준비성 검토 결과, PRD 기능 요구사항은 에픽에 100% 매핑되어 있으나 일부 스토리가 뒤 에픽의 기능을 먼저 요구해 독립 구현이 어렵다.

이번 코스 수정의 핵심 문제는 기능 누락이 아니라 구현 순서와 완료 기준의 불안정성이다. 그대로 구현에 들어가면 임시 권한 모델, 임시 재고 이월 기준, 임시 리포트 계산 경로가 만들어질 수 있고, 뒤 스토리에서 다시 수정해야 할 위험이 있다.

사용자가 지정한 가장 중요한 조치는 다음 세 가지다.

1. Epic 4가 Epic 5 리포트 기능을 먼저 요구하는 구조를 제거한다.
2. Epic 2의 재고 이월이 Epic 4 본사 마감에 의존하지 않게 조정한다.
3. Story 1.2 전에 지점/사용자/배정 모델 골격을 먼저 정의한다.

## 2. Impact Analysis

### Epic Impact

**Epic 1: 안전한 업무 공간과 기준정보 관리**

Story 1.2가 지점장의 배정 지점 접근을 검증하려면 `User`, `Store`, `UserStoreAccess` 또는 동등한 관계가 먼저 필요하다. 따라서 Story 1.1 또는 별도 초기 기반 스토리에 최소 모델, seed, 권한 helper 골격을 추가해야 한다.

**Epic 2: 지점 일일 장부 입력과 검토 제출**

Story 2.4가 현재 “직전 본사 마감 장부”를 전일재고 이월 기준으로 요구하지만 본사 마감은 Epic 4에서 처음 구현된다. Epic 2는 직전 저장 장부 또는 검토 대기 장부 기반 이월과 수동 입력 fallback으로 독립 완료 가능해야 한다. 본사마감 기준 자동 이월은 Epic 4 이후 보강으로 넘긴다.

**Epic 4: 본사 검토, 마감, 정정 기록**

Story 4.5가 관제판과 리포트 모두의 정정 반영값 사용을 요구한다. 리포트는 Epic 5 범위이므로 Epic 4에서는 장부 상세과 관제판 반영까지만 남겨야 한다.

**Epic 5: 회의와 기간/월간 리포트**

Story 4.5에서 빠지는 리포트 정정 반영값 요구를 Epic 5의 리포트 스토리로 이동해야 한다.

### Artifact Conflicts

**PRD**

최종 MVP 범위는 유지한다. 다만 PRD의 최종 요구와 에픽별 구현 완료 기준을 분리해야 한다. FR-9의 최종 “직전 마감 장부 이월”과 FR-21의 “관제판과 리포트 정정 반영값 사용”은 유지하되, Epic 2와 Epic 4가 해당 최종 기능 전체를 선행 완료해야 하는 구조는 제거한다.

**Architecture**

초기 모델 골격과 권한 helper 책임을 Story 1.1 또는 초기 기반 스토리에 명시해야 한다. 재고 이월 계산은 Epic 2의 fallback 기준과 Epic 4 이후 본사마감 기준을 구분해야 한다.

**UX**

대규모 UX 재설계는 필요 없다. 재고 이월 fallback 안내 문구와 정정 반영값의 리포트 표시 책임 위치만 명확히 하면 된다.

### Technical Impact

이 변경은 코드 구현 전 계획 조정이다. 주요 산출물은 `epics.md`의 스토리 AC 수정이며, 필요하면 `architecture.md`에 초기 모델/권한 helper와 재고 이월 정책 메모를 보강한다.

## 3. Recommended Approach

권장 경로는 **Direct Adjustment**다.

롤백은 아직 구현 착수 전이므로 해당하지 않는다. MVP 축소도 필요하지 않다. 기존 범위는 유지하되, 에픽 독립성을 깨는 완료 조건만 이동하거나 분리한다.

**예상 노력:** 낮음~중간  
**위험:** 낮음  
**일정 영향:** 구현 착수 전 짧은 계획 조정. 이후 재작업 위험을 줄이는 효과가 크다.

## 4. Detailed Change Proposals

### Proposal 1: Story 1.2 전에 지점/사용자/배정 모델 골격 정의

**대상:** `epics.md` / Story 1.1 Acceptance Criteria 보강

**OLD**

```md
**Given** 로그인과 세션 처리가 서버에서 수행될 때
**When** 인증 상태를 확인하면
**Then** 클라이언트 UI 표시 여부가 아니라 서버 세션을 기준으로 보호 여부를 판단해야 한다.
```

**NEW**

```md
**Given** Story 1.2에서 지점장 배정 권한을 검증해야 할 때
**When** 초기 데이터 모델과 seed가 준비되면
**Then** `User`, `Store`, `UserStoreAccess` 또는 동등한 지점 배정 관계가 Prisma 모델에 정의되어야 한다
**And** 최소 1개 본사 사용자, 1개 지점장 사용자, 1개 활성 지점, 지점장-지점 배정 seed가 준비되어야 한다.

**Given** 서버 권한 검사가 필요한 업무 요청이 들어올 때
**When** 장부, 기준정보, 관제판, 리포트, 정정 기능의 서버 진입점이 구현되면
**Then** 공통 권한 helper는 사용자 역할과 지점 배정을 기준으로 허용/거부를 판단할 수 있어야 한다
**And** Story 1.2는 임시 권한 관계나 화면 숨김에 의존하지 않아야 한다.
```

**Rationale**

Story 1.2가 “배정된 지점”을 바로 요구하므로 최소 모델과 seed가 먼저 있어야 한다. PRD 범위는 늘리지 않고 구현 순서만 안정화한다.

### Proposal 2: Epic 2 재고 이월이 Epic 4 본사 마감에 의존하지 않게 조정

**대상:** `epics.md` / Story 2.4 Acceptance Criteria 수정

**OLD**

```md
**Then** 월 첫 장부는 월초 재고 스냅샷에서 전일재고를 가져와야 한다
**And** 이후 영업일은 직전 본사 마감 장부의 당일재고를 가져와야 한다.
```

**NEW**

```md
**Then** 월 첫 장부는 월초 재고 스냅샷에서 전일재고를 가져와야 한다
**And** Epic 2 범위에서는 이후 영업일의 전일재고를 직전 저장 장부 또는 검토 대기 장부의 당일재고에서 가져올 수 있어야 한다
**And** 직전 장부가 없거나 이월 기준을 확정할 수 없으면 수동 입력 fallback을 제공해야 한다.

**Given** Epic 4에서 본사 마감 기능이 구현된 뒤
**When** 이후 영업일의 전일재고 기준을 계산하면
**Then** 최종 이월 기준은 직전 본사 마감 장부의 당일재고로 보강되어야 한다
**And** 이 보강은 Epic 4 이후 별도 후속 스토리 또는 Story 4.2 이후 AC로 연결되어야 한다.
```

**Rationale**

PRD의 최종 정책은 유지하면서도 Epic 2가 Epic 4 없이 독립 완료될 수 있게 한다. 지금 구현 가능한 기준과 본사 마감 이후 최종 기준을 분리한다.

### Proposal 3: Epic 4가 Epic 5 리포트 기능을 먼저 요구하는 구조 제거

**대상:** `epics.md` / Story 4.5 제목 및 Acceptance Criteria 수정, Epic 5로 리포트 요구 이동

**OLD**

```md
### Story 4.5: 관제판과 리포트가 정정 반영값을 기본으로 사용한다

As a 본사 사용자,
I want 정정 기록을 추가한 뒤 관제판과 리포트 숫자가 정정 반영값으로 갱신되길 원한다,
So that 회의와 운영 판단에 최신 보정 숫자를 사용할 수 있다.
```

**NEW**

```md
### Story 4.5: 장부 상세와 관제판이 정정 반영값을 기본으로 사용한다

As a 본사 사용자,
I want 정정 기록을 추가한 뒤 장부 상세와 관제판 숫자가 정정 반영값으로 갱신되길 원한다,
So that 리포트 기능 없이도 마감 장부의 최신 보정 숫자를 운영 판단에 사용할 수 있다.
```

**OLD**

```md
**Given** 마감 장부에 정정 기록이 추가되어 있을 때
**When** 리포트용 계산 데이터가 조회되면
**Then** 기본 숫자는 정정 반영값을 사용해야 한다
**And** 원본값과 정정 반영값의 차이는 상세 확인 경로에서 추적 가능해야 한다.
```

**NEW**

```md
이 AC는 Story 5.1~5.5의 리포트 계산/표시 기준으로 이동한다.
```

**OLD**

```md
**Given** 정정 기록이 새로 저장될 때
**When** 저장이 완료되면
**Then** 관련 장부 상세, 관제판, 리포트 경로가 갱신되어야 한다
**And** 사용자가 낡은 계산값을 계속 보지 않도록 revalidation 또는 동등한 갱신 처리가 수행되어야 한다.
```

**NEW**

```md
**Given** 정정 기록이 새로 저장될 때
**When** 저장이 완료되면
**Then** 관련 장부 상세와 관제판 경로가 갱신되어야 한다
**And** 사용자가 낡은 계산값을 계속 보지 않도록 revalidation 또는 동등한 갱신 처리가 수행되어야 한다.
```

**추가 이동 제안**

```md
Story 5.1~5.5 공통 AC 또는 각 리포트 스토리에 추가:

**Given** 리포트 대상 장부에 정정 기록이 있을 때
**When** 리포트용 계산 데이터가 조회되면
**Then** 기본 숫자는 정정 반영값을 사용해야 한다
**And** 원본값과 정정 반영값의 차이는 리포트 상세 또는 장부 상세 확인 경로에서 추적 가능해야 한다.
```

**Rationale**

Epic 4는 정정 생성, 원본/정정 구분, 장부 상세/관제판 반영까지만 완료하면 독립적으로 끝날 수 있다. 리포트 적용은 Epic 5의 책임으로 옮긴다.

## 5. Implementation Handoff

**변경 범위 분류:** Moderate

이 변경은 코드 구현보다 backlog/story 정리가 중심이다. Product Owner와 Developer가 함께 `epics.md`를 수정하고, 필요한 경우 Architect가 `architecture.md`에 초기 모델/권한 helper와 재고 이월 정책을 짧게 보강하면 된다.

**Handoff recipients**

- Product Owner: 승인된 변경 제안을 `epics.md`에 반영하고 스토리 순서/완료 기준을 정리한다.
- Developer: 변경된 스토리가 독립 구현 가능한지 확인하고, 구현 시작 전 필요한 모델/helper/test handoff를 점검한다.
- Architect: `User`, `Store`, `UserStoreAccess`, 재고 이월 fallback, 정정 반영값 계산 경계가 아키텍처와 맞는지 확인한다.

**Success Criteria**

1. Story 1.2가 임시 지점 배정 모델 없이 구현 가능하다.
2. Story 2.4가 Epic 4 본사 마감 없이 Epic 2 안에서 완료 가능하다.
3. Story 4.5가 Epic 5 리포트 화면 없이 완료 가능하다.
4. Epic 5가 리포트 정정 반영값 요구를 명시적으로 받는다.
5. PRD의 최종 MVP 범위는 줄어들지 않는다.

## 6. Approval and Handoff Log

**승인 결과:** 승인됨  
**승인 일시:** 2026-05-29  
**변경 범위:** Moderate  
**Route to:** Product Owner / Developer  
**Deliverables:** Sprint Change Proposal + backlog reorganization plan

**Handoff**

- Product Owner는 승인된 세 가지 변경 제안을 `epics.md`에 반영한다.
- Developer는 수정된 스토리 기준으로 구현 순서와 초기 모델/helper 준비 상태를 확인한다.
- Architect는 초기 모델/권한 helper와 재고 이월 fallback 정책이 `architecture.md`와 맞는지 확인한다.

**Sprint status update**

`sprint-status.yaml` 또는 동등한 sprint status 파일은 현재 저장소에서 발견되지 않았다. 따라서 이번 워크플로에서 sprint status 갱신은 `[N/A]`로 기록한다.

## 7. Checklist Status Summary

| Section | Status |
| --- | --- |
| 1. Trigger and Context | 완료 |
| 2. Epic Impact Assessment | 완료 |
| 3. Artifact Conflict and Impact Analysis | 완료 |
| 4. Path Forward Evaluation | 완료 |
| 5. Sprint Change Proposal Components | 완료 |
| 6. Final Review and Handoff | 완료 |
