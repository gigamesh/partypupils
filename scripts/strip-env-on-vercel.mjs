import { rmSync } from "node:fs";

/**
 * On Vercel every environment variable comes from the project's dashboard
 * settings. The committed `.env` is dotenvx-encrypted, so if Next.js read it
 * during the build it would inject `encrypted:…` ciphertext for any variable
 * not also set in the dashboard. Removing it here keeps the build on dashboard
 * values only. Local builds (no VERCEL env var) leave `.env` untouched.
 */
if (process.env.VERCEL) {
  rmSync(".env", { force: true });
  console.log("Removed encrypted .env — build uses Vercel dashboard env vars");
}
