# Plan: 500 MB–1 GB audio uploads (DJ mixes)

Goal: support uploading, transcoding, and selling single audio files in the
500 MB–1 GB range (full DJ mixes, ~60–100 min) with a UX that doesn't feel
broken. Today the effective ceiling is **~220 MB** and it fails with no useful
error.

Two repos are involved:

- `party-pupils` (this repo) — routes, admin form, upload client.
- `gigamusic` (`/Users/mmasurka/code/gigamusic`) — `packages/admin`,
  `packages/audio`, `packages/storage`. Most of the load-bearing work is here
  and needs a version bump consumed by this repo.

---

## 1. Why ~220 MB is the ceiling today

Nothing validates file size anywhere. The presign handler checks only key shape
and content type (`packages/admin/src/handlers/upload.ts:58-68`), and
`ReleaseForm.tsx` never reads `file.size`. **There is no limit constant to
raise** — the ceiling is emergent from how `/api/admin/upload/process` works.

The upload leg is fine: browser → R2 direct via presigned PUT, so Vercel's
4.5 MB request-body cap never applies and R2 accepts single PUTs to 5 GB.

The transcode leg is where it breaks. For a source WAV of size N,
`createAdminUploadProcessHandler` writes three files to `/tmp`
(`handlers/upload.ts:163-166`):

| File | Size |
|---|---|
| `${id}.wav` (downloaded source) | N |
| `${id}.tagged.wav` | N |
| `${id}.mp3` (320 kbps) | ~0.23N |

That's **~2.23N against a hard 500 MB `/tmp`**, so N ≤ ~220 MB. This matches
the "200 MB WAV" assumption already baked into
`tests/lib/upload-client.test.ts:8`.

Memory is the second wall. Three separate full-file buffers are live:

1. `getFileBuffer(key)` → entire WAV in a Buffer (`upload.ts:173`).
2. `readFile(taggedWavPath)` → second full copy for `uploadBuffer`
   (`upload.ts:186-190`). The first can't be GC'd because `wavBuf.length` is
   still read at `upload.ts:219`.
3. **`appendId3ChunkToWav`** (`packages/audio/src/wav-id3.ts:37-53`) does
   `readFile` → `Buffer.concat` → `writeFile`, peaking at ~2N *by itself*,
   inside `tagWav`.

For a 1 GB file that's well past the 2 GB (Hobby) / 4 GB (Pro max) function.

### Platform limits in play

| Limit | Value | Relevant? |
|---|---|---|
| `/tmp` scratch | **500 MB** | **Yes — the binding constraint** |
| Function memory | 2 GB Hobby / 4 GB Pro max | **Yes** |
| `maxDuration` | 300s Hobby / 800s Pro / 1800s beta | **Yes** — route sets 300 |
| Request body | 4.5 MB | No — presigned direct upload |
| R2 single PUT | 5 GB | No |
| `fileSize` column | `integer` (int4, ~2.1 GB) | Not at 1 GB; caps ~2 GB |
| **WAV RIFF size field** | **uint32 → 4 GB** | Format ceiling regardless of infra |

---

## 2. Measured performance

Benchmarked on M4 Max with a real 1 GB WAV (101 min, 44.1 kHz/16-bit stereo →
243 MB MP3):

| Stage | Wall | Notes |
|---|---|---|
| `tagWav` remux (`-c:a copy`) | 4.1s | I/O bound, 29% CPU |
| 320 kbps `libmp3lame` encode | 31.1s | 100% CPU, single-threaded, 195× realtime |
| `tagMp3` | 0.7s | |
| **ffmpeg total** | **~36s** | |

Derated ~3× for a Vercel vCPU (single-thread; extra vCPUs don't help
`libmp3lame`), plus ~2.3 GB of R2 transfer the local benchmark can't see:

- Encode: ~90–110s
- Tag passes: ~15–25s
- Network (1 GB down, 1.07 GB + 243 MB up): ~30–90s
- **Total today (fully serialized): ~2.5–4 min** — lands right on the 300s cliff
  with zero retry margin.

Encode cost tracks *audio duration*, not bytes: a 1 GB file at 24-bit/48k is
only ~62 min and encodes ~40% faster than the 44.1/16 case.

