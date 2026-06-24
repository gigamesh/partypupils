import type { NextRequest } from "next/server";
import { createAdminLinkPagesHandlers } from "@gigamusic/links/server";
import { queries } from "@/lib/db";

const handlers = createAdminLinkPagesHandlers({ queries });

interface RouteContext {
  params: Promise<Record<string, never>>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handlers.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handlers.POST(req, ctx);
}
