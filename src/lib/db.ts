import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Neon (prod): use the WebSocket-based serverless driver to avoid the
 * cold-start auth timeouts and dropped sockets that plague direct pg
 * connections from short-lived Vercel functions.
 *
 * Everything else (local `prisma dev`, CI test schema): use the direct pg
 * adapter. PrismaPg's generated SQL hard-codes a schema (defaulting to
 * `public`) and does NOT honor the `?schema=` URL param that Prisma's legacy
 * CLI engine did. Pull the schema out of the URL and pass it as the
 * adapter's `schema` option so non-`public` schemas (notably the test
 * runner's `schema=test`) actually take effect at runtime.
 */
function createPrismaClient() {
  const raw = env.DATABASE_URL();

  if (raw.includes("neon.tech")) {
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString: raw }) });
  }

  const sslAdjusted = raw.replace("sslmode=require", "sslmode=verify-full");
  const match = sslAdjusted.match(/[?&]schema=([^&]+)/);
  const schema = match ? decodeURIComponent(match[1]) : undefined;
  const connectionString = match
    ? sslAdjusted.replace(/([?&])schema=[^&]+&?/, (_, sep) => (sep === "?" ? "?" : "&")).replace(/[?&]$/, "")
    : sslAdjusted;
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
  "P1008", // operations timed out
  "P1017", // server closed the connection
  "P2024", // timed out fetching a new connection from the pool
]);

// Substrings of pg connection-failure messages (no stable error code): a lost
// socket, a connection-acquisition timeout while the database wakes up, or
// Neon's `08P01 "Authentication timed out"` emitted while its compute is
// still warming up.
const TRANSIENT_CONNECTION_ERROR_MESSAGES = [
  "socket disconnected",
  "Connection terminated",
  "timeout exceeded when trying to connect",
  "timeout expired",
  "Authentication timed out",
];

/**
 * True for connection-level failures that are safe to retry (vs. query bugs).
 * Walks the `cause` chain because Prisma wraps the driver's underlying socket
 * error in its own exception — the outer message often doesn't match our
 * substrings but the nested cause does (e.g. outer "Connection terminated due
 * to connection timeout" with a cause of "Connection terminated unexpectedly"
 * from the pg socket). Depth-capped to avoid pathological self-referential
 * cause chains.
 */
function isTransientConnectionError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CONNECTION_ERROR_CODES.has(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  if (TRANSIENT_CONNECTION_ERROR_MESSAGES.some((m) => message.includes(m))) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined && isTransientConnectionError(cause, depth + 1);
}

/**
 * Runs a database operation, retrying with exponential backoff when it fails
 * with a transient connection error (e.g. ECONNRESET during a connection
 * burst, or a cold Neon compute that's still warming). Non-connection errors
 * propagate immediately.
 *
 * Backoff is sized to outlast Neon's scale-to-zero wake (typically 3–8s):
 * 200ms, 400ms, 800ms, 1600ms — total ~3s of sleeps across 5 attempts.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientConnectionError(error)) throw error;
      lastError = error;
      if (attempt < attempts - 1) {
        const delay = 200 * 2 ** attempt;
        console.warn(
          `Transient database error, retrying in ${delay}ms (attempt ${attempt + 1}/${attempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
