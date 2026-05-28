import type { NextRequest } from "next/server";
import { createAdminLinkPagesHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";

// Auth is enforced upstream by `src/proxy.ts`; the package no longer
// verifies sessions inside handlers.
const handlers = createAdminLinkPagesHandlers({ queries: linkPageQueries });

interface RouteContext {
  params: Promise<Record<string, never>>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handlers.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handlers.POST(req, ctx);
}
