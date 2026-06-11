import {
  PermissionAction,
  PrismaClient,
  StoreAccessMode,
  UserRole,
} from "../generated/prisma/index.js";
import { hashPassword } from "../src/server/password.ts";

const prisma = new PrismaClient();
const DEFAULT_HQ_NAME = "본사 관리자";
const DEFAULT_STORE_MANAGER_EMAIL = "store-manager@example.com";
const DEFAULT_STORE_MANAGER_NAME = "샘플 지점장";
const DEFAULT_SAMPLE_STORE_NAME = "샘플 지점";
const SEED_HQ_PASSWORD_MIN_LENGTH = 12;

const ALL_PERMISSION_ACTIONS = [
  PermissionAction.LEDGER_CREATE,
  PermissionAction.LEDGER_EDIT,
  PermissionAction.LEDGER_HQ_CLOSE,
  PermissionAction.CORRECTION_CREATE,
  PermissionAction.UPLOAD_PREVIEW,
  PermissionAction.UPLOAD_COMMIT,
  PermissionAction.SETTINGS_MANAGE,
  PermissionAction.REPORT_VIEW,
  PermissionAction.EXPORT_CREATE,
  PermissionAction.USER_PERMISSION_MANAGE,
] as const;

const SYSTEM_PERMISSION_PROFILES = [
  {
    code: "OWNER",
    name: "대표/소유자",
    description: "전체 지점과 모든 운영 action을 관리합니다.",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: ALL_PERMISSION_ACTIONS,
  },
  {
    code: "HQ_ADMIN",
    name: "본사 관리자",
    description: "본사 운영 관리에 필요한 주요 action을 수행합니다.",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [
      PermissionAction.LEDGER_EDIT,
      PermissionAction.LEDGER_HQ_CLOSE,
      PermissionAction.CORRECTION_CREATE,
      PermissionAction.REPORT_VIEW,
      PermissionAction.EXPORT_CREATE,
      PermissionAction.USER_PERMISSION_MANAGE,
    ],
  },
  {
    code: "HQ_STAFF",
    name: "본사 스텝",
    description: "지정된 지점 범위의 장부와 리포트를 확인합니다.",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [PermissionAction.LEDGER_EDIT, PermissionAction.REPORT_VIEW],
  },
  {
    code: "CLOSE_MANAGER",
    name: "마감 담당자",
    description: "본사 마감과 정정 action을 수행합니다.",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [
      PermissionAction.LEDGER_HQ_CLOSE,
      PermissionAction.CORRECTION_CREATE,
      PermissionAction.REPORT_VIEW,
    ],
  },
  {
    code: "UPLOAD_STAFF",
    name: "업로드 담당자",
    description: "업로드 preview와 commit action을 수행합니다.",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [
      PermissionAction.UPLOAD_PREVIEW,
      PermissionAction.UPLOAD_COMMIT,
      PermissionAction.REPORT_VIEW,
    ],
  },
  {
    code: "SETTINGS_ADMIN",
    name: "설정 관리자",
    description: "기준정보와 사용자/권한 설정을 관리합니다.",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [
      PermissionAction.SETTINGS_MANAGE,
      PermissionAction.USER_PERMISSION_MANAGE,
      PermissionAction.REPORT_VIEW,
    ],
  },
  {
    code: "HQ_READONLY",
    name: "본사 조회 전용",
    description: "본사 리포트 조회와 export 생성을 수행합니다.",
    storeAccessMode: StoreAccessMode.ALL_STORES,
    actions: [PermissionAction.REPORT_VIEW, PermissionAction.EXPORT_CREATE],
  },
  {
    code: "STORE_MANAGER",
    name: "지점장",
    description: "배정된 지점의 장부를 생성하고 수정합니다.",
    storeAccessMode: StoreAccessMode.ASSIGNED_STORES,
    actions: [PermissionAction.LEDGER_CREATE, PermissionAction.LEDGER_EDIT],
  },
] as const;

function getSeedName() {
  const seedName = process.env.SEED_HQ_NAME?.trim();

  if (seedName === undefined || seedName.length === 0) {
    return DEFAULT_HQ_NAME;
  }

  return seedName;
}

function getStoreManagerName() {
  const seedName = process.env.SEED_STORE_MANAGER_NAME?.trim();

  if (seedName === undefined || seedName.length === 0) {
    return DEFAULT_STORE_MANAGER_NAME;
  }

  return seedName;
}

function getSampleStoreName() {
  const storeName = process.env.SEED_SAMPLE_STORE_NAME?.trim();

  if (storeName === undefined || storeName.length === 0) {
    return DEFAULT_SAMPLE_STORE_NAME;
  }

  return storeName;
}

