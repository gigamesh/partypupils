import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createQueries } from "@gigamusic/db";
import * as schema from "@/db/schema";
import { env } from "./env";

export { withDbRetry, loggedCacheRead, isTransientConnectionError } from "@gigamusic/db";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db: Db };

/**
 * Neon (prod): use the WebSocket-based serverless driver to avoid the
 * cold-start auth timeouts and dropped sockets that plague direct pg
 * connections from short-lived Vercel functions.
 *
 * Everything else (local Postgres, CI): use the direct pg driver.
 */
function createDb(): Db {
  const raw = env.DATABASE_URL();

  if (raw.includes("neon.tech")) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: raw });
    return drizzleNeon(pool, { schema }) as unknown as Db;
  }

  const sslAdjusted = raw.replace("sslmode=require", "sslmode=verify-full");
  const pool = new PgPool({
    connectionString: sslAdjusted,
    // Each serverless instance keeps its own pool; a low cap plus keepAlive
    // avoids exhausting Postgres connections and resetting sockets under load.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  return drizzlePg(pool, { schema });
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    if (!globalForDb.db) {
      globalForDb.db = createDb();
    }
    return Reflect.get(globalForDb.db, prop);
  },
}) as Db;

// Shared `@gigamusic/db` queries singleton. Built once at module load against
// the lazy db proxy above — actual DB connections still defer until the
// first query.
export const queries = createQueries(db);

// Silence unused-type-import warnings.
export type { NeonDatabase };
