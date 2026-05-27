import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

/**
 * Admin auth gate. Runs before route handlers — anything under `/admin` or
 * `/api/admin` requires a valid `admin_session` cookie. The bcrypt-verify
 * login route at `/api/admin/auth` is the one allowed exception (you
 * obviously need to hit it before you have a session).
 *
 * Why a proxy and not per-route checks: the `@gigamusic/admin` package no
 * longer ships an auth helper (as of 0.2.0 — consumers own auth). Doing
 * the check here once means every existing and future admin route is
 * gated by default, with no risk of forgetting to add the check inside a
 * new handler.
 */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const path = url.pathname;

  // The login route itself isn't gated — that's the on-ramp.
  if (path === "/api/admin/auth") {
    return NextResponse.next();
  }

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    const authed = await verifyAdminSessionFromRequest(req);
    if (!authed) {
      if (path.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
