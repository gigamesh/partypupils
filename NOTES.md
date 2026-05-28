# gigamusic integration notes

## What landed

Lib + route swaps to `@gigamusic/*` packages on `gigamusic-integration`. Each is its own commit:

### Library swaps

- `23299a0` `src/lib/email.ts` → `@gigamusic/email` (Resend provider + 3 templates). Webhook now passes `session.amount_total` for the totalCents line. Branding `{ siteName, themeColor: "#adfd02" }` injected from `constants.ts`. (Later amended in `d61a6eb` to also export `EMAIL_BRANDING` and `emailProvider()` so the webhook route can feed them to `createStripeWebhookHandler`.)
- `f256220` `src/lib/storage.ts` → `@gigamusic/storage.createR2Provider`. Skinny wrappers preserve all party-pupils signatures (`uploadFile(File, pathname)`, `getPresignedUploadUrl(key, contentType)`, etc).
- `4c847dd` `src/lib/admin-auth.ts` → `@gigamusic/core.createAdminSessionToken` / `verifyAdminSessionToken`. Cookie write + sliding-window refresh kept; payload now carries `{ admin: true }` instead of `{}` so old cookies issued by the previous build will be rejected (users will re-login once).
- `e29bbaa` `src/lib/order-auth.ts` → `@gigamusic/core.signOrderToken` / `verifyOrderToken`. Party-pupils only signs `email`; passed `orderId: ""` as a placeholder since the magic-link only uses email.
- `c726847` `src/lib/rate-limit.ts` → `@gigamusic/db.createQueries().consumeRateLimit`. Returns `{ ok, remaining, resetAt }`; wrapper exposes the legacy boolean. Party-pupils' Prisma client (generated to `src/generated/prisma`) is structurally compatible — passed in via `as unknown as GigamusicPrismaClient`.
- `cec8b95` `src/lib/link-page-validation.ts` → `@gigamusic/core.RESERVED_SLUGS`. Wraps the ReadonlyArray in a Set to preserve the `.has(slug)` API. `SLUG_PATTERN`, error messages, `isUniqueConstraintError` stayed local.
- `3973df7` re-enabled the `link-platforms` swap to `@gigamusic/links` + `transpilePackages`.
- `03febe6` `src/lib/download-auth.ts` → `@gigamusic/db.createQueries().tokenGrantsTrack` / `tokenGrantsRelease`. The `releaseId` arg on `tokenGrantsTrack` is kept for call-site stability but is ignored — the gigamusic query resolves the parent release internally.
- `5b39133` `src/lib/release-reads.ts` → `@gigamusic/db.createQueries()`. `getFeaturedReleases` is `listPublishedReleases().slice(0, 4)`; `getReleaseBySlug` adds the `isPublished: true` filter on top of the unfiltered package query.
- `90f9e65` `getTrackByReleaseAndSlug` + `getHeroLinks` now go through the package. `@gigamusic/db.getTrackByReleaseAndSlug(releaseSlug, trackSlug)` returns the track + parent release + sibling tracks for the song page; the `release.isPublished` filter is enforced inside the package. `listVisibleLinks({ showOnHero: true })` replaces the post-fetch `.filter(...)` on hero links. The direct `prisma` import in `release-reads.ts` is reduced to a single delegate hand-off via `createQueries(...)` — there are no longer any raw Prisma reads in this file.
- `33ef5e3` `src/lib/link-pages.ts` → `@gigamusic/links.createLinkPageQueries`. `LinkPageWithItems` shape (`release.{coverImageUrl,isPublished}`, `items`) matches party-pupils' consumer at `src/app/links/[slug]/page.tsx` 1:1.
- `13df7ce` `src/lib/catalog.ts` → `@gigamusic/core.applyCatalogDiscount` + `sumLineItems` and `queries.getSetting` for the discount percent. `prisma.release.findMany({ select: { id, price } })` stays direct — routing through `listPublishedReleases` would fetch tracks + files on every homepage render.
- `d159283` `src/lib/preview.ts` → `@gigamusic/audio.transcodeWavToMp3`. (Later deleted entirely once the route swap left no production consumers.)
- `701950c` `scripts/retag-audio-files.ts` → `@gigamusic/audio.runRetag`. Flattens the Prisma graph into `RetagTrack[]`, preserves the existing CLI surface (`--apply / --release / --track / --skip`). `src/lib/wav-tags.ts` deleted (no callers); the legacy `ffmpegBinary` / `metadataArgs` exports were removed from `preview.ts` in the same commit. `runRetag` rewrites WAV + (in-place) MP3 ID3 frames per track — no re-encode on the MP3 side.

