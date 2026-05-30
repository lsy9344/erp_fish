---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
includedFiles:
  prd:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\addendum.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\.decision-log.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\reconcile-markdown-sources.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\reconcile-workbooks.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-resolution.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md
  architecture:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\architecture.md
  epics:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\epics.md
  ux:
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\DESIGN.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\EXPERIENCE.md
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\mockups\key-closing-detail.html
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\mockups\key-dashboard.html
    - C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\mockups\key-inventory.html
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-29
**Project:** erp_fish

## Step 1: Document Discovery

### PRD Files Found

**Whole Documents:**
- None

**Sharded Documents:**
- Folder: `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2`
  - `.decision-log.md` (6,045 bytes, modified 2026-05-28 15:11:34)
  - `addendum.md` (4,082 bytes, modified 2026-05-28 14:05:22)
  - `prd.md` (27,883 bytes, modified 2026-05-28 15:11:34)
  - `reconcile-markdown-sources.md` (9,472 bytes, modified 2026-05-28 14:47:00)
  - `reconcile-workbooks.md` (10,682 bytes, modified 2026-05-28 14:48:57)
  - `review-resolution.md` (2,560 bytes, modified 2026-05-28 14:54:36)
  - `review-rubric.md` (8,813 bytes, modified 2026-05-28 14:47:24)

### Architecture Files Found

**Whole Documents:**
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\architecture.md` (43,310 bytes, modified 2026-05-28 16:41:49)

**Sharded Documents:**
- None

### Epics & Stories Files Found

**Whole Documents:**
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\epics.md` (95,047 bytes, modified 2026-05-29 00:37:03)

**Sharded Documents:**
- None

### UX Design Files Found

**Whole Documents:**
- None

**Sharded Documents:**
- Folder: `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28`
  - `.decision-log.md` (3,528 bytes, modified 2026-05-28 15:50:04)
  - `DESIGN.md` (9,715 bytes, modified 2026-05-28 15:51:54)
  - `EXPERIENCE.md` (18,208 bytes, modified 2026-05-29 00:37:16)
  - `.working\color-themes-1.html` (29,311 bytes, modified 2026-05-28 15:45:48)
  - `.working\key-closing-detail.html` (19,954 bytes, modified 2026-05-28 16:01:38)
  - `.working\key-dashboard.html` (19,076 bytes, modified 2026-05-28 15:58:49)
  - `.working\key-inventory.html` (19,095 bytes, modified 2026-05-28 16:00:14)
  - `mockups\key-closing-detail.html` (19,954 bytes, modified 2026-05-28 16:01:58)
  - `mockups\key-dashboard.html` (19,076 bytes, modified 2026-05-28 16:01:58)
  - `mockups\key-inventory.html` (18,915 bytes, modified 2026-05-29 00:37:25)

### Issues

- No duplicate whole and sharded document formats were found.
- PRD and UX are folder-based artifacts without `index.md`; selected their primary markdown files and supporting files for assessment.
- `project-context.md` was not found in the repository.

## Step 2: PRD Analysis

### Functional Requirements

FR-1: 역할 기반 로그인. 사용자는 본사 사용자 또는 지점장 역할로 로그인할 수 있다. 본사 사용자는 전체 지점 메뉴에 접근할 수 있고, 지점장은 자기 지점 장부 메뉴에 접근할 수 있으며, 로그인하지 않은 사용자는 장부 데이터에 접근할 수 없다.

FR-2: 지점 접근 제한. 지점장은 자기 지점의 일일 장부만 조회하고 입력할 수 있다. 지점장은 다른 지점 장부 목록과 상세에 접근할 수 없고, 본사 사용자는 모든 지점 장부 목록과 상세에 접근할 수 있다.

FR-3: 입력/수정 이력 기록. 시스템은 주요 입력과 수정에 대해 입력자, 수정자, 수정 시각, 변경 전 값, 변경 후 값을 기록한다. 지점장 입력과 본사 입력/수정 내역은 구분되어 표시되어야 하며, 장부 상세에서 변경 이력을 확인할 수 있어야 하고, 본사 마감 후 정정 기록은 일반 수정 이력과 구분되어야 한다.

