import { redirect } from "next/navigation";

import { getAppHomePath } from "~/server/authz";

export default async function AppPage() {
  redirect(await getAppHomePath());
}
