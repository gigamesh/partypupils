# Plan: large audio uploads (DJ mixes)

Goal: sell full DJ mixes (~60–120 min) alongside the existing track catalog,
with an upload UX that doesn't feel broken.

## Decisions (locked)

| Question | Decision |
|---|---|
| Formats for mixes | **MP3 only** |
| Transcode location, if needed | Off-platform worker — **now deferred, see §2** |
| Vercel plan | **Pro** (800s duration, 4 GB / 2 vCPU available) |
| Master format | **Cap at 44.1 kHz / 16-bit** — applies to track WAV masters; largely moot for mixes |

**Assumption to confirm:** the admin bounces and uploads the mix as a 320 kbps
MP3 directly. No server-side encode. If mixes should instead be uploaded as WAV
and encoded server-side, the whole transcode problem comes back and §2 reopens.

Two repos are involved:

- `party-pupils` (this repo) — routes, admin form, upload client, validation.
- `gigamusic` (`/Users/mmasurka/code/gigamusic`) — `packages/admin`,
  `packages/audio`. Needs a version bump consumed here.

---

## 1. What MP3-only removes

Choosing MP3-only deletes the hardest part of the problem. The WAV→MP3
transcode in `createAdminUploadProcessHandler` was the binding constraint:
it writes ~2.23× the source size to a hard 500 MB `/tmp`, capping uploads at
~220 MB, and takes 2–4 minutes for a 1 GB file.

Mixes never enter that path. **No transcode, no job queue, no worker, no
duration pressure.** The existing WAV path stays exactly as-is for regular
tracks, which are comfortably under the ~220 MB ceiling.

What's left is a much smaller problem: getting a large MP3 uploaded, tagged, and
sold.

---

## 2. The actual remaining bottleneck: save-time retag

Not the upload — the **retag that runs on every release save**
(`src/lib/release-retag.ts` → `retagTrackFiles`). For an MP3 of size M,
`retagOne` (`packages/admin/src/handlers/retag.ts:92-144`) does:

1. `getFileBuffer(key)` → M in memory
2. `writeFile(inputPath, buf)` → **M on `/tmp`**
3. `tagMp3` → `readFile` (M) → `NodeID3.write` returns a new buffer (M) →
   `writeFile(outputPath)` → **another M on `/tmp`**
4. `readFile(outputPath)` → M again
5. `uploadBuffer(tagged, …)`

**`/tmp` peak is 2M against the 500 MB cap → M ≤ ~250 MB.** At 320 kbps
(2.4 MB/min) that's **~104 minutes of audio**. Memory peaks around 3M, which is
fine on Pro.

| Mix length | MP3 size | `/tmp` needed | Status today |
|---|---|---|---|
| 60 min | 144 MB | 288 MB | OK |
| 90 min | 216 MB | 432 MB | OK, thin margin |
| 104 min | 250 MB | 500 MB | **at the wall** |
| 120 min | 288 MB | 576 MB | fails |
| 180 min | 432 MB | 864 MB | fails |

Two things make this worse than it looks: it recurs on *every save*, not just at
upload, and it fails inside a best-effort loop that logs and continues
(`retag.ts:133-140`) — so a too-long mix silently ships with no tags rather than
erroring.

**The fix is small.** `node-id3` operates on buffers; the tempfile round-trip is
pointless for MP3. `getFileBuffer` → `NodeID3.write` → `uploadBuffer` touches
`/tmp` zero times and peaks at ~2M memory. On Pro's 4 GB that comfortably
handles a 1 GB MP3 — which at 320 kbps is over 7 hours of audio, well past any
real mix.

---

## 3. Work plan

### 3.1 Allow MP3-only releases — `party-pupils`

- **`src/lib/release-validation.ts:56-61`** — `publishedTrackSchema` hard-requires
  a WAV (`"A WAV file is required"`). Needs to accept an MP3-only track. Decide
  whether this is a per-release flag (a "mix" release type) or a blanket
  relaxation to "at least one audio file". A flag is safer — it keeps the
  existing guarantee that normal releases ship a lossless master.
- **`src/app/admin/releases/ReleaseForm.tsx:1155`** — the file input is
  `accept=".wav"`. Needs to accept `.mp3` for mix releases.
- **Upload flow** — mixes skip `/api/admin/upload/process` entirely (it rejects
  non-`.wav` keys at `handlers/upload.ts:135` anyway). Upload → create track +
  file rows → save-time retag applies tags. Verify the form's save path handles
  a track whose only file is an MP3.
- **Download UI** — the WAV/MP3 toggle must hide or disable WAV for a release
  with no WAV files. Check `buildReleaseZipBundle(releaseId, format)`
  (`src/lib/release-zip.ts:101`) returns sensibly for `format: "wav"` on an
  MP3-only release rather than an empty zip.

### 3.2 Remove the `/tmp` round-trip from MP3 tagging — `gigamusic`

- **`packages/admin/src/handlers/retag.ts:92-144`** — add a buffer-only path for
  `format === "mp3"`: `getFileBuffer` → tag → `uploadBuffer`, no tempfiles. WAV
  still needs disk (ffmpeg remux), so keep the existing branch for it.
