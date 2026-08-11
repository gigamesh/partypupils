import { describe, expect, it } from "vitest";
import {
  applyBundleDiscount,
  apportion,
  chargeableTotal,
  STRIPE_MIN_CHARGE_CENTS,
} from "@/lib/pricing";

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

describe("chargeableTotal", () => {
  it("raises sub-minimum totals to the Stripe floor", () => {
    expect(chargeableTotal(0)).toBe(STRIPE_MIN_CHARGE_CENTS);
    expect(chargeableTotal(49)).toBe(STRIPE_MIN_CHARGE_CENTS);
  });

  it("passes through totals at or above the floor", () => {
    expect(chargeableTotal(50)).toBe(50);
    expect(chargeableTotal(2600)).toBe(2600);
  });
});

describe("apportion", () => {
  const sumOf = (m: Map<number, number>) => [...m.values()].reduce((s, v) => s + v, 0);

  it("splits proportionally when the division is exact", () => {
    const result = apportion(1500, [
      { id: 1, price: 1000 },
      { id: 2, price: 2000 },
    ]);
    expect(result.get(1)).toBe(500);
    expect(result.get(2)).toBe(1000);
  });

  it("distributes remainder cents so the total is exact", () => {
    const parts = [
      { id: 1, price: 1000 },
      { id: 2, price: 1000 },
      { id: 3, price: 1000 },
    ];
    const result = apportion(1000, parts);
    expect(sumOf(result)).toBe(1000);
    expect([...result.values()].sort()).toEqual([333, 333, 334]);
  });

  it("sums to the total across randomized inputs", () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 200; trial++) {
      const count = 1 + Math.floor(rand() * 12);
      const parts = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        price: Math.floor(rand() * 5000),
      }));
      const total = Math.floor(rand() * 50000);
      expect(sumOf(apportion(total, parts))).toBe(total);
    }
  });

  it("is deterministic for the same inputs", () => {
    const parts = [
      { id: 3, price: 700 },
      { id: 1, price: 700 },
      { id: 2, price: 700 },
    ];
    const a = apportion(1001, parts);
    const b = apportion(1001, parts);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("gives a single member the whole total", () => {
    expect(apportion(2600, [{ id: 7, price: 999 }]).get(7)).toBe(2600);
  });

  it("splits evenly when every member is free", () => {
    const result = apportion(300, [
      { id: 1, price: 0 },
      { id: 2, price: 0 },
      { id: 3, price: 0 },
    ]);
    expect(sumOf(result)).toBe(300);
    expect([...result.values()]).toEqual([100, 100, 100]);
  });

  it("handles a total smaller than the member count", () => {
    const result = apportion(2, [
      { id: 1, price: 500 },
      { id: 2, price: 400 },
      { id: 3, price: 300 },
    ]);
    expect(sumOf(result)).toBe(2);
  });

  it("returns an empty map for no members", () => {
    expect(apportion(1000, []).size).toBe(0);
  });
});