FR-4: 지점+일자 장부 생성. 본사 사용자와 지점장은 지점+일자 기준으로 일일 장부를 열 수 있다. 같은 지점+일자에는 하나의 일일 장부가 존재하고, 장부가 없으면 입력 시작 시 생성되며, 이미 생성된 장부를 다시 열면 기존 입력값이 유지된다.

FR-5: 단계형 입력 흐름. 일일 장부 입력은 매출/결제, 비용, 매입, 재고, 손실/폐기/떨이, 근무인원/특이사항, 검토/제출 순서로 제공된다. 입력자는 각 단계를 이동할 수 있고, 검토/제출 화면에서 주요 누락 항목과 계산 요약을 확인할 수 있으며, 저장 중인 장부는 입력 중 상태로 표시된다. 검토 대기 상태는 본사 마감 전 상태이며 원본 잠금으로 처리하지 않는다.

FR-6: 매출/결제 입력. 입력자는 총매출, 현금, 카드, 기타 결제수단, 매출차액 관련 값을 입력할 수 있다. 결제수단별 금액과 총매출은 장부에 저장되고, 시스템은 매출차액을 계산하거나 표시할 수 있으며, 매출차액이 본사 기준값을 넘으면 이상 신호 후보로 표시된다.

FR-7: 비용 입력. 입력자는 비용 항목, 금액, 메모를 입력할 수 있다. 하나의 일일 장부에 여러 비용 항목을 등록할 수 있고, 비용 합계는 영업이익 계산에 반영된다.

FR-8: 매입 입력. 입력자는 품목, 규격, 단가, 수량, 매입금액을 입력할 수 있다. 지점장과 본사 사용자 모두 매입 정보를 입력할 수 있고, 본사 사용자가 관리하는 매입 기준 또는 품목 마스터를 선택해 입력할 수 있으며, 입력된 매입은 재고 흐름과 일일 요약 계산에 반영된다.

FR-9: 품목 단위 재고 입력. 입력자는 품목, 규격, 단가, 전일재고, 매입, 판매/차감, 당일재고, 재고금액, 수량을 다룰 수 있다. 재고는 품목+규격 단위로 저장되고, 냉동/생물 같은 품목 구분을 기록할 수 있으며, 전일재고, 매입, 판매/차감, 손실, 당일재고 흐름을 일자별로 추적할 수 있다. 시스템 계산 재고와 실제 입력 재고의 차이를 확인할 수 있고, 월 첫 장부의 전일재고는 월초 재고 스냅샷에서 가져오며, 이후 영업일의 전일재고는 직전 마감 장부의 당일재고에서 자동 이월된다.

FR-10: 재고 조정 기록. 본사 사용자와 지점장은 시스템 계산 재고와 실제 재고가 다를 때 재고 조정을 기록할 수 있다. 재고 조정에는 품목, 규격, 조정 전 수량/금액, 조정 후 수량/금액, 차이 수량/금액, 차이 사유, 작성자, 작성 시각이 남아야 한다. 차이 사유는 필수로 입력하거나 선택해야 하며, 재고 조정은 재고 흐름, 이상 신호, 리포트에 반영된다. 본사 마감 후 재고 조정은 원본 수정이 아니라 정정 기록으로만 추가된다.

FR-11: 손실/폐기/떨이 입력. 입력자는 손실, 폐기, 떨이 항목을 품목, 수량, 금액, 처리 유형, 사유/특이사항과 함께 입력할 수 있다. 손실 항목은 재고 흐름과 손실 리포트에 반영되고, 손실액 또는 손실 수량이 본사 기준값을 넘으면 이상 신호 후보로 표시된다.

FR-12: 근무인원/특이사항 입력. 입력자는 근무인원과 근무 관련 특이사항을 기록할 수 있다. 근무인원은 인당생산성 계산에 반영된다. 1차 범위는 직원 마스터, 근무자별 선택, 월간 근무일수 자동 집계, 지각/조퇴, 출퇴근/급여 수준의 상세 근태 관리를 포함하지 않는다.

FR-13: 핵심 지표 계산. 시스템은 매출, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 평균재고, 평균매출, 매출대비 재고비율, 최고매출품목, 최고매출품목 매출액, 매출차액, 재고/손실 관련 지표를 계산한다. 각 일일 장부 상세에서 계산값을 확인할 수 있어야 하고, 관제판과 리포트는 같은 계산 기준을 사용해야 하며, 계산 기준이 확정되지 않은 항목은 Open Questions의 결정 등급에 따라 처리한다.

