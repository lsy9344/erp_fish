import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { LoginForm } from "~/features/auth/login-form";
import { auth } from "~/server/auth";
import { getAppHomePath } from "~/server/authz";
import { APP_DISPLAY_NAME } from "~/lib/brand";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

function getSafeCallbackUrl(value: string | undefined) {
  if (
    value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login")
  ) {
    return value;
  }

  return "/app";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params.callbackUrl);

  if (session?.user.id) {
    const appHomePath = await getAppHomePath();

    if (!appHomePath.startsWith("/login")) {
      redirect(appHomePath);
    }
  }

  return (
    <main className="bg-background flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">
              {APP_DISPLAY_NAME} 로그인
            </h1>
          </CardTitle>
          <CardDescription>
            {APP_DISPLAY_NAME} 업무 공간에 접속합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>
    </main>
  );
}
