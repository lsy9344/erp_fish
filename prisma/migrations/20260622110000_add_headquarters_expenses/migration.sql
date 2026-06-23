-- CreateTable
CREATE TABLE "HeadquartersExpense" (
    "id" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "HeadquartersExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeadquartersExpense_expenseDate_idx" ON "HeadquartersExpense"("expenseDate");

-- CreateIndex
CREATE INDEX "HeadquartersExpense_storeId_expenseDate_idx" ON "HeadquartersExpense"("storeId", "expenseDate");

-- CreateIndex
CREATE INDEX "HeadquartersExpense_createdById_idx" ON "HeadquartersExpense"("createdById");

-- CreateIndex
CREATE INDEX "HeadquartersExpense_updatedById_idx" ON "HeadquartersExpense"("updatedById");

-- AddForeignKey
ALTER TABLE "HeadquartersExpense" ADD CONSTRAINT "HeadquartersExpense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadquartersExpense" ADD CONSTRAINT "HeadquartersExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadquartersExpense" ADD CONSTRAINT "HeadquartersExpense_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
