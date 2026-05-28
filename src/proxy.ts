import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// Admin auth gate. Runs before route handlers — anything under `/admin` or
// `/api/admin` requires a valid `admin_session` cookie, except the login
// route itself (which is the on-ramp). `@gigamusic/admin` 0.3.0 dropped
// its own auth helpers, so without this proxy the admin handler factories
// would happily serve any unauthenticated request.
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const authed = await verifyAdminSessionFromRequest(req);
    if (!authed) {
      if (pathname.startsWith("/api/admin")) {
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
