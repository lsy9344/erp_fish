"use server";

import {
  PermissionAction,
  Prisma,
  UserRole,
} from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  withAuditActorContext,
  writeAuditLog,
  type AuditActorContext,
} from "~/server/audit";
import {
  requireMasterDataDeleteAccess,
  requireUserPermissionAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { hashPassword } from "~/server/password";
import { revalidateMasterDataPaths } from "~/server/revalidation";
import {
  createUserAccountSchema,
  toUserFieldErrors,
  updateUserAccountSchema,
  userPermissionProfilesSchema,
  userStatusSchema,
  type CreateUserAccountInput,
  type UpdateUserAccountInput,
  type UserPermissionProfilesInput,
  type UserStatusInput,
} from "./user-schemas";

type UserActionData = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  storeIds: string[];
};

type UserSnapshot = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  storeIds: string[];
  storeNames: string[];
  profileIds: string[];
  profileNames: string[];
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} as const;
const userManagementTransactionOptions = { timeout: 15_000 } as const;

function revalidateUserPaths() {
  revalidateMasterDataPaths("users");
}

function parseCreateUserInput(
  input: unknown,
): ActionResult<CreateUserAccountInput> {
  const parsed = createUserAccountSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toUserFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseUpdateUserInput(
  input: unknown,
): ActionResult<UpdateUserAccountInput> {
  const parsed = updateUserAccountSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toUserFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseUserStatusInput(input: unknown): ActionResult<UserStatusInput> {
  const parsed = userStatusSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toUserFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseUserPermissionProfilesInput(
  input: unknown,
): ActionResult<UserPermissionProfilesInput> {
  const parsed = userPermissionProfilesSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toUserFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function duplicateEmailError<T>(): ActionResult<T> {
  return actionError(
    "DUPLICATE_USER_EMAIL",
    "이미 같은 이메일 사용자가 있습니다.",
    {
      email: ["이미 같은 이메일 사용자가 있습니다."],
    },
  );
}

function inactiveStoreError<T>(): ActionResult<T> {
  return actionError(
    "INVALID_STORE_ASSIGNMENT",
    "활성 지점만 배정할 수 있습니다.",
    {
      storeIds: ["활성 지점만 배정할 수 있습니다."],
    },
  );
}

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isPrismaForeignKeyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

// 삭제를 막을 관계. 이 앱은 모든 쓰기가 AuditLog를 남기므로 auditLogs 하나가
// "이 계정이 일한 적 있다"의 사실상 단일 신호다. 장부 관계는 사유를 구체적으로
// 보여주려고 함께 센다. 나머지 30여 개 Restrict 관계는 스키마가 막고, 여기서는
// P2003을 같은 메시지로 옮겨 담는다(관계가 늘어도 이 목록을 고칠 필요가 없다).
const USER_DELETE_BLOCKERS = [
  ["auditLogs", "변경 이력"],
  ["createdDailyLedgers", "작성한 장부"],
  ["updatedDailyLedgers", "수정한 장부"],
  ["submittedDailyLedgers", "제출한 장부"],
  ["closedDailyLedgers", "마감한 장부"],
  ["lossReviewedDailyLedgers", "손실 검토한 장부"],
] as const;

function userInUseError<T>(reason: string): ActionResult<T> {
  return actionError(
    "USER_IN_USE",
    `${reason} 삭제할 수 없습니다. 대신 비활성으로 바꿔 주세요.`,
  );
}

// WO(2026-08-14): 안 쓰거나 잘못 만든 계정 정리용. 되돌릴 수 없어
// 사용자/권한 수정과 분리한 MASTER_DATA_DELETE 권한이 있어야 한다.
export async function deleteUserAccount(
  userId: string,
): Promise<ActionResult<UserActionData>> {
  const actor = await requireMasterDataDeleteAccess();

  if (actor.id === userId) {
    return actionError(
      "SELF_DELETE",
      "현재 로그인한 계정은 삭제할 수 없습니다.",
    );
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getUserSnapshot(tx, userId);

      if (!before) {
        return { status: "missing" as const };
      }

      const counts = await tx.user.findUnique({
        where: { id: userId },
        select: {
          _count: {
            select: {
              auditLogs: true,
              createdDailyLedgers: true,
              updatedDailyLedgers: true,
              submittedDailyLedgers: true,
              closedDailyLedgers: true,
              lossReviewedDailyLedgers: true,
            },
          },
        },
      });

      if (!counts) {
        return { status: "missing" as const };
      }

      const blockers = USER_DELETE_BLOCKERS.filter(
        ([key]) => counts._count[key] > 0,
      ).map(([, label]) => label);

      if (blockers.length > 0) {
        return { status: "in-use" as const, blockers };
      }

      await writeAuditLog(tx, {
        action: "user.deleted",
        targetType: "User",
        targetId: userId,
        actorId: actor.id,
        before: toAuditUserSnapshot(
          before,
          toUserDeleteAuditContext(actor.role),
        ),
        after: null,
      });

      // 지점 배정·권한 프로필·세션은 Cascade라 함께 사라진다(연결 정보뿐이다).
      await tx.user.delete({ where: { id: userId } });

      return { status: "deleted" as const, before };
    }, userManagementTransactionOptions);

    if (result.status === "missing") {
      return actionError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }

    if (result.status === "in-use") {
      return userInUseError(`${result.blockers.join(", ")} 기록이 있어`);
    }

    revalidateUserPaths();

    return actionOk(
      toActionData(
        {
          id: result.before.id,
          name: result.before.name,
          email: result.before.email,
          role: result.before.role,
          isActive: result.before.isActive,
        },
        result.before.storeIds,
      ),
    );
  } catch (error) {
    if (isPrismaForeignKeyError(error)) {
      return userInUseError("이 계정을 참조하는 기록이 있어");
    }

    throw error;
  }
}

function uniqueStoreIds(storeIds: string[]) {
  return [...new Set(storeIds)];
}

async function getValidStoreAssignments(
  tx: Prisma.TransactionClient,
  role: UserRole,
  storeIds: string[],
) {
  const ids = role === UserRole.STORE_MANAGER ? uniqueStoreIds(storeIds) : [];

  if (ids.length === 0) {
    return [];
  }

  const stores = await tx.store.findMany({
    where: {
      id: { in: ids },
      isActive: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
    },
  });

  if (stores.length !== ids.length) {
    return null;
  }

  return stores;
}

function toActionData(
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: UserRole;
    isActive: boolean;
  },
  storeIds: string[],
): UserActionData {
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    isActive: user.isActive,
    storeIds,
  };
}