- **`packages/audio/src/tag-mp3.ts:73-81`** — expose a buffer-in/buffer-out
  variant (`tagMp3Buffer`) alongside the current path-based `tagMp3`. The
  internals are already buffer-based; only the `readFile`/`writeFile` wrapper
  needs removing.
- **Surface retag failures.** `retagOne` swallows errors per file by design
  (stale metadata shouldn't roll back a save), but a mix that silently ships
  untagged is bad. Surface failed results in the save response so the admin sees
  them.

Together these lift the MP3 ceiling from ~250 MB to memory-bound.

### 3.3 Upload: multipart + real progress — both repos

Independent of everything above, and the biggest UX win. A 250 MB MP3 over a
typical upstream connection is several minutes on a single non-resumable PUT.

- **`src/lib/upload-client.ts`** — replace the single `fetch` PUT with chunked R2
  multipart: per-part upload, per-part retry with backoff, byte-level progress,
  resume from last completed part. 8–16 MB parts.
- **Progress requires XHR.** `fetch` has no upload-progress hook (`response.body`
  is download-only; `duplex: 'half'` is Chromium-only). Use
  `xhr.upload.addEventListener("progress", …)` per part, or derive coarse
  progress from completed part count.
- **Multipart presign routes** — create / sign-part / complete / abort. Extend
  `createAdminUploadPresignHandler` (`packages/admin/src/handlers/upload.ts`),
  exposed here under `src/app/api/admin/upload/`. Keep the existing single-PUT
  path for images and small audio.
- **R2 CORS** — must allow the part PUTs and **expose `ETag`**; multipart
  completion fails without it. Easy to miss, fails late.
- **`ReleaseForm.tsx:1280-1291`** — the current bar is a step counter that sits
  frozen for the whole transfer. Add a per-file byte bar with rate + ETA; keep
  the step counter as the outer track-level indicator.
- **R2 lifecycle rule** to abort incomplete multipart uploads after ~7 days.

### 3.4 Guardrails — `party-pupils`

- Client-side size check in `ReleaseForm` with a clear message at the supported
  ceiling.
- Server-side size validation at presign time.
- A mix longer than the supported length should fail loudly at upload, not
  silently lose its tags at save.

### 3.5 Download polish — `party-pupils`

Customer downloads already stream client-side (Service Worker + `client-zip`
from presigned URLs), so archive size never touches a function. A single 250 MB
MP3 is unremarkable here. Minor gaps:

- **`src/lib/storage.ts:40`** — `expiresInSeconds: 600` is fine for one MP3, but
  thin for a multi-file release over a slow connection. Worth raising.
- Zip progress UI — no feedback for large archives.
- ZIP64 only matters above 4 GB; not reachable with MP3-only mixes.

---

## 4. Sequencing

1. **§3.1 allow MP3-only releases** — without this nothing ships; mixes can't be
   published at all.
2. **§3.2 buffer-only MP3 tagging** — small, independent, and removes the silent
   failure mode above ~104 min.
3. **§3.3 multipart upload + progress** — the UX work.
4. **§3.4 guardrails**, **§3.5 download polish**.

§3.1 alone makes mixes up to ~104 minutes shippable, since that's within what
the current retag path can handle. §3.2 removes the length ceiling entirely.

---

## 5. Deferred (not needed under MP3-only)

Kept here in case the format decision reverses:

- Off-platform transcode worker (Vercel Sandbox / Fly / Cloudflare Container).
- Async job queue + polling for multi-minute transcodes.
- Streaming ffmpeg with hand-synthesized WAV RIFF headers.
- `packages/audio/src/wav-id3.ts:37-53` — `appendId3ChunkToWav` does
  `readFile` → `Buffer.concat` → `writeFile`, peaking at ~2N inside `tagWav`.
  Harmless at current track sizes, but it's the first thing to fix if large WAVs
  ever come back. Cheap fix: seek, append at EOF, patch the 4 RIFF size bytes at
  offset 4.
- WAV's own uint32 RIFF size field caps the format at 4 GB regardless of
  infrastructure.

---

## 6. Open questions

- **Confirm the assumption at the top**: admin uploads an already-encoded
  320 kbps MP3, no server-side encode.
- **Is a mix a `single`, or a new release type?** Affects §3.1's flag,
  `releaseTypeSchema` (`release-validation.ts:64`), and how mixes surface in the
  catalog.
- **Previews** — the 30s preview path is unaffected, but `startSeconds: 0` is a
  poor preview for a 100-minute mix.
- **Pricing** for a mix vs a track.

---

## 7. Acceptance criteria

- A ~100 min / 250 MB MP3 mix uploads with a live byte-level progress bar and
  survives a mid-upload network drop without restarting from zero.
- The mix publishes without a WAV, and the download UI doesn't offer a WAV.
- Tags and cover art are present on the delivered file, and any retag failure is
  surfaced to the admin rather than swallowed.
- A 3-hour mix either works or fails with a clear message — never ships untagged.
- Existing WAV-backed releases are unaffected; regression-test the current
  upload → transcode → download path.
