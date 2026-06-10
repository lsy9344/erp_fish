# Validation Report — ERP Fish PRD

- **PRD:** `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- **Rubric:** `C:\Code\Project\erp_fish\.agents\skills\bmad-prd\assets\prd-validation-checklist.md`
- **Run at:** 2026-06-10T17:34:43+09:00
- **Grade:** Poor

## Overall verdict

이 PRD는 본사 관제탑 중심의 MVP와 2026-06-10 승인 추가 구현 범위를 비교적 정직하게 분리했고, FR/CAP별 검증 조건도 대부분 후속 UX, 아키텍처, 스토리 작성자가 추출할 수 있는 수준이다. 다만 문서 스스로 `draft`와 구현 게이트를 선언하듯이, 계산/FIFO/권한/리포트 계약의 일부 결정은 아직 닫히지 않았고, 승인 추가 구현 범위의 일부 CAP 추적성이 끊겨 최종 구현 승인용 PRD로 쓰기에는 추가 정리가 필요하다.

비판 리뷰는 더 보수적으로 보았다. 특히 MVP 필수 FR 일부가 `스토리 작성 전 필수` Open Question에 걸려 있고, `매출차액`과 재고 이월/정정 연쇄 정책이 아직 제품 결정으로 닫히지 않아, 이 상태로 에픽/스토리를 만들면 구현팀이 정책을 대신 정할 위험이 있다.

## Dimension verdicts

- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — strong

## Findings by severity

### Critical (3)

**[Adversarial]** — MVP 필수 범위 안에 스토리 작성 전 필수 OQ가 남아 있음 (§0.2, §10)  
FR-1~FR-29는 MVP 필수지만, OQ-1~OQ-3이 각각 매출차액, `30%단가`, 품목 분리 기준을 막고 있다. 이 질문들은 FR-6/FR-14/FR-16/FR-17, FR-9/FR-13, FR-24에 직접 연결된다.  
Fix: MVP FR별 `스토리 작성 가능/불가` 상태를 표시하고, OQ-1~OQ-3이 닫히기 전에는 관련 FR을 discovery story로 분리한다.

**[Adversarial]** — `매출차액` 정의가 수식, 용어, 검증 조건 사이에서 안전하지 않음 (§3, §4.3, FR-6, FR-14)  
용어 정의와 계산표가 같은 뜻으로 읽히지 않고, 손실/조정 반영 방향과 양수/음수 표시 기준이 모호하다.  
Fix: 결제 차액, 상품 합계 차액, 손실/조정 반영 차액으로 쪼개거나, 단일 지표라면 입력 예시 3~5개와 부호/표시/임계값 규칙을 확정한다.

**[Adversarial]** — 재고 이월과 마감 후 정정 반영의 연쇄 갱신 정책이 닫히지 않음 (FR-9, FR-20, FR-21)  
마감 후 정정이 이후 장부의 전일재고, 당일재고, FIFO 잔량, 리포트 집계에 자동 전파되는지와 본사 확인/확정 절차가 부족하다.  
Fix: 영향 날짜 범위 산정, 재계산 큐, 본사 확인/확정 이벤트, 리포트 표시값, 재마감 필요 여부를 상태 전이로 명시한다.

### High (10)

**[Rubric + Adversarial]** — 승인 추가 구현의 실제 릴리스 경계가 아직 PRD 밖에 있음 (§0.2, §8)  
CAP-1~CAP-18은 승인 추가 구현으로 묶였지만, MVP 동시 배포인지 후속 배포인지가 에픽 계획으로 밀려 있다.  
Fix: CAP별 `MVP와 동시`, `MVP 직후`, `Blocked by OQ`, `Optional`, `Contract/Ops only` 중 하나를 붙인다.

**[Rubric]** — CAP-14가 CAP 구현 순서/추적 표에서 빠져 있음 (§8, §8.4, §10)  
§8.4에는 CAP-14가 있고 OQ-9도 CAP-14를 참조하지만, §8의 CAP 구현 순서 표에는 CAP-14가 없다.  
Fix: CAP-14를 phase, 의존/선행, Related FR/SM/OQ와 함께 §8 표에 추가한다.

**[Adversarial]** — 권한 프로파일과 FR의 넓은 “본사 사용자” 표현이 충돌할 수 있음 (§4.1, FR-18~FR-26)  
권한 프로파일은 세분화됐지만 여러 FR은 여전히 “본사 사용자”를 단일 권한처럼 쓴다.  
Fix: FR-18~FR-26, CAP-6, CAP-13, CAP-15에 `권한 프로파일 x action` 매트릭스를 추가한다.

**[Adversarial]** — 동시 편집 정책이 공동 입력 구조에 비해 얕음 (FR-4, FR-5, §5)  
본사와 지점장이 같은 장부를 수정할 수 있지만 필드 단위 병합, 장부 단위 잠금, optimistic locking 기준이 없다.  
Fix: 충돌 감지 단위, 비교 화면, 저장 재시도 방식, 본사 강제 수정 중 편집 제한 여부를 정한다.

**[Adversarial]** — 일괄 마감의 hard stop 조건이 없음 (CAP-15)  
검증 오류나 이월 공백도 사유가 있으면 마감 가능한 구조로 읽힌다. 어떤 오류가 절대 마감 불가인지 없다.  
Fix: hard stop, override 가능 오류, 경고만 표시할 항목을 표로 구분한다.

**[Adversarial]** — 업로드 commit 이후 취소/재처리/마감 장부 처리 정책이 부족함 (CAP-6)  
업로드 상태 모델과 마감 전/후 재처리 규칙이 없다.  
Fix: `preview`, `committed`, `voided`, `reprocessed`, `failed` 상태와 행 단위 idempotency, 취소 감사 이벤트를 정의한다.

**[Adversarial]** — 리포트 집계 규칙이 아직 구현자 해석에 의존함 (§4.7, FR-27~FR-29)  
필수 컬럼은 있지만 평균매출, 평균재고, 증감률, 마감일수에서 상태별 분모/분자 규칙이 부족하다.  
Fix: 주요 지표별 분자/분모, 제외 상태, `데이터 부족`, 휴무일, 미마감, 정정 반영/원본 export 규칙을 예시와 함께 확정한다.

**[Adversarial]** — MVP 품목 단위 원가/수량 계산 기준이 섞여 있음 (§4.3, FR-9, CAP-7, OQ-2)  
FIFO 전 MVP에서 재고금액과 매출원가를 어떤 단가로 계산하는지 단일 기준이 부족하다.  
Fix: MVP 원가 계산 단가 우선순위, 수량 x 단가 변환, 품목별 합산, 미확정 단가 표시/마감 가능 여부를 정한다.

**[Adversarial]** — 백업/복구 핵심 목표가 계약 문서로 너무 밀려 있음 (§5, CAP-19)  
RPO/RTO가 없으면 DB 백업, 업로드 원본 보관, 감사 로그 저장 방식 설계가 흔들린다.  
Fix: 제품 PRD에 최소 RPO/RTO, 감사 로그 보존 기간, 업로드 원본/파싱 결과 보관 기준을 둔다.

**[Rubric]** — 게이트 닫힘 절차의 실행 소유자와 증빙 산출물이 약함 (§0.1)  
G2~G5는 결과 조건은 있지만 누가 어떤 산출물로 닫는지 약하다.  
Fix: 각 게이트에 owner와 증빙 산출물, 예: `PM 승인 계산표`, `API 권한 매트릭스`, `리포트 컬럼 계약`, `FIFO 정책 메모`를 붙인다.

### Medium (14)

**[Rubric]** — CAP phase 순서의 전략 근거가 약함 (§8)  
Fix: phase별 목표와 다음 phase로 넘어가는 조건을 1~2문장씩 추가한다.

**[Rubric]** — 승인 추가 구현 성공 지표 일부가 운영 결과보다 기능 존재에 가까움 (§9)  
Fix: 업로드 재작업률, FIFO `확인 필요` 비율, 리포트 수동 보정 건수 같은 운영 지표를 보강한다.

**[Rubric]** — 일부 UI/CAP 검증 조건이 주관적임 (§8.3, §8.4)  
Fix: 리사이징 대상 컬럼, 저장 여부, 최소/최대 폭, 차트 유형, 필수 축/범례/필터를 지정한다.

**[Rubric]** — CAP-14 손실액 계산은 OQ-9에 막혀 완료 기준이 반쪽임 (§8.4, §10)  
Fix: `OQ-9 닫힘 전 구현 불가`를 명시하고, 희망 판매가 버전 관리와 변경 적용 시점을 추가한다.

**[Rubric]** — 최종화 전 필수 질문의 실행 순서가 한눈에 보이지 않음 (§10)  
Fix: §10 위에 `최종 PRD 전 필수`, `MVP 스토리 전 필수`, `확장 Epic 전 필수`, `계약 전 필수` 실행 순서 목록을 추가한다.

**[Rubric]** — CAP ID 순서가 구현 순서와 숫자 순서를 동시에 표현해 읽는 비용이 있음 (§8)  
Fix: 표 제목을 `구현 권장 순서`로 바꾸고 숫자순 CAP ID 인덱스를 추가한다.

**[Adversarial]** — 인증/계정 보안 요구가 운영 매뉴얼로 밀려 있음 (FR-1)  
Fix: 최소 비밀번호 기준, 계정 잠금/해제, 비활성 계정 세션 종료, 관리자 초기화 감사 이벤트를 PRD에 직접 둔다.

**[Adversarial]** — 작성자 이름 세션 캐싱과 로그인 사용자/감사 로그 관계가 불명확함 (CAP-16)  
Fix: `로그인 계정`, `작성자 표시명`, `실제 입력 담당자`의 관계를 정의한다.

**[Adversarial]** — 희망 판매가 기준 손실액의 시간 정책이 약함 (CAP-14)  
Fix: 영업 개시 기준 시각, 변경 잠금, 예외 입력, 미입력 처리, 본사 override 감사 규칙을 정한다.

**[Adversarial]** — 직원/급여 참고 범위의 민감도 관리가 부족함 (CAP-1, CAP-9)  
Fix: 직원 정보 필드별 조회/수정 권한, export, 비활성/퇴사 처리, 지점 간 노출 범위를 정한다.

**[Adversarial]** — 알림 메시지 보안과 내용 제한이 약함 (CAP-11, CAP-13)  
Fix: 템플릿별 허용 필드, 수신자 권한별 마스킹, 그룹 채널 제한, 발송 로그 보관 기준을 추가한다.

**[Adversarial]** — CAP-18 대시보드 리사이징 UX acceptance가 부족함 (CAP-18)  
Fix: 사용자별 저장, reset, 최소/최대 크기, 필수 컬럼 보호, 반응형 동작을 추가한다.

**[Adversarial]** — 마스터 데이터 변경 적용 시점이 일부만 정의됨 (FR-22~FR-26)  
Fix: effective dating, 작성 중 장부 반영 여부, 비활성 코드 수정 가능 여부, 업로드 매핑 우선순위를 정한다.

**[Rubric]** — OQ-19/OQ-20 흡수 근거가 후속 독자에게 덜 직관적임 (§10, .decision-log.md)  
Fix: §10 또는 decision log에 제거된 OQ가 본문 규칙으로 흡수되었다는 짧은 주석을 남긴다.

### Low (6)

**[Rubric]** — CAP-12의 마지막 검증 조건이 앞 조건을 반복함 (§8.6)  
Fix: 검색/필터 가능한 화면/API 결과로 바꾼다.

**[Rubric]** — FR-16의 “눈에 띄게 표시” 기준이 시각적으로 느슨함 (§4.4)  
Fix: 색상 외 아이콘/텍스트 병행, 다중 신호 정렬, 접근성 기준을 추가한다.

**[Rubric]** — brownfield 기준 기존 엑셀 대체 흐름이 FR별로 완전히 붙어 있지는 않음 (§4, addendum)  
Fix: 필요한 경우 FR 묶음별 `대체하는 기존 엑셀 흐름` 한 줄을 추가한다.

**[Adversarial]** — “Excel 수준” 표현이 아직 기준 혼선을 만들 수 있음 (CAP-3)  
Fix: 비교 대상 항목, 제외 항목, 참고 매핑 표, 숫자 불일치 시 우선 기준을 명시한다.

**[Adversarial]** — 기술 용어가 운영자용 PRD 문맥에 섞여 있음 (§4, §8)  
Fix: 기술 용어를 용어집에 추가하거나 쉬운 말로 바꾼다.

**[Rubric]** — `본사 사용자`가 상위 표현이라 후속 산출물에서 세부 프로파일명을 기준으로 추출해야 함 (§4.1)  
Fix: 후속 UX/API 산출물에서는 `본사 관리자`, `마감 담당자`, `조회 전용 본사` 같은 세부 권한명을 기준으로 쓴다.

## Mechanical notes

- FR 번호는 FR-1~FR-29까지 연속이다.
- CAP 번호는 CAP-1~CAP-19가 본문에 존재하지만, §8의 CAP 구현 순서 표에서 CAP-14가 누락되어 있다.
- OQ 번호는 OQ-1~OQ-18까지 연속이다.
- `[ASSUMPTION]`, `[NOTE FOR PM]`, `[NON-GOAL]` 인라인 태그는 현재 본문에 없다.
- UJ-1~UJ-4는 모두 named protagonist를 가진다.

## Reviewer files

- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-adversarial-general.md`