async function getUserSnapshot(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<UserSnapshot | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      storeAssignments: {
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

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
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
  };
}

function sameStringArray(first: string[], second: string[]) {
  const sortedFirst = [...first].sort();
  const sortedSecond = [...second].sort();

  return (
    sortedFirst.length === sortedSecond.length &&
    sortedFirst.every((value, index) => value === sortedSecond[index])
  );
}

function toAuditUserSnapshot(
  snapshot: UserSnapshot,
  actorContext: AuditActorContext,
) {
  return withAuditActorContext(
    {
      id: snapshot.id,
      name: snapshot.name,
      email: snapshot.email,
      role: snapshot.role,
      isActive: snapshot.isActive,
      storeIds: snapshot.storeIds,
      storeNames: snapshot.storeNames,
      profileIds: snapshot.profileIds,
      profileNames: snapshot.profileNames,
    },
    actorContext,
  );
}

function toUserPermissionAuditContext(actorRole: UserRole) {
  return {
    actorRole,
    requiredAction: PermissionAction.USER_PERMISSION_MANAGE,
  };
}

// 삭제는 USER_PERMISSION_MANAGE가 아니라 전용 action으로 통과한다. 감사 로그에도 그대로 남긴다.
function toUserDeleteAuditContext(actorRole: UserRole) {
  return {
    actorRole,
    requiredAction: PermissionAction.MASTER_DATA_DELETE,
  };
}

