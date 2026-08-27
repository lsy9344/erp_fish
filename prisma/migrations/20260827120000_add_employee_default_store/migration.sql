ALTER TABLE "Employee" ADD COLUMN "storeId" TEXT;

CREATE INDEX "Employee_storeId_idx" ON "Employee"("storeId");

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
