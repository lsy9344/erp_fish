import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // 재고 단계 조회/저장은 병합·이월·FIFO를 한 트랜잭션에서 순차 실행해
    // Prisma 기본 5s를 넘겨 P2028(Transaction already closed)로 죽는다.
    // 장부 상세는 이 트랜잭션이 다른 쿼리와 병렬로 돌아 콜드 스타트에서 특히
    // 잘 터진다. 내부 ERP 트래픽 규모에선 넉넉한 기본 타임아웃이 안전하다.
    // ponytail: 전역 기본값으로 올림. 특정 트랜잭션만 문제되면 그 호출에 개별
    // { timeout } 지정으로 좁혀라.
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
