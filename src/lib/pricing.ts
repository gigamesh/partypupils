/**
 * Pure bundle pricing math. Deliberately free of `db` / `env` / `next` imports
 * so the admin editor can preview prices client-side against the exact
 * function the server charges with.
 *
 * Only the discount itself lives here. Clamping to the Stripe card minimum and
 * apportioning a bundle total across its member releases both moved into
 * `@gigamusic/checkout` 4.6.0, which owns the `amounts` metadata contract that
 * apportionment exists to satisfy.
 */

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
