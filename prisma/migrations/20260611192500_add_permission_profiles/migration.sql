-- CreateEnum
CREATE TYPE "StoreAccessMode" AS ENUM ('ALL_STORES', 'ASSIGNED_STORES');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM (
  'LEDGER_CREATE',
  'LEDGER_EDIT',
  'LEDGER_HQ_CLOSE',
  'CORRECTION_CREATE',
  'UPLOAD_PREVIEW',
  'UPLOAD_COMMIT',
  'SETTINGS_MANAGE',
  'REPORT_VIEW',
  'EXPORT_CREATE',
  'USER_PERMISSION_MANAGE'
);

-- CreateTable
CREATE TABLE "PermissionProfile" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "storeAccessMode" "StoreAccessMode" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PermissionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionProfileAction" (
  "profileId" TEXT NOT NULL,
  "action" "PermissionAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionProfileAction_pkey" PRIMARY KEY ("profileId","action")
);

-- CreateTable
CREATE TABLE "UserPermissionProfile" (
  "userId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserPermissionProfile_pkey" PRIMARY KEY ("userId","profileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionProfile_code_key" ON "PermissionProfile"("code");

-- CreateIndex
CREATE INDEX "PermissionProfile_isActive_idx" ON "PermissionProfile"("isActive");

-- CreateIndex
CREATE INDEX "PermissionProfile_storeAccessMode_idx" ON "PermissionProfile"("storeAccessMode");

-- CreateIndex
CREATE INDEX "PermissionProfileAction_action_idx" ON "PermissionProfileAction"("action");

-- CreateIndex
CREATE INDEX "UserPermissionProfile_profileId_idx" ON "UserPermissionProfile"("profileId");

-- AddForeignKey
ALTER TABLE "PermissionProfileAction" ADD CONSTRAINT "PermissionProfileAction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PermissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionProfile" ADD CONSTRAINT "UserPermissionProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionProfile" ADD CONSTRAINT "UserPermissionProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PermissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
