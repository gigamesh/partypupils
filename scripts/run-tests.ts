/**
 * Test runner wrapper.
 *
 * Reads DATABASE_URL from .env (the same Postgres `pnpm dev` connects to) and
 * redirects tests onto a sibling **database** — `party_pupils` becomes
 * `party_pupils_test` — creating it on first run. Tests then `drizzle-kit push`
 * and wipe tables freely without touching the dev catalog.
 *
 * This used to overlay `?schema=test` on the URL instead. Nothing in the stack
 * honours that parameter: `src/lib/db.ts` hands the string to `new PgPool({
 * connectionString })`, and Postgres selects a schema via `search_path`, not a
 * `schema` query param. So every run silently wiped the dev database's `public`
 * schema via the `beforeEach` in `tests/setup.ts`. A distinct database name is
 * honoured by `pg` and `drizzle-kit` alike, with no `search_path` juggling.
 *
 * Refuses to run against any non-localhost connection. If the DB isn't
 * reachable, prints a one-liner pointing at `pnpm dev` (which boots the local
 * Postgres as part of its workflow).
 */
import "@dotenvx/dotenvx/config";
import { spawnSync } from "child_process";
import { Socket } from "net";
import { TEST_DATABASE_SUFFIX, testDatabaseUrl } from "./test-db-url";

const base = process.env.DATABASE_URL;
if (!base) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}
if (!base.includes("localhost") && !base.includes("127.0.0.1")) {
  console.error("❌ Refusing to run tests: DATABASE_URL does not point to localhost.");
  console.error(`   Got: ${base.slice(0, 40)}...`);
  process.exit(1);
}

/** Try opening a TCP connection. Resolves true if the port accepts, false on timeout/error. */
function probeTcp(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    const done = (ok: boolean) => {
      s.removeAllListeners();
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
    s.connect(port, host);
  });
}

/** Pull host and port out of a libpq-style URL so we can probe them. */
function parseHostPort(url: string): { host: string; port: number } {
  const u = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
  return { host: u.hostname || "localhost", port: Number(u.port) || 5432 };
}

function maskUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ":***@");
}

/**
 * `CREATE DATABASE` the test database if it isn't there yet. Connects to the
 * server's default `postgres` database to do it, since you can't create a
 * database from inside the one you're creating. Idempotent — an existing
 * database is left alone, schema drift is handled by the `drizzle-kit push`
 * that follows.
 */
function ensureTestDatabase(adminUrl: string, name: string): void {
  const exists = spawnSync(
    "psql",
    [adminUrl, "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${name}'`],
    { encoding: "utf8" },
  );
  if (exists.status !== 0) {
    console.error(`❌ Could not reach Postgres to check for the test database.`);
    console.error(exists.stderr?.trim() || "");
    process.exit(1);
  }
  if (exists.stdout.trim() === "1") return;

  console.log(`📦 Creating test database "${name}"...`);
  const created = spawnSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${name}"`], {
    encoding: "utf8",
  });
  if (created.status !== 0) {
    console.error(`❌ Failed to create the test database:`);
    console.error(created.stderr?.trim() || "");
    process.exit(1);
  }
}

async function main() {
  const { host, port } = parseHostPort(base!);
  if (!(await probeTcp(host, port))) {
    console.error(`❌ Postgres isn't reachable at ${host}:${port}.`);
    console.error("   Start the local DB in another terminal:");
    console.error("     pnpm dev");
    console.error("   (which boots the local Postgres as part of the dev workflow).");
    process.exit(1);
  }

  const { url: testUrl, database } = testDatabaseUrl(base!);
  if (!database.endsWith(TEST_DATABASE_SUFFIX)) {
    console.error(`❌ Refusing to run: computed test database "${database}" is not a *${TEST_DATABASE_SUFFIX} name.`);
    process.exit(1);
  }

  // Maintenance connection for CREATE DATABASE — same server, `postgres` db.
  const { url: adminUrl } = testDatabaseUrl(base!, "postgres");
  ensureTestDatabase(adminUrl, database);

  const env = { ...process.env, DATABASE_URL: testUrl };
  console.log(`🧪 Test database: ${maskUrl(testUrl)}`);

  // Drizzle's analogue of `prisma db push --force-reset`: push the current
  // schema and accept every "data-loss" prompt non-interactively. The test
  // database exists only for this, so accepting destructive changes is the
  // intended behaviour.
  const push = spawnSync(
    "npx",
    ["drizzle-kit", "push", "--config", "drizzle.config.ts", "--force"],
    { stdio: "inherit", env },
  );
  if (push.status !== 0) process.exit(push.status ?? 1);

  const watch = process.argv.includes("--watch");
  const passthrough = process.argv.slice(2).filter((a) => a !== "--watch");
  const vitest = spawnSync(
    "npx",
    watch ? ["vitest", ...passthrough] : ["vitest", "run", ...passthrough],
    { stdio: "inherit", env },
  );
  process.exit(vitest.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
