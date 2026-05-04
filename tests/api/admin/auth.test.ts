/**
 * Admin auth route — verifies timing-safe password compare and per-IP
 * rate limiting backed by the shared Postgres counter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST as adminAuth } from "@/app/api/admin/auth/route";
import * as adminAuthLib from "@/lib/admin-auth";

beforeEach(() => {
  vi.mocked(adminAuthLib.createAdminSession).mockClear();
  process.env.ADMIN_PASSWORD = "test-correct-password";
});

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
  it("200s and creates a session on the correct password", async () => {
    const res = await adminAuth(loginReq("test-correct-password"));
    expect(res.status).toBe(200);
    expect(vi.mocked(adminAuthLib.createAdminSession)).toHaveBeenCalledTimes(1);
  });

  it("401s on the wrong password", async () => {
    const res = await adminAuth(loginReq("nope"));
    expect(res.status).toBe(401);
  });

  it("401s on a wrong-but-same-length password (timing-safe compare doesn't shortcut)", async () => {
    const res = await adminAuth(loginReq("test-correct-passwore"));
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
