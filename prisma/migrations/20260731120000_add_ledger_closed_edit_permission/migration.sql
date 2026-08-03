-- DESIGN.md D4: 마감 장부 직접 수정 전용 권한 action 추가.
-- PostgreSQL은 같은 트랜잭션에서 추가한 enum 값을 사용할 수 없으므로 이
-- 마이그레이션은 값 추가만 수행한다. 프로파일 권한 부여는 시드 단계에서 한다.
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LEDGER_CLOSED_EDIT';
