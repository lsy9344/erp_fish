import { UserRole } from "../../../generated/prisma/index.js";
import { requireUserPermissionAccess } from "~/server/authz";
import { db } from "~/server/db";

export type UserRoleFilter = "all" | UserRole;
export type UserStatusFilter = "all" | "active" | "inactive";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  updatedAt: string;
  storeIds: string[];
  storeNames: string[];
  profileIds: string[];
  profileNames: string[];
};

export type PermissionProfileOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type UserListFilters = {
  role?: UserRoleFilter;
  status?: UserStatusFilter;
};

export function normalizeUserRoleFilter(
  value: string | string[] | undefined,
): UserRoleFilter {
  if (value === UserRole.HEADQUARTERS || value === UserRole.STORE_MANAGER) {
    return value;
  }

  return "all";
}

export function normalizeUserStatusFilter(
  value: string | string[] | undefined,
): UserStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export async function getUsersForHeadquarters(filters: UserListFilters = {}) {
  await requireUserPermissionAccess();

  const role = filters.role ?? "all";
  const status = filters.status ?? "all";

  const users = await db.user.findMany({
    where: {
      ...(role === "all" ? {} : { role }),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [{ name: "asc" }, { email: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      updatedAt: true,
      storeAssignments: {
        where: {
          store: {
            isActive: true,
          },
        },
        orderBy: {
          store: {
            name: "asc",
          },
        },
        select: {
          storeId: true,
          store: {
            select: {
              name: true,
            },
          },
        },
      },
      permissionProfiles: {
        where: {
          profile: {
            isActive: true,
          },
        },
        orderBy: {
          profile: {
            name: "asc",
          },
        },
        select: {
          profileId: true,
          profile: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return users.map<UserListItem>((user) => ({
    id: user.id,
    name: user.name ?? "이름 없음",
    email: user.email ?? "",
    role: user.role,
    isActive: user.isActive,
    updatedAt: user.updatedAt.toISOString(),
    storeIds: user.storeAssignments.map((assignment) => assignment.storeId),
    storeNames: user.storeAssignments.map(
      (assignment) => assignment.store.name,
    ),
    profileIds: user.permissionProfiles.map(
      (assignment) => assignment.profileId,
    ),
    profileNames: user.permissionProfiles.map(
      (assignment) => assignment.profile.name,
    ),
  }));
}

export async function getUserManagementOptions() {
  await requireUserPermissionAccess();

  const [stores, profiles] = await Promise.all([
    db.store.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),
    db.permissionProfile.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
      },
    }),
  ]);

  return { stores, profiles };
}
