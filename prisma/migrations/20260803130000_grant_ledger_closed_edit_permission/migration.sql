-- DESIGN.md D4/배포: 기존 운영 DB에서도 OWNER와 HQ_ADMIN 프로파일이 마감 장부
-- 직접 수정 권한을 갖도록 부여한다. 앞선 마이그레이션에서 enum 값이 추가된 뒤
-- 실행되므로 여기서 LEDGER_CLOSED_EDIT를 사용할 수 있다. seed는 신규 환경용이다.
INSERT INTO "PermissionProfileAction" ("profileId", "action")
SELECT "id", 'LEDGER_CLOSED_EDIT'
FROM "PermissionProfile"
WHERE "code" IN ('OWNER', 'HQ_ADMIN')
ON CONFLICT ("profileId", "action") DO NOTHING;
