import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "로그인 식별자를 입력해 주세요.")
    .max(80, "로그인 식별자가 너무 깁니다.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(4, "비밀번호는 4자 이상이어야 합니다.")
    .max(1024, "비밀번호가 너무 깁니다."),
});

export type LoginInput = z.infer<typeof loginSchema>;
