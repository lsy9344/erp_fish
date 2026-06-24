"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";

import {
  createUserAccount,
  updateUserAccount,
  updateUserPermissionProfiles,
  updateUserStatus,
} from "~/features/master-data/user-actions";
import type {
  PermissionProfileOption,
  UserListItem,
  UserRoleFilter,
  UserStatusFilter,
} from "~/features/master-data/user-queries";
import type { FieldErrors } from "~/lib/action-result";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type ActiveStoreOption = {
  id: string;
  name: string;
};

type UserManagementClientProps = {
  users: UserListItem[];
  stores: ActiveStoreOption[];
  profiles: PermissionProfileOption[];
  filters: {
    role: UserRoleFilter;
    status: UserStatusFilter;
  };
};

type UserRoleValue = "HEADQUARTERS" | "STORE_MANAGER";
type EditingState =
  | {
      mode: "create";
      user?: never;
    }
  | {
      mode: "edit";
      user: UserListItem;
    };

const roleLabels: Record<UserRoleValue, string> = {
  HEADQUARTERS: "본사",
  STORE_MANAGER: "지점장",
};

const statusLabels = {
  active: "활성",
  inactive: "비활성",
} as const;

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function getStatusValue(isActive: boolean) {
  return isActive ? "active" : "inactive";
}

function getRoleLabel(role: string) {
  return roleLabels[role as UserRoleValue] ?? role;
}

