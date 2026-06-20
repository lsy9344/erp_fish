import { defineConfig } from "prisma/config";

function isPostgresDatabaseUrl(value: string | undefined) {
  return (
    value?.startsWith("postgresql://") === true ||
    value?.startsWith("postgres://") === true
  );
}

if (!isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
  delete process.env.DATABASE_URL;
  process.loadEnvFile?.(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
});
