# Testing & error-prone code audit

## Test suite

```
npm test            # one-shot run
npm run test:watch  # vitest watch mode
```

Both wrappers go through `scripts/run-tests.ts`, which:

- Refuses to run if `DATABASE_URL` is not localhost (defends against hitting Neon prod).
- Rewrites the connection string onto a separate Postgres `schema=test` so the dev DB's `public` schema is never touched. You can switch branches whose Prisma schemas differ without `--accept-data-loss`.
- Runs `prisma db push --force-reset` against that test schema, then invokes `vitest`.

Prisma 7 ships an AI-agent guard that requires
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` for `db push --force-reset`. When you (a human) run the script, no consent var is needed; agents have to set it explicitly.

The setup file (`tests/setup.ts`) truncates every relevant table between tests via `prisma.$transaction([deleteMany ...])` and mocks `@/lib/admin-auth`, `@/lib/stripe`, and `@/lib/email` so no external service is contacted.

## Known quirk: `@prisma/adapter-pg` aborted-transaction state

When a `prisma.$transaction([...])` fails mid-flight, the pooled Postgres connection appears to enter an "aborted transaction" state where every subsequent query on that connection fails with:

```
bind message supplies N parameters, but prepared statement "" requires 0
```

The rollback test in `tests/api/admin/releases.test.ts` works around this by calling `prisma.$disconnect()` after the expected failure, forcing the next query to grab a fresh connection. This same condition could in principle bite production after a real transaction failure — worth keeping an eye on. If we ever see those bind-mismatch errors in prod logs, the fix is to disconnect-and-reconnect on transaction failure, or upgrade Prisma when there's a fix upstream.

## What's covered

- `syncReleaseAndTracks` — the new incremental-sync logic, which is the highest-risk recent change. Tests cover ID preservation, deletes, creates, file diffing, reordering, transactional rollback, and the regression that produced the 59 orphaned OrderItems on prod.
- `POST /api/admin/releases` — creation + duplicate-slug rejection.
- `PUT/DELETE /api/admin/releases/[id]` — handler glue + cascade deletion.
- `GET /download/[token]` and `/download/[token]/zip` — token validation, authorization for both track-purchases and release-purchases, missing-param handling, upstream R2 fetch failure.
- `POST /api/webhooks/stripe` — signature check, order creation with download token, idempotency on retries, no-op when no items.

## Not covered (and why)

| Route | Reason |
| --- | --- |
| `/api/checkout` | Heavy Stripe SDK mocking; functional risk is mostly Stripe-side. Worth adding integration coverage if we change cart logic. |
| `/api/admin/upload`, `/upload/presign`, `/upload/process` | Require R2 + ffmpeg. Should be covered with a stubbed S3 client and a tiny fixture WAV. |
| `/api/admin/auth` | JWT round-trip; mostly framework. |
| `/api/admin/links`, `/api/admin/settings` | Trivial CRUD. Add when behaviour grows beyond CRUD. |
| `/api/orders/send-link`, `/api/contact` | Need Resend/email mocking; small surface. |

---

# Error-prone things flagged during the audit

## 1. `OrderItem` FKs default to `SetNull` — already bit us once

`OrderItem.releaseId` and `OrderItem.trackId` are `Int?` with no explicit `onDelete` clause. Prisma's default for nullable relations is `SetNull`. Layer 1 (the incremental sync) eliminated the most common path that produced orphans, but **deleting a release** (via `DELETE /api/admin/releases/[id]`) still nulls every `OrderItem.releaseId` for orders that bought it.

Mitigations to consider (from cheapest):
- Add **snapshot fields** to `OrderItem` (`releaseName`, `trackName`, `coverImageUrl`) populated at checkout. Order history rendering already does `if (item.release)` / `if (item.track)` checks; they can fall back to the snapshots.
- Or change `onDelete` to `Restrict`, so deleting a release that has any OrderItem references throws — forcing the admin to confirm.

## 2. R2 storage leaks on track/release deletion

Cascade deletes wipe `TrackFile` rows but leave the underlying R2 objects orphaned. There's no garbage collection. Cheap mitigation: enumerate `storageKey`s being removed and call `deleteFile` from `src/lib/storage.ts` in the same transaction (best-effort — R2 errors shouldn't block the DB delete).

## 3. Download tokens never expire

`DownloadToken` has no expiry. Anyone with the URL can download the files forever. Consider:
- Adding `expiresAt` and validating in the download endpoints.
- Logging download events (who, when, which IP) for an audit trail.

## 4. `download/[token]/zip` track ordering is wrong when `trackIds` is used

Lines 53–65: tracks are queried `orderBy: { name: "asc" }`, then re-numbered with `trackNumber: i + 1`. The "01 - X.mp3" prefix in the zip won't match the artist's actual track ordering for that release. Use the original `track.trackNumber`.

## 5. `download/[token]/zip` swallows mid-stream errors

Lines 117–136: two unawaited async IIFEs (`for await` loop and the `archive.append` loop) coordinate via a `PassThrough`. If `fetch(file.storageKey)` fails for one track, the loop just `continue`s — the user gets a partial zip with no indication something was missing. If the writer aborts, the response body silently truncates. Worth at minimum logging skipped tracks; better would be returning 502 if any track fails.

## 6. `download/[token]` authorizes via the release's *current* tracks

Lines 36–44: when checking whether an order owning a release entitles the download of a track, it looks at `item.release?.tracks` — i.e. the current tracks of the release. If a track was removed from the release after the order, the customer loses access even though they paid for the album. This is unrelated to the orphan bug but worth thinking about: should release purchases entitle access to whatever was on the release **at purchase time**, or whatever's there now?

## 7. Stripe webhook: empty email = silent loss of access

In `/api/webhooks/stripe/route.ts:74-82`, if `customer_details.email` is missing, no verification token is created and no email is sent. The order exists in the DB but the customer has no way to retrieve their downloads. Stripe Checkout almost always supplies an email, but it isn't guaranteed. At minimum log a warning so you can manually intervene.

## 8. Stripe webhook: email failure breaks idempotency cleanly, but slowly

The `sendPurchaseConfirmationEmail` call is `await`ed but not in a `try`/`catch`. If Resend is down, the webhook throws, returns 500, Stripe retries. On retry the dedupe check (`existingOrder` short-circuit) prevents a duplicate Order — good. But until the email service recovers, every retry just confirms the order exists and exits without sending. Wrapping the email call in a try/catch (or moving it after the response) would let the order land cleanly even when the email service hiccups; we can have a separate retry path for emails.

## 9. PUT incremental sync: stale browser tabs are still a hazard

If an admin has the edit page open from before the deploy of the new sync handler, their submit will lack `id` fields on existing tracks. The server then treats every track as new — deleting the existing ones and recreating them, recreating the orphan bug. Defensive option: if the payload has `tracks.length > 0` and **none** of them carry an `id`, while the DB **has** existing tracks for that release, refuse with 400 "stale form, please reload". Easy to add.

## 10. `prisma.config.ts` references migrations directory we don't use

`migrations: { path: "prisma/migrations" }` is dead config — the project uses `prisma db push`, not `prisma migrate`. Cleanup, no behavioural impact.

## 11. No CSRF / rate-limiting on public POST endpoints

`/api/checkout` and `/api/contact` accept POST from anywhere. Stripe-side the abuse vector is limited (each call creates a checkout session that costs nothing), but `/api/contact` could be spammed. Worth adding a simple per-IP rate limit (Vercel has a built-in for this) and either CSRF tokens or origin checks.

## 12. `@prisma/adapter-pg` connection-state issue (see "Known quirk" above)

Same root cause that bit us in tests could affect production after a real `$transaction` failure. Not currently producing symptoms; flagged in case it ever does.
