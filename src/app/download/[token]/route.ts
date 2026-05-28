import type { NextRequest } from "next/server";
import { createDownloadHandler } from "@gigamusic/checkout";
import { queries } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

const handler = createDownloadHandler({ queries, storage: storageProvider() });

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
