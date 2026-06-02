import { LogOutIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { signOut } from "~/server/auth";

export function LogoutButton() {
  async function logout() {
    "use server";

    await signOut({ redirectTo: "/login" });
  }

  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
      >
        <LogOutIcon aria-hidden="true" />
        로그아웃
      </Button>
    </form>
  );
}
