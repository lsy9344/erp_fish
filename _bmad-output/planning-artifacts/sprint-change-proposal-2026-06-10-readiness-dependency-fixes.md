# Sprint Change Proposal: 2026-06-10 구현 준비성 의존성 보정

**프로젝트:** erp_fish  
**작성일:** 2026-06-10  
**진행 방식:** Incremental  
**트리거 문서:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-10.md`  
**상태:** 승인됨 / 구현 반영 대기  
**검증 결과:** `NOT_READY_AS_IS`  
**최종 승인:** 2026-06-10, 사용자 명시 승인 `yes`

## 1. Issue Summary

`implementation-readiness-report-2026-06-10.md`는 현재 계획을 그대로 구현하기에는 준비되지 않았다고 평가했다. 기능 요구사항 FR1~FR29는 에픽에서 100% 커버되지만, 에픽과 스토리의 구현 순서, 데이터 생성 시점, 계산 기준, 실패 흐름이 일부 맞지 않는다.

핵심 트리거는 `Story 2.4`다. 이 스토리는 Epic 2 안에서 구현되어야 하지만, 전일재고 이월 기준으로 미래 Epic 4의 본사 마감 기능을 요구한다. 이 상태로 구현하면 Epic 2가 Epic 4 없이는 완결되지 않고, 개발자가 임시 마감 상태나 임시 재고 이월 규칙을 만들 가능성이 높다.

확인된 주요 이슈는 다음과 같다.

- `CR-1`: `Story 2.4`가 미래 Epic 4의 본사 마감 기능에 의존한다.
- `MA-1`: 월초 재고 스냅샷 생성/수정/검증 스토리가 없다.
- `MA-2`: MVP 원가/이익 계산 기준과 Epic 6 FIFO 기준의 관계가 불명확하다.
- `MA-3`: Epic 2의 근무인원 숫자 입력과 Epic 9의 직원별 근무 집계가 데이터 단절을 일으킬 수 있다.
- `MA-4`: 일부 스토리가 너무 커서 구현과 검증 위험이 크다.
- `MA-5`: 조건부 Acceptance Criteria와 실패 흐름이 부족하다.

## 2. Impact Analysis

### Epic Impact

**Epic 2: 지점 일일 장부 입력과 검토 제출**

가장 큰 영향을 받는다. `Story 2.4`의 재고 이월 기준을 Epic 2 안에서 구현 가능한 기준으로 바꿔야 한다. 월초 재고 스냅샷 선행 스토리도 Epic 2에 추가해야 한다. `Story 2.2`는 비용, 근무, 역할별 민감 지표 제한을 나눠야 한다.

**Epic 4: 본사 검토, 마감, 정정 기록**

본사 마감은 재고 이월의 최종 확정 기준으로 남긴다. 다만 Epic 2의 최초 재고 입력이 Epic 4를 기다리지 않도록, Epic 4는 후보 이월값을 확정 이월값으로 보강하는 역할을 맡는다.

**Epic 6: 품목 정규화와 매입/FIFO 재고 기반**

MVP 기본 계산과 FIFO 계산의 책임을 분리해야 한다. FIFO 매입 lot과 잔량 근거는 Epic 6에서 도입하고, Epic 2~5는 운영 확인용 기본 계산 기준임을 명확히 한다.

**Epic 8: 지점장 권한, 마감, 손실, 입력 흐름 보완**

`차이` 라벨 변경, 희망 판매가 손실액, 대시보드 리사이징은 정책 결정과 구현 노트를 분리해야 한다. 결정되지 않은 계산 의미를 구현자가 임의로 확정하면 안 된다.

**Epic 9: 직원 마스터와 인사/급여 정산 참고 자료**

Epic 2의 근무인원 숫자와 Epic 9의 직원별 근무 선택 기록 사이에 전환 기준이 필요하다. Epic 9 이전 장부의 숫자 근무인원은 직원별 근무 기록으로 자동 분해하지 않는다.

**Epic 10: 리포트 고도화와 월 손익계산서**

`Story 10.4`는 고정비 관리와 월 손익계산서 조회를 분리해야 한다. 데이터 부족, 중복 고정비, 민감 지표 제한 흐름도 명확히 해야 한다.

**Epic 11: 외부 알림**

알림 채널 인증 실패, 중복 발송, rate limit, 비활성 채널, 재시도 기록이 Acceptance Criteria에 들어가야 한다.

### Artifact Conflicts

**PRD**

`FR-9`는 직전 마감 장부만 이월 기준으로 말하고 있어 Epic 2 구현 순서와 충돌한다. PRD는 직전 저장 장부의 당일재고를 전일재고 후보로 쓰고, 본사 마감 후 확정 이월 기준으로 전환한다고 바꿔야 한다.

`FR-12`, `CAP-1`, `CAP-9`는 MVP 근무인원 숫자와 Epic 9 직원별 근무 기록의 전환 기준을 명확히 해야 한다.

`§4.3 계산과 검증`은 MVP 원가/이익/재고금액 계산을 운영용 기본 계산으로 정의하고, FIFO 확정 원가와 구분해야 한다.

**Epics/Stories**

수정 또는 추가가 필요한 주요 스토리는 다음과 같다.

- `Story 2.2`: 비용 입력, 근무 입력, 역할별 민감 지표 제한으로 분리
- `Story 2.4`: 월초 재고 스냅샷 선행 스토리 추가
- 기존 `Story 2.4`: 전일재고 후보 확인과 실제 재고 입력 스토리로 정리
- `Story 2.7`, `3.3`, `5.3`, `5.5`, `6.3`: MVP 기본 계산과 FIFO 계산 구분
- `Story 6.2`: 업로드 검증, 매핑 실패 검수, 확정 반영, 지점장 읽기 전용 확인으로 분리
- `Story 8.2`, `8.4`, `8.5`, `8.6`: 실패 흐름과 정책 미정 처리 보강
- `Story 9.2`: Epic 9 이전 근무인원 숫자의 자동 직원별 분해 금지
- `Story 10.4`: 고정비 관리와 월 손익계산서 조회로 분리
- `Story 11.1`, `11.2`: 인증 실패, 중복 발송, rate limit, 비활성 채널 흐름 추가

**Architecture**

재고 이월 표현을 `직전 마감 장부 자동 이월`에서 `직전 저장 장부 기반 전일재고 후보 이월 + 본사 마감 후 확정 이월`로 바꿔야 한다.

계산 전략에는 MVP 기본 계산과 FIFO 계산의 적용 범위를 구분해야 한다.

**UX**

지점장 재고 입력 흐름에서 `전일 마감 없음 = 자동 이월 불가`가 아니라 `전일재고 기준 확인 필요`로 표현해야 한다. 수동 입력은 계속 허용한다.

## 3. Recommended Approach

권장 경로는 **Direct Adjustment + Backlog Reorganization**이다.

롤백은 필요하지 않다. 이미 구현된 기능을 되돌리는 문제가 아니라, 구현 전 planning artifact의 의존성과 모호함을 보정하는 문제다.

MVP 축소도 필요하지 않다. MVP의 장부 입력, 관제판, 마감, 정정, 기본 리포트 목표는 유지한다. 다만 MVP 계산은 운영용 기본 계산이고, FIFO 확정 원가와 직원별 근무 집계는 후속 Epic에서 도입한다는 선을 명확히 해야 한다.

**예상 노력:** Medium  
**위험도:** Medium  
**일정 영향:** 에픽/스토리 재정리와 후속 story 생성 기준 보정 필요. 코드 구현 전 처리하면 재작업 비용은 낮다.

## 4. Detailed Change Proposals

### Increment 1: Story 2.4 재고 이월 기준 보정

**상태:** 승인됨  
**대상:** `epics.md`

**OLD**

```md
**Then** 월 첫 장부는 월초 재고 스냅샷에서 전일재고를 가져와야 한다
**And** 이후 영업일은 직전 본사 마감 장부의 당일재고를 가져와야 한다.
```

**NEW**

```md
**Then** 월 첫 장부는 월초 재고 스냅샷에서 전일재고를 가져와야 한다
**And** 이후 영업일은 Epic 2 안에서 생성된 직전 저장 장부의 당일재고를 전일재고 후보로 가져와야 한다
**And** 직전 장부가 본사 마감되지 않은 경우에는 확정 이월값이 아니라 검토 필요 상태로 표시해야 한다.
```

### Increment 2: PRD FR-9 이월 기준 보정

**상태:** 승인됨  
**대상:** `prd.md`

**OLD**

```md
- 이후 영업일의 전일재고는 직전 마감 장부의 당일재고에서 자동 이월된다.
```

**NEW**

```md
- 이후 영업일의 전일재고는 직전 저장 장부의 당일재고를 전일재고 후보로 자동 이월한다.
- 직전 장부가 본사 마감 전이면 확정 이월값이 아니라 `검토 필요` 상태로 표시한다.
- 본사 마감 이후에는 해당 마감 장부의 당일재고를 확정 이월 기준으로 사용한다.
```

### Increment 3: 월초 재고 스냅샷 선행 스토리 추가

**상태:** 승인됨  
**대상:** `epics.md`

```md
### Story 2.4a: 본사가 월초 재고 스냅샷을 생성하고 검증한다

