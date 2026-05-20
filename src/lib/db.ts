import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * PrismaPg's generated SQL hard-codes a schema (defaulting to `public`) and
 * does NOT honor the `?schema=` URL param that Prisma's legacy CLI engine did.
 * Pull the schema out of the URL and pass it as the adapter's `schema` option
 * so non-`public` schemas (notably the test runner's `schema=test`) actually
 * take effect at runtime.
 */
function createPrismaClient() {
  const raw = env.DATABASE_URL().replace("sslmode=require", "sslmode=verify-full");
  const match = raw.match(/[?&]schema=([^&]+)/);
  const schema = match ? decodeURIComponent(match[1]) : undefined;
  const connectionString = match ? raw.replace(/([?&])schema=[^&]+&?/, (_, sep) => (sep === "?" ? "?" : "&")).replace(/[?&]$/, "") : raw;
  const adapter = new PrismaPg(
    {
      connectionString,
      // `connection_limit` in the URL is a Prisma query-engine option that the
      // pg driver adapter ignores, so the pool is sized here instead. Each
      // serverless instance keeps its own pool; a low cap plus keepAlive avoids
      // exhausting Postgres connections and resetting sockets under load.
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop);
  },
});

const TRANSIENT_CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "P1001", // can't reach database server
  "P1017", // server closed the connection
]);

// Substrings of pg connection-failure messages (no stable error code): a lost
// socket, or a connection-acquisition timeout while the database wakes up.
const TRANSIENT_CONNECTION_ERROR_MESSAGES = [
  "socket disconnected",
  "Connection terminated",
  "timeout exceeded when trying to connect",
  "timeout expired",
];

/** True for connection-level failures that are safe to retry (vs. query bugs). */
function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CONNECTION_ERROR_CODES.has(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return TRANSIENT_CONNECTION_ERROR_MESSAGES.some((m) => message.includes(m));
}

/**
 * Runs a database operation, retrying with exponential backoff when it fails
 * with a transient connection error (e.g. ECONNRESET during a connection
 * burst). Non-connection errors propagate immediately.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientConnectionError(error)) throw error;
      lastError = error;
      if (attempt < attempts - 1) {
        console.warn(
          `Transient database error, retrying (attempt ${attempt + 1}/${attempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
