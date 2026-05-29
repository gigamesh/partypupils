import type { NextRequest } from "next/server";
import * as audio from "@gigamusic/audio";
import { createAdminUploadProcessHandler } from "@gigamusic/admin/server";
import { queries } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

export const maxDuration = 300;

const handler = createAdminUploadProcessHandler({
  storage: storageProvider(),
  audio,
  queries,
});

export function POST(req: NextRequest) {
  return handler(req);
}
