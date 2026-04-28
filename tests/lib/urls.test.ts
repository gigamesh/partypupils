import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedRequestOrigin } from "@/lib/urls";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://test/api", { method: "POST", headers });
}

describe("isAllowedRequestOrigin", () => {
  const original = process.env.NEXT_PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://partypupils.com";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_BASE_URL = original;
  });

  it("allows requests from a known production domain", () => {
    expect(isAllowedRequestOrigin(reqWith({ origin: "https://partypupils.com" }))).toBe(true);
    expect(isAllowedRequestOrigin(reqWith({ origin: "https://www.partypupils.com" }))).toBe(true);
  });

  it("allows requests from NEXT_PUBLIC_BASE_URL", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://staging.example.com";
    expect(isAllowedRequestOrigin(reqWith({ origin: "https://staging.example.com" }))).toBe(true);
  });

  it("allows localhost on any port (dev)", () => {
    expect(isAllowedRequestOrigin(reqWith({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isAllowedRequestOrigin(reqWith({ origin: "http://localhost:9999" }))).toBe(true);
    expect(isAllowedRequestOrigin(reqWith({ origin: "http://127.0.0.1:3000" }))).toBe(true);
  });

  it("allows Vercel preview deployments", () => {
    expect(
      isAllowedRequestOrigin(reqWith({ origin: "https://party-pupils-git-feat-x.vercel.app" })),
    ).toBe(true);
  });

  it("rejects requests from unknown origins", () => {
    expect(isAllowedRequestOrigin(reqWith({ origin: "https://evil.com" }))).toBe(false);
    expect(isAllowedRequestOrigin(reqWith({ origin: "https://partypupils.com.evil.com" }))).toBe(false);
  });

  it("rejects requests with no Origin or Referer", () => {
    expect(isAllowedRequestOrigin(reqWith({}))).toBe(false);
  });

  it("falls back to Referer when Origin is missing", () => {
    expect(
      isAllowedRequestOrigin(reqWith({ referer: "https://partypupils.com/cart" })),
    ).toBe(true);
    expect(
      isAllowedRequestOrigin(reqWith({ referer: "https://evil.com/something" })),
    ).toBe(false);
  });

  it("rejects malformed Origin headers", () => {
    expect(isAllowedRequestOrigin(reqWith({ origin: "not-a-url" }))).toBe(false);
  });
});
