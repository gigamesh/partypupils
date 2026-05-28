// Read ADMIN_PASSWORD from env and print a bcrypt hash for ADMIN_PASSWORD_HASH.
//   pnpm tsx scripts/hash-admin-password.ts
import "@dotenvx/dotenvx/config";
import bcrypt from "bcryptjs";

// Matches `@gigamusic/core.hashPassword`. Inlined so this script runs under
// tsx (CJS) without pulling the ESM-only @gigamusic/core entry.
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
