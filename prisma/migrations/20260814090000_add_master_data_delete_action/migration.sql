-- WO(2026-08-14): 사용자/지점 영구 삭제 전용 action.
-- 되돌릴 수 없는 작업이라 SETTINGS_MANAGE(기준정보 수정)와 분리한다.
-- Postgres는 같은 트랜잭션에서 추가한 enum 값을 바로 쓸 수 없으므로
-- 프로필 부여는 다음 마이그레이션에서 한다.
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'MASTER_DATA_DELETE';