export function UserManagementClient({
  users,
  stores,
  profiles,
  filters,
}: UserManagementClientProps) {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const firstStoreInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<EditingState | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [role, setRole] = useState<UserRoleValue>("STORE_MANAGER");
  const [isActive, setIsActive] = useState(true);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rowStatusValues, setRowStatusValues] = useState<
    Record<string, string>
  >({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function pushFilters(next: {
    role?: UserRoleFilter;
    status?: UserStatusFilter;
  }) {
    const params = new URLSearchParams();

    if (next.role && next.role !== "all") {
      params.set("role", next.role);
    }

    if (next.status && next.status !== "all") {
      params.set("status", next.status);
    }

    router.push(
      `/app/master-data/users${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  function focusFirstError(errors: FieldErrors) {
    window.setTimeout(() => {
      if (errors.name?.length) {
        nameInputRef.current?.focus();
        return;
      }

      if (errors.email?.length) {
        emailInputRef.current?.focus();
        return;
      }

      if (errors.initialPassword?.length) {
        passwordInputRef.current?.focus();
        return;
      }

      if (errors.storeIds?.length) {
        firstStoreInputRef.current?.focus();
      }
    }, 0);
  }

  function openCreateDialog() {
    setDialogState({ mode: "create" });
    setName("");
    setEmail("");
    setInitialPassword("");
    setRole("STORE_MANAGER");
    setIsActive(true);
    setStoreIds([]);
    setProfileIds([]);
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function openEditDialog(user: UserListItem) {
    setDialogState({ mode: "edit", user });
    setName(user.name);
    setEmail(user.email);
    setInitialPassword("");
    setRole(user.role);
    setIsActive(user.isActive);
    setStoreIds(user.storeIds);
    setProfileIds(user.profileIds);
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function closeDialog() {
    setDialogState(null);
    setFieldErrors({});
    setFormError(null);
  }

  function toggleStore(storeId: string, checked: boolean) {
    setStoreIds((current) =>
      checked
        ? [...new Set([...current, storeId])]
        : current.filter((id) => id !== storeId),
    );
  }

  function toggleProfile(profileId: string, checked: boolean) {
    setProfileIds((current) =>
      checked
        ? [...new Set([...current, profileId])]
        : current.filter((id) => id !== profileId),
    );
  }

  async function handleRoleFilterChange(value: string) {
    const nextRole =
      value === "HEADQUARTERS" || value === "STORE_MANAGER" ? value : "all";

    pushFilters({ role: nextRole, status: filters.status });
  }

  async function handleStatusFilterChange(value: string) {
    const nextStatus =
      value === "active" || value === "inactive" ? value : "all";

    pushFilters({ role: filters.role, status: nextStatus });
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result =
        dialogState?.mode === "edit"
          ? await updateUserAccount(dialogState.user.id, {
              name,
              email,
              role,
              isActive,
              storeIds,
            })
          : await createUserAccount({
              name,
              email,
              role,
              initialPassword,
              isActive: true,
              storeIds,
            });

      if (!result.ok) {
        const nextErrors = result.error.fieldErrors ?? {};
        setFormError(result.error.message);
        setFieldErrors(nextErrors);
        focusFirstError(nextErrors);
        return;
      }

      if (dialogState?.mode === "edit") {
        const profileResult = await updateUserPermissionProfiles(
          dialogState.user.id,
          { profileIds },
        );

        if (!profileResult.ok) {
          const nextErrors = profileResult.error.fieldErrors ?? {};
          setFormError(profileResult.error.message);
          setFieldErrors(nextErrors);
          return;
        }
      }

      closeDialog();
      router.refresh();
    } catch {
      setFormError("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRowStatusSave(user: UserListItem) {
    const statusValue =
      rowStatusValues[user.id] ?? getStatusValue(user.isActive);
    const nextIsActive = statusValue === "active";

    if (nextIsActive === user.isActive) {
      return;
    }

    setRowSavingId(user.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[user.id];
      return next;
    });

    try {
      const result = await updateUserStatus(user.id, {
        isActive: nextIsActive,
      });

      if (!result.ok) {
        setRowErrors((current) => ({
          ...current,
          [user.id]: result.error.message,
        }));
        return;
      }

      router.refresh();
    } catch {
      setRowErrors((current) => ({
        ...current,
        [user.id]: "상태 변경 중 오류가 발생했습니다.",
      }));
    } finally {
      setRowSavingId(null);
    }
  }

  const nameError = fieldErrors.name?.[0];
  const emailError = fieldErrors.email?.[0];
  const passwordError = fieldErrors.initialPassword?.[0];
  const storeIdsError = fieldErrors.storeIds?.[0];
  const profileIdsError = fieldErrors.profileIds?.[0];
  const showStorePicker = role === "STORE_MANAGER";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field>
            <FieldLabel htmlFor="user-role-filter">역할 필터</FieldLabel>
            <select
              id="user-role-filter"
              value={filters.role}
              onChange={(event) =>
                void handleRoleFilterChange(event.currentTarget.value)
              }
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="all">전체</option>
              <option value="HEADQUARTERS">본사</option>
              <option value="STORE_MANAGER">지점장</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="user-status-filter">상태 필터</FieldLabel>
            <select
              id="user-status-filter"
              value={filters.status}
              onChange={(event) =>
                void handleStatusFilterChange(event.currentTarget.value)
              }
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="all">전체</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </Field>
        </div>
        <Button type="button" onClick={openCreateDialog}>
          <PlusIcon data-icon="inline-start" />
          사용자 추가
        </Button>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>로그인 식별자</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>연결 지점</TableHead>
              <TableHead>권한 프로필</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 수정 시각</TableHead>
              <TableHead className="text-right">행 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const statusValue =
                rowStatusValues[user.id] ?? getStatusValue(user.isActive);
              const isRowStatusChanged =
                statusValue !== getStatusValue(user.isActive);
              const rowError = rowErrors[user.id];

              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{getRoleLabel(user.role)}</TableCell>
                  <TableCell>
                    {user.storeNames.length > 0
                      ? user.storeNames.join(", ")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {user.profileNames.length > 0
                      ? user.profileNames.join(", ")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "secondary" : "outline"}>
                      {user.isActive
                        ? statusLabels.active
                        : statusLabels.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUpdatedAt(user.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <select
                        aria-label="활성 상태"
                        value={statusValue}
                        onChange={(event) => {
                          const nextStatusValue = event.currentTarget.value;

                          setRowStatusValues((current) => ({
                            ...current,
                            [user.id]: nextStatusValue,
                          }));
                          setRowErrors((current) => {
                            const next = { ...current };
                            delete next[user.id];
                            return next;
                          });
                        }}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                      >
                        <option value="active">활성</option>
                        <option value="inactive">비활성</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleRowStatusSave(user)}
                        disabled={
                          rowSavingId === user.id || !isRowStatusChanged
                        }
                      >
                        상태 적용
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(user)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        수정
                      </Button>
                    </div>
                    {rowError ? (
                      <p className="text-destructive mt-2 text-sm" role="alert">
                        {rowError}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-8 text-center"
                >
                  조건에 맞는 사용자가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(dialogState)}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit"
                ? "사용자 정보 수정"
                : "사용자 추가"}
            </DialogTitle>
            <DialogDescription>
              본사 사용자와 지점장 계정의 접근 범위를 관리합니다.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleDialogSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="user-name">이름</FieldLabel>
              <Input
                ref={nameInputRef}
                id="user-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "user-name-error" : undefined}
              />
              {nameError ? (
                <FieldError id="user-name-error">{nameError}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(emailError)}>
              <FieldLabel htmlFor="user-email">로그인 식별자</FieldLabel>
              <Input
                ref={emailInputRef}
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "user-email-error" : undefined}
              />
              {emailError ? (
                <FieldError id="user-email-error">{emailError}</FieldError>
              ) : null}
            </Field>
            {dialogState?.mode !== "edit" ? (
              <Field data-invalid={Boolean(passwordError)}>
                <FieldLabel htmlFor="user-initial-password">
                  초기 비밀번호
                </FieldLabel>
                <Input
                  ref={passwordInputRef}
                  id="user-initial-password"
                  type="password"
                  value={initialPassword}
                  onChange={(event) =>
                    setInitialPassword(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? "user-password-error" : undefined
                  }
                />
                {passwordError ? (
                  <FieldError id="user-password-error">
                    {passwordError}
                  </FieldError>
                ) : null}
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="user-role">역할</FieldLabel>
              <select
                id="user-role"
                value={role}
                onChange={(event) => {
                  const nextRole = event.currentTarget.value as UserRoleValue;
                  setRole(nextRole);
                  if (nextRole === "HEADQUARTERS") {
                    setStoreIds([]);
                  }
                }}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="HEADQUARTERS">본사</option>
                <option value="STORE_MANAGER">지점장</option>
              </select>
            </Field>
            {showStorePicker ? (
              <Field data-invalid={Boolean(storeIdsError)}>
                <FieldLabel>연결 지점</FieldLabel>
                <div
                  id="user-store-options"
                  role="group"
                  aria-describedby={
                    storeIdsError ? "user-store-options-error" : undefined
                  }
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
                >
                  {stores.map((store, index) => (
                    <label
                      key={store.id}
                      className="flex min-h-11 items-center gap-2 text-sm"
                    >
                      <input
                        ref={index === 0 ? firstStoreInputRef : undefined}
                        type="checkbox"
                        checked={storeIds.includes(store.id)}
                        aria-invalid={Boolean(storeIdsError)}
                        aria-describedby={
                          storeIdsError ? "user-store-options-error" : undefined
                        }
                        onChange={(event) =>
                          toggleStore(store.id, event.currentTarget.checked)
                        }
                      />
                      <span>{store.name}</span>
                    </label>
                  ))}
                </div>
                {storeIdsError ? (
                  <FieldError id="user-store-options-error">
                    {storeIdsError}
                  </FieldError>
                ) : null}
              </Field>
            ) : null}
            {dialogState?.mode === "edit" ? (
              <Field data-invalid={Boolean(profileIdsError)}>
                <FieldLabel>권한 프로필</FieldLabel>
                {profiles.length > 0 ? (
                  <div
                    id="user-profile-options"
                    role="group"
                    aria-describedby={
                      profileIdsError ? "user-profile-options-error" : undefined
                    }
                    className="grid gap-2 rounded-md border p-3"
                  >
                    {profiles.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex min-h-11 items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={profileIds.includes(profile.id)}
                          aria-invalid={Boolean(profileIdsError)}
                          aria-describedby={
                            profileIdsError
                              ? "user-profile-options-error"
                              : undefined
                          }
                          onChange={(event) =>
                            toggleProfile(
                              profile.id,
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <span className="flex flex-col">
                          <span className="font-medium">{profile.name}</span>
                          {profile.description ? (
                            <span className="text-muted-foreground">
                              {profile.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    배정 가능한 활성 권한 프로필이 없습니다.
                  </p>
                )}
                {profileIdsError ? (
                  <FieldError id="user-profile-options-error">
                    {profileIdsError}
                  </FieldError>
                ) : null}
              </Field>
            ) : null}
            {dialogState?.mode === "edit" ? (
              <Field>
                <FieldLabel htmlFor="user-active">활성 상태</FieldLabel>
                <select
                  id="user-active"
                  value={getStatusValue(isActive)}
                  onChange={(event) =>
                    setIsActive(event.currentTarget.value === "active")
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
              </Field>
            ) : null}
            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                취소
              </Button>
              <Button type="submit" disabled={isSaving}>
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
