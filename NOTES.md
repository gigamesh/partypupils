# gigamusic integration notes

## What landed

Lib + route swaps to `@gigamusic/*` packages on `gigamusic-integration`. Each is its own commit:

- `23299a0` `src/lib/email.ts` → `@gigamusic/email` (Resend provider + 3 templates). Webhook now passes `session.amount_total` for the totalCents line. Branding `{ siteName, themeColor: "#adfd02" }` injected from `constants.ts`. (Later amended in `d61a6eb` to also export `EMAIL_BRANDING` and `emailProvider()` so the webhook route can feed them to `createStripeWebhookHandler`.)
- `f256220` `src/lib/storage.ts` → `@gigamusic/storage.createR2Provider`. Skinny wrappers preserve all party-pupils signatures (`uploadFile(File, pathname)`, `getPresignedUploadUrl(key, contentType)`, etc).
- `4c847dd` `src/lib/admin-auth.ts` → `@gigamusic/core.createAdminSessionToken` / `verifyAdminSessionToken`. Cookie write + sliding-window refresh kept; payload now carries `{ admin: true }` instead of `{}` so old cookies issued by the previous build will be rejected (users will re-login once).
- `e29bbaa` `src/lib/order-auth.ts` → `@gigamusic/core.signOrderToken` / `verifyOrderToken`. Party-pupils only signs `email`; passed `orderId: ""` as a placeholder since the magic-link only uses email.
- `c726847` `src/lib/rate-limit.ts` → `@gigamusic/db.createQueries().consumeRateLimit`. Returns `{ ok, remaining, resetAt }`; wrapper exposes the legacy boolean. Party-pupils' Prisma client (generated to `src/generated/prisma`) is structurally compatible — passed in via `as unknown as GigamusicPrismaClient`.
- `cec8b95` `src/lib/link-page-validation.ts` → `@gigamusic/core.RESERVED_SLUGS`. Wraps the ReadonlyArray in a Set to preserve the `.has(slug)` API. `SLUG_PATTERN`, error messages, `isUniqueConstraintError` stayed local.
- `3973df7` re-enabled the `link-platforms` swap to `@gigamusic/links` + `transpilePackages`.
- `03febe6` `src/lib/download-auth.ts` → `@gigamusic/db.createQueries().tokenGrantsTrack` / `tokenGrantsRelease`. The `releaseId` arg on `tokenGrantsTrack` is kept for call-site stability but is ignored — the gigamusic query resolves the parent release internally.
- `5b39133` `src/lib/release-reads.ts` → `@gigamusic/db.createQueries()`. `getFeaturedReleases` is `listPublishedReleases().slice(0, 4)`; `getReleaseBySlug` adds the `isPublished: true` filter on top of the unfiltered package query. `getTrackByReleaseAndSlug` and `getHeroLinks` (which needs the `showOnHero` predicate) stay on raw Prisma — no package equivalents.
- `33ef5e3` `src/lib/link-pages.ts` → `@gigamusic/links.createLinkPageQueries`. `LinkPageWithItems` shape (`release.{coverImageUrl,isPublished}`, `items`) matches party-pupils' consumer at `src/app/links/[slug]/page.tsx` 1:1.
- `13df7ce` `src/lib/catalog.ts` → `@gigamusic/core.applyCatalogDiscount` + `sumLineItems` and `queries.getSetting` for the discount percent. `prisma.release.findMany({ select: { id, price } })` stays direct — routing through `listPublishedReleases` would fetch tracks + files on every homepage render.
- `4c44102` `src/app/api/checkout/route.ts` → wraps `@gigamusic/checkout.createCheckoutHandler`. Route-level wrapper still does the `isAllowedRequestOrigin` CSRF check and translates the legacy cart shape (`{ releaseId, trackId, catalogPurchase }`) to the package's canonical `{ kind, id }`. Handler is recreated per request so admin-changed discounts pick up on the next call.
- `d61a6eb` `src/app/api/webhooks/stripe/route.ts` → wraps `@gigamusic/checkout.createStripeWebhookHandler`. Built once at module load (no env reads at request time). `orderTokenSecret: env.ADMIN_SECRET()` so existing tokens stay valid.

