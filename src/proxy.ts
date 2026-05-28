import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// Admin API auth gate. `@gigamusic/admin` 0.3.0 dropped its own auth
// helpers, so without this the wrapped handler factories (links,
// link-pages, upload, etc.) would happily serve any unauthenticated
// request. `/api/admin/auth` is the one allowed exception — that's the
// login on-ramp.
//
// `/admin` pages are intentionally NOT gated here. `src/app/admin/layout.tsx`
// already renders the login form inline for unauthenticated requests, and
// trying to redirect would loop the matcher.
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  const authed = await verifyAdminSessionFromRequest(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
