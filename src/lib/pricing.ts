/**
 * Pure bundle pricing math. Deliberately free of `db` / `env` / `next` imports
 * so the admin editor can preview prices client-side against the exact
 * function the server charges with.
 */

/**
 * Stripe rejects card charges below 50 cents (USD). `@gigamusic/checkout`
 * keeps this as a private constant, so the local bundle checkout path carries
 * its own copy.
 */
export const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * Apply a percent-off discount to a bundle's summed member prices, rounded to
 * whole dollars so the displayed price stays tidy.
 *
 * The rounding is the reason for the clamps: `Math.round` on a small total
 * with a small discount can land *above* the original (e.g. $24.50 at 0% off
 * rounds to $25.00), which would mean a "discount" that charges more.
 */
export function applyBundleDiscount(
  originalPriceCents: number,
  discountPercent: number,
): number {
  const rounded =
    Math.round((originalPriceCents * (1 - discountPercent / 100)) / 100) * 100;
  return Math.max(0, Math.min(originalPriceCents, rounded));
}

/** Raise a total to the Stripe card minimum so a heavily discounted bundle doesn't hit an opaque Stripe error. */
export function chargeableTotal(cents: number): number {
  return Math.max(STRIPE_MIN_CHARGE_CENTS, Math.round(cents));
}

export interface ApportionPart {
  id: number;
  price: number;
}

/**
 * Split a charged bundle total across its member releases proportionally to
 * their list prices, using largest-remainder allocation.
 *
 * The sum of the returned values equals `totalCents` exactly. That matters:
 * these become `order_items.price` rows, and `sum(order_items.price) ===
 * orders.amountTotal` is the invariant refunds and the admin order view rely
 * on. Ties break deterministically (remainder desc, price desc, id asc) so a
 * webhook retry apportions identically.
 */
export function apportion(
  totalCents: number,
  parts: ApportionPart[],
): Map<number, number> {
  const result = new Map<number, number>();
  if (parts.length === 0) return result;

  const total = Math.max(0, Math.round(totalCents));
  const sum = parts.reduce((s, p) => s + Math.max(0, p.price), 0);

  // All-free members: nothing to weight by, so split evenly.
  const weights = sum > 0 ? parts.map((p) => Math.max(0, p.price) / sum) : parts.map(() => 1 / parts.length);

  const exact = weights.map((w) => total * w);
  const base = exact.map((v) => Math.floor(v));
  let remainder = total - base.reduce((s, v) => s + v, 0);

  const order = parts
    .map((p, i) => ({ i, frac: exact[i]! - base[i]!, price: p.price, id: p.id }))
    .sort((a, b) => b.frac - a.frac || b.price - a.price || a.id - b.id);

  for (const { i } of order) {
    if (remainder <= 0) break;
    base[i]! += 1;
    remainder -= 1;
  }

  parts.forEach((p, i) => result.set(p.id, base[i]!));
  return result;
}
