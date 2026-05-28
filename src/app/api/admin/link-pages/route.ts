import type { NextRequest } from "next/server";
import { createAdminLinkPagesHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";
import { env } from "@/lib/env";

const handlers = createAdminLinkPagesHandlers({
  queries: linkPageQueries,
  adminSessionSecret: env.ADMIN_SECRET(),
});

interface RouteContext {
  params: Promise<Record<string, never>>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handlers.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handlers.POST(req, ctx);
}
