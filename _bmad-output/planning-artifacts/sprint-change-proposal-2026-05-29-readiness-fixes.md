# Sprint Change Proposal: 구현 준비성 Blocker 2개 조정

**프로젝트:** erp_fish  
**작성일:** 2026-05-29  
**진행 방식:** Incremental  
**트리거 문서:** `implementation-readiness-report-2026-05-29.md`  
**상태:** 승인됨  
**승인된 증분 변경안:** Story 4.5 리포트 의존 제거, 코멘트 탭 MVP 제거
**최종 승인:** 2026-05-29, 사용자 명시 승인 `yes`

## 1. Issue Summary

`implementation-readiness-report-2026-05-29.md`의 최종 상태는 `NOT READY`다. 전체 산출물은 PRD, Architecture, UX, Epics 사이의 큰 방향은 맞지만, 구현 시작 전 정리해야 할 이슈 5개가 있다. 그중 2개는 blocker다.

핵심 blocker는 다음과 같다.

1. Epic 4 Story 4.5가 아직 구현되지 않은 Epic 5 리포트 기능에 의존한다.
2. `코멘트` 탭/화면이 UX와 stories에는 있지만 PRD와 Architecture에는 소유 범위가 없다.

이 문제는 MVP를 줄이는 문제가 아니다. 구현 순서와 산출물 소유권을 선명하게 정리해, 개발자가 미래 기능을 임시로 만들거나 숨은 범위를 구현하지 않게 하는 문제다.

## 2. Impact Analysis

### Epic Impact

**Epic 1: 안전한 업무 공간과 기준정보 관리**

Story 1.2가 지점장 모바일 하단 탭으로 `코멘트`를 요구한다. 하지만 PRD와 Architecture에는 본사 코멘트, 검토 메모, 조치 응답 기능의 데이터 모델과 서버 경계가 없다. Story 1.2에서 `코멘트`를 제거하면 Epic 1은 인증, 지점 접근 제한, 기본 업무 공간 제공에 집중할 수 있다.

**Epic 4: 본사 검토, 마감, 정정 기록**

Story 4.5가 관제판과 리포트 모두의 정정 반영값 사용을 요구한다. 리포트 화면과 리포트 drilldown은 Epic 5에서 처음 구현되므로 Epic 4가 독립 완료될 수 없다. Epic 4에서는 장부 상세, 관제판, shared calculation contract까지만 책임져야 한다.

**Epic 5: 회의와 기간/월간 리포트**

리포트의 정정 반영값 적용은 Epic 5가 소유해야 한다. 현재 Story 5.1~5.5에는 이미 정정 반영값, 상세 추적, shared calculation 요구가 들어 있어 큰 추가 범위는 없다. Story 4.5에서 리포트 문구만 제거하면 책임 위치가 맞아진다.

### Artifact Conflicts

**PRD**

PRD는 수정하지 않는다. PRD의 FR-21은 최종 제품 기준으로 `관제판과 리포트의 기본 숫자는 정정 반영값을 사용한다`고 말하는 것이 맞다. 문제는 최종 요구가 아니라 Story 4.5의 구현 순서다.

**Architecture**

Architecture는 수정하지 않는다. 별도 `comments` feature, comments model, comment server action이 없다는 점이 이번 blocker의 근거다. MVP에서 코멘트를 제거하면 Architecture와 맞아진다.

**UX**

UX는 수정 필요. 지점장 IA와 모바일 하단 탭에서 `코멘트`를 제거한다. 본사 검토 메모/조치 응답은 MVP에서 제외하고, 추후 필요하면 별도 PRD 요구사항과 dedicated story로 다시 추가한다.

**Epics**

Epics는 수정 필요. Story 4.5에서 리포트 관련 AC를 제거하고, Story 1.2와 UX-DR26에서 `코멘트` 탭을 제거한다.

### Technical Impact

코드 구현 전 계획 변경이다. 데이터 모델 추가나 기능 구현은 필요 없다. 오히려 숨은 comments 모델 구현과 future reports stub 구현을 막는다.

## 3. Recommended Approach

권장 경로는 **Direct Adjustment**다.

롤백은 아직 구현 착수 전이므로 해당하지 않는다. MVP Review도 필요 없다. MVP 범위는 유지하고, blocker 2개만 story/UX 문구에서 바로잡는다.

**예상 노력:** 낮음  
**위험:** 낮음  
**일정 영향:** 구현 착수 전 짧은 산출물 정리. 이후 재작업 위험을 줄인다.

## 4. Detailed Change Proposals

### Proposal 1: Story 4.5에서 Epic 5 리포트 의존 제거

**대상:** `epics.md` / Story 4.5

**OLD**

```md
### Story 4.5: 관제판과 리포트가 정정 반영값을 기본으로 사용한다

As a 본사 사용자,
I want 정정 기록을 추가한 뒤 관제판과 리포트 숫자가 정정 반영값으로 갱신되길 원한다,
So that 회의와 운영 판단에 최신 보정 숫자를 사용할 수 있다.
```

**NEW**