async function writeUserChangeAudits(
  tx: Prisma.TransactionClient,
  params: {
    actorId: string;
    actorRole: UserRole;
    userId: string;
    before: UserSnapshot | null;
    after: UserSnapshot;
  },
) {
  const { actorId, actorRole, userId, before, after } = params;
  const actorContext = toUserPermissionAuditContext(actorRole);

  if (!before) {
    await writeAuditLog(tx, {
      action: "user.created",
      targetType: "User",
      targetId: userId,
      actorId,
      before: null,
      after: toAuditUserSnapshot(after, actorContext),
    });
  } else if (
    before.name !== after.name ||
    before.email !== after.email ||
    before.isActive !== after.isActive
  ) {
    await writeAuditLog(tx, {
      action:
        before.isActive !== after.isActive
          ? after.isActive
            ? "user.activated"
            : "user.deactivated"
          : "user.updated",
      targetType: "User",
      targetId: userId,
      actorId,
      before: toAuditUserSnapshot(before, actorContext),
      after: toAuditUserSnapshot(after, actorContext),
    });
  }

  if (before && before.role !== after.role) {
    await writeAuditLog(tx, {
      action: "user.role_changed",
      targetType: "User",
      targetId: userId,
      actorId,
      before: toAuditUserSnapshot(before, actorContext),
      after: toAuditUserSnapshot(after, actorContext),
    });
  }

  const beforeStoreIds = before?.storeIds ?? [];

  if (!sameStringArray(beforeStoreIds, after.storeIds)) {
    await writeAuditLog(tx, {
      action: "user.store_assignments_changed",
      targetType: "User",
      targetId: userId,
      actorId,
      before: before ? toAuditUserSnapshot(before, actorContext) : null,
      after: toAuditUserSnapshot(after, actorContext),
    });
  }

  const beforeProfileIds = before?.profileIds ?? [];

  if (!sameStringArray(beforeProfileIds, after.profileIds)) {
    await writeAuditLog(tx, {
      action: "user.permission_profiles_changed",
      targetType: "User",
      targetId: userId,
      actorId,
      before: before ? toAuditUserSnapshot(before, actorContext) : null,
      after: toAuditUserSnapshot(after, actorContext),
    });
  }
}

async function replaceStoreAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  storeIds: string[],
) {
  await tx.userStoreAssignment.deleteMany({
    where: { userId },
  });

  if (storeIds.length === 0) {
    return;
  }

  await tx.userStoreAssignment.createMany({
    data: storeIds.map((storeId) => ({
      userId,
      storeId,
    })),
    skipDuplicates: true,
  });
}

async function replacePermissionProfiles(
  tx: Prisma.TransactionClient,
  userId: string,
  profileIds: string[],
) {
  await tx.userPermissionProfile.deleteMany({
    where: { userId },
  });

  if (profileIds.length === 0) {
    return;
  }

  await tx.userPermissionProfile.createMany({
    data: profileIds.map((profileId) => ({
      userId,
      profileId,
    })),
    skipDuplicates: true,
  });
}

export async function createUserAccount(
  input: unknown,
): Promise<ActionResult<UserActionData>> {
  const actor = await requireUserPermissionAccess();
  const parsed = parseCreateUserInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const duplicate = await tx.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true },
      });

      if (duplicate) {
        return { status: "duplicate" as const };
      }

      const stores = await getValidStoreAssignments(
        tx,
        parsed.data.role,
        parsed.data.storeIds,
      );

      if (!stores) {
        return { status: "invalid-stores" as const };
      }

      const profileIds = [...new Set(parsed.data.profileIds)];
      const profiles =
        profileIds.length === 0
          ? []
          : await tx.permissionProfile.findMany({
              where: {
                id: { in: profileIds },
                isActive: true,
              },
              select: { id: true },
            });

      if (profiles.length !== profileIds.length) {
        return { status: "invalid-profiles" as const };
      }

      const passwordHash = await hashPassword(parsed.data.initialPassword);
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          isActive: parsed.data.isActive,
          passwordHash,
        },
        select: userSelect,
      });

      await replaceStoreAssignments(
        tx,
        created.id,
        stores.map((store) => store.id),
      );

      await replacePermissionProfiles(tx, created.id, profileIds);

      const after = await getUserSnapshot(tx, created.id);

      if (!after) {
        throw new Error("Created user could not be loaded for audit.");
      }

      await writeUserChangeAudits(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        userId: created.id,
        before: null,
        after,
      });

      return {
        status: "created" as const,
        user: created,
        storeIds: stores.map((store) => store.id),
      };
    }, userManagementTransactionOptions);

    if (result.status === "duplicate") {
      return duplicateEmailError();
    }

    if (result.status === "invalid-stores") {
      return inactiveStoreError();
    }

    if (result.status === "invalid-profiles") {
      return actionError(
        "INVALID_PERMISSION_PROFILE",
        "활성 권한 프로필만 배정할 수 있습니다.",
        {
          profileIds: ["활성 권한 프로필만 배정할 수 있습니다."],
        },
      );
    }

    revalidateUserPaths();

    return actionOk(toActionData(result.user, result.storeIds));
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateEmailError();
    }

    throw error;
  }
}

