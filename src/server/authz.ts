import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import {
  PermissionAction,
  StoreAccessMode,
  UserRole,
} from "../../generated/prisma";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

const appLoginPath = "/login?callbackUrl=%2Fapp";
const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  isActive: true,
};

const storeSelect = {
  id: true,
  name: true,
  isActive: true,
};

const permissionProfileSelect = {
  id: true,
  code: true,
  storeAccessMode: true,
  actions: {
    select: {
      action: true,
    },
  },
};

type ActionPermissionOptions = {
  requiredRole?: UserRole | null;
};

export type StoreIdParam = string | string[] | undefined;

export function normalizeStoreIdParam(value: StoreIdParam) {
  if (Array.isArray(value) || !value) {
    return null;
  }

  return value;
}

export async function getCurrentUser() {
  noStore();
  const session = await auth();

  return session?.user ?? null;
}

export async function getCurrentUserRecord() {
  const user = await getCurrentUser();

  if (!user?.id) {
    return null;
  }

  return db.user.findUnique({
    where: { id: user.id },
    select: userSelect,
  });
}

export async function requireAppUser() {
  const currentUser = await getCurrentUserRecord();

  if (!currentUser) {
    redirect("/login?callbackUrl=%2Fapp");
  }

  if (!currentUser.isActive) {
    redirect("/login?callbackUrl=%2Fapp");
  }

  return currentUser;
}

export async function requireHeadquartersUser() {
  const currentUser = await requireAppUser();

  if (currentUser?.role !== UserRole.HEADQUARTERS) {
    redirect("/app/unauthorized");
  }

  return currentUser;
}

export async function getActivePermissionProfiles(userId: string) {
  return db.userPermissionProfile.findMany({
    where: {
      userId,
      profile: {
        isActive: true,
      },
    },
    select: {
      profile: {
        select: permissionProfileSelect,
      },
    },
  });
}

