import { z } from "zod";

export const employeeFormSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, "이름을 입력해 주세요.")
        .max(50, "이름은 50자 이하여야 합니다."),
    ),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "입사일 형식이 올바르지 않습니다."),
  isActive: z.boolean().optional().default(true),
});

export type EmployeeFormInput = z.input<typeof employeeFormSchema>;
export type EmployeeFormData = z.output<typeof employeeFormSchema>;