## Notes on the route swaps

- **Cart shape translation**: `src/app/cart/page.tsx` still emits `{ releaseId, trackId, catalogPurchase }`. The translation lives at the route boundary; the package consumes its canonical `{ kind, id }` input. UI was off-limits per orchestrator scope.
- **Webhook published-only resolution**: `@gigamusic/checkout.createStripeWebhookHandler` resolves item names/prices from `listPublishedReleases()`. Party-pupils' original `findMany` had no `isPublished` filter — but checkout-side filtering already prevents unpublished items from reaching this path, so behaviour is consistent.
- **Cross-tree NextRequest types**: `@gigamusic/checkout` is bundled against Next 16.2.6 in the gigamusic repo's `node_modules`; party-pupils is at 16.2.2. The two `NextRequest` types are structurally identical but nominally distinct, so the route handlers cast through `any` at the call boundary. Tag: candidate for a single-source `peerDependencies` declaration once packages are published.

## What was reverted earlier

- `aa21b10` / `9bc0772` `src/lib/link-platforms.tsx` — the original swap was reverted because the package re-exported server-only handlers from its main entry. The fix landed in `3973df7` (re-enable swap + `transpilePackages`); see commit `dffa94a` for the revert-of-revert.

## What is still NOT swapped (with reasons)

- `src/lib/preview.ts` — `convertWavStreamToMp3` has no `@gigamusic/audio` equivalent (different feature than `generatePreview` / `tagWav` / `tagMp3`).
- `src/lib/wav-tags.ts` — `extractId3v2Tag` + `retagWav({ srcWavPath, outWavPath, id3v2Tag })` shape doesn't match `@gigamusic/audio.tagWav({ inputPath, outputPath, tags, coverArt })`. Only used by `retag-audio-files.ts` maintenance script.
- `src/lib/release-reads.ts` — `getTrackByReleaseAndSlug` (no package equivalent) and `getHeroLinks` (`showOnHero` filter is party-pupils-specific) stay on raw Prisma. **Suggested**: add a `listVisibleLinks({ showOnHero?: boolean })` overload, and a `getTrack({ releaseSlug, trackSlug })` query.
- API routes other than checkout + stripe webhook: `src/app/api/checkout/route.ts` and `src/app/api/webhooks/stripe/route.ts` are done. The downloads route, admin routes, contact route, and link-pages routes are follow-ups.

## Outstanding gigamusic-package observations (for orchestrator)

1. **Two Next versions in the tree.** `@gigamusic/checkout` is built against `next@16.2.6`; party-pupils is on `next@16.2.2`. Their `NextRequest` types diverge by nominal identity even though the runtime shape matches — every route wrapping a gigamusic handler ends up casting through `any`. Aligning Next versions (or expressing it as a `peerDependency`) would let route handlers stay strongly typed.
2. **`createCheckoutHandler` bakes catalog discount at factory call.** The handler closes over `catalogDiscount.percent`; party-pupils reads the percent from a SiteSetting that admins can change without redeploying. The route works around this by reconstructing the handler per request. An alternative would be to accept `catalogDiscount` as `() => Promise<{percent, productName}>`.
3. **`@gigamusic/checkout` webhook handler resolves items via `listPublishedReleases`.** Behaviourally fine today (the checkout handler is the only on-ramp and it filters the same way), but documenting it would prevent surprises if an unpublished item ever reached the webhook via a direct Stripe API call.

## Build state

- `npx tsc --noEmit` — passes cleanly on `gigamusic-integration` (verified after the swaps above).
- `npx next build --webpack` — compiles cleanly. The only failure is the pre-existing `src/app/api/all-tracks/route.ts` route-export typecheck on `RADIO_TRACKS_TAG`, which existed before the integration commits (verified at `4046552`).
- `npx next build` (Turbopack default in Next 16) — still fails to resolve `@gigamusic/*` `link:` symlinks; Webpack remains the workaround. **Flagged for orchestrator**: publish + switch to a version range, or keep `--webpack` until Turbopack's `link:` resolution is fixed.
