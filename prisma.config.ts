import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Project uses `prisma db push`, not `prisma migrate`, so no migrations path is needed.
  // The `seed` location stays under `migrations` because that's where Prisma's config
  // namespace expects it.
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
