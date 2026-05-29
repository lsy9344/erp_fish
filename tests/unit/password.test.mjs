import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const passwordModuleUrl = pathToFileURL(
  path.join(process.cwd(), "src", "server", "password.ts"),
);

test("password hashes verify the original password only", async () => {
  const { hashPassword, verifyPassword } = await import(passwordModuleUrl.href);

  const hash = await hashPassword("local-dev-secret");

  assert.notEqual(hash, "local-dev-secret");
  assert.equal(await verifyPassword("local-dev-secret", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("malformed password hashes fail closed", async () => {
  const { verifyPassword } = await import(passwordModuleUrl.href);

  assert.equal(await verifyPassword("anything", "scrypt$salt$zz"), false);
  assert.equal(await verifyPassword("anything", "scrypt$salt$abc"), false);
  assert.equal(await verifyPassword("anything", "scrypt$salt$00$extra"), false);
});
