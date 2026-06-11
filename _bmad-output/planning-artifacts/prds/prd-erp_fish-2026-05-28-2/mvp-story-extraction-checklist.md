---
title: "ERP Fish MVP Story Extraction Checklist"
status: "approved"
created: "2026-06-11"
updated: "2026-06-11"
source_prd: "prd.md"
gate: "G6"
approved: "2026-06-11"
approved_by: "Noah Lee"
approval_scope: "MVP-S01~MVP-S03 implementation story allowed; MVP-S04~MVP-S10 implementation story blocked and kept as discovery/policy work."
---

# MVP Story Extraction Checklist

이 문서는 PRD §0.1 G6의 실제 산출물이다. `bmad-create-epics-and-stories` 또는 동등한 에픽/스토리 생성 작업은 이 체크리스트를 먼저 읽고, `may generate implementation story`가 `yes`인 slice만 구현 스토리로 추출한다.

현재 상태는 **approved**다. 2026-06-11에 Noah Lee가 PM + 개발 리드 승인 기준으로 이 체크리스트를 G6 공식 story extraction gate로 승인했다.

승인 범위:
- `MVP-S01~MVP-S03`은 구현 스토리로 추출할 수 있다.
- `MVP-S04~MVP-S10`은 구현 스토리로 추출하지 않고 discovery story 또는 정책 확정 작업으로만 다룬다.

## 사용 규칙

- `implementation story`: 연결된 OQ가 없거나, 본문 요구사항과 증빙 산출물만으로 구현자가 새 정책을 해석하지 않아도 되는 slice다.
- `discovery story`: 질문 종결, 정책 메모, 승인 산출물 생성이 목표다. 제품 동작 구현을 포함하지 않는다.
- `blocked`: owner와 재확인 시점이 정해졌지만 아직 구현 또는 discovery story로 넘길 근거가 부족한 slice다.
- `may generate implementation story`는 자동화 입력을 위해 `yes` 또는 `no`만 사용한다.
- `may generate implementation story`가 `no`인 slice는 구현 스토리로 만들지 않는다.
- `approval date`가 비어 있는 행은 승인 대기 상태다. 현재 승인된 행은 모두 `2026-06-11`로 표시한다.

## Checklist

| Slice ID | Related FR/CAP/OQ | 기능 slice | Current status | May generate implementation story | Required closure artifact | Owner | Approval date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MVP-S01 | FR-1~FR-5, FR-7, FR-8(MVP 수동 매입), FR-10~FR-12(희망 판매가 손실 제외), FR-15, FR-18~FR-23, FR-25~FR-27 | 로그인, 기본 장부 입력, 비용/매입/손실/근무자 기록, 본사 관제, 마감/정정, 마스터 관리의 OQ 비의존 MVP slice | implementation story | yes | G4 권한/감사 계약, 관련 화면/API acceptance criteria | PM + 개발 리드 | 2026-06-11 | 민감 지표 또는 계산 정책 의존 slice는 아래 별도 행을 따른다. |
| MVP-S02 | FR-13, §4.3, §4.7 | 총매출, 비용합계, 근무인원, 평균매출처럼 가격·원가·민감 노출 정책에 의존하지 않는 기본 합계/상태 계산 | implementation story | yes | G2 계산 정책의 기본 합계 기준 | PM + 본사 운영자 | 2026-06-11 | 민감 지표 노출 차단 최소 기준(§4.1)을 함께 적용한다. |
| MVP-S03 | FR-28, FR-29, §4.1 | 본사 권한 전용 조회와 export | implementation story | yes | G4 권한/감사 계약, 민감 필드 서버 차단 테스트 | PM + 개발 리드 | 2026-06-11 | 지점장, 외부 공유 링크, 캐시 응답에는 민감 지표가 노출되지 않는다. |
| MVP-S04 | FR-6, FR-14, FR-16, FR-17, OQ-1 | 매출차액 이상 신호 임계값과 알림/우선순위 판정 | discovery story | no | PM 승인 매출차액 기준표(금액/비율/부호/예시 포함) | PM + 본사 운영자 | 2026-06-11 | OQ-1 전에는 차이값 표시까지만 구현 가능하다. |
| MVP-S05 | FR-9, FR-13, OQ-2 | `30%단가` 파생 표시 또는 계산 | discovery story | no | `30%단가` 업무 의미와 화면 표시 여부 결정 메모 | PM + 본사 운영자 | 2026-06-11 | 재고 입력·기본 계산 자체와 분리한다. |
| MVP-S06 | FR-24, CAP-5, OQ-3 | 초기 품목 마스터 적재/정규화 | discovery story | no | 품목명/구분/규격 분리 기준표와 초기 샘플 검증 | PM + 본사 운영자 | 2026-06-11 | 품목 선택·입력 기능은 별도 구현 가능하다. |
| MVP-S07 | FR-13, CAP-7, OQ-7, OQ-17 | FIFO 기준 매출원가, 재고금액, 매출이익, 이익률, 재고비율 | discovery story | no | FIFO 적용 범위와 반품/조정/폐기/떨이 처리 순서 정책 메모 | 본사 운영자 + 개발 리드 | 2026-06-11 | OQ 종료 전에는 MVP 기본 계산값 또는 `기준 확인 필요`로만 표시한다. |
| MVP-S08 | FR-11, FR-13, CAP-14, OQ-9 | 희망 판매가 기준 손실액 | discovery story | no | 희망 판매가 version/lock 및 미입력/변경 시 계산 정책 | PM + 본사 운영자 | 2026-06-11 | MVP 손실 기록은 기존 손실 유형·수량·금액 기록으로 제한한다. |
| MVP-S09 | FR-13, FR-28, FR-29, CAP-13, OQ-10A | 지점장 화면/API/export/공유 링크/캐시/알림 템플릿의 민감 파생 지표 차단 | discovery story | no | OQ-10A 승인본: surface x 권한별 allowed/blocked field matrix, 서버 응답 차단 테스트, 감사 로그 기준 | PM + 개발 리드 | 2026-06-11 | OQ-10A가 닫혀도 CAP-13 고도화 노출 허용(OQ-10B)은 자동으로 열리지 않는다. |
| MVP-S10 | FR-9, FR-13, CAP-17, OQ-14 | `차이`를 `당일 판매량`으로 바꾸는 범위 | discovery story | no | 라벨 변경인지 계산 의미 변경인지 결정한 재고 용어 승인 메모 | PM + 본사 운영자 | 2026-06-11 | 단순 라벨 변경은 가능하나 계산 의미 변경은 정책 확정 후 구현한다. |

## Gate Decision

- Checklist approval status: `approved`
- Required approvers: PM, 개발 리드
- Approval record: Noah Lee approved this checklist on 2026-06-11 as the official G6 story extraction gate.
- Next action: `MVP-S01~MVP-S03`만 구현 스토리 생성 입력으로 넘긴다. `MVP-S04~MVP-S10`은 discovery story 또는 정책 확정 작업으로 유지한다.
