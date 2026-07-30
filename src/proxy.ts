import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  verifyAdminSessionFromRequest,
} from "@/lib/admin-auth";

// Admin API auth gate. `@gigamusic/admin` 0.3.0 dropped its own auth
// helpers, so without this the wrapped handler factories (links,
// link-pages, upload, etc.) would happily serve any unauthenticated
// request. `/api/admin/auth` is the one allowed exception — that's the
// login on-ramp.
//
// `/admin` pages are intentionally NOT gated here. `src/app/admin/layout.tsx`
// already renders the login form inline for unauthenticated requests, and
// trying to redirect would loop the matcher. They still run through this
// proxy so that browsing the admin UI rolls the session cookie forward — see
// below.
//
// This is also where the session's sliding refresh happens: an admin request
// carrying a valid-but-aging cookie gets a reissued one on the response. The
// proxy owns this because it's the only layer that sees every admin request
// *and* can write cookies (`cookies()` is read-only inside a Server Component
// render, so `src/app/admin/layout.tsx` can't do it).
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  const session = await verifyAdminSessionFromRequest(req);

  if (!session.authed) {
    // Page requests fall through to the layout's inline login form; only the
    // API is hard-gated.
    if (!pathname.startsWith("/api/")) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.next();
  if (session.refreshedToken) {
    res.cookies.set(
      ADMIN_SESSION_COOKIE,
      session.refreshedToken,
      adminSessionCookieOptions,
    );
  }
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