### Route swaps

- `4c44102` `src/app/api/checkout/route.ts` → wraps `@gigamusic/checkout.createCheckoutHandler`. Route-level wrapper still does the `isAllowedRequestOrigin` CSRF check and translates the legacy cart shape (`{ releaseId, trackId, catalogPurchase }`) to the package's canonical `{ kind, id }`. Handler is recreated per request so admin-changed discounts pick up on the next call.
- `d61a6eb` `src/app/api/webhooks/stripe/route.ts` → wraps `@gigamusic/checkout.createStripeWebhookHandler`. Built once at module load (no env reads at request time). `orderTokenSecret: env.ADMIN_SECRET()` so existing tokens stay valid.
- `74e881a` `src/app/cart/page.tsx` now POSTs `{ items: [{ kind, id? }] }` — the canonical `CheckoutCartItem` shape — directly. The route's `translateCart` block + re-encoded `Request` bridge are removed; the body passes through to `createCheckoutHandler` unchanged. localStorage cart state shape is untouched, so prior cart contents still round-trip.
- `083a0c6` `src/app/api/checkout/route.ts` now constructs `createCheckoutHandler` once at module load and resolves the discount via the new `catalogDiscount: () => Promise<...>` callback at request time.
- `62d2590` Download routes → `@gigamusic/checkout` factories. `src/app/download/[token]/{route,zip/route,zip-stream/route}.ts` and `src/app/sw-zip/[...path]/route.ts` are now thin wrappers around `createDownloadHandler` / `createDownloadZipHandler` / `createDownloadZipStreamHandler` / `createSwZipFallbackHandler`. `src/lib/release-zip.ts` is trimmed to the admin-only `buildReleaseZipBundle` + `presignZipFiles`; the customer-side `resolveCustomerZip` and ~265 lines of supporting helpers are gone. `src/lib/storage.ts` gains a `storageProvider()` accessor mirroring `emailProvider()` so the factories can be handed the shared R2 singleton. Bonus pickups: the new `zip-stream` route inherits gigamusic's serialised-fetch + byte-counter + `_FAILED_*.txt` improvements that party-pupils' local copy was missing.
- `bec7ac6` Customer zip filenames keep the `"Party Pupils - "` prefix — `@gigamusic/checkout` gained a `zipNamePrefix` option on `DownloadDeps`, and both zip routes pass `SITE_NAME` from `@/lib/constants`. Empty/whitespace prefixes fall back to the brand-agnostic default.
- `6f5618b` Admin auth → bcrypt + `createAdminLoginHandler`. `ADMIN_PASSWORD_HASH` (bcrypt cost 12) is the canonical credential — generated once via `pnpm tsx scripts/hash-admin-password.ts`, encrypted into `.env` and `.env.prod` via `dotenvx set`. The login route is a 5-line wrapper around `createAdminLoginHandler` (per-IP brute-force rate-limit is owned by the package; same key prefix `admin-login:<ip>`, same 10/15min cap). `src/lib/admin-auth.ts` is now a one-function façade over `isAdminAuthenticated(secret)`; the old in-house JWT signing + sliding-window refresh + `createAdminSession()` writer are gone. Behaviour diff: sessions are a flat 24h expiry (no sliding refresh) — admins re-log in once a day instead of being silently re-issued. Also: drops the dead `export { RADIO_TRACKS_TAG }` from `src/app/api/all-tracks/route.ts` so the build typechecks; the constant is re-imported from `@/lib/cache-tags` directly by all consumers.
- `5816ec7` `/api/admin/links` → `createAdminLinksHandlers`. 4-method route is now a 30-line wrapper. POST/PUT/DELETE each `revalidateTag(LINKS_TAG)` after a successful response (the factory leaves cache invalidation to the consumer). Free-with-the-swap: PUT now supports `{ orderedIds: [...] }` for bulk reorder, which the old route didn't.
- `228326a` `/api/admin/link-pages` (all three) → `@gigamusic/links/server` factories. `createAdminLinkPagesHandlers`, `createAdminLinkPageByIdHandlers`, and `createAdminLinkPageItemsHandlers` each map 1:1 to the existing party-pupils routes. Cache invalidation is internal to the package (it `revalidateTag(LINK_PAGES_TAG)` on its own), so the wrappers stay trivial. `src/lib/link-pages.ts` now exports its `linkPageQueries` singleton so the route files share the same instance. `tests/api/admin/link-pages.test.ts` rewired to attach a real `admin_session` cookie signed with `ADMIN_SECRET` — the gigamusic factory verifies stateless from `req.headers.cookie`, so the global `vi.mock("@/lib/admin-auth")` no longer gates those routes.
- `8af3628` `/api/admin/upload/{presign,process}` → `@gigamusic/admin/server` factories. Both routes are thin shells now. The presign handler is identical behaviour; the process handler picks up new behaviour worth noting:
  - **WAV retag in place.** After transcoding, the package tags the source WAV with the supplied metadata and re-uploads it under the same key. The bucket's `.wav` object now carries ID3 tags. TPE2/`album_artist` is stripped by `@gigamusic/audio`'s type-level guarantee — safe per AGENTS.md.
  - **Response shape gains `wavUrl` + `wavFileSize` + `mp3FileSize`.** The upload form only reads `mp3Url`, so existing consumers ignore the extras.
  - **Optional `trackId` in the body triggers `queries.upsertTrackFile`.** Party-pupils' form doesn't pass one today (the release POST/PUT persists track files), so this code path stays dark — wired for forward compat only.

