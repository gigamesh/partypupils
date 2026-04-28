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
