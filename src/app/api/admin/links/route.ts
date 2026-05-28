import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  createAdminLinksHandlers,
  type AdminDeps,
} from "@gigamusic/admin/server";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LINKS_TAG } from "@/lib/cache-tags";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// The `AdminDeps` type wants the full bag (storage, audio, branding,
// adminPasswordHash) but `createAdminLinksHandlers` only reads `queries` +
// `adminSessionSecret`. Pass the live slice and cast the rest — keeps the
// per-route bundle from pulling in storage/audio/email transitively.
const handlers = createAdminLinksHandlers({
  queries,
  adminSessionSecret: env.ADMIN_SECRET(),
} as unknown as AdminDeps);

/** Re-validate the hero/links cache after every write so changes show up immediately. */
async function withCacheBust(res: Response): Promise<Response> {
  if (res.ok) revalidateTag(LINKS_TAG, "max");
  return res;
}

export function GET(req: NextRequest) {
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  return withCacheBust(await handlers.POST(req));
}

export async function PUT(req: NextRequest) {
  return withCacheBust(await handlers.PUT(req));
}

export async function DELETE(req: NextRequest) {
  return withCacheBust(await handlers.DELETE(req));
}
