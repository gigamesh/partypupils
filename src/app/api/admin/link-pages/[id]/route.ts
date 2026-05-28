import type { NextRequest } from "next/server";
import { createAdminLinkPageByIdHandlers } from "@gigamusic/links/server";
import { linkPageQueries } from "@/lib/link-pages";

const handlers = createAdminLinkPageByIdHandlers({ queries: linkPageQueries });

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
