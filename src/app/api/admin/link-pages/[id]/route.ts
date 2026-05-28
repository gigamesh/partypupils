import type { NextRequest } from "next/server";
import { createAdminLinkPageByIdHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";
import { env } from "@/lib/env";

const handlers = createAdminLinkPageByIdHandlers({
  queries: linkPageQueries,
  adminSessionSecret: env.ADMIN_SECRET(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handlers.GET(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return handlers.PUT(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handlers.DELETE(req, ctx);
}
