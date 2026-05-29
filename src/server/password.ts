import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_HEX_LENGTH = 32;
const HASH_PREFIX = "scrypt";
const HEX_PATTERN = /^[0-9a-f]+$/i;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `${HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split("$");

  if (parts.length !== 3) {
    return false;
  }

  const [prefix = "", salt = "", hash = ""] = parts;

  if (
    prefix !== HASH_PREFIX ||
    salt.length !== SALT_HEX_LENGTH ||
    !HEX_PATTERN.test(salt) ||
    hash.length !== KEY_LENGTH * 2 ||
    !HEX_PATTERN.test(hash)
  ) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
