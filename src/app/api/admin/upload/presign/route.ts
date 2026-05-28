import type { NextRequest } from "next/server";
import { createAdminUploadPresignHandler } from "@gigamusic/admin/server";
import { storageProvider } from "@/lib/storage";

const handler = createAdminUploadPresignHandler({ storage: storageProvider() });

export function POST(req: NextRequest) {
  return handler(req);
}
