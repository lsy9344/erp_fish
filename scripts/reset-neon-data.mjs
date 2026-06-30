// 지정한 기준 테이블만 남기고 Neon DB 데이터를 초기화합니다.
// 보존: 아이디/비밀번호(User), 사용자권한(권한 프로필/사용자권한배정), 지점(Store),
//       코드관리(LedgerInputCode/코드별칭), 이상신호 설정(AnomalyThresholdSetting).
//
// ⚠️ 파괴적 스크립트입니다. 모든 운영성 데이터를 TRUNCATE합니다. 안전장치:
//   - production 환경(VERCEL_ENV/NODE_ENV=production)에서는 실행을 거부합니다.
//   - --yes (또는 CONFIRM_RESET=yes) 없이는 실행하지 않습니다.
//   - --dry-run 으로 삭제 대상만 출력하고 끝낼 수 있습니다.
import "./_loadenv.mjs";
import { PrismaClient } from "../generated/prisma/index.js";
import {
  describeDatabaseTarget,
  requireExplicitResetConfirmation,
  requireResettableDatabaseUrl,
} from "./destructive-script-guards.mjs";

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

if (!isDryRun) {
  requireExplicitResetConfirmation(process.argv.slice(2), process.env);
}

// pooled 연결을 직접 끄지 않고, unpooled가 있으면 명시적으로 사용한다(TRUNCATE는 트랜잭션 풀에서
// 불안정할 수 있음). DATABASE_URL을 덮어쓰지 않고 PrismaClient에 직접 넘긴다.
const datasourceUrl = requireResettableDatabaseUrl(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  process.env,
);

const db = new PrismaClient({ datasourceUrl });

const PRESERVE_TABLES = new Set([
  "User",
  "Store",
  "UserStoreAssignment",
  "PermissionProfile",
  "PermissionProfileAction",
  "UserPermissionProfile",
  "LedgerInputCode",
  "LedgerInputCodeStoreAlias",
  "AnomalyThresholdSetting",
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

  const target = describeDatabaseTarget(datasourceUrl, process.env);

  console.log(
    `대상 DB: ${target.host}/${target.database} · 환경: ${target.environment}`,
  );
  console.log(`보존 테이블: ${[...PRESERVE_TABLES].sort().join(", ")}`);
  console.log(`초기화 대상 테이블: ${targetTables.length}개`);
  console.log(targetTables.join(", "));

  if (isDryRun) {
    console.log("🟡 --dry-run: 실제 삭제 없이 종료합니다.");
    return;
  }

  const cmd = `TRUNCATE TABLE ${statement} RESTART IDENTITY CASCADE`;
  await db.$executeRawUnsafe(cmd);

  console.log(
    "✅ Neon DB 초기화 완료: 보존 대상 제외, 모든 테이블 데이터 삭제",
  );
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
