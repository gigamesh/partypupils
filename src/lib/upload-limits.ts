/**
 * Per-format audio upload ceilings.
 *
 * Neither limit is a policy choice — both are derived from the 500 MB of
 * writable `/tmp` a Vercel Function gets, which is the binding constraint on
 * every server-side path that touches a whole audio file.
 *
 *   WAV — `/api/admin/upload/process` writes the source, a tagged copy, and the
 *   generated 320kbps MP3 (~23% of a 1411kbps WAV) before anything is cleaned
 *   up: ~2.23x the source. 500 / 2.23 ≈ 224 MB, so 200 MB leaves margin.
 *
 *   MP3 — the save-time retag round-trips the file through `/tmp` twice (read
 *   in, tagged copy out): 2x the source. 500 / 2 = 250 MB, so 240 MB leaves
 *   margin. At 320kbps that's ~100 minutes, which covers a typical DJ mix.
 *
 * Both ceilings lift substantially once those paths stream instead of
 * buffering — see docs/large-audio-uploads.md.
 */
export const AUDIO_UPLOAD_LIMITS = {
  wav: 200 * 1024 * 1024,
  mp3: 240 * 1024 * 1024,
} as const;

export type LimitedAudioFormat = keyof typeof AUDIO_UPLOAD_LIMITS;

/**
 * Human-readable size, e.g. `1.2 GB` / `240 MB` / `3.4 MB` / `812 KB`. Also
 * used for transfer rates, which is why sub-megabyte values still need to read
 * sensibly rather than collapsing to `0 MB`.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 10 * 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Explain why `size` is over the ceiling for `format`, or null when it fits.
 * Shared by the admin form's pre-flight and the presign route so both refuse
 * at the same threshold with the same wording.
 */
export function oversizeAudioMessage(
  fileName: string,
  size: number,
  format: LimitedAudioFormat,
): string | null {
  const limit = AUDIO_UPLOAD_LIMITS[format];
  if (size <= limit) return null;
  const suffix =
    format === "mp3"
      ? " Split the mix or shorten it."
      : " Bounce a shorter master, or upload a 320kbps MP3 instead — mixes can ship MP3-only.";
  return (
    `"${fileName}" is ${formatBytes(size)}, over the ${formatBytes(limit)} ` +
    `limit for ${format.toUpperCase()} uploads.${suffix}`
  );
}
