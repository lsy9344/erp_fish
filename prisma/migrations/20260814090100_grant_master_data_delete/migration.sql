-- WO(2026-08-14): MASTER_DATA_DELETE는 대표(OWNER)와 전용 프로필에만 부여한다.
-- HQ_ADMIN·SETTINGS_ADMIN을 포함한 나머지 프로필은 의도적으로 제외한다.
-- 전용 프로필을 따로 두는 이유: 대표 권한 묶음(급여·개인정보 조회 포함)을 주지 않고
-- 삭제 권한만 특정 담당자에게 열 수 있어야 한다.
-- 지점 접근 범위는 ASSIGNED_STORES로 둬서 이 프로필을 얹어도 조회 범위가 넓어지지 않게 한다.
INSERT INTO "PermissionProfile" ("id", "code", "name", "description", "isSystem", "isActive", "storeAccessMode", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'MASTER_DATA_DELETE',
  '기준정보 삭제',
  '안 쓰거나 잘못 만든 사용자와 지점을 영구 삭제합니다.',
  true,
  true,
  'ASSIGNED_STORES',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- 복합 PK 덕분에 부분 배포 후 재실행해도 안전하다.
INSERT INTO "PermissionProfileAction" ("profileId", "action", "createdAt")
SELECT "id", 'MASTER_DATA_DELETE'::"PermissionAction", CURRENT_TIMESTAMP
FROM "PermissionProfile"
WHERE "code" IN ('OWNER', 'MASTER_DATA_DELETE')
ON CONFLICT ("profileId", "action") DO NOTHING;