FR-14: 입력 검증. 시스템은 필수 입력값 누락, 결제수단 합계와 총매출 차이, 상품별 판매금액 합계와 총매출 차이, 재고/손실 이상 후보를 표시한다. 검토/제출 화면에서 주요 누락과 이상 후보를 확인할 수 있어야 하고, 이상 후보가 있어도 본사 사용자는 장부를 열어 판단할 수 있어야 한다. 검증 결과는 본사 마감 여부와 구분되어 표시되고, 영업 상태가 휴무일인 장부는 미입력 장부와 구분되어 표시된다.

FR-15: 전체 지점 관제판. 본사 사용자는 오늘/어제 기준 전체 지점의 장부 상태를 한 화면에서 볼 수 있다. 각 지점은 한 줄로 표시되고, 각 행에는 영업 상태, 장부 상태, 이상 신호, 매출, 이익률, 매출차액, 손실 여부, 마지막 수정자, 마지막 수정 시각, 본사 마감 여부가 표시된다. 본사 사용자는 지점 행을 선택해 일일 장부 상세로 이동할 수 있다.

FR-16: 이상 신호 표시. 시스템은 매출/이익률 급락, 매출차액, 재고/손실 이상을 이상 신호로 표시한다. 이상 신호는 지점 행에서 눈에 띄게 표시되어야 하고, 한 지점에 여러 이상 신호가 동시에 표시될 수 있으며, 이상 신호가 없는 지점도 관제판에서 상태를 확인할 수 있다.

FR-17: 이상 신호 기준값 설정. 본사 사용자는 이상 신호 기준값을 설정할 수 있다. 본사는 매출 하락률, 이익률 하락폭, 매출차액 금액, 손실액, 재고 차이 기준을 설정할 수 있고, 기준값 변경 후 새 관제판 조회에는 변경된 기준이 반영되어야 하며, 기준값 변경 이력이 남아야 한다. 기준값은 고정 코드가 아니라 본사 운영 설정으로 저장된다.

FR-18: 본사 직접 입력/수정. 본사 사용자는 모든 지점의 본사 마감 전 일일 장부를 직접 입력하거나 수정할 수 있다. 본사 사용자는 지점장 입력값을 보완하거나 수정할 수 있고, 본사 수정은 변경 이력에 본사 사용자 수정으로 기록되며, 수정 후 계산값과 이상 신호가 갱신된다.

FR-19: 본사 마감과 원본 잠금. 본사 사용자는 일일 장부를 본사 마감 처리할 수 있다. 본사 마감 후 원본 장부 입력값은 수정할 수 없고, 본사 마감 상태는 관제판과 장부 상세에서 표시되며, 지점장은 본사 마감된 장부를 수정할 수 없다.

FR-20: 마감 후 정정 기록. 본사 마감 후 오류가 발견되면 본사 사용자는 원본을 수정하지 않고 정정 기록을 추가할 수 있다. 정정 기록에는 작성자, 작성 시각, 대상 항목, 원본값, 정정값, 사유가 남아야 하며, 정정 기록은 삭제되거나 원본 수정으로 합쳐지지 않는다. 장부 상세에서 원본값과 정정 반영값을 구분해 볼 수 있다.

FR-21: 정정 반영값 사용. 관제판과 리포트의 기본 숫자는 정정 반영값을 사용한다. 정정 기록 추가 후 관제판과 리포트 숫자가 정정 반영값으로 표시되어야 하고, 사용자는 상세에서 원본값과 정정 반영값의 차이를 확인할 수 있다.

FR-22: 지점 마스터 관리. 본사 사용자는 지점명과 활성/비활성 상태를 관리할 수 있다. 비활성 지점은 신규 장부 입력 대상에서 제외할 수 있고, 과거 장부 조회를 위해 비활성 지점 데이터는 보존된다.

FR-23: 사용자/권한 관리. 본사 사용자는 본사 사용자와 지점장 계정, 지점 접근 권한을 관리할 수 있다. 지점장 계정은 하나 이상의 지점에 연결되고, 권한 변경 후 접근 범위가 즉시 반영된다.

