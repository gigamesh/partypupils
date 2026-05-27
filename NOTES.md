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
- `5b39133` `src/lib/release-reads.ts` → `@gigamusic/db.createQueries()`. `getFeaturedReleases` is `listPublishedReleases().slice(0, 4)`; `getReleaseBySlug` adds the `isPublished: true` filter on top of the unfiltered package query.
- **`getTrackByReleaseAndSlug` + `getHeroLinks` now go through the package.** `@gigamusic/db.getTrackByReleaseAndSlug(releaseSlug, trackSlug)` returns the track + parent release + sibling tracks for the song page; the `release.isPublished` filter is enforced inside the package. `listVisibleLinks({ showOnHero: true })` replaces the post-fetch `.filter(...)` on hero links. The direct `prisma` import in `release-reads.ts` is reduced to a single delegate hand-off via `createQueries(...)` — there are no longer any raw Prisma reads in this file.
- `33ef5e3` `src/lib/link-pages.ts` → `@gigamusic/links.createLinkPageQueries`. `LinkPageWithItems` shape (`release.{coverImageUrl,isPublished}`, `items`) matches party-pupils' consumer at `src/app/links/[slug]/page.tsx` 1:1.
- `13df7ce` `src/lib/catalog.ts` → `@gigamusic/core.applyCatalogDiscount` + `sumLineItems` and `queries.getSetting` for the discount percent. `prisma.release.findMany({ select: { id, price } })` stays direct — routing through `listPublishedReleases` would fetch tracks + files on every homepage render.
- `4c44102` `src/app/api/checkout/route.ts` → wraps `@gigamusic/checkout.createCheckoutHandler`. Route-level wrapper still does the `isAllowedRequestOrigin` CSRF check and translates the legacy cart shape (`{ releaseId, trackId, catalogPurchase }`) to the package's canonical `{ kind, id }`. Handler is recreated per request so admin-changed discounts pick up on the next call.
- `d61a6eb` `src/app/api/webhooks/stripe/route.ts` → wraps `@gigamusic/checkout.createStripeWebhookHandler`. Built once at module load (no env reads at request time). `orderTokenSecret: env.ADMIN_SECRET()` so existing tokens stay valid.
- `a00dc12` `package.json` next + eslint-config-next bumped to `16.2.6` (exact pin, matching the gigamusic tree). Unblocks dropping `as any` casts at the route boundary.
- `d159283` `src/lib/preview.ts` → `@gigamusic/audio.transcodeWavToMp3`. `convertWavStreamToMp3` keeps its stream-in / file-out signature: the stream is buffered to a temp WAV and the cover image is read into a Buffer before the package handoff. `Mp3Metadata` (party-pupils' historical `year: number` shape) stays as a local alias that `toAudioTags` translates to `AudioTags`.
- `701950c` `scripts/retag-audio-files.ts` → `@gigamusic/audio.runRetag`. Flattens the Prisma graph into `RetagTrack[]`, preserves the existing CLI surface (`--apply / --release / --track / --skip`). `src/lib/wav-tags.ts` deleted (no callers); the legacy `ffmpegBinary` / `metadataArgs` exports were removed from `preview.ts` in the same commit. Note: MP3 retag is no longer done by the script — the package contract treats MP3 retagging as a consumer concern (gigamusic re-encodes from the freshly tagged WAV on admin upload).
- `74e881a` `src/app/cart/page.tsx` now POSTs `{ items: [{ kind, id? }] }` — the canonical `CheckoutCartItem` shape — directly. The route's `translateCart` block + re-encoded `Request` bridge are removed; the body passes through to `createCheckoutHandler` unchanged. localStorage cart state shape is untouched, so prior cart contents still round-trip.
- `083a0c6` `src/app/api/checkout/route.ts` now constructs `createCheckoutHandler` once at module load and resolves the discount via the new `catalogDiscount: () => Promise<...>` callback at request time. Same admin-changeable behaviour, no per-request handler reconstruction.
- `8e4425d` Dropped `as any` / `as unknown as NextRequest` casts in `checkout` + `stripe` route wrappers — both trees are now on `next@16.2.6` and the two `NextRequest` types unify.
- **download routes → `@gigamusic/checkout` factories.** `src/app/download/[token]/{route,zip/route,zip-stream/route}.ts` and `src/app/sw-zip/[...path]/route.ts` are now thin wrappers around `createDownloadHandler` / `createDownloadZipHandler` / `createDownloadZipStreamHandler` / `createSwZipFallbackHandler`. `src/lib/release-zip.ts` is trimmed to the admin-only `buildReleaseZipBundle` + `presignZipFiles`; the customer-side `resolveCustomerZip` and ~265 lines of supporting helpers are gone. `src/lib/storage.ts` gains a `storageProvider()` accessor mirroring `emailProvider()` so the factories can be handed the shared R2 singleton. Bonus pickups: the new `zip-stream` route inherits gigamusic's serialised-fetch + byte-counter + `_FAILED_*.txt` improvements that party-pupils' local copy was missing.
- **Stripe + @types/node bump.** Stripe pinned to `^22.1.0` (was `^22.0.0`) and `@types/node` bumped to `^22` (was `^20`) so pnpm dedupes Stripe across this repo and the gigamusic tree — fixes the TS2739 / nominal-type identity errors at the `WebhookDeps.stripe` boundary now that gigamusic's checkout pulls `stripe@22.1.1`.

## Notes on the route swaps

- **Webhook published-only resolution**: `@gigamusic/checkout.createStripeWebhookHandler` resolves item names/prices from `listPublishedReleases()`. Party-pupils' original `findMany` had no `isPublished` filter — but checkout-side filtering already prevents unpublished items from reaching this path, so behaviour is consistent.
- **Customer zip filenames lost the "Party Pupils - " prefix.** `@gigamusic/checkout.createDownloadZipHandler` produces `Order N (MP3).zip` / `Tracks (MP3).zip` / `${releaseName} (MP3).zip` — brand-agnostic by design. Two `tests/api/download.test.ts` assertions were updated to match. If we want the artist-name back in the filename, the cleanest path is to add a `zipNamePrefix` option to the gigamusic factory; for now the names are still clearly tied to the order/release.

## What was reverted earlier

- `aa21b10` / `9bc0772` `src/lib/link-platforms.tsx` — the original swap was reverted because the package re-exported server-only handlers from its main entry. The fix landed in `3973df7` (re-enable swap + `transpilePackages`); see commit `dffa94a` for the revert-of-revert.

## What is still NOT swapped (with reasons)

- API routes other than checkout + stripe webhook + downloads: admin routes, contact route, and link-pages routes are follow-ups.
- `src/lib/preview.ts` is now a thin shim around `@gigamusic/audio.transcodeWavToMp3` but is intentionally retained because the admin upload route and the cart-side metadata shape (`Mp3Metadata` with `year: number`) keep the historical surface stable. Could be inlined if `@gigamusic/audio.AudioTags` ever gains a `year`/`date` convenience overload.
- `runRetag` does not retag MP3 files — gigamusic intentionally moves MP3 retag to the upload pipeline (re-encode from the freshly tagged WAV). The previous party-pupils script re-tagged MP3s in place; this is a deliberate feature trade-off.

## Outstanding gigamusic-package observations (for orchestrator)

1. **`@gigamusic/checkout` webhook handler resolves items via `listPublishedReleases`.** Behaviourally fine today (the checkout handler is the only on-ramp and it filters the same way), but documenting it would prevent surprises if an unpublished item ever reached the webhook via a direct Stripe API call.
2. **`runRetag` does not retag MP3 files.** Party-pupils' previous script did. If a future site needs in-place MP3 retag during maintenance (without re-uploading a WAV), the package needs to expose that path.

## Build state

- `npx tsc --noEmit` — passes cleanly on `gigamusic-integration` apart from the pre-existing `RADIO_TRACKS_TAG` route-export error in `src/app/api/all-tracks/route.ts` (predates the integration; verified at `4046552`).
- `npx next build --webpack` — compiles successfully (`Compiled successfully in ~9s`); only failure is the same pre-existing `RADIO_TRACKS_TAG` route-export typecheck.
- `npx next build` (Turbopack default in Next 16) — still fails to resolve `@gigamusic/*` `link:` symlinks; Webpack remains the workaround. **Flagged for orchestrator**: publish + switch to a version range, or keep `--webpack` until Turbopack's `link:` resolution is fixed.
- `pnpm dev:prod` smoke (port 3001, fallback from 3000): `/`, `/music`, `/cart`, `/admin`, `/faq` all return 200.
