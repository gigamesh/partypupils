import { describe, expect, it } from "vitest";
import { applyBundleDiscount } from "@/lib/pricing";

describe("applyBundleDiscount", () => {
  it.each([
    [3000, 15, 2600],
    [1000, 50, 500],
    [999, 0, 999],
    [10000, 20, 8000],
  ])("discounts %i by %i%% to %i", (original, percent, expected) => {
    expect(applyBundleDiscount(original, percent)).toBe(expected);
  });

  it("never returns more than the original price when rounding rounds up", () => {
    // $24.50 at 0% off rounds to $25.00 without the clamp.
    expect(applyBundleDiscount(2450, 0)).toBe(2450);
    // Whole-dollar rounding still applies below the clamp: $24.255 -> $24.00.
    expect(applyBundleDiscount(2450, 1)).toBe(2400);
  });

  it("never returns a negative price", () => {
    expect(applyBundleDiscount(1500, 100)).toBe(0);
  });

  it("handles an empty bundle", () => {
    expect(applyBundleDiscount(0, 15)).toBe(0);
  });
});