FR-24: 품목 마스터 관리. 본사 사용자는 품목명, 구분, 규격, 기본 단가를 관리할 수 있다. 장부 입력자는 품목 마스터에서 품목을 선택할 수 있고, 장부 입력 시 실제 단가와 수량은 장부 상황에 맞게 입력/조정할 수 있으며, 품목 마스터 변경은 과거 장부의 원본 입력값을 임의로 바꾸지 않는다.

FR-25: 매입 기준 관리. 본사 사용자는 매입 관련 기준 또는 기본 정보를 관리할 수 있다. 매입 입력 시 본사 기준 정보를 선택하거나 참조할 수 있고, 본사와 지점장 모두 장부에 매입 정보를 입력할 수 있다.

FR-26: 코드 관리. 본사 사용자는 결제수단, 비용 항목, 손실 유형 같은 장부 입력 코드를 관리할 수 있다. 장부 입력 화면에서 관리 코드가 선택지로 제공되고, 비활성 코드는 신규 입력 선택지에서 제외할 수 있으며, 과거 장부의 기존 코드 표시는 유지된다.

FR-27: 일별 아침 회의 리포트. 본사 사용자는 전체 지점의 일별 회의용 요약을 볼 수 있다. 리포트는 지점별 마감 상태, 이상 신호, 매출, 이익률, 매출차액, 손실 현황을 보여주고, 기본 숫자는 정정 반영값을 사용하며, 원본값과 정정 반영값 차이는 상세에서 확인할 수 있다.

FR-28: 지점별 기간 비교. 본사 사용자는 선택 기간의 지점별 실적을 비교할 수 있다. 비교 항목은 매출, 매출이익, 이익률, 영업이익, 인당생산성, 평균재고, 평균매출, 매출대비 재고비율, 손실을 포함한다. 지점별 비교가 가능해야 하고, 1차 리포트는 시스템에 입력된 신규 데이터를 기준으로 하며, 과거 엑셀 일괄 이관 데이터는 1차 필수 전제로 삼지 않는다. 미입력, 입력 중, 검토 대기, 본사 마감, 휴무일 데이터는 구분되어 집계된다.

FR-29: 월간 지점 요약. 본사 사용자는 지점별 월간 실적, 마감 현황, 주요 이상 항목, 손실/재고 흐름 요약을 볼 수 있다. 월과 지점을 선택해 요약을 볼 수 있어야 하고, 마감되지 않은 장부가 있으면 요약에서 구분되며, 월간 요약은 최고매출품목, 최고매출품목 매출액, 평균재고, 평균매출, 매출대비 재고비율을 포함한다.

**Total FRs:** 29

### Non-Functional Requirements

NFR-1: 권한 보안. 본사 사용자와 지점장의 접근 범위는 서버 기준으로 강제되어야 한다.

NFR-2: 감사 추적. 마감, 정정, 주요 입력/수정, 기준값 변경은 누가 언제 무엇을 바꿨는지 추적 가능해야 한다.

NFR-3: 데이터 보존. 본사 마감 후 원본 장부는 보존되어야 하며, 정정 기록으로 덮어쓰면 안 된다.

NFR-4: 반응형 웹. 지점장 입력 화면은 PC, 태블릿, 모바일 웹에서 사용할 수 있어야 한다.

NFR-5: 운영 속도. 본사 관제판 기본 조회는 10개 내외 지점 기준 3초 안에 지점 목록과 이상 신호를 표시하는 것을 목표로 한다.

NFR-6: 모바일 사용성. 단계형 장부 입력의 핵심 흐름은 최소 390px 폭의 모바일 화면에서 사용할 수 있어야 한다.

NFR-7: 엑셀 의존 감소. 1차 제품은 기존 엑셀의 목적을 대체하되, 엑셀 수식이나 서식 구조를 그대로 복제하는 것을 목표로 하지 않는다.

**Total NFRs:** 7

### Additional Requirements

