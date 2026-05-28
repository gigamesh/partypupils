/**
 * Test runner wrapper.
 *
 * Reads DATABASE_URL from .env (the same Postgres `pnpm dev` connects to) and
 * overlays `schema=test` so:
 *   - the dev DB's `public` schema is never touched
 *   - tests can `prisma db push --force-reset` freely
 *
 * Refuses to run against any non-localhost connection. If the DB isn't
 * reachable, prints a one-liner pointing at `npx prisma dev`.
 */
import "@dotenvx/dotenvx/config";
import { spawnSync } from "child_process";
import { Socket } from "net";

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

const withSchemaTest = (url: string): string => {
  if (/[?&]schema=test\b/.test(url)) return url;
  if (/[?&]schema=[^&]+/.test(url)) return url.replace(/([?&])schema=[^&]+/, "$1schema=test");
  return url + (url.includes("?") ? "&" : "?") + "schema=test";
};

// Auto-defend against PgBouncer prepared-statement collisions. `prisma dev`
// fronts Postgres with PgBouncer in transaction-pool mode, so any persistent
// prepared statement across test runs collides as "prepared statement s0
// already exists". `pgbouncer=true` tells Prisma to disable prepared
// statements; `connection_limit=1` keeps the pool to a single long-lived
// server connection. Both are no-ops on a vanilla Postgres.
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

async function main() {
  const { host, port } = parseHostPort(base!);
  if (!(await probeTcp(host, port))) {
    console.error(`❌ Postgres isn't reachable at ${host}:${port}.`);
    console.error("   Start the local DB in another terminal:");
    console.error("     npx prisma dev");
    console.error("   (or run `pnpm dev`, which starts it as part of the dev workflow).");
    process.exit(1);
  }

  const testUrl = withPgBouncerSafety(withSchemaTest(base!));
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
