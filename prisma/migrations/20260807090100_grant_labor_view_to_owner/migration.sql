-- WO-0806 #5: LABOR_VIEW는 대표(OWNER) 프로필에만 부여한다.
-- HQ_ADMIN을 포함한 나머지 프로필은 의도적으로 제외한다.
-- 복합 PK 덕분에 부분 배포 후 재실행해도 안전하다.
INSERT INTO "PermissionProfileAction" ("profileId", "action", "createdAt")
SELECT "id", 'LABOR_VIEW'::"PermissionAction", CURRENT_TIMESTAMP
FROM "PermissionProfile"
WHERE "code" = 'OWNER'
ON CONFLICT ("profileId", "action") DO NOTHING;