export async function hasActionPermission(
  userId: string,
  action: PermissionAction,
  options: ActionPermissionOptions = {},
) {
  const requiredRole = options.requiredRole ?? UserRole.HEADQUARTERS;
  const user = await db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      ...(requiredRole ? { role: requiredRole } : {}),
      permissionProfiles: {
        some: {
          profile: {
            isActive: true,
            actions: {
              some: {
                action,
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(user);
}

export async function requireActionPermission(
  action: PermissionAction,
  options: ActionPermissionOptions = {},
) {
  const currentUser = await requireAppUser();
  const requiredRole = options.requiredRole ?? UserRole.HEADQUARTERS;

  if (requiredRole && currentUser.role !== requiredRole) {
    redirect("/app/unauthorized");
  }

  const hasPermission = await hasActionPermission(currentUser.id, action, {
    requiredRole,
  });

  if (!hasPermission) {
    redirect("/app/unauthorized");
  }

  return currentUser;
}

export async function requireHeadquartersActionPermission(
  action: PermissionAction,
) {
  return requireActionPermission(action, {
    requiredRole: UserRole.HEADQUARTERS,
  });
}

export async function requireSettingsAccess() {
  return requireHeadquartersActionPermission(PermissionAction.SETTINGS_MANAGE);
}

// WO(2026-08-14): 사용자/지점 영구 삭제. 되돌릴 수 없어 기준정보 수정
// (SETTINGS_MANAGE)과 분리한 별도 action으로 판정한다. seed 기준으로 대표(OWNER)와
// `기준정보 삭제` 프로필만 가지며, 다른 본사 프로필에는 부여하지 않는다.
export async function requireMasterDataDeleteAccess() {
  return requireHeadquartersActionPermission(
    PermissionAction.MASTER_DATA_DELETE,
  );
}

export async function requireUserPermissionAccess() {
  return requireHeadquartersActionPermission(
    PermissionAction.USER_PERMISSION_MANAGE,
  );
}

export async function requireReportAccess() {
  return requireHeadquartersActionPermission(PermissionAction.REPORT_VIEW);
}

// WO-0806 #5: 직원 관리·인건비 현황은 계좌번호·주소·급여를 다루므로 대표 전용이다.
// 읽기만 좁히면 “볼 수 없는데 고칠 수 있는” 상태가 되므로 쓰기도 같은 action을 쓴다.
export async function requireLaborViewAccess() {
  return requireHeadquartersActionPermission(PermissionAction.LABOR_VIEW);
}

export async function requireEmployeeManageAccess() {
  return requireLaborViewAccess();
}

export async function requireLedgerHqEditAccess() {
  return requireHeadquartersActionPermission(PermissionAction.LEDGER_EDIT);
}

// DESIGN.md D4/D5: 마감 장부 직접 수정은 LEDGER_EDIT에 더해 LEDGER_CLOSED_EDIT를
// 가진 활성 본사 사용자만 가능하다. 지점 접근 범위는 각 저장 action이 이어서
// 검사한다. 반환값의 closedEditAllowed는 서버 판정 결과이며 클라이언트 prop의
// 기본값(false)과 동일한 의미로 사용한다.
export async function requireLedgerHqEditContext() {
  const user = await requireLedgerHqEditAccess();
  const closedEditAllowed = await hasActionPermission(
    user.id,
    PermissionAction.LEDGER_CLOSED_EDIT,
  );

  return { user, closedEditAllowed };
}

// WO(2026-06-24): 이카운트 출고/입고 업로드는 본사 전용. preview는 UPLOAD_PREVIEW,
// commit/void는 UPLOAD_COMMIT 권한으로 분리한다.
export async function requireEcountUploadPreviewAccess() {
  return requireHeadquartersActionPermission(PermissionAction.UPLOAD_PREVIEW);
}

export async function requireEcountUploadCommitAccess() {
  return requireHeadquartersActionPermission(PermissionAction.UPLOAD_COMMIT);
}

export async function requireStoreManagerLedgerEditAccess(storeId: string) {
  const access = await requireStoreAccess(storeId);

  if (access.user.role !== UserRole.STORE_MANAGER) {
    redirect("/app/unauthorized");
  }

  const hasPermission = await hasActionPermission(
    access.user.id,
    PermissionAction.LEDGER_EDIT,
    {
      requiredRole: UserRole.STORE_MANAGER,
    },
  );

  if (!hasPermission) {
    redirect("/app/unauthorized");
  }

  return access;
}

export async function requireLedgerHqCloseAccess() {
  return requireHeadquartersActionPermission(PermissionAction.LEDGER_HQ_CLOSE);
}

export async function requireCorrectionCreateAccess() {
  return requireHeadquartersActionPermission(
    PermissionAction.CORRECTION_CREATE,
  );
}

export async function requireAuditHistoryAccess() {
  const currentUser = await requireSettingsAccess();
  await requireReportAccess();

  return currentUser;
}

export async function requireExportCreateAccess() {
  return requireHeadquartersActionPermission(PermissionAction.EXPORT_CREATE);
}

export async function getHeadquartersStoreScope() {
  const currentUser = await requireHeadquartersUser();
  const activeProfiles = await getActivePermissionProfiles(currentUser.id);
  const hasAllStoreAccess = activeProfiles.some(
    ({ profile }) => profile.storeAccessMode === StoreAccessMode.ALL_STORES,
  );
  const hasAssignedStoreAccess = activeProfiles.some(
    ({ profile }) =>
      profile.storeAccessMode === StoreAccessMode.ASSIGNED_STORES,
  );

  if (!hasAllStoreAccess && !hasAssignedStoreAccess) {
    redirect("/app/unauthorized");
  }

  const stores = await db.store.findMany({
    where: {
      isActive: true,
      ...(hasAllStoreAccess
        ? {}
        : {
            assignments: {
              some: {
                userId: currentUser.id,
              },
            },
          }),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: storeSelect,
  });

  return {
    user: currentUser,
    mode: hasAllStoreAccess
      ? StoreAccessMode.ALL_STORES
      : StoreAccessMode.ASSIGNED_STORES,
    stores,
    storeIds: stores.map((store) => store.id),
  };
}

export async function requireHeadquartersStoreScope(storeId: string) {
  const scope = await getHeadquartersStoreScope();
  const store = scope.stores.find((item) => item.id === storeId);

  if (!store) {
    redirect("/app/unauthorized");
  }

  return {
    user: scope.user,
    store,
  };
}

export async function requireHeadquartersLedgerScope(ledgerId: string) {
  const ledger = await db.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: {
      id: true,
      storeId: true,
    },
  });

  if (!ledger) {
    redirect("/app/unauthorized");
  }

  const scopedStore = await requireHeadquartersStoreScope(ledger.storeId);

  return {
    user: scopedStore.user,
    ledger,
    store: scopedStore.store,
  };
}

export async function getAppHomePath() {
  const currentUser = await getCurrentUserRecord();

  if (currentUser?.isActive !== true) {
    return appLoginPath;
  }

  if (currentUser.role === UserRole.HEADQUARTERS) {
    return "/app/dashboard";
  }

  if (currentUser.role === UserRole.STORE_MANAGER) {
    return "/app/store-entry";
  }

  return appLoginPath;
}

export async function getStoreManagerWorkspace() {
  const currentUser = await requireAppUser();

  if (currentUser.role === UserRole.HEADQUARTERS) {
    return {
      status: "headquarters",
      user: currentUser,
    } as const;
  }

  const store = await db.store.findFirst({
    where: {
      isActive: true,
      assignments: {
        some: {
          userId: currentUser.id,
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: storeSelect,
  });

  if (!store) {
    return {
      status: "no-active-store",
      user: currentUser,
    } as const;
  }

  return {
    status: "ready",
    user: currentUser,
    store,
  } as const;
}

export async function getStoreManagerLedgerEditWorkspace() {
  const workspace = await getStoreManagerWorkspace();

  if (workspace.status !== "ready") {
    return workspace;
  }

  await requireStoreManagerLedgerEditAccess(workspace.store.id);

  return workspace;
}

export async function requireStoreAccess(storeId: string) {
  const currentUser = await requireAppUser();

  if (currentUser.role === UserRole.HEADQUARTERS) {
    const activeProfiles = await getActivePermissionProfiles(currentUser.id);
    const hasAllStoreAccess = activeProfiles.some(
      ({ profile }) => profile.storeAccessMode === StoreAccessMode.ALL_STORES,
    );
    const hasAssignedStoreAccess = activeProfiles.some(
      ({ profile }) =>
        profile.storeAccessMode === StoreAccessMode.ASSIGNED_STORES,
    );

    if (!hasAllStoreAccess && !hasAssignedStoreAccess) {
      redirect("/app/unauthorized");
    }

    const store = await db.store.findFirst({
      where: {
        id: storeId,
        isActive: true,
        ...(hasAllStoreAccess
          ? {}
          : {
              assignments: {
                some: {
                  userId: currentUser.id,
                },
              },
            }),
      },
      select: storeSelect,
    });

    if (!store) {
      redirect("/app/unauthorized");
    }

    return {
      user: currentUser,
      store,
    };
  }

  if (currentUser.role !== UserRole.STORE_MANAGER) {
    redirect("/app/unauthorized");
  }

  const store = await db.store.findFirst({
    where: {
      id: storeId,
      isActive: true,
      assignments: {
        some: {
          userId: currentUser.id,
        },
      },
    },
    select: storeSelect,
  });

  if (!store) {
    redirect("/app/unauthorized");
  }

  return {
    user: currentUser,
    store,
  };
}
