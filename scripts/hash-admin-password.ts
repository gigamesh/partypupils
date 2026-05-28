/**
 * One-shot: read the current ADMIN_PASSWORD out of env and print a bcrypt
 * hash you can paste into ADMIN_PASSWORD_HASH (locally + in Vercel).
 *
 * Usage:
 *   pnpm tsx scripts/hash-admin-password.ts
 *
 * The hash includes the salt; no separate ADMIN_PASSWORD_SALT is needed.
 * Once `ADMIN_PASSWORD_HASH` is in `.env` and the routes have been swapped,
 * the plaintext `ADMIN_PASSWORD` env var can be deleted.
 */
import "@dotenvx/dotenvx/config";
import bcrypt from "bcryptjs";

// 12 matches @gigamusic/core's hashAdminPassword. Kept inline so the
// script can be invoked via tsx (CJS) without dragging in the ESM-only
// @gigamusic/core entry.
const SALT_ROUNDS = 12;

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error(
      "ADMIN_PASSWORD is not set. Make sure your .env (or .env.prod) is loaded.",
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  console.log("\nADMIN_PASSWORD_HASH:\n");
  console.log(hash);
  console.log(
    "\nPaste the line above into your .env (and `vercel env add ADMIN_PASSWORD_HASH` for prod/preview).\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
