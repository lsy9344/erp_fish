-- CreateTable
CREATE TABLE "NotificationDeliveryLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "NotificationDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_templateKey_sentAt_idx" ON "NotificationDeliveryLog"("templateKey", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_recipientId_sentAt_idx" ON "NotificationDeliveryLog"("recipientId", "sentAt");
