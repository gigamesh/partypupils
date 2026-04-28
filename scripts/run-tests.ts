/**
 * Test runner wrapper.
 *
 * Forces tests onto an isolated Postgres schema (`schema=test` in the
 * connection string) so:
 *   - the dev DB's `public` schema is never touched (no --accept-data-loss
 *     surprises when switching branches whose Prisma schemas differ)
 *   - tests can `prisma db push --force-reset` freely
 *
 * Refuses to run against any non-localhost connection.
 */
import "dotenv/config";
import { spawnSync } from "child_process";

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

const testUrl = (() => {
  if (/[?&]schema=test\b/.test(base)) return base;
  if (/[?&]schema=[^&]+/.test(base)) return base.replace(/([?&])schema=[^&]+/, "$1schema=test");
  return base + (base.includes("?") ? "&" : "?") + "schema=test";
})();

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
