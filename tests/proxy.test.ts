/**
 * Tests the `src/proxy.ts` admin-auth gate. Uses the *real*
 * `verifyAdminSessionFromRequest` (not the global mock from
 * `tests/setup.ts`) so the cookie signing/verification round-trip is
 * exercised end-to-end.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { signSessionToken } from "@gigamusic/core";
import { env } from "@/lib/env";

vi.unmock("@/lib/admin-auth");

const { proxy } = await import("@/proxy");

let validCookie = "";

beforeAll(async () => {
  const token = await signSessionToken({
    payload: { admin: true },
    secret: env.ADMIN_SECRET(),
  });
  validCookie = `admin_session=${token}`;
});

function req(path: string, opts: { cookie?: string } = {}): Request {
  return new Request(`http://test${path}`, {
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  });
}

describe("proxy (admin auth gate)", () => {
  it("401s an unauthenticated /api/admin request", async () => {
    const res = await proxy(req("/api/admin/links") as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("passes through a request with a valid admin_session cookie", async () => {
    const res = await proxy(req("/api/admin/links", { cookie: validCookie }) as never);
    // NextResponse.next() returns a 200-ish response with the
    // `x-middleware-next: 1` marker — that's how the runtime knows to
    // continue to the matched route handler.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets /api/admin/auth through even without a cookie (login on-ramp)", async () => {
    const res = await proxy(req("/api/admin/auth") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects a request whose cookie is signed with the wrong secret", async () => {
    const token = await signSessionToken({
      payload: { admin: true },
      secret: "not-the-real-secret",
    });
    const res = await proxy(req("/api/admin/links", { cookie: `admin_session=${token}` }) as never);
    expect(res.status).toBe(401);
  });

  it("rejects a request whose cookie payload isn't `{ admin: true }`", async () => {
    const token = await signSessionToken({
      payload: { admin: false },
      secret: env.ADMIN_SECRET(),
    });
    const res = await proxy(req("/api/admin/links", { cookie: `admin_session=${token}` }) as never);
    expect(res.status).toBe(401);
  });

  it("lets an unauthenticated /admin page through to the inline login form", async () => {
    const res = await proxy(req("/admin/releases") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy (sliding session refresh)", () => {
  /** Sign a session token that expires `seconds` from now. */
  async function agedCookie(seconds: number): Promise<string> {
    const token = await signSessionToken({
      payload: { admin: true },
      secret: env.ADMIN_SECRET(),
      expiresIn: `${seconds}s`,
    });
    return `admin_session=${token}`;
  }

  it("reissues the cookie when the token is inside the 12h refresh window", async () => {
    const cookie = await agedCookie(60 * 60 * 6);
    const res = await proxy(req("/api/admin/links", { cookie }) as never);

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("admin_session=");
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).toContain("HttpOnly");
    // The reissued token must differ from the one that came in, or the
    // refresh isn't actually extending anything.
    expect(setCookie).not.toContain(cookie.slice("admin_session=".length));
  });

  it("refreshes on an /admin page view, not just API calls", async () => {
    const cookie = await agedCookie(60 * 60 * 6);
    const res = await proxy(req("/admin/releases", { cookie }) as never);

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("set-cookie")).toContain("admin_session=");
  });

  it("leaves a fresh token alone", async () => {
    const cookie = await agedCookie(60 * 60 * 23);
    const res = await proxy(req("/api/admin/links", { cookie }) as never);

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not resurrect an already-expired session", async () => {
    const cookie = await agedCookie(-60);
    const res = await proxy(req("/api/admin/links", { cookie }) as never);

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
