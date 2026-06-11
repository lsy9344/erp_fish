# PRD Quality Review — ERP Fish PRD

## Overall verdict

ERP Fish PRD는 내부 ERP 요구사항 문서로서 강하다. 본사 관제탑이라는 제품 thesis, MVP/승인 추가 구현/계약/후순위 경계, FR/CAP ID, Open Questions, 계산/권한/감사/리포트 계약이 잘 드러난다. 다만 문서 자체가 `status: "draft"`를 유지하고 여러 MVP slice를 OQ와 승인 산출물에 걸어 두고 있으므로, 아직 최종 story 생성용 PRD로 바로 쓰기보다는 §0.1/§0.2/§10의 게이트를 먼저 닫아야 한다.

## Decision-readiness — adequate

PRD는 결정과 trade-off를 숨기지 않는다. §0.1은 G1 릴리스 경계, G2 계산 정책, G4 권한/감사 계약, G6 스토리 추출 통제처럼 구현 전 닫아야 할 게이트를 owner와 증빙 산출물까지 포함해 둔다. §0.2도 `MVP 필수`, `승인 추가 구현`, `계약/운영 별도`, `후순위/명시 제외`를 분리해, 한 문서 안에 들어온 요구가 모두 같은 출시 약속이 아니라는 점을 명확히 한다.

Open Questions도 실제 결정 대기 상태로 관리된다. §10은 OQ를 "MVP 스토리 생성 전", "Extension A 에픽 전", "구현 setup 중", "계약 전"처럼 닫히는 시점별로 묶는다. 약점은 §7.1의 MVP 포함 범위가 단순 기능 목록처럼 읽히는 반면, §0.2와 §10은 그중 일부 slice가 아직 blocked 또는 discovery-first라고 말한다는 점이다.

### Findings

- **[medium]** MVP 포함 목록이 build-ready 목록으로 오독될 수 있다 (§7.1, §0.2, §10) — §7.1은 "본사 기준값 설정", "매출/이익률 급락, 매출차액, 재고/손실 이상 신호"를 MVP 포함 범위로 둔다. 하지만 §0.2는 "MVP 필수 FR이라도 일부는 §10의 Open Question이 닫혀야 구현 스토리로 확정할 수 있다"고 하고, §10은 OQ-1/OQ-2/OQ-3/OQ-10을 "MVP 스토리 생성 전" 질문으로 묶는다. PRD의 의도는 맞지만, downstream reader가 §7.1만 복사하면 차단 slice를 놓칠 수 있다. *Fix:* §7.1 바로 아래에 모든 항목이 §0.2 story readiness와 §10 OQ gate를 상속한다는 문장을 추가하거나, §7.1 bullet에 `implementation-ready`, `discovery-first`, `blocked slice exists` 같은 준비 상태를 붙인다.

## Substance over theater — strong

내용은 장식보다 실제 업무에서 나온 요구에 가깝다. UJ는 네 개뿐이지만 김관리자, 현대 지점장, 이스태프처럼 named protagonist와 아침 회의, 하루 장부 입력, 누락 매입 보완, 마감 후 정정이라는 실제 운영 장면을 가진다. 용어, 장부 상태, 동시 편집, 권한, 계산, 마감 가능성, 리포트 계약도 모두 제품 위험을 줄이는 데 쓰인다.

일반적인 template 문구도 거의 없다. PRD는 엑셀 화면/수식 복제를 목표로 삼지 않고, AI도 기능 약속이 아니라 구조화 데이터 준비로 제한한다. NFR도 "안전하고 빠르게" 같은 말에 머물지 않고 서버 권한 강제, edit token, 감사 이벤트 필드, RPO/RTO, 리포트 분모/분자 규칙으로 내려와 있다.

### Findings

없음.

## Strategic coherence — strong

제품 thesis는 일관된다. ERP Fish는 지점별 일일 장부를 본사가 확인하고, 아침 회의 전에 위험 지점을 고르고, 필요한 수정/마감/정정을 통제하는 관제탑이다. MVP 기능은 수동 입력, 검증, 본사 관제판, 마감/정정, 마스터, 기본 리포트에 집중하고, 후속 CAP는 권한/통제, 재고 신뢰, 직원/급여 참고, 리포트/알림 고도화로 이어진다.

성공 지표도 기능 존재보다 운영 결과를 보려 한다. SM-1~SM-5는 회의 준비 가능성, 마감 통제, 정정 추적성, 입력 완결성, 본사 기준 운영을 본다. Counter-metrics도 의미 있다. 빠른 입력 때문에 검증을 줄이지 않고, 이상 신호 수를 줄이는 것을 성공으로 보지 않으며, 엑셀과 숫자가 같다는 이유만으로 성공으로 보지 않는다는 점이 thesis를 지킨다.

### Findings

- **[low]** 전략 지표 하나가 목표 기준 없이 측정 항목만 둔다 (§9, SM-6) — SM-6은 "측정: 지점별 시스템 장부 작성률, 엑셀 fallback 발생 건수, fallback 사유"라고 하지만, 어느 수준이면 엑셀 의존이 줄었다고 볼지 목표가 없다. *Fix:* 예를 들어 오픈 N주 후 활성 지점 중 시스템 장부 작성률 목표와 fallback 발생 건수/추세 기준을 추가한다.

## Done-ness clarity — adequate

