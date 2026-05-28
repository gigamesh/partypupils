import type { NextRequest } from "next/server";
import { createAdminLoginHandler } from "@gigamusic/admin/server";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";

// `queries` opts the package into its built-in per-IP brute-force rate limit
// (10 attempts / 15 min, same shape as the old hand-rolled limiter on this
// route). Without `queries` the handler skips the rate-limit check entirely.
const handler = createAdminLoginHandler({
  adminPasswordHash: env.ADMIN_PASSWORD_HASH(),
  adminSessionSecret: env.ADMIN_SECRET(),
  queries,
});

export function POST(req: NextRequest) {
  return handler(req);
}
