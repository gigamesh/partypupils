import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { hashPassword } from "@gigamusic/core";

// Opt out of the global `vi.mock("@/lib/admin-auth")` from tests/setup.ts —
// this test exercises the real login route, including the real cookie write
// from `createAdminSession`.
vi.unmock("@/lib/admin-auth");

// The route module reads `env.ADMIN_PASSWORD_HASH()` at import time, so the
// hash and env mutation have to happen before the dynamic route import below.
const passwordHash = await hashPassword("test-correct-password");
process.env.ADMIN_PASSWORD_HASH = passwordHash;

// Mock `next/headers` cookies with a Map so we can observe what the package
// writes after a successful login. Mirrors @gigamusic/admin's own test pattern.
const cookieJar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set(name: string, value: string) {
      cookieJar.set(name, { value });
    },
  }),
}));

const { POST: adminAuth } = await import("@/app/api/admin/auth/route");

function loginReq(password: string, ip = "1.1.1.1"): NextRequest {
  return new Request("http://test/api/admin/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ password }),
  }) as unknown as NextRequest;
}

describe("POST /api/admin/auth", () => {
  it("loaded a deterministic hash fixture", () => {
    expect(passwordHash.startsWith("$2")).toBe(true);
  });

  it("200s and writes a session cookie on the correct password", async () => {
    cookieJar.clear();
    const res = await adminAuth(loginReq("test-correct-password"));
    expect(res.status).toBe(200);
    expect(cookieJar.get("admin_session")?.value).toBeTruthy();
  });

  it("401s on the wrong password", async () => {
    const res = await adminAuth(loginReq("nope"));
    expect(res.status).toBe(401);
  });

  it("401s on an empty password", async () => {
    const res = await adminAuth(loginReq(""));
    expect(res.status).toBe(401);
  });

  it("rate-limits brute force attempts from the same IP at 10/window", async () => {
    // 10 wrong attempts → 401; the 11th should be 429.
    for (let i = 0; i < 10; i++) {
      const res = await adminAuth(loginReq("wrong", "9.9.9.9"));
      expect(res.status).toBe(401);
    }
    const res = await adminAuth(loginReq("wrong", "9.9.9.9"));
    expect(res.status).toBe(429);
  });

  it("does not bleed the rate-limit across IPs", async () => {
    for (let i = 0; i < 10; i++) {
      await adminAuth(loginReq("wrong", "5.5.5.5"));
    }
    const blocked = await adminAuth(loginReq("wrong", "5.5.5.5"));
    expect(blocked.status).toBe(429);

    const otherIp = await adminAuth(loginReq("wrong", "6.6.6.6"));
    expect(otherIp.status).toBe(401);
  });
});
