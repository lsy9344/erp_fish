import { z } from "zod";

const storeNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "지점명을 입력해 주세요.")
      .max(80, "지점명은 80자 이하여야 합니다."),
  );

export const storeFormSchema = z.object({
  name: storeNameSchema,
  isActive: z.boolean(),
});

export type StoreFormInput = z.infer<typeof storeFormSchema>;

export const storeStatusSchema = z.object({
  isActive: z.boolean(),
});

export type StoreStatusInput = z.infer<typeof storeStatusSchema>;

export function toFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