As a 본사 사용자,
I want 월 첫 장부의 전일재고 기준이 되는 월초 재고 스냅샷을 생성하고 검증하고 싶다,
So that 지점장은 월 첫 장부에서도 품목별 전일재고를 안정적으로 불러올 수 있다.
```

핵심 AC:

- 지점+월+품목+규격 기준 재고 스냅샷 저장
- 생성자, 생성 시각, 변경 이력 감사 로그
- 중복 생성 방지
- 월 첫 장부 재고 단계에서 스냅샷 프리필
- 누락 품목은 `검토 필요` 표시 후 수동 입력 허용

### Increment 4: 기존 Story 2.4 크기와 책임 정리

**상태:** 승인됨  
**대상:** `epics.md`

**OLD**

```md
### Story 2.4: 지점장이 전일 이월 재고를 불러와 품목별 재고를 수정한다
```

**NEW**

```md
### Story 2.5: 지점장이 전일 이월 재고 후보를 확인하고 품목별 실제 재고를 입력한다
```

추가 기준:

- 누락 품목과 사유를 한국어 안내로 표시
- 수동 전일재고 입력 허용
- MVP 재고금액은 수량과 단가 기준으로 표시
- FIFO 기준 재고금액은 Epic 6 도입 전까지 `기준 확인 필요` 또는 별도 근거 없음 상태로 구분

### Increment 5: PRD 계산 기준 정리

**상태:** 승인됨  
**대상:** `prd.md`

MVP의 원가/이익/재고금액 계산은 운영 확인을 위한 기본 계산 기준이다. FIFO 매입 lot, 잔여 수량, 재고 원가 근거가 도입되기 전에는 FIFO 기준 확정 원가처럼 표시하지 않는다. 화면과 리포트는 간이 기준 계산값과 `기준 확인 필요` 상태를 구분해야 한다.

### Increment 6: 에픽 계산 스토리에 MVP/FIFO 구분 추가

**상태:** 승인됨  
**대상:** `Story 2.7`, `Story 3.3`, `Story 5.3`, `Story 5.5`, `Story 6.3`

Epic 2~5에는 MVP 기본 계산 기준임을 표시하고, Epic 6에는 FIFO 기준 계산값과 MVP 기본 계산값의 적용 범위를 구분하는 AC를 추가한다.

### Increment 7: PRD 근무 데이터 전환 기준 정리

**상태:** 승인됨  
**대상:** `prd.md`

MVP에서는 근무인원 숫자를 저장하고 인당생산성 계산에 반영한다. 이 숫자는 직원별 근무 기록으로 자동 복원된다는 전제를 두지 않는다. 직원 마스터, 근무자별 선택, 월간 근무일수 자동 집계는 추가 구현 범위에서 도입한다.

### Increment 8: Story 2.2 / 9.2 근무 데이터 전환 기준 추가

**상태:** 승인됨  
**대상:** `epics.md`

`Story 2.2`에는 근무인원 숫자가 직원별 근무 기록으로 자동 분해되지 않는다는 AC를 추가한다.

`Story 9.2`에는 Epic 9 이전 장부의 근무인원 숫자를 특정 직원 근무 기록으로 자동 변환하지 않고, 필요한 경우 본사 수동 보정 또는 별도 이관 상태로 표시한다는 AC를 추가한다.

### Increment 9: Story 2.2 분리

**상태:** 승인됨  
**대상:** `epics.md`

```md
### Story 2.2a: 지점장이 비용 항목을 저장한다
### Story 2.2b: 지점장이 근무인원과 특이사항을 저장한다
### Story 2.2c: 역할별 요약 응답에서 민감 지표를 제한한다
```

### Increment 10: Story 6.2 분리

**상태:** 승인됨  
**대상:** `epics.md`

```md
### Story 6.2a: 본사가 이카운트 엑셀 파일을 업로드하고 검증 결과를 확인한다
### Story 6.2b: 본사가 매핑 실패 품목을 검수하고 매핑을 완료한다
### Story 6.2c: 본사가 검증 완료된 업로드를 확정해 장부 매입 라인을 생성한다
### Story 6.2d: 지점장이 본사 업로드 매입 라인을 읽기 전용으로 확인한다
```

추가 실패 흐름:

- 같은 업로드 배치 중복 확정 방지
- 일부 행 실패 시 전체 롤백 또는 부분 반영 정책 명시
- 실패 사유와 적용 정책을 업로드 이력에 기록

### Increment 11: Story 10.4 분리

**상태:** 승인됨  
**대상:** `epics.md`

```md
### Story 10.4a: 본사가 매장별 월 고정비를 관리한다
### Story 10.4b: 본사가 월 손익계산서를 조회한다
```

추가 실패 흐름:

- 같은 지점+월+항목의 고정비 중복 생성 방지
- 손익계산서 데이터 부족 시 0으로 정상 처리 금지
- `데이터 부족` 또는 `기준 확인 필요` 표시

### Increment 12: 일괄 마감과 알림 실패 흐름 보강

**상태:** 승인됨  
**대상:** `Story 8.2`, `Story 11.1`, `Story 11.2`

추가 흐름:

- 이미 본사 마감된 장부는 일괄 마감에서 건너뜀 처리
- 일부 장부 실패 시 성공/실패/건너뜀 결과를 장부별 기록
- 동시 마감 요청에서 중복 마감 방지
- 알림 인증 실패 시 민감값 노출 없는 오류 표시
- 중복 알림 발송 방지
- rate limit 또는 일시 오류 재시도 기록
- 비활성 채널은 발송하지 않고 건너뜀 로그 기록

### Increment 13: 정책 미정 항목과 구현 노트 정리

**상태:** 승인됨  
**대상:** `Story 8.4`, `Story 8.5`, `Story 8.6`

`Story 8.4`는 OQ-14가 단순 라벨 변경인지 계산 의미 변경인지에 따라 동작을 나눈다. 결정 전에는 계산 로직을 변경하지 않는다.

`Story 8.5`는 OQ-9가 확정되지 않았으면 희망 판매가 기준 손실액을 임의 계산하지 않고 `기준 확인 필요`로 표시한다.

`Story 8.6`은 TanStack Table 도입 검토 같은 구현 선택을 Acceptance Criteria가 아니라 구현 노트로 둔다.

### Increment 14: Architecture/UX 표현 정렬

**상태:** 승인됨  
**대상:** `architecture.md`, `EXPERIENCE.md`

Architecture:

```md
품목명/규격 정규화, 월초 재고 스냅샷, 직전 저장 장부 기반 전일재고 후보 이월, 본사 마감 후 확정 이월, 정정 반영값 계산이 핵심 의존점이다.
```

UX:

```md
주의: 단계 4에서 직전 장부가 본사 마감 전이거나 일부 품목의 전일재고 후보가 없으면 → 알림 배너: "전일재고 기준에 확인이 필요한 항목이 있습니다. 직접 입력하거나 본사에 문의하세요." 수동 입력 허용.
```

## 5. Implementation Handoff

**변경 범위 분류:** Moderate

**이유:** PRD, Epics, Architecture, UX 문서 정렬이 필요하고, 일부 스토리 추가/분리와 sprint-status 후속 갱신이 필요하다. 제품 목표를 다시 세우는 수준은 아니지만, 구현 백로그 재정리가 필요하다.

**Route to:** Product Owner / Developer agents

**Responsibilities:**

- Product Owner 또는 planning agent: 승인된 Increment 1~14를 PRD, Epics, Architecture, UX에 반영한다.
- Product Owner 또는 planning agent: 스토리 번호와 `sprint-status.yaml`를 새 구조에 맞게 갱신한다.
- Developer agent: 후속 story 생성 시 MVP 기본 계산, FIFO 계산, 후보/확정 이월, 근무 데이터 전환 기준을 그대로 반영한다.
- Reviewer: readiness check를 다시 실행해 `CR-1`, `MA-1`, `MA-2`, `MA-3`이 해소되었는지 확인한다.

**Handoff Status:** 최종 승인 완료. 다음 작업자는 이 문서의 Increment 1~14를 기준으로 planning artifacts를 수정한다.

**Success Criteria:**

- Epic 2가 Epic 4 본사 마감 기능 없이도 구현 가능한 재고 입력 흐름을 가진다.
- 월초 재고 스냅샷 생성/수정/검증 스토리가 `Story 2.5`보다 먼저 존재한다.
- MVP 기본 계산과 Epic 6 FIFO 계산이 문서와 스토리에서 구분된다.
- Epic 9 이전 근무인원 숫자는 직원별 근무 기록으로 자동 변환되지 않는다.
- 큰 스토리들이 사용자 가치 단위로 나뉜다.
- 일괄 마감, 업로드, 알림, 손익계산서의 실패 흐름이 Acceptance Criteria에 포함된다.
- Architecture와 UX가 후보 이월/확정 이월 표현을 같은 방식으로 사용한다.

## 6. Checklist Progress

- [x] 1.1 Triggering story identified: `Story 2.4`
- [x] 1.2 Core problem defined: planning artifact dependency/order/AC clarity issue
- [x] 1.3 Supporting evidence collected: readiness report, PRD, Epics, Architecture, UX
- [x] 2.1 Current epic impact assessed: Epic 2 cannot complete as originally planned
- [x] 2.2 Epic-level changes identified: add snapshot story, revise inventory carryover, split large stories
- [x] 2.3 Remaining epics reviewed: Epic 4, 6, 8, 9, 10, 11 impacted
- [x] 2.4 Future epic invalidation checked: no epic invalidated, but backlog reorganization needed
- [x] 2.5 Priority/order checked: snapshot and MVP calculation decisions must precede implementation
- [x] 3.1 PRD conflicts checked: FR-9, FR-12, calculation section, CAP-1, CAP-9 impacted
- [x] 3.2 Architecture conflicts checked: inventory carryover and calculation strategy wording impacted
- [x] 3.3 UI/UX conflicts checked: inventory flow warning copy impacted
- [N/A] 3.4 Deployment/CI impact: planning artifact correction only
- [x] 4.1 Direct Adjustment evaluated: viable
- [N/A] 4.2 Rollback evaluated: no implementation rollback target
- [x] 4.3 PRD MVP Review evaluated: MVP scope maintained
- [x] 4.4 Recommended path selected: Direct Adjustment + Backlog Reorganization
- [x] 5.1 Issue summary created
- [x] 5.2 Epic/artifact impact documented
- [x] 5.3 Recommended path documented
- [x] 5.4 MVP impact/action plan documented
- [x] 5.5 Agent handoff plan documented
- [x] 6.1 Checklist completion reviewed
- [x] 6.2 Proposal accuracy verification pending final user review
- [x] 6.3 Explicit final approval obtained: 2026-06-10 사용자 명시 승인 `yes`
- [!] 6.4 sprint-status.yaml update pending: planning artifact 반영 시 함께 갱신 필요
- [x] 6.5 Confirm handoff plan documented: Product Owner / Developer agents

## 7. Next Step

승인된 Increment 1~14를 planning artifacts에 반영한다. 반영 대상은 `prd.md`, `epics.md`, `architecture.md`, `EXPERIENCE.md`, 그리고 후속으로 `sprint-status.yaml`다.
