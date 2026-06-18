import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("이메일 형식이 올바르지 않습니다.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(1, "비밀번호를 입력해 주세요.")
    .max(1024, "비밀번호가 너무 깁니다."),
});

export type LoginInput = z.infer<typeof loginSchema>;
