import { execSync } from "node:child_process";

import { PrismaClient, UserRole } from "../../generated/prisma/index.js";
import { hashPassword } from "../../src/server/password";

const databaseUrl = process.env.DATABASE_URL;

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

export default async function globalSetup() {
  process.env.DATABASE_URL = requireTestDatabaseUrl(databaseUrl);

  execSync("pnpm exec prisma db push --skip-generate", {
    env: process.env,
    stdio: "inherit",
  });

  const prisma = new PrismaClient();
  const passwordHash = await hashPassword("correct-password");

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

  await prisma.user.upsert({
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
        in: [manager.id, unassignedManager.id, inactiveOnlyManager.id],
      },
    },
  });

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

  await prisma.$disconnect();
}
