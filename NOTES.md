# gigamusic integration notes

## What landed

Easy lib swaps to `@gigamusic/*` packages on `gigamusic-integration`. Each is its own commit:

- `23299a0` `src/lib/email.ts` → `@gigamusic/email` (Resend provider + 3 templates). Webhook now passes `session.amount_total` for the totalCents line. Branding `{ siteName, themeColor: "#adfd02" }` injected from `constants.ts`.
- `f256220` `src/lib/storage.ts` → `@gigamusic/storage.createR2Provider`. Skinny wrappers preserve all party-pupils signatures (`uploadFile(File, pathname)`, `getPresignedUploadUrl(key, contentType)`, etc).
- `4c847dd` `src/lib/admin-auth.ts` → `@gigamusic/core.createAdminSessionToken` / `verifyAdminSessionToken`. Cookie write + sliding-window refresh kept; payload now carries `{ admin: true }` instead of `{}` so old cookies issued by the previous build will be rejected (users will re-login once).
- `e29bbaa` `src/lib/order-auth.ts` → `@gigamusic/core.signOrderToken` / `verifyOrderToken`. Party-pupils only signs `email`; passed `orderId: ""` as a placeholder since the magic-link only uses email.
- `c726847` `src/lib/rate-limit.ts` → `@gigamusic/db.createQueries().consumeRateLimit`. Returns `{ ok, remaining, resetAt }`; wrapper exposes the legacy boolean. Party-pupils' Prisma client (generated to `src/generated/prisma`) is structurally compatible — passed in via `as unknown as GigamusicPrismaClient`.
- `cec8b95` `src/lib/link-page-validation.ts` → `@gigamusic/core.RESERVED_SLUGS`. Wraps the ReadonlyArray in a Set to preserve the `.has(slug)` API. `SLUG_PATTERN`, error messages, `isUniqueConstraintError` stayed local.

## What was reverted

- `aa21b10` / `9bc0772` `src/lib/link-platforms.tsx` — attempted swap to `@gigamusic/links` but reverted. The package's main entry (`./src/index.ts`) re-exports `./api/handlers.ts`, which imports `revalidateTag` from `next/cache`. Webpack treats that as a server-only module and refuses to bundle it into client/edge graphs. Subpath imports like `@gigamusic/links/platforms/detect` aren't allowed by the package's `exports` field. **Fix flagged for orchestrator**: split `@gigamusic/links` into a client-safe subentry (e.g. `@gigamusic/links/platforms`) or move `detectLinkPlatform` / `PLATFORM_LABELS` / `LinkPlatformIcon` into the existing `./client` subentry.

## What was NOT swapped (with reasons)

- `src/lib/preview.ts` — exports `convertWavStreamToMp3` (WAV→MP3 streaming transcoder for the upload pipeline). `@gigamusic/audio` has `generatePreview` (short audio previews) and `tagWav` / `tagMp3`, but no streaming WAV-to-MP3 equivalent. Different feature.
- `src/lib/wav-tags.ts` — exports `extractId3v2Tag` + `retagWav({ srcWavPath, outWavPath, id3v2Tag })`. `@gigamusic/audio.tagWav` has a different shape (`{ inputPath, outputPath, tags, coverArt }`) and synthesizes its own ID3v2 from `tags` rather than accepting a pre-built buffer. `extractId3v2Tag` lives in `@gigamusic/audio/src/wav-id3.ts` but isn't exported. Only used by the `retag-audio-files.ts` maintenance script.
- `src/lib/download-auth.ts` — exports `tokenGrantsTrack(token, trackId, releaseId)`, a database-keyed lookup on the `DownloadToken` table. Not a JWT — the plan's mapping to `signDownloadToken`/`verifyDownloadToken` doesn't apply.
- `src/lib/release-reads.ts`, `src/lib/link-pages.ts`, `src/lib/catalog.ts` — wrap raw Prisma calls in Next.js `unstable_cache` + `RELEASES_TAG`/`LINK_PAGES_TAG` tags. `@gigamusic/db.createQueries()` returns string IDs (via `stringifyIds`); party-pupils uses `number` IDs everywhere. Swapping would cascade through every consumer (UI components, types). **Flagged for orchestrator**: either add an `idsAs: "number"` option to `createQueries`, or split the cache layer into a thin party-pupils wrapper that also converts IDs.

## Harder swaps (API routes) — not attempted

API route factories (`createCheckoutHandler`, `createStripeWebhookHandler`, etc.) live in `@gigamusic/checkout` and depend on `@gigamusic/db`'s string-ID query shape. Same blocker as above.

## Build state

- `npx tsc --noEmit` — passes cleanly on `gigamusic-integration`.
- `npx next build --webpack` — **compiles cleanly**. Only pre-existing failure is `src/app/api/all-tracks/route.ts` (route file exports `RADIO_TRACKS_TAG`, which Next 16's strict route-export typecheck rejects). This existed before the integration commits (verified at `4046552`).
- `npx next build` (Turbopack default in Next 16) — **fails to resolve `@gigamusic/*`**. `pnpm` installs each `link:` dep as a relative symlink under `node_modules/@gigamusic/<pkg>`; Turbopack does not follow these in module resolution. Webpack does. **Flagged for orchestrator**: either publish the packages and switch from `link:` to a version range, or temporarily change party-pupils' `build` script to `next build --webpack` until Turbopack's `link:` resolution is fixed.