- 장부 상태는 미입력, 입력 중, 검토 대기, 본사 마감으로 정의된다. 지점장 제출 또는 검토 대기 전환은 원본 잠금이 아니며, 원본 장부가 잠기는 시점은 본사 마감이다.
- 영업 상태는 영업일과 휴무일로 구분된다.
- 1차 계산 기준은 총매출, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 재고금액, 평균재고, 평균매출, 매출대비 재고비율, 최고매출품목, 매출차액 정의를 포함한다.
- 1차 제외 범위는 텔레그램 알림, 이카운트 연동, POS/카드 매출 자동 연동, AI 이미지 식별, 설날 등 특수 기간 비교 리포트, 상세 근태 관리, 직원 마스터, 근무자별 선택, 월간 근무일수 자동 집계, 지각/조퇴 상세 관리, 고급 재고 신선도/입고일 추적, 과거 엑셀 데이터 일괄 이관이다.
- MVP 포함 범위는 본사/지점장 로그인, 지점+일자 장부 생성, 단계형 장부 입력, 매출/결제, 비용, 매입, 재고, 손실/폐기/떨이, 근무인원/특이사항, 관제판, 이상 신호, 재고 조정, 기준값 설정, 본사 직접 입력/수정, 본사 마감, 정정 기록, 마스터 관리, 일별/기간/월간 리포트를 포함한다.
- 성공 지표는 아침 회의 준비 가능성, 본사 마감 통제, 마감 후 추적 가능성, 지점 입력 완결성, 본사 기준 운영이다.
- Open Questions는 매출차액 이상 신호 기준, 30%단가 의미, 품목명/구분/규격 분리 방식, 운영 지점과 과거 지점 목록 확정, 과거 엑셀 이관 필요 여부와 결측값 정책이다.
- `review-resolution.md` 기준으로 이전 리뷰의 차단 이슈였던 상태/잠금 정책, 재고 조정, 계산식/KPI, 과거 이관 범위, 직원/근무표 범위, 매입 입력 권한은 PRD에 반영 또는 정책 유지로 처리되었다.

### PRD Completeness Assessment

PRD는 `final` 상태이고 FR-1부터 FR-29까지 연속된 기능 요구사항과 7개 전역 NFR을 제공한다. 본사 관제, 지점 입력, 마감/정정, 재고 조정, 이상 신호, 리포트가 1차 제품 목표와 직접 연결되어 있어 에픽 커버리지 검증을 진행할 수 있다.

주의할 점은 Open Questions 일부가 스토리 작성 전 필수 결정으로 남아 있다는 것이다. 특히 매출차액 이상 신호 기준, 30%단가 의미, 품목 마스터 분리 방식은 구현 상세와 테스트 기준에 영향을 준다. 다음 단계에서는 epics/stories가 이 질문들을 무시하고 확정처럼 구현하지 않았는지, 또는 적절한 결정 지점으로 남겼는지 확인해야 한다.

## Step 3: Epic Coverage Validation

### Epic FR Coverage Extracted

