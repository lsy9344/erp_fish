import { UserRole } from "../../../generated/prisma/index.js";
import { requireHeadquartersUser } from "~/server/authz";
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
  await requireHeadquartersUser();

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
  }));
}

export async function getUserManagementOptions() {
  await requireHeadquartersUser();

  const stores = await db.store.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
    },
  });

  return { stores };
}
