import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminLinksHandlers } from "@gigamusic/admin/server";
import { queries } from "@/lib/db";
import { LINKS_TAG } from "@/lib/cache-tags";

const handlers = createAdminLinksHandlers({ queries });

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