### Infra

- `a00dc12` `package.json` next + eslint-config-next bumped to `16.2.6` (exact pin, matching the gigamusic tree). Unblocks dropping `as any` casts at the route boundary.
- `8e4425d` Dropped `as any` / `as unknown as NextRequest` casts in `checkout` + `stripe` route wrappers — both trees are now on `next@16.2.6` and the two `NextRequest` types unify.
- `6f5618b` Stripe pinned to `^22.1.0` (was `^22.0.0`) and `@types/node` bumped to `^22` (was `^20`) so pnpm dedupes Stripe across this repo and the gigamusic tree — fixes the TS2739 / nominal-type identity errors at the `WebhookDeps.stripe` boundary now that gigamusic's checkout pulls `stripe@22.1.1`.

### Test infra

- `8af3628` `tests/setup.ts` gained a global `next/headers` mock. The gigamusic admin handlers verify the session via `cookies()`-based `isAdminAuthenticated(secret)`, which throws "called outside a request scope" in vitest. The setup stub returns a synthetic jar containing a freshly signed `admin_session` token (using `@gigamusic/core.createAdminSessionToken` + the loaded `ADMIN_SECRET`) so every test sees an authed admin by default. The earlier auth-test that built its own jar still works.
- `8af3628` Two test rewires landed alongside the upload swap: `tests/api/admin/presign.test.ts` asserts the new `(key, { contentType })` storage-method shape, and `tests/api/admin/upload-process.test.ts` mocks `getFileBuffer` + `uploadBuffer` + `uploadStream` (instead of the old `getFileStream`/`uploadStream` pair) to match the new code path.

## What was reverted earlier

- `aa21b10` / `9bc0772` `src/lib/link-platforms.tsx` — the original swap was reverted because the package re-exported server-only handlers from its main entry. The fix landed in `3973df7` (re-enable swap + `transpilePackages`); see commit `dffa94a` for the revert-of-revert.

## Decisions — staying local

- **Contact route** — gigamusic has no contact handler factory and shouldn't (contact destinations + branding are artist-specific).
- **Admin settings** — party-pupils' settings route carries a FAQ-JSON validator. FAQ is deliberately out of scope for `@gigamusic/admin`, so the settings route stays local.
- **Admin releases (POST + PUT/PATCH/DELETE)** — `@gigamusic/admin/server.createAdminReleaseByIdHandlers` exposes a scalar-only PUT and no PATCH. Party-pupils' PUT uses `syncReleaseAndTracks` (incremental track diff) and PATCH gates `isPublished` flips with `validatePublishedRelease`. The track-sync code is mature; lifting it into the package would change a lot of edges without clear upside.
- **Admin orders** — party-pupils' admin orders page is a server component that reads directly with date + pagination filters, not a REST handler. `createAdminOrdersHandler`'s `?email=…` shape doesn't match.

## Open follow-ups

1. **Turbopack `link:` resolution** — `npx next build` (Turbopack default in Next 16) still fails to resolve `@gigamusic/*` `link:` symlinks; `--webpack` is the workaround. Resolve by publishing `@gigamusic/*` and switching to a version range, or stay on `--webpack` indefinitely.

## Build state

- `npx tsc --noEmit` — passes cleanly on `gigamusic-integration`.
- `npx next build --webpack` — compiles + typechecks successfully.
- `npx next build` (Turbopack default in Next 16) — still fails to resolve `@gigamusic/*` `link:` symlinks; see Open follow-up #6.
- `pnpm test` — 141/141 tests pass against a vanilla Postgres on `localhost:5436`.
- `pnpm dev:prod` smoke (port 3001, fallback from 3000): `/`, `/music`, `/cart`, `/admin`, `/faq` all return 200.
