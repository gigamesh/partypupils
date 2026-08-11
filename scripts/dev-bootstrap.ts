/**
 * Dev startup orchestrator.
 *
 *   1. Loads `.env` (DATABASE_URL must point at localhost).
 *   2. Ensures the `party-pupils-pg` Docker container is running.
 *   3. Waits until Postgres accepts connections.
 *   4. Runs `drizzle-kit push --force` to sync the schema (idempotent).
 *   5. If the `releases` table is empty, loads `db/seed.sql` so dev always has
 *      a realistic catalog to click through.
 *
 * Triggered by `pnpm dev`. Re-runnable safely; nothing is destructive after
 * the first run.
 *
 * Pass `--reseed` (or run `pnpm db:seed:force`) to wipe the seeded tables and
 * reload the dump regardless of row count. Without it, a single hand-created
 * release is enough to make step 5 skip forever, which silently leaves you
 * with no catalog, no bundles, and no site settings.
 */
import "@dotenvx/dotenvx/config";
import { spawnSync } from "node:child_process";
import { Socket } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) die("DATABASE_URL is not set in .env");
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    die(`DATABASE_URL must point at localhost (got: ${url.slice(0, 40)}...)`);
  }

  const { host, port } = parseHostPort(url);

  const containerReachable = await probeTcp(host, port, 500);
  if (!containerReachable) {
    console.log("🐳 Starting party-pupils-pg via docker compose...");
    const up = spawnSync("docker", ["compose", "up", "-d"], {
      stdio: "inherit",
      cwd: REPO_ROOT,
    });
    if (up.status !== 0) die("docker compose up failed");
  } else {
    console.log("✅ Postgres already reachable on", `${host}:${port}`);
  }

  await waitForPostgres(host, port, 30_000);
  console.log("✅ Postgres accepting connections");

  // Sync schema. `--force` skips the interactive prompt; the dev DB is
  // considered disposable, so applying any drift unattended is fine.
  const push = spawnSync(
    "npx",
    ["drizzle-kit", "push", "--config", "drizzle.config.ts", "--force"],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
  if (push.status !== 0) die("drizzle-kit push failed");

  // Seed the catalog from db/seed.sql IF the DB is empty. Skipping when there's
  // already data preserves anything the dev creates locally — releases, link
  // pages, test orders, etc. — across restarts.
  const reseed = process.argv.slice(2).includes("--reseed");
  const releaseCount = pgCount(url, "releases");

  if (releaseCount > 0 && !reseed) {
    console.log(`✅ DB already has data (${releaseCount} releases) — skipping seed`);
    console.log("   Run `pnpm db:seed:force` to wipe and reload db/seed.sql.");
    return;
  }

  if (reseed && releaseCount > 0) {
    console.log(`🧹 Reseeding — clearing ${releaseCount} existing release(s)...`);
    truncateSeededTables(url);
  } else {
    console.log("🌱 Empty DB — loading db/seed.sql...");
  }

  const seed = spawnSync("psql", [url, "-f", resolve(REPO_ROOT, "db/seed.sql")], {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });
  if (seed.status !== 0) die("seed load failed");
  console.log(
    `✅ Seeded (${pgCount(url, "releases")} releases, ${pgCount(url, "tracks")} tracks)`,
  );
}

/**
 * Every table `db/seed.sql` populates. The dump is data-only — it carries no
 * TRUNCATEs of its own — so a reload onto a populated DB would collide on
 * primary keys and, worse, rewind the sequences via the dump's trailing
 * `setval` calls. Clearing first keeps ids and sequences consistent.
 *
 * `CASCADE` covers FK dependents; `RESTART IDENTITY` resets the sequences the
 * dump is about to set explicitly.
 */
function truncateSeededTables(url: string): void {
  const tables = [
    "order_items",
    "orders",
    "download_tokens",
    "track_files",
    "tracks",
    "link_page_items",
    "link_pages",
    "releases",
    "links",
    "site_settings",
  ];
  const result = spawnSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-c", `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) die(`Failed to clear seeded tables: ${result.stderr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function die(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function parseHostPort(connectionString: string): { host: string; port: number } {
  const u = new URL(connectionString.replace(/^postgres(ql)?:\/\//, "http://"));
  return { host: u.hostname || "localhost", port: Number(u.port) || 5432 };
}

function probeTcp(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const s = new Socket();
    const done = (ok: boolean) => {
      s.removeAllListeners();
      s.destroy();
      resolveProbe(ok);
    };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.once("timeout", () => done(false));
    s.connect(port, host);
  });
}

async function waitForPostgres(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeTcp(host, port, 500)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  die(`Postgres at ${host}:${port} did not accept connections within ${timeoutMs}ms`);
}

function pgCount(url: string, table: string): number {
  const result = spawnSync(
    "psql",
    [url, "-tAc", `SELECT count(*) FROM ${table}`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) die(`Failed to count ${table}: ${result.stderr}`);
  return parseInt(result.stdout.trim(), 10) || 0;
}