- FR1: Epic 1 - 본사 사용자와 지점장이 역할 기반으로 로그인한다.
- FR2: Epic 1 - 지점장은 자기 지점만 접근하고, 본사는 모든 지점에 접근한다.
- FR3: Epic 1 - 주요 입력/수정 이력과 본사/지점장 변경 주체를 기록한다.
- FR4: Epic 2 - 지점+일자 기준 일일 장부를 생성하고 다시 열 수 있다.
- FR5: Epic 2 - 일일 장부를 단계형 입력 흐름으로 작성한다.
- FR6: Epic 2 - 매출/결제와 매출차액 관련 값을 입력하고 계산/표시한다.
- FR7: Epic 2 - 비용 항목과 비용 합계를 장부와 영업이익 계산에 반영한다.
- FR8: Epic 2 - 매입 품목, 규격, 단가, 수량, 금액을 입력하고 기준정보를 참조한다.
- FR9: Epic 2 - 품목+규격 단위 재고 흐름과 전일재고 이월을 관리한다.
- FR10: Epic 2 - 재고 조정과 차이 사유를 기록하고 재고 흐름에 반영한다.
- FR11: Epic 2 - 손실/폐기/떨이 항목을 입력하고 재고/손실 리포트에 반영한다.
- FR12: Epic 2 - 근무인원과 특이사항을 입력하고 인당생산성 계산에 반영한다.
- FR13: Epic 2 - 장부 상세와 이후 관제/리포트가 함께 사용할 핵심 지표를 계산한다.
- FR14: Epic 2 - 누락, 합계 불일치, 재고/손실 이상 후보를 검토 화면에 표시한다.
- FR15: Epic 3 - 본사가 전체 지점의 장부 상태와 이상 신호를 관제판에서 본다.
- FR16: Epic 3 - 매출/이익률 급락, 매출차액, 재고/손실 이상 신호를 표시한다.
- FR17: Epic 3 - 본사가 이상 신호 기준값을 설정하고 변경 이력을 남긴다.
- FR18: Epic 4 - 본사가 본사 마감 전 장부를 직접 입력하거나 수정한다.
- FR19: Epic 4 - 본사가 장부를 마감하고 원본 장부를 잠근다.
- FR20: Epic 4 - 본사 마감 후 원본을 바꾸지 않고 정정 기록을 추가한다.
- FR21: Epic 4 and Epic 5 - Epic 4 covers correction-applied values for ledger detail and dashboard; Epic 5 covers correction-applied values for reports.
- FR22: Epic 1 - 본사가 지점명과 활성/비활성 상태를 관리한다.
- FR23: Epic 1 - 본사가 사용자 계정과 지점 접근 권한을 관리한다.
- FR24: Epic 1 - 본사가 품목명, 구분, 규격, 기본 단가를 관리한다.
- FR25: Epic 1 - 본사가 매입 기준 또는 기본 정보를 관리한다.
- FR26: Epic 1 - 본사가 결제수단, 비용 항목, 손실 유형 같은 코드를 관리한다.
- FR27: Epic 5 - 본사가 전체 지점의 일별 아침 회의 리포트를 본다.
- FR28: Epic 5 - 본사가 선택 기간의 지점별 실적을 비교한다.
- FR29: Epic 5 - 본사가 지점별 월간 실적, 마감 현황, 손실/재고 흐름 요약을 본다.

**Total FRs in epics:** 29

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR1 | 역할 기반 로그인 | Epic 1 | Covered |
| FR2 | 지점 접근 제한 | Epic 1 | Covered |
| FR3 | 입력/수정 이력 기록 | Epic 1 | Covered |
| FR4 | 지점+일자 장부 생성 | Epic 2 | Covered |
| FR5 | 단계형 입력 흐름 | Epic 2 | Covered |
| FR6 | 매출/결제 입력 | Epic 2 | Covered |
| FR7 | 비용 입력 | Epic 2 | Covered |
| FR8 | 매입 입력 | Epic 2 | Covered |
| FR9 | 품목 단위 재고 입력 | Epic 2 | Covered |
| FR10 | 재고 조정 기록 | Epic 2 | Covered |
| FR11 | 손실/폐기/떨이 입력 | Epic 2 | Covered |
| FR12 | 근무인원/특이사항 입력 | Epic 2 | Covered |
| FR13 | 핵심 지표 계산 | Epic 2 | Covered |
| FR14 | 입력 검증 | Epic 2 | Covered |
| FR15 | 전체 지점 관제판 | Epic 3 | Covered |
| FR16 | 이상 신호 표시 | Epic 3 | Covered |
| FR17 | 이상 신호 기준값 설정 | Epic 3 | Covered |
| FR18 | 본사 직접 입력/수정 | Epic 4 | Covered |
| FR19 | 본사 마감과 원본 잠금 | Epic 4 | Covered |
| FR20 | 마감 후 정정 기록 | Epic 4 | Covered |
| FR21 | 정정 반영값 사용 | Epic 4 and Epic 5 | Covered |
| FR22 | 지점 마스터 관리 | Epic 1 | Covered |
| FR23 | 사용자/권한 관리 | Epic 1 | Covered |
| FR24 | 품목 마스터 관리 | Epic 1 | Covered |
| FR25 | 매입 기준 관리 | Epic 1 | Covered |
| FR26 | 코드 관리 | Epic 1 | Covered |
| FR27 | 일별 아침 회의 리포트 | Epic 5 | Covered |
| FR28 | 지점별 기간 비교 | Epic 5 | Covered |
| FR29 | 월간 지점 요약 | Epic 5 | Covered |

### Missing Requirements

No missing FR coverage was found. Every PRD FR from FR1 through FR29 appears in the epics document's FR Coverage Map.

No extra FR numbers were found in the epics coverage map.

### Coverage Statistics

- Total PRD FRs: 29
- FRs covered in epics: 29
- Coverage percentage: 100%

