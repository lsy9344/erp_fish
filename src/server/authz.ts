import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { UserRole } from "../../generated/prisma";
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
    const store = await db.store.findFirst({
      where: { id: storeId },
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
