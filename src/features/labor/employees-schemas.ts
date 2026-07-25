import { z } from "zod";

// WO-25(2026-07-25) #6/#8: 등록 상세 — 하루 인건비 · 월 희망 수령액(4대보험/현금).
// 빈 문자열은 "미입력"(null)로 취급하고, 입력 시에는 0 이상 정수 원 단위만 허용한다.
const optionalWonAmount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") {
      return null;
    }

    return typeof v === "number" ? v : Number(v);
  })
  .pipe(
    z
      .number()
      .int("정수 금액만 입력할 수 있습니다.")
      .min(0, "0 이상 금액을 입력해 주세요.")
      .nullable(),
  );

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
  dailyWage: optionalWonAmount,
  desiredInsuranceAmount: optionalWonAmount,
  desiredCashAmount: optionalWonAmount,
});

export type EmployeeFormInput = z.input<typeof employeeFormSchema>;
export type EmployeeFormData = z.output<typeof employeeFormSchema>;
