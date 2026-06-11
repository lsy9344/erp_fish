# Adversarial PRD Review: ERP Fish

검토 대상: `prd.md`
함께 검토한 문서: `addendum.md`, `.decision-log.md`
검토 관점: 제품 리스크, 누락 요구사항, 모호한 acceptance boundary, downstream UX/architecture/story churn, scope contradiction

## Verdict

**조건부 통과: 이 PRD는 이제 위험을 숨기는 문서가 아니라 위험을 잘 드러내는 draft다.** 이전 검증에서 가장 위험했던 세 가지, 즉 민감 지표 충돌, FR-13/OQ 영향 누락, CAP 릴리스 경계 부재는 본문에서 상당히 정리됐다.

하지만 "정리됐다"와 "바로 구현해도 된다"는 다르다. 지금 가장 큰 남은 위험은 문서가 스스로 `draft`라고 말하는데도, downstream 작업자가 MVP 필수 또는 후속 확정이라는 표현만 보고 정책 종결 없이 story extraction을 시작하는 것이다.

## Severity Summary

- Critical: 0
- High: 3
- Medium: 5
- Low: 2
- Total: 10 findings

## High Findings

### H1. MVP 필수와 story-ready가 아직 같은 말이 아니다

**Location / quote**

- PRD §0.1 line 20: 문서는 아직 `draft`.
- PRD §0.2 lines 47-56: 여러 MVP FR slice가 OQ 차단.
- PRD §10 lines 1184-1206: MVP 스토리 생성 전 OQ-1, OQ-2, OQ-3, OQ-10 종결 필요.

**Risk**

PRD는 이 문제를 잘 설명한다. 하지만 바로 그 설명 때문에 현재 문서는 최종 구현 투입물이 아니다. PM/기획/개발 중 누군가 §7의 MVP 포함 범위만 보고 "FR-1~FR-29가 MVP 필수니까 모두 스토리로 쪼개자"라고 하면, §0.2의 slice guard를 놓칠 수 있다.

**Remediation**

스토리 생성 전에 `MVP story extraction checklist`를 별도 산출물로 만들고, 각 FR slice를 `implementation story`, `discovery story`, `blocked` 중 하나로 다시 표시하라. 이 체크리스트 없이는 에픽/스토리 생성을 시작하지 않는 게 안전하다.

### H2. "후속 확정"은 아직 delivery commitment가 아니다

**Location / quote**

- PRD §8 lines 817-839: CAP 릴리스 버킷이 추가됨.
- 다수 CAP가 `후속 확정`으로 표시됨.

**Risk**

이전보다 훨씬 낫지만, "후속 확정"은 아직 계약/일정/릴리스 약속이 아니다. 고객에게는 승인된 추가 구현처럼 보이고, 개발팀에는 아직 나중에 확정할 backlog처럼 보일 수 있다.

**Remediation**

각 CAP에 `target release`, `commercial commitment`, `owner`, `approval artifact`를 붙여라. 최소한 `MVP+0`, `MVP+1`, `separate paid release`, `approved backlog only`, `blocked` 정도의 구분이 필요하다.

### H3. MVP 가격 기준은 닫혔지만, 가격 신뢰 상태는 아직 약하다

**Location / quote**

- PRD §4.3 lines 410-424: MVP 단가/가격 기준.
- PRD §4.5 lines 541-553: 가격 기준 없음은 개별 마감에서 사유 입력 시 예외 가능.

**Risk**

사용자 직접 입력 단가를 1순위로 두는 것은 현장 운영상 필요할 수 있다. 문제는 그 단가가 검증된 단가인지, 임시 단가인지, 본사 override인지, 근거 없는 단가인지가 보고 숫자와 마감 판단에 어떻게 표시되는지 아직 약하다는 점이다. 이 상태로 매출원가/이익률이 회의에서 쓰이면 "운영 확인용"이라는 꼬리표만으로는 오해를 막기 어렵다.

**Remediation**

단가마다 `source`, `verification status`, `approved by`, `effective date`, `manual override reason`을 저장하고, 리포트에는 가격 신뢰 상태를 표시하라. 가격 기준 없음으로 개별 마감한 장부는 월간 리포트에서 별도 카운트되어야 한다.

## Medium Findings

### M1. OQ-10은 MVP 최소 차단과 고도화 정책이 한 줄에 섞여 있다

**Location / quote**

- PRD §10 line 1206: OQ-10은 `스토리 작성 전 필수(MVP 최소 차단) + Epic 8 구현 전 필수(고도화)`.

