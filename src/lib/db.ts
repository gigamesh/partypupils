import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * PrismaPg's generated SQL hard-codes a schema (defaulting to `public`) and
 * does NOT honor the `?schema=` URL param that Prisma's legacy CLI engine did.
 * Pull the schema out of the URL and pass it as the adapter's `schema` option
 * so non-`public` schemas (notably the test runner's `schema=test`) actually
 * take effect at runtime.
 */
function createPrismaClient() {
  const raw = env.DATABASE_URL().replace("sslmode=require", "sslmode=verify-full");
  const match = raw.match(/[?&]schema=([^&]+)/);
  const schema = match ? decodeURIComponent(match[1]) : undefined;
  const connectionString = match ? raw.replace(/([?&])schema=[^&]+&?/, (_, sep) => (sep === "?" ? "?" : "&")).replace(/[?&]$/, "") : raw;
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop);
  },
});