## Step 4: UX Alignment Assessment

### UX Document Status

Found.

- UX design tokens and components: `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\DESIGN.md`
- UX journeys and information architecture: `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\EXPERIENCE.md`
- UX decision log: `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\ux-designs\ux-erp_fish-2026-05-28\.decision-log.md`
- Key mockups: `mockups\key-dashboard.html`, `mockups\key-closing-detail.html`, `mockups\key-inventory.html`

### UX to PRD Alignment

The UX documentation aligns with the PRD's main user-facing requirements.

- Role-based IA matches PRD roles: 본사 gets 관제판, 리포트, 기준정보, 설정; 지점장 gets today's ledger and store entry flows.
- 장부 단계형 입력, 재고 입력, 손실 입력, 과거 장부, 검토/제출, 본사 마감, 정정 표시 all map back to PRD FR-4 through FR-21.
- 본사 관제판, 이상 신호, 마감 상태, 정정 반영값, and 리포트 journeys map to PRD FR-15 through FR-29.
- Mobile requirements are reflected through 390px minimum width and bottom navigation for 지점장 core entry flows.
- The current main UX IA and epics both use 지점장 mobile tabs `장부`, `재고`, `손실`; the previous `코멘트` tab issue is no longer present in the active IA or story requirements.

### UX to Architecture Alignment

Architecture supports the UX choices.

- Next.js App Router, Server Actions, Auth.js, Prisma, PostgreSQL, shadcn/ui, Tailwind CSS, TanStack Table, and Recharts provide the expected implementation base for the UX.
- Server-side authorization and shared calculation services support PRD/UX needs for role-based access, audit trails, dashboard data, report data, and correction-applied values.
- Architecture performance targets match the formal PRD NFR: dashboard data for about 10 stores should display within 3 seconds.
- Responsive design requirements are covered through the 390px mobile target, desktop sidebar, mobile bottom navigation, and accessible shadcn primitives.
- Revalidation requirements after ledger, closing, correction, settings, and master-data changes support the UX expectation that 관제판 and 리포트 avoid stale values.

### Alignment Issues

No blocking UX/PRD/Architecture misalignment was found.

### Warnings

- UX decision log D-010 still mentions the old mobile bottom tab structure `(장부/재고/손실/코멘트)`. The active `EXPERIENCE.md` and `epics.md` have removed `코멘트`, so the decision log should be updated to avoid stale scope signals.
- UX key flow says the dashboard Skeleton disappears within 1 second, while PRD, Architecture, and epics use the formal 3-second target for about 10 stores. Treat the 1-second line as aspirational or revise it for consistency.
- Color contrast verification remains an implementation check. UX calls out the need to verify primary/warning contrast, and the epics include WCAG 2.2 AA acceptance criteria.

## Step 5: Epic Quality Review

### Review Scope

- Epics reviewed: 5
- Stories reviewed: 30
- User-story format checked: all stories include `As`, `I want`, and `So that`
- Acceptance criteria format checked: all stories use Given/When/Then-style criteria
- Forward dependency search completed across the full epics document

### Epic Structure Validation

| Epic | User Value Focus | Independence | Assessment |
| --- | --- | --- | --- |
| Epic 1: 안전한 업무 공간과 기준정보 관리 | 본사/지점장 로그인, 권한, 기준정보 관리 | Stands alone as the authenticated base and master-data foundation | Pass |
| Epic 2: 지점 일일 장부 입력과 검토 제출 | 지점장이 일일 장부를 작성하고 제출 | Uses Epic 1 auth/master-data output only | Pass |
| Epic 3: 본사 관제판과 이상 신호 운영 | 본사가 지점 상태와 이상 신호를 운영 | Uses Epic 1-2 ledger and settings output | Pass |
| Epic 4: 본사 검토, 마감, 정정 기록 | 본사가 장부를 보완, 마감, 정정 | Uses Epic 1-3 ledger/dashboard output | Pass |
| Epic 5: 회의와 기간/월간 리포트 | 본사가 회의/기간/월간 리포트를 확인 | Uses prior ledger, correction, calculation output | Pass |

No technical-only epic was found. Epic 1 includes starter setup, but Architecture explicitly requires a T3/Next.js/Prisma/Auth/shadcn starter baseline, and Story 1.1 ties that setup to a usable protected 본사 workspace. This satisfies the starter-template exception without turning the whole epic into a technical milestone.

