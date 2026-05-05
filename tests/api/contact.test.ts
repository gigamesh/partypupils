/**
 * Contact endpoint — focused on the new origin check (Layer A CSRF defense).
 * Existing rate-limit + honeypot logic isn't re-tested here.
 */
import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { POST as contact } from "@/app/api/contact/route";

function jsonReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://test/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/contact origin check", () => {
  it("403s when no Origin/Referer header", async () => {
    const res = await contact(jsonReq({ name: "x", email: "x@y.com", message: "hi" }));
    expect(res.status).toBe(403);
  });

  it("403s when Origin is a different site", async () => {
    const res = await contact(
      jsonReq({ name: "x", email: "x@y.com", message: "hi" }, { origin: "https://evil.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("proceeds past the origin check when Origin is localhost (dev)", async () => {
    const res = await contact(
      jsonReq({ name: "x", email: "x@y.com", message: "hi" }, { origin: "http://localhost:3000" }),
    );
    // Email is mocked in setup.ts; happy path returns 200.
    expect(res.status).toBe(200);
  });
});

describe("POST /api/contact rate limiting (Postgres-backed)", () => {
  it("429s after 3 successful sends from the same IP within the window", async () => {
    const ip = "8.8.8.8";
    for (let i = 0; i < 3; i++) {
      const res = await contact(
        jsonReq(
          { name: "x", email: `x${i}@y.com`, message: "hi" },
          { origin: "http://localhost:3000", "x-forwarded-for": ip },
        ),
      );
      expect(res.status).toBe(200);
    }
    const blocked = await contact(
      jsonReq(
        { name: "x", email: "x@y.com", message: "hi" },
        { origin: "http://localhost:3000", "x-forwarded-for": ip },
      ),
    );
    expect(blocked.status).toBe(429);
  });

  it("limit is per-IP (different IPs aren't blocked together)", async () => {
    const a = "10.0.0.1";
    const b = "10.0.0.2";
    for (let i = 0; i < 3; i++) {
      await contact(
        jsonReq(
          { name: "x", email: "x@y.com", message: "hi" },
          { origin: "http://localhost:3000", "x-forwarded-for": a },
        ),
      );
    }
    const aBlocked = await contact(
      jsonReq(
        { name: "x", email: "x@y.com", message: "hi" },
        { origin: "http://localhost:3000", "x-forwarded-for": a },
      ),
    );
    expect(aBlocked.status).toBe(429);

    const bOk = await contact(
      jsonReq(
        { name: "x", email: "x@y.com", message: "hi" },
        { origin: "http://localhost:3000", "x-forwarded-for": b },
      ),
    );
    expect(bOk.status).toBe(200);
  });
});