```md
### Story 4.5: 관제판이 정정 반영값을 기본으로 사용한다

As a 본사 사용자,
I want 정정 기록을 추가한 뒤 관제판 숫자와 이상 신호가 정정 반영값으로 갱신되길 원한다,
So that Epic 5 리포트 화면이 없어도 본사 운영 판단에 최신 보정 숫자를 사용할 수 있다.
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

**Rationale**

Epic 4는 정정 생성, 원본/정정 구분, 장부 상세/관제판 반영까지만 완료하면 독립적으로 끝날 수 있다. 리포트 적용은 Epic 5의 책임이다.

**Incremental approval:** 승인됨.

### Proposal 2: `코멘트` 탭은 MVP에서 제거

**대상:** `epics.md` / UX-DR26, Story 1.2  
**대상:** `ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md` / 지점장 IA, 내비게이션 구조

**OLD**

```md
UX-DR26: 지점장은 모바일 하단 탭 바를 통해 장부, 재고, 손실, 코멘트에 접근해야 하며, 탭 이동은 현재 입력 단계를 유지해야 한다.
```

**NEW**

```md
UX-DR26: 지점장은 모바일 하단 탭 바를 통해 장부, 재고, 손실에 접근해야 하며, 탭 이동은 현재 입력 단계를 유지해야 한다.
```

**OLD**

```md
**Then** 모바일에서는 장부, 재고, 손실, 코멘트 하단 탭이 보여야 한다
...
**When** 장부, 재고, 손실, 코멘트 화면의 데이터를 조회하면
```

**NEW**

```md
**Then** 모바일에서는 장부, 재고, 손실 하단 탭이 보여야 한다
...
**When** 장부, 재고, 손실 화면의 데이터를 조회하면
```

**OLD**

```md
| 본사 코멘트 | 장부 상세 / 하단 탭 `코멘트` | 본사 검토 메모 확인 및 조치 응답 |

탭: `장부` / `재고` / `손실` / `코멘트`
```

**NEW**

```md
본사 코멘트 행을 MVP 지점장 IA에서 제거한다.

탭: `장부` / `재고` / `손실`
```

**Rationale**

PRD와 Architecture에 본사 코멘트/검토 메모의 데이터 모델, 권한, 상태, 알림, 응답 흐름이 없다. 지금 유지하면 Story 1.2가 숨은 기능을 품게 된다. 추후 필요하면 별도 PRD 요구사항과 dedicated story로 다시 추가한다.

**Incremental approval:** 승인됨.

## 5. Non-Blocker Handling

### UX performance language mismatch

UX key flow의 `Skeleton이 1초 이하로 사라진다`는 문구는 formal acceptance target이 아니라 aspirational scenario copy로 취급한다. 공식 성능 목표는 PRD/Architecture/Epics의 `10개 내외 지점 기준 3초`를 유지한다.

### Color contrast verification

별도 scope 변경은 필요 없다. Epics에 WCAG 2.2 AA와 primary/warning 대비 검증이 포함되어 있으므로 implementation acceptance에서 유지한다.

### Story sizing risk

Story 1.5, Story 2.2, Story 5.5는 구현 추정 때 크면 분리한다. 지금은 blocker가 아니므로 이번 proposal에서 즉시 scope 변경하지 않는다.

## 6. Implementation Handoff

**변경 범위 분류:** Moderate

코드 구현보다 backlog/story와 UX 문서 정리가 중심이다. Product Owner와 Developer가 `epics.md`와 UX 문서를 수정하고, 재검토 워크플로우를 다시 실행하면 된다.

**Handoff recipients**

- Product Owner: 승인된 변경 제안을 `epics.md`와 UX 문서에 반영한다.
- Developer: Story 4.5가 Epic 5 없이 구현 가능한지, Story 1.2가 comments model 없이 구현 가능한지 확인한다.
- UX Designer: 하단 탭 3개 구조가 mockup과 EXPERIENCE 문서에서 일관되는지 확인한다.

**Success Criteria**

1. Story 4.5가 Epic 5 report route, report query, report drilldown 없이 완료 가능하다.
2. Story 5.1~5.5가 리포트의 정정 반영값 책임을 명시적으로 유지한다.
3. Story 1.2와 UX-DR26에서 `코멘트` 탭이 제거된다.
4. PRD와 Architecture에 없는 comments 기능이 MVP 구현 범위에 들어가지 않는다.
5. 재실행한 implementation readiness check에서 blocker가 해소된다.

## 7. Checklist Status Summary

| Section | Status |
| --- | --- |
| 1. Trigger and Context | 완료 |
| 2. Epic Impact Assessment | 완료 |
| 3. Artifact Conflict and Impact Analysis | 완료 |
| 4. Path Forward Evaluation | 완료 |
| 5. Sprint Change Proposal Components | 완료 |
| 6. Final Review and Handoff | 완료 |

## 8. Approval and Handoff Log

**승인 결과:** 승인됨  
**승인 일시:** 2026-05-29  
**승인 입력:** `yes`  
**변경 범위:** Moderate  
**Route to:** Product Owner / Developer, UX Designer support  
**Deliverables:** Sprint Change Proposal + backlog/UX artifact adjustment plan

**Handoff**

- Product Owner는 승인된 두 변경 제안을 `epics.md`에 반영한다.
- UX Designer는 `EXPERIENCE.md`와 관련 mockup의 지점장 하단 탭을 3개 구조로 정리한다.
- Developer는 수정된 Story 4.5와 Story 1.2가 future reports나 comments model 없이 구현 가능한지 확인한다.
- 변경 반영 후 implementation readiness check를 다시 실행해 blocker 해소 여부를 확인한다.

**Sprint status update**

`sprint-status.yaml` 또는 동등한 sprint status 파일은 현재 저장소에서 발견되지 않았다. 또한 이번 변경은 epic/story 추가, 제거, renumber가 아니라 문구와 책임 경계 조정이므로 sprint status 갱신은 `[N/A]`로 기록한다.
