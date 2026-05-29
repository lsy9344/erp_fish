import { z } from "zod";

import { UserRole } from "../../../generated/prisma/index.js";

const userNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "이름을 입력해 주세요.")
      .max(80, "이름은 80자 이하여야 합니다."),
  );

const userEmailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email("이메일 형식이 올바르지 않습니다."));

const storeIdsSchema = z.array(z.string()).default([]);

function requireStoreForManager<
  T extends { role: UserRole; storeIds: string[] },
>(value: T, context: z.RefinementCtx) {
  if (value.role === UserRole.STORE_MANAGER && value.storeIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "지점장은 하나 이상의 활성 지점에 배정해야 합니다.",
      path: ["storeIds"],
    });
  }
}

export const createUserAccountSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    role: z.nativeEnum(UserRole),
    initialPassword: z
      .string()
      .min(12, "초기 비밀번호는 12자 이상이어야 합니다.")
      .max(1024, "초기 비밀번호가 너무 깁니다."),
    storeIds: storeIdsSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine(requireStoreForManager);

export const updateUserAccountSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    role: z.nativeEnum(UserRole),
    storeIds: storeIdsSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine(requireStoreForManager);

export const userStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateUserAccountInput = z.infer<typeof createUserAccountSchema>;
export type UpdateUserAccountInput = z.infer<typeof updateUserAccountSchema>;
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export function toUserFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
