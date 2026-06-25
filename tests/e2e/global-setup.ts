import { execSync } from "node:child_process";

import {
  PermissionAction,
  PrismaClient,
  StoreAccessMode,
  UserRole,
} from "../../generated/prisma/index.js";
import { hashPassword } from "../../src/server/password";

const databaseUrl = process.env.DATABASE_URL;
const profileDefinitions = [
  {
    code: "HQ_ADMIN",
    name: "본사 관리자",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [
      PermissionAction.LEDGER_EDIT,
      PermissionAction.LEDGER_HQ_CLOSE,
      PermissionAction.CORRECTION_CREATE,
      PermissionAction.UPLOAD_PREVIEW,
      PermissionAction.UPLOAD_COMMIT,
      PermissionAction.REPORT_VIEW,
      PermissionAction.EXPORT_CREATE,
      PermissionAction.USER_PERMISSION_MANAGE,
    ],
  },
  {
    code: "HQ_STAFF",
    name: "본사 스텝",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [PermissionAction.LEDGER_EDIT, PermissionAction.REPORT_VIEW],
  },
  {
    code: "HQ_VIEWER",
    name: "본사 조회 전용",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [PermissionAction.REPORT_VIEW],
  },
  {
    code: "SETTINGS_ADMIN",
    name: "설정 관리자",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [
      PermissionAction.SETTINGS_MANAGE,
      PermissionAction.USER_PERMISSION_MANAGE,
      PermissionAction.REPORT_VIEW,
    ],
  },
  {
    code: "STORE_MANAGER",
    name: "지점장",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [PermissionAction.LEDGER_CREATE, PermissionAction.LEDGER_EDIT],
  },
] as const;

function requireTestDatabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error("DATABASE_URL is required for e2e global setup.");
  }

  const databaseName = new URL(value).pathname.replace(/^\//, "");

  if (!/(test|e2e)/i.test(databaseName)) {
    throw new Error(
      `Refusing to run e2e setup against non-test database "${databaseName}".`,
    );
  }

  return value;
}

async function upsertPermissionProfiles(prisma: PrismaClient) {
  const profiles = new Map<string, { id: string }>();

  for (const definition of profileDefinitions) {
    const profile = await prisma.permissionProfile.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        name: definition.name,
        isSystem: true,
        isActive: true,
        storeAccessMode: definition.storeAccessMode,
      },
      update: {
        name: definition.name,
        isSystem: true,
        isActive: true,
        storeAccessMode: definition.storeAccessMode,
      },
      select: { id: true },
    });

    profiles.set(definition.code, profile);

    await prisma.permissionProfileAction.deleteMany({
      where: {
        profileId: profile.id,
        action: {
          notIn: [...definition.actions],
        },
      },
    });

    for (const action of definition.actions) {
      await prisma.permissionProfileAction.upsert({
        where: {
          profileId_action: {
            profileId: profile.id,
            action,
          },
        },
        create: {
          profileId: profile.id,
          action,
        },
        update: {},
      });
    }
  }

  return profiles;
}

async function assignPermissionProfile(
  prisma: PrismaClient,
  userId: string,
  profileId: string | undefined,
) {
  if (!profileId) {
    throw new Error("Missing permission profile fixture.");
  }

  await prisma.userPermissionProfile.upsert({
    where: {
      userId_profileId: {
        userId,
        profileId,
      },
    },
    create: {
      userId,
      profileId,
    },
    update: {},
  });
}

async function truncateE2eDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

