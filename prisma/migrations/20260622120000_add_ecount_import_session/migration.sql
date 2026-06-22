-- CreateTable
CREATE TABLE "EcountImportSession" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "purchasesJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcountImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EcountImportSession_ledgerId_idx" ON "EcountImportSession"("ledgerId");

-- CreateIndex
CREATE INDEX "EcountImportSession_actorId_idx" ON "EcountImportSession"("actorId");

-- CreateIndex
CREATE INDEX "EcountImportSession_expiresAt_idx" ON "EcountImportSession"("expiresAt");
