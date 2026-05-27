import type { NextRequest } from "next/server";
import { createAdminUploadPresignHandler } from "@gigamusic/admin/server";
import { storageProvider } from "@/lib/storage";

// Auth is enforced upstream by `src/proxy.ts`; the package no longer
// verifies sessions inside handlers. This factory takes just the storage
// slice it reads.
const handler = createAdminUploadPresignHandler({
  storage: storageProvider(),
});

export function POST(req: NextRequest) {
  return handler(req);
}
