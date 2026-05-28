import type { NextRequest } from "next/server";
import {
  createAdminUploadPresignHandler,
  type AdminDeps,
} from "@gigamusic/admin/server";
import { storageProvider } from "@/lib/storage";
import { env } from "@/lib/env";

// The presign handler only reads `storage` + `adminSessionSecret` at
// runtime; cast the rest of the `AdminDeps` bag away so this route's
// serverless bundle doesn't transitively pull in audio + email.
const handler = createAdminUploadPresignHandler({
  storage: storageProvider(),
  adminSessionSecret: env.ADMIN_SECRET(),
} as unknown as AdminDeps);

export function POST(req: NextRequest) {
  return handler(req);
}
