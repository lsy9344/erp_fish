import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

test("repository root contains the T3 app scaffold without nesting", () => {
  assert.ok(existsSync(path.join(root, "package.json")), "package.json should exist at the repository root");
  assert.ok(existsSync(path.join(root, "src", "app")), "Next.js app router files should live under src/app");
  assert.ok(existsSync(path.join(root, "prisma", "schema.prisma")), "Prisma schema should exist");
  assert.equal(existsSync(path.join(root, "erp_fish", "package.json")), false, "app must not be nested in erp_fish/erp_fish");
});

test("T3 stack choices include NextAuth, Prisma, Tailwind, and PostgreSQL without tRPC", () => {
  const packageJson = readJson("package.json");
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  assert.ok(dependencies.next, "Next.js dependency should be present");
  assert.ok(dependencies["next-auth"], "NextAuth.js dependency should be present");
  assert.ok(dependencies["@prisma/client"], "Prisma client dependency should be present");
  assert.ok(dependencies.prisma, "Prisma CLI dependency should be present");
  assert.ok(dependencies.tailwindcss, "Tailwind CSS dependency should be present");
  assert.equal(dependencies["@trpc/server"], undefined, "tRPC should not be included for the MVP scaffold");

  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  assert.match(schema, /provider\s+=\s+"postgresql"/, "Prisma should use the PostgreSQL provider");
});

test("Prisma schema has an initial migration", () => {
  assert.ok(existsSync(path.join(root, "prisma", "migrations")), "prisma/migrations should exist");
});
