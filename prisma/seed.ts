import { PrismaClient, UserRole } from "../generated/prisma/index.js";
import { hashPassword } from "../src/server/password.ts";

const prisma = new PrismaClient();
const DEFAULT_HQ_NAME = "본사 관리자";
const SEED_HQ_PASSWORD_MIN_LENGTH = 12;

function getSeedName() {
  const seedName = process.env.SEED_HQ_NAME?.trim();

  if (seedName === undefined || seedName.length === 0) {
    return DEFAULT_HQ_NAME;
  }

  return seedName;
}

async function main() {
  const email = process.env.SEED_HQ_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_HQ_PASSWORD;
  const name = getSeedName();
  const allowProductionSeed = process.env.ALLOW_PRODUCTION_SEED === "true";
  const allowPasswordRotation =
    process.env.ALLOW_SEED_PASSWORD_ROTATION === "true";

  if (process.env.NODE_ENV === "production" && !allowProductionSeed) {
    throw new Error(
      "Set ALLOW_PRODUCTION_SEED=true before running the seed script in production.",
    );
  }

  if (!email || !password) {
    throw new Error(
      "SEED_HQ_EMAIL and SEED_HQ_PASSWORD are required to seed the headquarters account.",
    );
  }

  if (password.length < SEED_HQ_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_HQ_PASSWORD must be at least ${SEED_HQ_PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser?.role && existingUser.role !== UserRole.HEADQUARTERS) {
    throw new Error(
      "SEED_HQ_EMAIL already belongs to a non-headquarters account.",
    );
  }

  const shouldWritePasswordHash =
    !existingUser?.passwordHash || allowPasswordRotation;
  const passwordHash = shouldWritePasswordHash
    ? await hashPassword(password)
    : existingUser.passwordHash;

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: UserRole.HEADQUARTERS,
      isActive: true,
    },
    update: {
      name,
      role: UserRole.HEADQUARTERS,
      ...(shouldWritePasswordHash ? { passwordHash } : {}),
    },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