export async function updateUserAccount(
  userId: string,
  input: unknown,
): Promise<ActionResult<UserActionData>> {
  const actor = await requireUserPermissionAccess();
  const parsed = parseUpdateUserInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  if (
    actor.id === userId &&
    (parsed.data.role !== UserRole.HEADQUARTERS || !parsed.data.isActive)
  ) {
    return actionError(
      "SELF_PERMISSION_CHANGE",
      "현재 로그인한 본사 계정의 권한은 직접 낮추거나 비활성화할 수 없습니다.",
    );
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getUserSnapshot(tx, userId);

      if (!before) {
        return { status: "missing" as const };
      }

      const stores = await getValidStoreAssignments(
        tx,
        parsed.data.role,
        parsed.data.storeIds,
      );

      if (!stores) {
        return { status: "invalid-stores" as const };
      }

      const profileIds = [...new Set(parsed.data.profileIds)];
      const profiles =
        profileIds.length === 0
          ? []
          : await tx.permissionProfile.findMany({
              where: {
                id: { in: profileIds },
                isActive: true,
              },
              select: {
                id: true,
                actions: {
                  select: { action: true },
                },
              },
            });

      if (profiles.length !== profileIds.length) {
        return { status: "invalid-profiles" as const };
      }

      if (actor.id === userId) {
        const retainsPermissionManage = profiles.some((profile) =>
          profile.actions.some(
            (entry) => entry.action === PermissionAction.USER_PERMISSION_MANAGE,
          ),
        );

        if (!retainsPermissionManage) {
          return { status: "self-lockout" as const };
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          isActive: parsed.data.isActive,
        },
        select: userSelect,
      });

      await replaceStoreAssignments(
        tx,
        userId,
        stores.map((store) => store.id),
      );

      await replacePermissionProfiles(tx, userId, profileIds);

      const after = await getUserSnapshot(tx, userId);

      if (!after) {
        throw new Error("Updated user could not be loaded for audit.");
      }

      await writeUserChangeAudits(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        userId,
        before,
        after,
      });

      return {
        status: "updated" as const,
        user: updated,
        storeIds: stores.map((store) => store.id),
      };
    }, userManagementTransactionOptions);

    if (result.status === "missing") {
      return actionError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }

    if (result.status === "invalid-stores") {
      return inactiveStoreError();
    }

    if (result.status === "invalid-profiles") {
      return actionError(
        "INVALID_PERMISSION_PROFILE",
        "활성 권한 프로필만 배정할 수 있습니다.",
        {
          profileIds: ["활성 권한 프로필만 배정할 수 있습니다."],
        },
      );
    }

    if (result.status === "self-lockout") {
      return actionError(
        "SELF_PERMISSION_CHANGE",
        "현재 로그인한 본사 계정의 권한 관리 권한은 직접 제거할 수 없습니다.",
        {
          profileIds: [
            "권한 관리(USER_PERMISSION_MANAGE) 권한을 가진 프로필을 최소 하나 유지해야 합니다.",
          ],
        },
      );
    }

    revalidateUserPaths();

    return actionOk(toActionData(result.user, result.storeIds));
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return duplicateEmailError();
    }

    throw error;
  }
}