대부분의 FR은 검증 가능한 결과를 가진다. §4.3은 공식, 반올림, VAT 범위, 가격 신뢰 상태, 매출차액 예시를 정의하고, §4.5는 마감 가능성 표를 둔다. §4.7도 리포트별 필수 컬럼, 필터, export/차트, 기간 집계의 분자/분모를 정의해 engineering과 QA가 바로 story/acceptance criteria를 만들 수 있게 한다.

일부 extension CAP는 의도적으로 아직 story-ready가 아니다. 이는 §8의 `approved backlog only`, `blocked until`, `후속 확정` 표기와 맞으므로 결함은 아니다. 다만 해당 CAP가 실제 implementation epic으로 승격될 때는 UX 수치, 재시도/실패 정책, 기본 설정 같은 완료 기준을 먼저 닫아야 한다.

### Findings

- **[medium]** 일부 CAP 검증 조건이 아직 measurable completion criteria를 뒤로 미룬다 (§8.4, §8.6) — CAP-18은 "데스크톱 기준 최소/최대 폭과 overflow 처리 기준을 UX 설계에서 숫자로 확정한다"고 하고, CAP-11은 재시도와 최종 실패 표시 정책을 "적용할 수 있다"고만 한다. backlog 승인에는 충분하지만 구현 story로는 아직 부족하다. *Fix:* 해당 CAP를 implementation epic으로 승격하기 전에 숫자형 UX 기준, retry count/interval, escalation, 기본 설정을 닫는 discovery/policy story를 먼저 만든다.

## Scope honesty — strong

범위는 정직하다. §6은 MVP에서 제외되는 LINE/텔레그램 알림, 이카운트 직접 API, POS/카드 자동 연동, AI 이미지 식별, 상세 근태, 고급 신선도 추적, 과거 엑셀 일괄 이관을 명시한다. §8은 그중 일부가 승인 추가 구현 후보로 승격되었음을 설명하지만, §6이 삭제된 것은 아니라고 말한다.

불확실성도 잘 분리되어 있다. 본문에는 `[ASSUMPTION]` 태그를 흩뿌리지 않고, §10 Open Questions로 모았다. §8의 CAP 약속 원장은 `후속 확정`이 납기 약속이 아니며 승인 산출물 없이 story로 승격하지 않는다고 못박아, 승인 후보와 구현 약속을 구분한다.

### Findings

없음.

## Downstream usability — adequate

UX, architecture, story creation에서 source-extract하기 좋은 구조다. FR-1~FR-29, CAP-1~CAP-19, OQ-1~OQ-18이 모두 존재하고, UJ도 named protagonist를 가진다. glossary와 상태 표는 장부, 마감, 정정, 재고 이월, 업로드, 민감 지표 같은 핵심 domain noun을 안정적으로 제공한다.

주요 downstream risk는 OQ-10의 승인 상태다. §4.1에는 이미 "민감 필드 노출 기본 매트릭스"가 있지만, §10은 OQ-10 MVP 최소 노출 차단이 닫히려면 그 매트릭스가 "승인되고" 구현 story 기준으로 확정되어야 한다고 말한다. artifact는 있으나 그것이 draft baseline인지 approved MVP minimum인지가 story writer에게 즉시 보이지 않는다.

### Findings

- **[medium]** OQ-10 승인 상태가 story extraction 기준으로 충분히 명시되지 않았다 (§4.1, §10) — §4.1은 "민감 필드 노출 기본 매트릭스"를 제공하지만, §10은 OQ-10 MVP 최소 종료 조건으로 매트릭스가 "승인되고" 차단 필드가 "구현 스토리 기준으로 확정"되어야 한다고 한다. 매트릭스는 있지만 승인 여부가 애매하다. *Fix:* 해당 매트릭스를 `draft baseline` 또는 `approved MVP minimum`으로 표시하고, 승인 사실을 decision log 또는 G4/G6 증빙에 연결한 뒤 FR-13/FR-28/FR-29 story를 추출한다.

## Shape fit — strong

문서 형태는 제품에 잘 맞는다. ERP Fish는 소비자 앱이 아니라 운영 밀도가 높은 내부 ERP이므로, 긴 persona 서사보다 capability spec, 권한, 감사, 마감 가능성, 계산, 리포트 계약이 더 중요하다. 이 PRD는 그 부분에 지면을 잘 쓴다.

Brownfield/Excel 전환 맥락도 적절히 처리된다. addendum은 고객 문서와 엑셀 파일에서 뽑은 관찰을 보존하고, PRD 본문은 확정된 제품 행동과 요구사항에 집중한다. 엑셀 수식과 화면을 권위로 보지 않는다는 원칙도 반복해서 드러난다.

### Findings

없음.

## Mechanical notes

- FR continuity: FR-1부터 FR-29까지 존재하며 연속된다.
- CAP continuity: CAP-1부터 CAP-19까지 존재한다. §8은 numeric order가 아니라 phase order로 배치되어 있고, CAP ID 색인이 이를 보완한다.
- OQ continuity: OQ-1부터 OQ-18까지 존재하며 연속된다.
- UJ naming: UJ-1부터 UJ-4까지 모두 named protagonist와 scenario context를 가진다.
- Assumptions Index: inline `[ASSUMPTION]` 태그는 발견되지 않았다. §11은 남은 미확정 사항을 §10 Open Questions로 관리한다고 설명한다.
- Cross-reference risk: 검토한 범위에서 깨진 FR/CAP/OQ reference는 발견하지 못했다. 단, story extraction은 §7.1 단독이 아니라 §0.2에서 시작해야 한다.
