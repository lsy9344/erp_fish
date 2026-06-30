ALTER TABLE "HeadquartersExpense" ADD COLUMN "adjustmentReason" TEXT;

-- 분리 이전에는 본사조정(category='본사조정') 행의 memo가 사실상 조정사유 역할을 했다.
-- 월별 손익이 이제 adjustmentReason만 조정사유로 읽으므로, 기존 본사조정 행의 memo를
-- adjustmentReason로 backfill해 배포 후 조정사유가 빈 값이 되지 않게 한다. memo는 그대로 둔다.
UPDATE "HeadquartersExpense"
SET "adjustmentReason" = "memo"
WHERE "category" = '본사조정'
  AND "memo" IS NOT NULL
  AND "adjustmentReason" IS NULL;
