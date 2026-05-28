/**
 * Test runner wrapper.
 *
 * Forces tests onto an isolated Postgres schema (`schema=test` in the
 * connection string) so:
 *   - the dev DB's `public` schema is never touched (no --accept-data-loss
 *     surprises when switching branches whose Prisma schemas differ)
 *   - tests can `prisma db push --force-reset` freely
 *
 * Prefers `TEST_DATABASE_URL` when set, falling back to `DATABASE_URL`. Set
 * `TEST_DATABASE_URL` to a vanilla Postgres (e.g. `postgresql://postgres:postgres@localhost:5436/test`)
 * to avoid sharing the dev DB — prevents PgBouncer prepared-statement
 * collisions when `prisma dev` is alive at the same time.
 *
 * Refuses to run against any non-localhost connection.
 */
import "@dotenvx/dotenvx/config";
import { spawnSync } from "child_process";

const explicitTestUrl = process.env.TEST_DATABASE_URL;
const base = explicitTestUrl ?? process.env.DATABASE_URL;
if (!base) {
  console.error("❌ Neither TEST_DATABASE_URL nor DATABASE_URL is set");
  process.exit(1);
}
if (!base.includes("localhost") && !base.includes("127.0.0.1")) {
  console.error("❌ Refusing to run tests: connection does not point to localhost.");
  console.error(`   Got: ${base.slice(0, 40)}...`);
  process.exit(1);
}

const withSchemaTest = (url: string): string => {
  if (/[?&]schema=test\b/.test(url)) return url;
  if (/[?&]schema=[^&]+/.test(url)) return url.replace(/([?&])schema=[^&]+/, "$1schema=test");
  return url + (url.includes("?") ? "&" : "?") + "schema=test";
};

// Auto-defend against PgBouncer prepared-statement collisions. `prisma dev`
// fronts Postgres with PgBouncer in transaction-pool mode, so any persistent
// prepared statement across test runs collides as "prepared statement s0
// already exists". `pgbouncer=true` tells Prisma to disable prepared
// statements; `connection_limit=1` keeps the connection pool to a single
// long-lived server. Both are no-ops on a vanilla Postgres.
const withPgBouncerSafety = (url: string): string => {
  let out = url;
  if (!/[?&]pgbouncer=/.test(out)) {
    out += (out.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  // Force connection_limit=1 even if the source URL had a higher value —
  // prepared-statement caching is per-server-connection.
  out = out.replace(/([?&])connection_limit=[^&]+/, "$1connection_limit=1");
  if (!/[?&]connection_limit=/.test(out)) {
    out += "&connection_limit=1";
  }
  return out;
};

const testUrl = withPgBouncerSafety(withSchemaTest(base));

const env = { ...process.env, DATABASE_URL: testUrl };

console.log(`🧪 Test schema: ${testUrl.replace(/:[^:@]+@/, ":***@")}`);

const push = spawnSync(
  "npx",
  ["prisma", "db", "push", "--force-reset"],
  { stdio: "inherit", env },
);
if (push.status !== 0) process.exit(push.status ?? 1);

const watch = process.argv.includes("--watch");
const vitest = spawnSync(
  "npx",
  watch ? ["vitest"] : ["vitest", "run"],
  { stdio: "inherit", env },
);
process.exit(vitest.status ?? 1);