export default async function globalSetup() {
  process.env.DATABASE_URL = requireTestDatabaseUrl(databaseUrl);

  execSync(
    "corepack pnpm exec prisma db push --skip-generate --accept-data-loss",
    {
      env: process.env,
      stdio: "inherit",
    },
  );

  const prisma = new PrismaClient();
  await truncateE2eDatabase(prisma);
  const passwordHash = await hashPassword("correct-password");
  const permissionProfiles = await upsertPermissionProfiles(prisma);

  const storyStores = await prisma.store.findMany({
    where: {
      name: {
        startsWith: "스토리13",
      },
    },
    select: { id: true },
  });
  const storyStoreIds = storyStores.map((store) => store.id);

  if (storyStoreIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "Store",
        targetId: {
          in: storyStoreIds,
        },
      },
    });
    await prisma.store.deleteMany({
      where: {
        id: {
          in: storyStoreIds,
        },
      },
    });
  }

  const story14Users = await prisma.user.findMany({
    where: {
      email: {
        startsWith: "story14-",
      },
    },
    select: { id: true },
  });
  const story14UserIds = story14Users.map((user) => user.id);

  if (story14UserIds.length > 0) {
    const story14Ledgers = await prisma.dailyLedger.findMany({
      where: {
        OR: [
          { createdById: { in: story14UserIds } },
          { updatedById: { in: story14UserIds } },
          { submittedById: { in: story14UserIds } },
          { closedById: { in: story14UserIds } },
        ],
      },
      select: { id: true },
    });
    const story14LedgerIds = story14Ledgers.map((ledger) => ledger.id);

    if (story14LedgerIds.length > 0) {
      const story14CorrectionRecords = await prisma.correctionRecord.findMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
        select: { id: true },
      });
      const story14CorrectionRecordIds = story14CorrectionRecords.map(
        (record) => record.id,
      );

      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { targetType: "DailyLedger", targetId: { in: story14LedgerIds } },
            {
              targetType: "CorrectionRecord",
              targetId: { in: story14CorrectionRecordIds },
            },
            { actorId: { in: story14UserIds } },
          ],
        },
      });
      await prisma.correctionRecord.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.ledgerLossItem.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.ledgerInventoryAdjustment.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.ledgerInventoryItem.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.ledgerPurchaseItem.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.ledgerExpense.deleteMany({
        where: { dailyLedgerId: { in: story14LedgerIds } },
      });
      await prisma.dailyLedger.deleteMany({
        where: { id: { in: story14LedgerIds } },
      });
    }

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          {
            targetType: "User",
            targetId: {
              in: story14UserIds,
            },
          },
          {
            actorId: {
              in: story14UserIds,
            },
          },
        ],
      },
    });
    await prisma.userStoreAssignment.deleteMany({
      where: {
        userId: {
          in: story14UserIds,
        },
      },
    });
    await prisma.session.deleteMany({
      where: {
        userId: {
          in: story14UserIds,
        },
      },
    });
    await prisma.account.deleteMany({
      where: {
        userId: {
          in: story14UserIds,
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: story14UserIds,
        },
      },
    });
  }

  const story24Products = await prisma.product.findMany({
    where: {
      name: {
        startsWith: "스토리2-4",
      },
    },
    select: { id: true },
  });
  const story24ProductIds = story24Products.map((product) => product.id);

  if (story24ProductIds.length > 0) {
    await prisma.ledgerLossItem.deleteMany({
      where: {
        productId: {
          in: story24ProductIds,
        },
      },
    });
    await prisma.inventoryOpeningSnapshot.deleteMany({
      where: {
        productId: {
          in: story24ProductIds,
        },
      },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: {
        productId: {
          in: story24ProductIds,
        },
      },
    });
    await prisma.purchaseStandard.deleteMany({
      where: {
        productId: {
          in: story24ProductIds,
        },
      },
    });
    await prisma.product.deleteMany({
      where: {
        id: {
          in: story24ProductIds,
        },
      },
    });
  }

  const hqUser = await prisma.user.upsert({
    where: { email: "hq@example.com" },
    create: {
      email: "hq@example.com",
      name: "본사 관리자",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "본사 관리자",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
  });

  const assignedHqUser = await prisma.user.upsert({
    where: { email: "hq-assigned@example.com" },
    create: {
      email: "hq-assigned@example.com",
      name: "지정 지점 본사",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "지정 지점 본사",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
  });

  const readOnlyHqUser = await prisma.user.upsert({
    where: { email: "hq-viewer@example.com" },
    create: {
      email: "hq-viewer@example.com",
      name: "본사 조회 전용",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "본사 조회 전용",
      role: UserRole.HEADQUARTERS,
      passwordHash,
      isActive: true,
    },
  });

  const gangnamStore = await prisma.store.upsert({
    where: { id: "store-gangnam" },
    create: {
      id: "store-gangnam",
      name: "강남점",
      isActive: true,
    },
    update: {
      name: "강남점",
      isActive: true,
    },
  });

  await prisma.store.upsert({
    where: { id: "store-hongdae" },
    create: {
      id: "store-hongdae",
      name: "홍대점",
      isActive: true,
    },
    update: {
      name: "홍대점",
      isActive: true,
    },
  });

  const seochoStore = await prisma.store.upsert({
    where: { id: "store-seocho" },
    create: {
      id: "store-seocho",
      name: "서초점",
      isActive: true,
    },
    update: {
      name: "서초점",
      isActive: true,
    },
  });

  const inactiveStore = await prisma.store.upsert({
    where: { id: "store-closed" },
    create: {
      id: "store-closed",
      name: "폐점",
      isActive: false,
    },
    update: {
      name: "폐점",
      isActive: false,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    create: {
      email: "manager@example.com",
      name: "강남 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "강남 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
  });

  const unassignedManager = await prisma.user.upsert({
    where: { email: "unassigned-manager@example.com" },
    create: {
      email: "unassigned-manager@example.com",
      name: "미배정 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "미배정 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
  });

  const inactiveOnlyManager = await prisma.user.upsert({
    where: { email: "inactive-manager@example.com" },
    create: {
      email: "inactive-manager@example.com",
      name: "비활성 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
    update: {
      name: "비활성 지점장",
      role: UserRole.STORE_MANAGER,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userStoreAssignment.deleteMany({
    where: {
      userId: {
        in: [
          manager.id,
          unassignedManager.id,
          inactiveOnlyManager.id,
          assignedHqUser.id,
        ],
      },
    },
  });
  await prisma.userPermissionProfile.deleteMany({
    where: {
      userId: {
        in: [
          hqUser.id,
          assignedHqUser.id,
          readOnlyHqUser.id,
          manager.id,
          unassignedManager.id,
          inactiveOnlyManager.id,
        ],
      },
    },
  });

  await assignPermissionProfile(
    prisma,
    hqUser.id,
    permissionProfiles.get("HQ_ADMIN")?.id,
  );
  await assignPermissionProfile(
    prisma,
    hqUser.id,
    permissionProfiles.get("SETTINGS_ADMIN")?.id,
  );
  await assignPermissionProfile(
    prisma,
    assignedHqUser.id,
    permissionProfiles.get("HQ_STAFF")?.id,
  );
  await assignPermissionProfile(
    prisma,
    readOnlyHqUser.id,
    permissionProfiles.get("HQ_VIEWER")?.id,
  );
  await assignPermissionProfile(
    prisma,
    manager.id,
    permissionProfiles.get("STORE_MANAGER")?.id,
  );
  await assignPermissionProfile(
    prisma,
    unassignedManager.id,
    permissionProfiles.get("STORE_MANAGER")?.id,
  );
  await assignPermissionProfile(
    prisma,
    inactiveOnlyManager.id,
    permissionProfiles.get("STORE_MANAGER")?.id,
  );

  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: manager.id,
        storeId: gangnamStore.id,
      },
    },
    create: {
      userId: manager.id,
      storeId: gangnamStore.id,
    },
    update: {},
  });

  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: manager.id,
        storeId: seochoStore.id,
      },
    },
    create: {
      userId: manager.id,
      storeId: seochoStore.id,
    },
    update: {},
  });

  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: inactiveOnlyManager.id,
        storeId: inactiveStore.id,
      },
    },
    create: {
      userId: inactiveOnlyManager.id,
      storeId: inactiveStore.id,
    },
    update: {},
  });

  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: assignedHqUser.id,
        storeId: seochoStore.id,
      },
    },
    create: {
      userId: assignedHqUser.id,
      storeId: seochoStore.id,
    },
    update: {},
  });

  // WO(2026-06-24) Task 18: 이카운트 출고/입고 전체 흐름(업로드→매핑→commit→장부→리포트)을
  // e2e에서 검증하기 위한 commit 완료 fixture. 서초점 장부에 ECOUNT_UPLOAD 매입 1건을 심고,
  // 원본 EcountImportLine과 1:1로 연결한다. 단가는 원본(sourceUnitPrice)과 적용(unitPrice)을 분리한다.
  // 서초점을 쓰는 이유: store-ledger-purchase 스펙이 강남/홍대 장부를 정리하므로 충돌을 피한다.
  const ecountBusinessDate = new Date("2026-06-20T00:00:00.000Z");
  const ecountDateNo = "2026-06-20-1";

  const ecountProduct = await prisma.product.upsert({
    where: {
      name_category_spec: {
        name: "제주갈치",
        category: "생물",
        spec: "31-35미",
      },
    },
    create: {
      name: "제주갈치",
      category: "생물",
      spec: "31-35미",
      defaultUnitPrice: 12000,
      isActive: true,
      updatedById: hqUser.id,
    },
    update: { isActive: true, updatedById: hqUser.id },
    select: { id: true },
  });

  const ecountUploadProduct = await prisma.product.upsert({
    where: {
      name_category_spec: {
        name: "E2E업로드갈치",
        category: "생물",
        spec: "31-35미",
      },
    },
    create: {
      name: "E2E업로드갈치",
      category: "생물",
      spec: "31-35미",
      defaultUnitPrice: 12000,
      isActive: true,
      updatedById: hqUser.id,
    },
    update: { isActive: true, updatedById: hqUser.id },
    select: { id: true },
  });

  await prisma.storeExternalAlias.upsert({
    where: {
      provider_rawName: {
        provider: "ECOUNT",
        rawName: "E2E강남점",
      },
    },
    create: {
      provider: "ECOUNT",
      rawName: "E2E강남점",
      storeId: gangnamStore.id,
      updatedById: hqUser.id,
    },
    update: { storeId: gangnamStore.id, updatedById: hqUser.id },
  });

  await prisma.productExternalAlias.upsert({
    where: {
      provider_rawName_rawSpec: {
        provider: "ECOUNT",
        rawName: "E2E업로드갈치 [31-35미]",
        rawSpec: "31-35미",
      },
    },
    create: {
      provider: "ECOUNT",
      rawName: "E2E업로드갈치 [31-35미]",
      rawSpec: "31-35미",
      productId: ecountUploadProduct.id,
      updatedById: hqUser.id,
    },
    update: { productId: ecountUploadProduct.id, updatedById: hqUser.id },
  });

  // 멱등성을 위해 기존 e2e 이카운트 fixture를 정리한 뒤 다시 만든다.
  const existingEcountLedger = await prisma.dailyLedger.findUnique({
    where: {
      storeId_closingDate: {
        storeId: seochoStore.id,
        closingDate: ecountBusinessDate,
      },
    },
    select: { id: true },
  });

  if (existingEcountLedger) {
    await prisma.ledgerInventoryFifoLot.deleteMany({
      where: { dailyLedgerId: existingEcountLedger.id },
    });
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: existingEcountLedger.id },
    });
    await prisma.ledgerInventoryAdjustment.deleteMany({
      where: { dailyLedgerId: existingEcountLedger.id },
    });
    await prisma.ledgerPurchaseItem.deleteMany({
      where: { dailyLedgerId: existingEcountLedger.id },
    });
    await prisma.dailyLedger.delete({
      where: { id: existingEcountLedger.id },
    });
  }
  await prisma.ecountImportBatch.deleteMany({
    where: { fileHash: "e2e-ecount-supply-fixture" },
  });

  const ecountBatch = await prisma.ecountImportBatch.create({
    data: {
      fileName: "이카운트 엑셀파일.xlsx",
      fileHash: "e2e-ecount-supply-fixture",
      sheetName: "Sheet1",
      businessDate: ecountBusinessDate,
      status: "COMMITTED",
      uploadedById: hqUser.id,
      committedById: hqUser.id,
      committedAt: new Date("2026-06-20T01:00:00.000Z"),
    },
    select: { id: true },
  });

  const ecountLedger = await prisma.dailyLedger.create({
    data: {
      storeId: seochoStore.id,
      closingDate: ecountBusinessDate,
      status: "IN_PROGRESS",
      version: 1,
      createdById: hqUser.id,
      updatedById: hqUser.id,
    },
    select: { id: true },
  });

  const ecountLine = await prisma.ecountImportLine.create({
    data: {
      batchId: ecountBatch.id,
      rowNumber: 1,
      dateNo: ecountDateNo,
      rawStoreName: "서초",
      storeId: seochoStore.id,
      rawProductName: "제주갈치",
      productId: ecountProduct.id,
      productName: "제주갈치",
      productCategory: "생물",
      productSpec: "31-35미",
      quantity: 10,
      unitPrice: 12000,
      supplyAmount: 120000,
      totalAmount: 120000,
      status: "COMMITTED",
    },
    select: { id: true },
  });

  const ecountPurchaseItem = await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ecountLedger.id,
      productId: ecountProduct.id,
      sourceType: "ECOUNT_UPLOAD",
      productName: "제주갈치",
      productCategory: "생물",
      productSpec: "31-35미",
      unitPrice: 12000,
      quantity: 10,
      amount: 120000,
      sourceUnitPrice: 12000,
      ecountImportLineId: ecountLine.id,
      referenceInfo: `이카운트 Sheet1 1행 · 일자-No. ${ecountDateNo} · 거래처 서초`,
      createdById: hqUser.id,
      updatedById: hqUser.id,
    },
    select: { id: true },
  });

  await prisma.ecountImportLine.update({
    where: { id: ecountLine.id },
    data: { ledgerPurchaseItemId: ecountPurchaseItem.id },
  });

  await prisma.$disconnect();
}
