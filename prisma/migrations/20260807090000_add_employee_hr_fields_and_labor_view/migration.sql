-- WO-0806 #1: 인사관리 카드 필드. 기존 직원은 미입력(null)으로 남는다.
ALTER TABLE "Employee" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "position" TEXT;

-- WO-0806 #5: 직원 관리·인건비 현황을 대표(OWNER) 전용으로 좁히는 action.
-- Postgres는 같은 트랜잭션에서 추가한 enum 값을 바로 쓸 수 없으므로
-- 프로필 부여는 다음 마이그레이션에서 한다.
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LABOR_VIEW';