**Risk**

이 구분은 정확하지만, 하나의 OQ로 남겨두면 회의에서 "OQ-10 닫힘"이 무엇을 의미하는지 다시 헷갈릴 수 있다. MVP 최소 차단은 이미 대부분 정책화되어 있고, 고도화는 CAP-13 범위다.

**Remediation**

OQ-10을 `OQ-10A MVP 최소 노출 차단 승인`과 `OQ-10B 고도화 노출 정책`으로 나누거나, 현재 OQ 안에 두 단계의 close criteria를 명시하라.

### M2. 권한 matrix는 좋아졌지만 실제 permission artifact는 아직 없다

**Location / quote**

- PRD §4.1 lines 204-217: action-level permission matrix.
- PRD §0.1 line 27: G4 증빙 산출물은 권한 프로파일 x action 매트릭스와 감사 이벤트 계약서.

**Risk**

본문 표는 충분히 좋은 시작점이다. 하지만 G4가 요구하는 증빙 산출물로 보기에는 아직 화면/API/mutation별 상세 권한이 부족하다. 예를 들어 같은 `리포트 조회/export` 안에서도 리포트별, 컬럼별, 지점 범위별 권한이 달라진다.

**Remediation**

PRD 본문은 유지하되, architecture 또는 story 작업 전에 별도 permission contract를 생성하라. 리포트별 컬럼, export, alert template, cache response까지 포함해야 한다.

### M3. 계정 보안 기준은 방향만 있고 수치가 없다

**Location / quote**

- PRD §4.1 lines 234-242: 실패 제한, 세션 만료, 초기 비밀번호 교체.

**Risk**

정책 방향은 맞다. 하지만 로그인 실패 몇 회, 잠금 몇 분, 세션 만료 몇 시간 같은 값이 없으면 구현자마다 다른 기본값을 고른다.

**Remediation**

보안 기본값을 PRD 또는 운영 설정 계약에 추가하라. 예: 실패 5회 잠금, 관리자 초기화 비밀번호 만료, 유휴 세션 만료, 장기 세션 만료.

### M4. 직원/급여 개인정보 보존 정책이 아직 OQ-12 뒤에 있다

**Location / quote**

- PRD §8.1 lines 876-902: 직원/급여 참고 자료.
- PRD §10 line 1208: OQ-12.

**Risk**

"실제 지급 확정 제외"만으로 개인정보 리스크가 없어지지는 않는다. 입사일, 특수 근태 메모, 급여 차액은 충분히 민감하다. PRD는 field-level 권한과 보존/삭제/익명화 필요성을 말하지만, 실제 기간과 삭제 기준은 아직 없다.

**Remediation**

CAP-1/CAP-9 epic 전에 개인정보 보존표를 작성하라. 필드별 보존 기간, 익명화 조건, export 권한, 퇴사자 표시 기준이 필요하다.

### M5. 백업/RPO/RTO는 강해졌지만 restore acceptance가 아직 얇다

**Location / quote**

- PRD §5 lines 747-752: RPO 1시간, RTO 4시간, 복구 리허설.

**Risk**

기준 자체는 좋아졌다. 다만 restore drill acceptance가 "수행하고 기록한다" 수준이라, 실제로 어떤 데이터가 복구되어야 성공인지가 약하다.

**Remediation**

복구 리허설 성공 기준에 장부, 마감 이벤트, 정정 이벤트, 업로드 원본, preview/commit/void 이력, 감사 로그 검색 가능 여부를 넣어라.

## Low Findings

### L1. 기술 용어가 설명된 뒤에도 본문에 꽤 남아 있다

**Location / quote**

- PRD §3 기술 용어 표.
- PRD 전반의 `mutation`, `commit`, `preview`, `idempotency`, `cache`.

**Risk**

개발자는 이해하지만 본사 운영자가 정책을 승인할 때 뉘앙스를 놓칠 수 있다.

**Remediation**

처음 한 번만 병기하고 이후에는 운영자 표현을 우선하라.

### L2. 일부 Phase 이름은 여전히 영어 코드처럼 보인다

**Location / quote**

- PRD §8 lines 821-839: Extension A/B/C/D, Contract/Ops.

**Risk**

심각한 문제는 아니다. 다만 산출물 언어가 한국어라면 고객/운영자 승인 문서에서 약간 딱딱하게 보일 수 있다.

**Remediation**

필요하면 `Extension A: 권한/통제 기반`을 `확장 A: 권한/통제 기반`처럼 바꾸면 충분하다.
