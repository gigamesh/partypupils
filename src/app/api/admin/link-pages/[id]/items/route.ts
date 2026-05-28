import type { NextRequest } from "next/server";
import { createAdminLinkPageItemsHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";
import { env } from "@/lib/env";

const handlers = createAdminLinkPageItemsHandlers({
  queries: linkPageQueries,
  adminSessionSecret: env.ADMIN_SECRET(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handlers.POST(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return handlers.PUT(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handlers.DELETE(req, ctx);
}