export async function updateUserStatus(
  userId: string,
  input: unknown,
): Promise<ActionResult<UserActionData>> {
  const actor = await requireUserPermissionAccess();
  const parsed = parseUserStatusInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  if (actor.id === userId && !parsed.data.isActive) {
    return actionError(
      "SELF_PERMISSION_CHANGE",
      "현재 로그인한 본사 계정은 직접 비활성화할 수 없습니다.",
    );
  }

  const result = await db.$transaction(async (tx) => {
    const before = await getUserSnapshot(tx, userId);

    if (!before) {
      return { status: "missing" as const };
    }

    if (before.isActive === parsed.data.isActive) {
      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });

      if (!existing) {
        return { status: "missing" as const };
      }

      return {
        status: "unchanged" as const,
        user: existing,
        storeIds: before.storeIds,
      };
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { isActive: parsed.data.isActive },
      select: userSelect,
    });
    const after = await getUserSnapshot(tx, userId);

    if (!after) {
      throw new Error("Updated user could not be loaded for audit.");
    }

    await writeUserChangeAudits(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      userId,
      before,
      after,
    });

    return {
      status: "updated" as const,
      user: updated,
      storeIds: after.storeIds,
    };
  }, userManagementTransactionOptions);

  if (result.status === "missing") {
    return actionError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }

  if (result.status === "updated") {
    revalidateUserPaths();
  }

  return actionOk(toActionData(result.user, result.storeIds));
}

export async function updateUserPermissionProfiles(
  userId: string,
  input: unknown,
): Promise<ActionResult<UserActionData>> {
  const actor = await requireUserPermissionAccess();
  const parsed = parseUserPermissionProfilesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const profileIds = [...new Set(parsed.data.profileIds)];

  const result = await db.$transaction(async (tx) => {
    const before = await getUserSnapshot(tx, userId);

    if (!before) {
      return { status: "missing" as const };
    }

    const profiles =
      profileIds.length === 0
        ? []
        : await tx.permissionProfile.findMany({
            where: {
              id: { in: profileIds },
              isActive: true,
            },
            select: {
              id: true,
              actions: {
                select: { action: true },
              },
            },
          });

    if (profiles.length !== profileIds.length) {
      return { status: "invalid-profiles" as const };
    }

    // 자기 자신의 권한을 편집할 때는, 권한 관리(USER_PERMISSION_MANAGE) action을
    // 부여하는 활성 프로필이 최소 하나는 남아 있어야 한다. 그렇지 않으면 본인이
    // 권한 관리 화면에서 스스로를 잠가버릴 수 있다.
    if (actor.id === userId) {
      const retainsPermissionManage = profiles.some((profile) =>
        profile.actions.some(
          (entry) => entry.action === PermissionAction.USER_PERMISSION_MANAGE,
        ),
      );

      if (!retainsPermissionManage) {
        return { status: "self-lockout" as const };
      }
    }

    await replacePermissionProfiles(tx, userId, profileIds);

    const updated = await tx.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });

    if (!updated) {
      return { status: "missing" as const };
    }

    const after = await getUserSnapshot(tx, userId);

    if (!after) {
      throw new Error("Updated user could not be loaded for audit.");
    }

    await writeUserChangeAudits(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      userId,
      before,
      after,
    });

    return {
      status: "updated" as const,
      user: updated,
      storeIds: after.storeIds,
    };
  }, userManagementTransactionOptions);

  if (result.status === "missing") {
    return actionError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }

  if (result.status === "invalid-profiles") {
    return actionError(
      "INVALID_PERMISSION_PROFILE",
      "활성 권한 프로필만 배정할 수 있습니다.",
      {
        profileIds: ["활성 권한 프로필만 배정할 수 있습니다."],
      },
    );
  }

  if (result.status === "self-lockout") {
    return actionError(
      "SELF_PERMISSION_CHANGE",
      "현재 로그인한 본사 계정의 권한 관리 권한은 직접 제거할 수 없습니다.",
      {
        profileIds: [
          "권한 관리(USER_PERMISSION_MANAGE) 권한을 가진 프로필을 최소 하나 유지해야 합니다.",
        ],
      },
    );
  }

  revalidateUserPaths();

  return actionOk(toActionData(result.user, result.storeIds));
}