async function upsertSystemPermissionProfiles() {
  const profilesByCode = new Map<string, { id: string }>();

  for (const profileDefinition of SYSTEM_PERMISSION_PROFILES) {
    const profile = await prisma.permissionProfile.upsert({
      where: { code: profileDefinition.code },
      create: {
        code: profileDefinition.code,
        name: profileDefinition.name,
        description: profileDefinition.description,
        isSystem: true,
        isActive: true,
        storeAccessMode: profileDefinition.storeAccessMode,
      },
      update: {
        name: profileDefinition.name,
        description: profileDefinition.description,
        isSystem: true,
        isActive: true,
        storeAccessMode: profileDefinition.storeAccessMode,
      },
      select: { id: true },
    });

    profilesByCode.set(profileDefinition.code, profile);

    await prisma.permissionProfileAction.deleteMany({
      where: {
        profileId: profile.id,
        action: {
          notIn: [...profileDefinition.actions],
        },
      },
    });

    for (const action of profileDefinition.actions) {
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

  return profilesByCode;
}

async function assignPermissionProfile(userId: string, profileId: string) {
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

async function main() {
  const email = process.env.SEED_HQ_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_HQ_PASSWORD;
  const name = getSeedName();
  const storeManagerEmail =
    process.env.SEED_STORE_MANAGER_EMAIL?.trim().toLowerCase() ??
    DEFAULT_STORE_MANAGER_EMAIL;
  const storeManagerPassword = process.env.SEED_STORE_MANAGER_PASSWORD ?? password;
  const storeManagerName = getStoreManagerName();
  const sampleStoreName = getSampleStoreName();
  const allowProductionSeed = process.env.ALLOW_PRODUCTION_SEED === "true";
  const allowPasswordRotation =
    process.env.ALLOW_SEED_PASSWORD_ROTATION === "true";

  if (process.env.NODE_ENV === "production" && !allowProductionSeed) {
    throw new Error(
      "Set ALLOW_PRODUCTION_SEED=true before running the seed script in production.",
    );
  }

  if (!email || !password) {
    throw new Error(
      "SEED_HQ_EMAIL and SEED_HQ_PASSWORD are required to seed the headquarters account.",
    );
  }

  if (password.length < SEED_HQ_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_HQ_PASSWORD must be at least ${SEED_HQ_PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  if (
    !storeManagerPassword ||
    storeManagerPassword.length < SEED_HQ_PASSWORD_MIN_LENGTH
  ) {
    throw new Error(
      `SEED_STORE_MANAGER_PASSWORD must be at least ${SEED_HQ_PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser?.role && existingUser.role !== UserRole.HEADQUARTERS) {
    throw new Error(
      "SEED_HQ_EMAIL already belongs to a non-headquarters account.",
    );
  }

  const shouldWritePasswordHash =
    !existingUser?.passwordHash || allowPasswordRotation;
  const passwordHash = shouldWritePasswordHash
    ? await hashPassword(password)
    : existingUser.passwordHash;

  const headquartersUser = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: UserRole.HEADQUARTERS,
      isActive: true,
    },
    update: {
      name,
      role: UserRole.HEADQUARTERS,
      ...(shouldWritePasswordHash ? { passwordHash } : {}),
    },
  });

  const profilesByCode = await upsertSystemPermissionProfiles();

  for (const profileCode of ["HQ_ADMIN", "SETTINGS_ADMIN"]) {
    const profile = profilesByCode.get(profileCode);

    if (!profile) {
      throw new Error(`Missing system permission profile: ${profileCode}`);
    }

    await assignPermissionProfile(headquartersUser.id, profile.id);
  }

  const existingStoreManager = await prisma.user.findUnique({
    where: { email: storeManagerEmail },
  });

  if (
    existingStoreManager?.role &&
    existingStoreManager.role !== UserRole.STORE_MANAGER
  ) {
    throw new Error(
      "SEED_STORE_MANAGER_EMAIL already belongs to a non-store-manager account.",
    );
  }

  const storeManagerPasswordHash =
    !existingStoreManager?.passwordHash || allowPasswordRotation
      ? await hashPassword(storeManagerPassword)
      : existingStoreManager.passwordHash;

  const storeManager = await prisma.user.upsert({
    where: { email: storeManagerEmail },
    create: {
      email: storeManagerEmail,
      name: storeManagerName,
      passwordHash: storeManagerPasswordHash,
      role: UserRole.STORE_MANAGER,
      isActive: true,
    },
    update: {
      name: storeManagerName,
      role: UserRole.STORE_MANAGER,
      isActive: true,
      ...(!existingStoreManager?.passwordHash || allowPasswordRotation
        ? { passwordHash: storeManagerPasswordHash }
        : {}),
    },
  });

  const storeManagerProfile = profilesByCode.get("STORE_MANAGER");

  if (!storeManagerProfile) {
    throw new Error("Missing system permission profile: STORE_MANAGER");
  }

  await assignPermissionProfile(storeManager.id, storeManagerProfile.id);

  const sampleStore = await prisma.store.upsert({
    where: { name: sampleStoreName },
    create: {
      name: sampleStoreName,
      isActive: true,
    },
    update: {
      isActive: true,
    },
  });

  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: storeManager.id,
        storeId: sampleStore.id,
      },
    },
    create: {
      userId: storeManager.id,
      storeId: sampleStore.id,
    },
    update: {},
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
