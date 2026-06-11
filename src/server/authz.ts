import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { StoreAccessMode, UserRole } from "../../generated/prisma";
import type { PermissionAction } from "../../generated/prisma";
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
