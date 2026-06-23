-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

-- AlterTable
ALTER TABLE "LedgerLaborItem" ADD COLUMN "employeeId" TEXT;

-- CreateIndex
CREATE INDEX "LedgerLaborItem_employeeId_idx" ON "LedgerLaborItem"("employeeId");

-- AddForeignKey
ALTER TABLE "LedgerLaborItem" ADD CONSTRAINT "LedgerLaborItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
