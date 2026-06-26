// 지정한 기준 테이블만 남기고 Neon DB 데이터를 초기화합니다.
// 보존: 아이디/비밀번호(User), 사용자권한(권한 프로필/사용자권한배정), 지점(Store),
//       코드관리(LedgerInputCode/코드별칭).
import "./_loadenv.mjs";
import { PrismaClient } from "../generated/prisma/index.js";

if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

const db = new PrismaClient();

const PRESERVE_TABLES = new Set([
  "User",
  "Store",
  "UserStoreAssignment",
  "PermissionProfile",
  "PermissionProfileAction",
  "UserPermissionProfile",
  "LedgerInputCode",
  "LedgerInputCodeStoreAlias",
  "Account",
  "Session",
  "VerificationToken",
]);

async function main() {
  const rows = await db.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const allTables = rows.map((row) => row.tablename);

  const targetTables = allTables.filter((name) => {
    if (name.startsWith("_")) return false;
    return !PRESERVE_TABLES.has(name);
  });

  if (targetTables.length === 0) {
    console.log("초기화할 테이블이 없습니다.");
    return;
  }

  targetTables.sort();
  const statement = targetTables
    .map((name) => `"${name.replace(/"/g, '""')}"`)
    .join(", ");

  console.log(`보존 테이블: ${[...PRESERVE_TABLES].sort().join(", ")}`);
  console.log(`초기화 대상 테이블: ${targetTables.length}개`);
  console.log(targetTables.join(", "));

  const cmd = `TRUNCATE TABLE ${statement} RESTART IDENTITY CASCADE`;
  await db.$executeRawUnsafe(cmd);

  console.log("✅ Neon DB 초기화 완료: 보존 대상 제외, 모든 테이블 데이터 삭제");
}

main()
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
