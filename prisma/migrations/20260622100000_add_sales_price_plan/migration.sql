-- CreateTable
CREATE TABLE "StoreSalesPricePlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "plannedUnitPrice" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "StoreSalesPricePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreSalesPricePlan_storeId_businessDate_idx" ON "StoreSalesPricePlan"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "StoreSalesPricePlan_productId_idx" ON "StoreSalesPricePlan"("productId");

-- CreateIndex
CREATE INDEX "StoreSalesPricePlan_createdById_idx" ON "StoreSalesPricePlan"("createdById");

-- CreateIndex
CREATE INDEX "StoreSalesPricePlan_updatedById_idx" ON "StoreSalesPricePlan"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "storeSalesPricePlan_storeId_businessDate_productId_key" ON "StoreSalesPricePlan"("storeId", "businessDate", "productId");

-- AddForeignKey
ALTER TABLE "StoreSalesPricePlan" ADD CONSTRAINT "StoreSalesPricePlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSalesPricePlan" ADD CONSTRAINT "StoreSalesPricePlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSalesPricePlan" ADD CONSTRAINT "StoreSalesPricePlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSalesPricePlan" ADD CONSTRAINT "StoreSalesPricePlan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
