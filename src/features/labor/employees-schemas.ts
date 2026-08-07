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

// WO-0806 #1: 인사관리 카드의 선택 문자열. 빈 문자열은 미입력(null)로 취급한다.
function optionalText(max: number, message: string) {
  return z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim() ?? "";

      return trimmed === "" ? null : trimmed;
    })
    .pipe(z.string().max(max, message).nullable());
}

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
    .regex(/^\d{4}-\d{2}-\d{2}$/, "입사일 형식이 올바르지 않습니다.")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    }, "존재하는 입사일을 입력해 주세요."),
  isActive: z.boolean().optional().default(true),
  dailyWage: optionalWonAmount,
  desiredInsuranceAmount: optionalWonAmount,
  // WO-0806 #1: 연락처는 숫자·하이픈만 허용해 이체/연락 실무에서 바로 쓸 수 있게 한다.
  phone: optionalText(20, "연락처는 20자 이하여야 합니다.").pipe(
    z
      .string()
      .regex(/^[\d-]{9,20}$/, "연락처는 숫자와 하이픈만 입력해 주세요.")
      .nullable(),
  ),
  bankAccount: optionalText(50, "계좌번호는 50자 이하여야 합니다."),
  address: optionalText(200, "주소는 200자 이하여야 합니다."),
  position: optionalText(20, "직급은 20자 이하여야 합니다."),
});

export type EmployeeFormInput = z.input<typeof employeeFormSchema>;
export type EmployeeFormData = z.output<typeof employeeFormSchema>;
