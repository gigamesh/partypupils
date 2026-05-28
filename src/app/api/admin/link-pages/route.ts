import type { NextRequest } from "next/server";
import { createAdminLinkPagesHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";

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
