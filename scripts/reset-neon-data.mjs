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

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isConfirmed = args.has("--yes") || process.env.CONFIRM_RESET === "yes";

// production은 절대 초기화하지 않는다. Vercel/Node 환경값 모두 검사한다.
const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";
if (environment === "production") {
  console.error(
    `❌ production 환경(${environment})에서는 DB 초기화를 거부합니다.`,
  );
  process.exit(1);
}

if (!isDryRun && !isConfirmed) {
  console.error(
    "❌ 확인 플래그가 없습니다. 삭제 대상을 먼저 보려면 --dry-run, 실제 삭제는 --yes(또는 CONFIRM_RESET=yes)를 붙여 실행하세요.",
  );
  process.exit(1);
}

// pooled 연결을 직접 끄지 않고, unpooled가 있으면 명시적으로 사용한다(TRUNCATE는 트랜잭션 풀에서
// 불안정할 수 있음). DATABASE_URL을 덮어쓰지 않고 PrismaClient에 직접 넘긴다.
const datasourceUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

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

  // 대상 DB 호스트를 출력해 어떤 DB를 비우는지 눈으로 확인할 수 있게 한다.
  let targetHost = "(알 수 없음)";
  try {
    targetHost = new URL(datasourceUrl ?? "").host || targetHost;
  } catch {
    // URL 파싱 실패는 무시(호스트 표시는 정보 제공용일 뿐).
  }

  console.log(
    `대상 DB 호스트: ${targetHost} · 환경: ${environment || "(미설정)"}`,
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