**Takeaway: transcoding is cheap (~30s of real CPU). The problem is disk,
memory, and serialization — not encoding.**

---

## 3. Key decision: where does transcode run?

### Option A — stream in-place on Vercel Functions

Feed ffmpeg the presigned R2 URL as input, pipe outputs into `uploadStream`
(already S3-multipart), never materialize a full file. Stages overlap, so
wall-clock collapses to roughly `max(transfer, encode)` ≈ 90–120s.

The catch is the **tagged WAV output**. WAV needs a seekable output for the RIFF
size field; ffmpeg writing to a pipe emits placeholder sizes. And
`appendId3ChunkToWav` patches the file on disk after the fact, which a multipart
stream can't do. Making this work means synthesizing the RIFF header ourselves
— we know the exact output size up front since the audio is `-c:a copy` PCM —
and streaming header + INFO chunks + PCM + `id3 ` chunk in one pass. Doable, but
it's custom container code in `packages/audio`, and it's the fiddliest part of
the whole plan.

- Pros: no new infrastructure; smallest ops surface; keeps everything in the
  existing package layout.
- Cons: custom WAV muxing; still bounded by 800s; `/tmp` gives zero slack if
  anything needs to land on disk.

### Option B — move transcode off Vercel Functions (recommended)

Run the job in a container with real disk — Vercel Sandbox (GA), or a worker on
Fly/Railway, or a Cloudflare Container co-located with R2 (no egress, lowest
latency to the bucket). The existing buffer-and-tempfile code then works
essentially as-is; only the memory fixes in §4.2 are still worth doing.

- Pros: removes the 500 MB `/tmp` and duration ceilings outright; keeps
  `packages/audio` simple; headroom for future work (stems, loudness
  normalization, waveform generation).
- Cons: new deploy target, new failure modes, job orchestration required.

**Recommendation: Option B.** The `/tmp` cap is a hard wall that Option A only
squeezes past with custom container muxing, and the async job queue (§4.3) is
needed either way for a 2–4 min operation. Once jobs are async, the incremental
cost of running the worker somewhere with a real filesystem is small — and it's
the difference between "fits with no margin" and "not a constraint anymore."

Option A remains a reasonable fallback if standing up a worker is unattractive;
§4.2 is shared between both paths regardless.

---

## 4. Work plan

### 4.1 Upload: multipart + real progress — `party-pupils` + `packages/admin`

- **`src/lib/upload-client.ts`** — replace the single `fetch` PUT with chunked
  R2 multipart: per-part upload, per-part retry with backoff, byte-level
  progress callback, resume from last completed part. Suggested part size
  8–16 MB.
- **Progress requires XHR, not `fetch`.** `fetch` has no upload-progress hook
  (`response.body` is download-only; `duplex: 'half'` request streaming is
  Chromium-only). Use `xhr.upload.addEventListener("progress", …)` per part, or
  derive coarse progress from completed part count.
- **New multipart presign routes** — create / sign-part / complete / abort.
  Extend `createAdminUploadPresignHandler` in
  `packages/admin/src/handlers/upload.ts`, exposed here under
  `src/app/api/admin/upload/`. Keep the existing single-PUT path for images and
  small audio.
- **R2 bucket CORS** — must allow the part PUTs and **expose `ETag`**; multipart
  completion fails without it. Easy to miss, fails late.
- **`src/app/admin/releases/ReleaseForm.tsx`** — the current bar is a step
  counter (`progress.current/total`, lines 1280-1291) that sits frozen for the
  entire transfer. Add a per-file byte bar with rate + ETA; keep the step
  counter as the outer track-level indicator.
- **Abandoned-upload cleanup** — incomplete multipart uploads accrue storage
  cost silently. Add an R2 lifecycle rule to abort them after ~7 days.

### 4.2 Memory fixes — `packages/audio` + `packages/admin`

Worth doing on both paths; each is small and independently shippable.

- **`packages/audio/src/wav-id3.ts:37-53`** — rewrite `appendId3ChunkToWav` to
  seek instead of slurp: open a file handle, write the chunk at EOF, patch the
  4 RIFF size bytes at offset 4. Drops peak from ~2N to O(1). Biggest win for
  the smallest diff.