### Story Quality Findings

#### Critical Violations

None.

The previous critical issue around Story 4.5 has been resolved. Story 4.5 now limits its scope to 장부 상세/관제판 correction-applied values and no longer requires future Epic 5 report screens to be complete.

#### Major Issues

None.

No story depends on a future story. The only explicit cross-story references found are Story 5.3, Story 5.4, and Story 5.5 referencing Story 5.2's detail path. This is a backward same-epic reference and is acceptable if implementation order keeps Story 5.2 before 5.3-5.5.

#### Minor Concerns

- Several stories are likely larger implementation slices and should be watched during detailed story creation: Story 2.4, Story 2.7, Story 3.1, Story 4.3, Story 5.1, Story 5.3, and Story 5.5. They are still coherent user-value slices, but may need subtasking or a split if implementation estimates become high.
- Story 4.5's title is phrased as a system behavior rather than a direct user action. Its body is a proper 본사 user story, so this is naming polish rather than a readiness blocker.
- Story 5.3, Story 5.4, and Story 5.5 intentionally depend on Story 5.2's report-detail path. This is not a forward dependency, but the implementation plan should preserve that sequence.

### Database and Entity Timing

No evidence was found that Story 1.1 creates all product tables upfront. The epics set Prisma/PostgreSQL as the data foundation and then introduce domain entities when their business stories need them: stores/users/master data in Epic 1, ledgers and inventory in Epic 2, anomaly settings in Epic 3, closing/correction records in Epic 4, and report queries in Epic 5.

This sequencing is acceptable. During detailed story creation, each story should include only the schema/migration work needed for that story's behavior.

### Best Practices Compliance Checklist

| Check | Result |
| --- | --- |
| Epics deliver user value | Pass |
| Epics can function in sequence without future epics | Pass |
| Stories are independently completable within their sequence | Pass |
| No forward dependencies | Pass |
| Database tables created when first needed | Pass with implementation watch |
| Acceptance criteria are clear and testable | Pass |
| Traceability to FRs maintained | Pass |

### Remediation Guidance

- Keep Story 5.2 before Story 5.3-5.5 in the implementation order.
- During `bmad-create-story`, re-check large stories for split potential before handing them to development.
- Preserve the fix to Story 4.5: dashboard correction-applied behavior belongs in Epic 4; report correction-applied behavior belongs in Epic 5.

## Step 6: Summary and Recommendations

### Overall Readiness Status

READY

The planning artifacts are ready to proceed into implementation. PRD requirements are complete enough for implementation planning, all 29 PRD FRs are covered by epics, UX aligns with PRD and Architecture, and no blocking epic/story quality violations remain.

### Critical Issues Requiring Immediate Action

None.

### Major Issues Requiring Immediate Action

None.

### Non-Blocking Items to Address

1. Update UX decision log D-010 so it no longer lists the removed `코멘트` mobile tab.
2. Decide whether the UX key-flow statement "Skeleton disappears within 1 second" is aspirational or should be revised to match the formal 3-second target.
3. Keep color contrast verification in the implementation checklist, especially primary and warning colors.
4. Carry PRD Open Questions into detailed story creation, especially 매출차액 기준, 30%단가 의미, 품목명/구분/규격 분리, and historical data policy.
5. Watch larger stories during story creation and split only if implementation estimates become too large.
6. Preserve the implementation order where Story 5.2 precedes Story 5.3, Story 5.4, and Story 5.5.

### Recommended Next Steps

1. Run `[SP] Sprint Planning` with `bmad-sprint-planning` in a fresh context. This is the next required BMad implementation-phase step.
2. After sprint planning, run `[CS] Create Story` with `bmad-create-story` for the next planned story.
3. Validate the generated story with `[VS] Validate Story`, then proceed to `[DS] Dev Story` with `bmad-dev-story`.

### Final Note

This assessment identified 0 critical issues, 0 major issues, and 6 non-blocking cleanup or implementation-watch items across UX consistency, PRD open questions, and story execution planning. Implementation can proceed after sprint planning, with the minor items tracked during story preparation.

**Assessor:** John, Product Manager
**Assessment Date:** 2026-05-29
