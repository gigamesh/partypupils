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
});