- **`packages/admin/src/handlers/upload.ts:173,186-190`** — replace
  `getFileBuffer` + `writeFile` with `getFileStream` (already on
  `StorageProvider`), and `uploadBuffer` with `uploadStream`. Capture
  `wavFileSize` from `stat()` only, so the source buffer isn't pinned by the
  `wavBuf.length` read at line 219.
- **Single ffmpeg pass, two outputs** — `tagWav` + `generatePreview` currently
  read the source twice. ffmpeg can emit the tagged WAV and the MP3 from one
  input read.

### 4.3 Async job pipeline — `party-pupils` + `packages/admin`

A 2–4 min operation must not be a held-open HTTP request.

- Job table (`id`, `trackId`, `key`, `status`, `progress`, `error`,
  timestamps) — schema lives in `packages/db`.
- `POST /api/admin/upload/process` returns `202` + job id immediately instead of
  blocking (`src/app/api/admin/upload/process/route.ts`).
- `GET /api/admin/upload/process/[jobId]` for polling.
- `ReleaseForm` polls and renders per-track transcode state; saving a release
  with a still-running job should be allowed, with the track marked pending.
- Idempotency: re-processing the same key should be safe (retries, double
  submits).
- If staying on Option A, also raise `maxDuration` past 300 — requires Pro.

### 4.4 Download — `party-pupils` + `packages/checkout`

Customer downloads already stream client-side (Service Worker + `client-zip`
from presigned URLs), so archive size never touches a function. Remaining gaps:

- **`src/lib/storage.ts:40`** — `expiresInSeconds: 600` will expire mid-transfer
  on a multi-GB zip over a slow connection. Raise substantially for large-file
  downloads (a signed URL only needs to be valid at request start, but the zip
  stream presigns every entry up front).
- **Zip progress UI** — no feedback across a multi-GB archive.
- **Verify ZIP64** in the `client-zip` path once archives cross 4 GB.
- **Resume** — a dropped multi-GB zip download restarts from zero. Probably
  acceptable; note it and move on.

### 4.5 Guardrails (do first — cheap, stops silent failure)

- Client-side size check in `ReleaseForm` with a clear message at whatever the
  current supported ceiling is.
- Server-side size validation at presign time.
- Replace the generic `"Transcoding failed"` (`handlers/upload.ts:259`) with
  something that distinguishes OOM / timeout / disk-full.

---

## 5. Suggested sequencing

1. **§4.5 guardrails** — ship today; turns a mystery failure into a clear error.
2. **§4.2 memory fixes** — small, independent, raises the practical ceiling
   immediately even before anything else lands.
3. **§4.1 multipart upload + progress** — the single biggest UX win, and
   independent of where transcode runs.
4. **§4.3 async jobs** — required before any multi-minute transcode is viable.
5. **§3 Option B worker** — removes the ceiling permanently.
6. **§4.4 download polish**.

Steps 1–3 alone make 500 MB workable. Steps 4–5 are what 1 GB needs.

---

## 6. Open questions

- **Do mixes need the WAV + MP3 pair at all?** If mixes ship MP3-only, the
  transcode step disappears entirely — presign, upload, tag, done — and §4.3 and
  §3 become unnecessary. This is by far the cheapest path to shipping and should
  be answered before any of the above is built.
- **Plan tier?** Several options (800s duration, 4 GB memory) are Pro-only.
- **Pricing/packaging for mixes** — is a mix a single-track release, or does it
  need its own product type?
- **Do mixes need previews?** The 30s preview path is unaffected but may want a
  different offset for a 100-min mix than `startSeconds: 0`.
- **Bit depth / sample rate policy** — capping mix masters at 44.1/16 bounds
  file size and encode time; 24/48 masters are ~1.6× the bytes per minute.

---

## 7. Acceptance criteria

- A 1 GB WAV uploads with a live byte-level progress bar and survives a
  mid-upload network drop without restarting from zero.
- Transcode completes without OOM or timeout; admin sees live status and can
  navigate away and return.
- Failures surface a specific, actionable error.
- Customer download of a multi-GB release completes without URL expiry.
- Existing ≤220 MB uploads are unaffected — regression-test the current path.
