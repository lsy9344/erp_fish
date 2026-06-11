import { requireAppUser } from "~/server/authz";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAppUser();

  return children;
}
