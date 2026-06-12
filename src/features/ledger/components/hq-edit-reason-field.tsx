"use client";

import { Input } from "~/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import type { RefObject } from "react";

type HqEditReasonFieldProps = {
  id: string;
  value: string;
  error?: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
};

export function HqEditReasonField({
  id,
  value,
  error,
  disabled,
  inputRef,
  onChange,
}: HqEditReasonFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>본사 수정 사유</FieldLabel>
      <Input
        ref={inputRef}
        id={id}
        name="reason"
        autoComplete="off"
        maxLength={500}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-11"
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : `${id}-description`
        }
      />
      <FieldDescription id={`${id}-description`}>
        {disabled
          ? "저장할 수 없는 상태에서는 본사 수정 사유를 입력할 수 없습니다."
          : "본사가 원본 장부를 보완 수정하는 이유를 감사 로그에 남깁니다."}
      </FieldDescription>
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : null}
    </Field>
  );
}
