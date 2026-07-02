"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Loader2Icon, LogInIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        setError("로그인 식별자 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      window.location.assign(result.url ?? callbackUrl);
    } catch {
      setError("로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">로그인 식별자</FieldLabel>
          <Input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            required
            disabled={isPending}
          />
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="password">비밀번호</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />
          <FieldDescription>내부 계정으로 로그인합니다.</FieldDescription>
          {error ? <FieldError id="login-error">{error}</FieldError> : null}
        </Field>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <LogInIcon data-icon="inline-start" />
          )}
          로그인
        </Button>
      </FieldGroup>
    </form>
  );
}
