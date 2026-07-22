# 2026-07-22 재고·매출 개선 구현 결과

## 완료 범위

- 월초 재고단가 표시용 안전 DTO 연결
- 사용자 용어를 `판매한 가격`으로 통일
- 재고 저장 영수증, `방금 저장됨`/`수정 중`, Enter 다음 행 이동 구현
- 이월 매출 Contract A 적용
  - 영업 매출 합계 = 장부 마감 매출 + 이월 매출
  - 결제 대사는 장부 마감 매출만 사용
  - 전일 이월은 다음 영업일 총매출·결제에 재반영하지 않음
- 정정, 감사, 본사 마감, 대시보드, 리포트, CSV/XLSX 반영
- 총매출·이월 매출 동시 정정 상한을 advisory lock으로 직렬화

## 데이터베이스 검증

- Neon에 격리 테스트 DB `erp_fish_e2e`를 생성해 DB 기반 E2E 실행
- 빈 `erp_fish_migration_test` DB에 전체 48개 migration을 순서대로 적용
- `20260722090000_add_carryover_sales_amount` 적용 완료 확인
- `DailyLedger.carryoverSalesAmount`가 `integer NOT NULL DEFAULT 0`임을 확인
- migration 검증 DB는 검증 후 삭제
- 기본 Neon `neondb`에 `20260722090000_add_carryover_sales_amount` 배포 완료
  - 기존 장부 29건의 이월 매출은 기본값 0으로 보존
  - NULL 또는 배포 시점의 예상하지 않은 0이 아닌 값 없음
  - `prisma migrate status`에서 전체 48개 migration 적용 완료 확인

## 검증 결과

- Prisma validate/generate: 통과
- TypeScript: 통과
- ESLint `--max-warnings=0`: 통과
- 단위 테스트: 602/602 통과
- API 테스트: 14/14 통과
- 프로덕션 빌드: 통과
- `git diff --check`: 통과
- 격리 DB 핵심 E2E 7개 시나리오 통과
  - 총매출·이월 매출 동시 정정 직렬화
  - 재고 명시 저장 후 버전·감사로그 중복 증가 방지
  - 월초 스냅샷 단가·재고 저장 유지
  - 지점장 매출/결제 이월 입력·영업 합계·재방문 유지
  - 본사 관제판
  - 통합 리포트 정정·손실 기준
  - 지점장 검토 화면

## 환경 참고

원격 Neon DB에서는 각 화면 저장·조회가 로컬 기본 Playwright 제한보다 오래 걸려,
핵심 E2E 검증 시 테스트 제한 120초와 expect 제한 60초를 사용했다.
