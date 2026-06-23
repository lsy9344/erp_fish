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

export async function requireUserPermissionAccess() {
  return requireHeadquartersActionPermission(
    PermissionAction.USER_PERMISSION_MANAGE,
  );
}

export async function requireReportAccess() {
  return requireHeadquartersActionPermission(PermissionAction.REPORT_VIEW);
}

// WO-D(2026-06-22): 직원 마스터 조회는 REPORT_VIEW, 직원 생성/수정/비활성화 등
// 쓰기 작업은 SETTINGS_MANAGE로 분리한다. REPORT_VIEW만 가진 읽기 전용 본사
// 사용자가 인사 마스터를 변경하지 못하도록 막는다.
export async function requireEmployeeManageAccess() {
  return requireHeadquartersActionPermission(PermissionAction.SETTINGS_MANAGE);
}

export async function requireLedgerHqEditAccess() {
  return requireHeadquartersActionPermission(PermissionAction.LEDGER_EDIT);
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
