-- Preserve the effective permissions of the existing system owner/admin profiles.
-- The composite primary key makes this safe to run again after a partial deploy.
INSERT INTO "PermissionProfileAction" ("profileId", "action", "createdAt")
SELECT "id", 'LEDGER_CLOSED_EDIT'::"PermissionAction", CURRENT_TIMESTAMP
FROM "PermissionProfile"
WHERE "code" IN ('OWNER', 'HQ_ADMIN')
ON CONFLICT ("profileId", "action") DO NOTHING;
