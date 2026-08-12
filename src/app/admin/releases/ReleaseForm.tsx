"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { slugify } from "@/lib/utils";
import { presignAndUpload } from "@/lib/upload-client";
import { oversizeAudioMessage } from "@/lib/upload-limits";
import { SESSION_EXPIRED_MESSAGE, throwIfSessionExpired } from "@/lib/session-expired";
import { combinedName, deriveTrackArtistTitle } from "@/lib/track-name";
import {
  tracksMissingWavMaster,
  validateReleaseFormState,
  type AudioFormat,
  type ReleaseFormState,
} from "@/lib/release-validation";
import {
  artUploadTypeFor,
  healPlaceholderSlug,
  isPlaceholderReleaseSlug,
  nextTrackSlug,
  readJsonBody,
  slugIsOwned,
  slugToPersist,
} from "@/lib/release-form";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { DownloadButtons } from "@/components/DownloadButtons";
import type { PlayerTrack } from "@/lib/player-types";

/** Checkbox that supports an indeterminate display state for "some children selected". */
function RadioCheckbox({
  id,
  checked,
  partial,
  onChange,
}: {
  id?: string;
  checked: boolean;
  partial: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      id={id}
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer"
    />
  );
}

interface TrackInput {
  existingId?: number;
  artist: string;
  title: string;
  genre: string;
  slug: string;
  /** True once the slug is the admin's own rather than derived from the name. */
  slugTouched?: boolean;
  priceStr: string;
  trackNumber: number;
  inRadio: boolean;
  /**
   * The freshly-picked audio file, WAV or MP3. A WAV is the normal path: it's
   * uploaded and server-side transcoded to a companion 320kbps MP3. An MP3 is
   * uploaded as-is with no transcode — the DJ-mix case, where the file is
   * already the deliverable and no lossless master exists.
   */
  audioFile: File | null;
  /** Embedded tags read from the selected file — kept so the UI can flag overrides. */
  audioTags?: { artist?: string; title?: string; genre?: string };
  /** Cover art embedded in the selected file as a `data:` URL — `null` if it has none. */
  audioArtDataUrl?: string | null;
  existingWavName?: string;
  existingWavStorageKey?: string;
  existingWavFileSize?: number;
  existingMp3Name?: string;
  existingMp3StorageKey?: string;
  existingMp3FileSize?: number;
}

interface ExistingTrack {
  id: number;
  name: string;
  artist: string | null;
  genre: string | null;
  slug: string;
  price: number;
  trackNumber: number;
  inRadio: boolean;
  files: { format: string; fileName: string; storageKey: string; fileSize: number | null }[];
}

/** Reduce a `{ key: string[] }` server error map to `{ key: string }` for inline display. */
function flattenFieldErrors(
  fieldErrors: Record<string, unknown>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(fieldErrors)) {
    if (Array.isArray(msgs) && msgs.length > 0 && typeof msgs[0] === "string") {
      flat[key] = msgs[0];
    }
  }
  return flat;
}

/** Map a zod dotted-path key (`tracks[0].artist`) to a friendly form-summary label. */
function friendlyFieldLabel(key: string): string {
  const trackMatch = /^tracks\[(\d+)\]\.(.+)$/.exec(key);
  if (trackMatch) {
    const trackLabel = `Track ${Number(trackMatch[1]) + 1}`;
    const fieldLabel = TRACK_FIELD_LABELS[trackMatch[2]] ?? trackMatch[2];
    return `${trackLabel} — ${fieldLabel}`;
  }
  return RELEASE_FIELD_LABELS[key] ?? key;
}

/** Map a zod dotted-path key to the DOM id of the matching form field. */
function fieldDomId(key: string): string {
  const trackMatch = /^tracks\[(\d+)\]\.(.+)$/.exec(key);
  if (trackMatch) {
    const sub = trackMatch[2];
    const subId = TRACK_FIELD_DOM_SUFFIX[sub] ?? sub;
    return `track-${trackMatch[1]}-${subId}`;
  }
  return RELEASE_FIELD_DOM_ID[key] ?? key;
}

const RELEASE_FIELD_LABELS: Record<string, string> = {
  name: "Release Name",
  slug: "Slug",
  price: "Release Price",
  type: "Release Type",
  tracks: "Tracks",
  coverImageUrl: "Cover Image",
  releasedAt: "Release Date",
};

const RELEASE_FIELD_DOM_ID: Record<string, string> = {
  name: "name",
  slug: "slug",
  price: "price",
  type: "type",
  tracks: "tracks-section",
  coverImageUrl: "cover-image",
};

const TRACK_FIELD_LABELS: Record<string, string> = {
  name: "Title (Artist + Title combined cannot be empty)",
  artist: "Artist",
  slug: "Slug",
  price: "Price",
  files: "Audio file",
};

// Suffix mapping for the per-track DOM ids the form renders below
// (`track-<index>-<suffix>`). `name` is a derived field — there's no single
// input, but the artist field is the first thing the admin needs to fix.
const TRACK_FIELD_DOM_SUFFIX: Record<string, string> = {
  name: "artist",
  artist: "artist",
  slug: "slug",
  price: "price",
  files: "wav",
};

/**
 * Audio format implied by a picked file's extension. Returns null for anything
 * else, which the pickers treat as "no audio selected" — the `accept` attribute
 * is a hint, not a guarantee, so an unrecognized file must not silently upload
 * under a key the presign handler would reject anyway.
 */
function audioFormatOf(file: File | null | undefined): AudioFormat | null {
  if (!file) return null;
  if (/\.wav$/i.test(file.name)) return "wav";
  if (/\.mp3$/i.test(file.name)) return "mp3";
  return null;
}

/** Formats already persisted for a track on an existing release. */
function existingAudioFormatsOf(track: TrackInput): AudioFormat[] {
  const formats: AudioFormat[] = [];
  if (track.existingWavStorageKey) formats.push("wav");
  if (track.existingMp3StorageKey) formats.push("mp3");
  return formats;
}

/** Size-limit message for a picked file, or null when it fits. */
function oversizeMessage(file: File): string | null {
  const format = audioFormatOf(file);
  if (!format) return null;
  return oversizeAudioMessage(file.name, file.size, format);
}

/** Read a Blob into a base64 `data:` URL — used for inline artwork preview and transport. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Park a track's embedded cover art in storage and return its public URL, or
 * null if it can't be stored.
 *
 * The art reaches the transcode endpoint as a storage key rather than inline
 * base64 because that request is a JSON body, and JSON bodies are capped at
 * 4.5 MB by the platform. Cover art embedded in a master is routinely a
 * 3000x3000 JPEG, which base64-encodes past that cap — the request is then
 * rejected with a plain-text "Request Entity Too Large" before it ever
 * reaches the function. Uploading the art as a file sidesteps the cap
 * entirely: file uploads go straight to R2 via a presigned URL.
 */
async function uploadTrackArt(
  dataUrl: string,
  prefix: string,
): Promise<string | null> {
  const blob = await (await fetch(dataUrl)).blob();
  const type = artUploadTypeFor(blob.type);
  if (!type) return null;
  const file = new File([blob], `art.${type.ext}`, { type: type.mime });
  return presignAndUpload(file, `${prefix}/art.${type.ext}`);
}

interface LinkPageSummary {
  id: number;
  slug: string;
  title: string;
  isPublished: boolean;
}

interface ReleaseFormProps {
  release?: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    price: number;
    type: string;
    coverImageUrl: string | null;
    releasedAt: Date | string | null;
    isPublished: boolean;
    inRadio: boolean;
    tracks?: ExistingTrack[];
  };
  linkPages?: LinkPageSummary[];
}

export function ReleaseForm({ release, linkPages }: ReleaseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);
  const [name, setName] = useState(release?.name || "");
  const [slug, setSlug] = useState(() =>
    healPlaceholderSlug(release?.slug ?? "", release?.name ?? "", isPlaceholderReleaseSlug),
  );
  // The release slug follows the name until the admin takes it over. A saved
  // release carrying a `draft-<hex>` slug hasn't been taken over — publishing
  // rejects that slug outright, so it has to keep syncing.
  const [slugTouched, setSlugTouched] = useState(
    () => !isPlaceholderReleaseSlug(release?.slug ?? ""),
  );
  const [description, setDescription] = useState(release?.description || "");
  const [priceStr, setPriceStr] = useState(
    release ? (release.price / 100).toFixed(2) : ""
  );
  const [type, setType] = useState<"album" | "single">(
    (release?.type as "album" | "single") || "single",
  );
  const [releasedAt, setReleasedAt] = useState(() => {
    if (!release?.releasedAt) return "";
    const d = new Date(release.releasedAt);
    return d.toISOString().slice(0, 10);
  });
  const [isPublished, setIsPublished] = useState(release?.isPublished || false);
  const [inRadio, setInRadio] = useState(release?.inRadio ?? true);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreviewSrc, setCoverPreviewSrc] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackInput[]>(() => {
    if (release?.tracks && release.tracks.length > 0) {
      return release.tracks.map((t) => {
        const wav = t.files.find((f) => f.format === "wav");
        const mp3 = t.files.find((f) => f.format === "mp3");
        const split = deriveTrackArtistTitle(t.name, t.artist);
        return {
          existingId: t.id,
          artist: split.artist,
          title: split.title,
          genre: t.genre ?? "",
          // A real stored slug is a URL someone may already be using; a
          // `track-N` placeholder is the form's own filler, so it heals from
          // the name right away and keeps syncing until the admin takes over.
          slug: healPlaceholderSlug(
            t.slug,
            combinedName(split.artist, split.title),
            (s) => !slugIsOwned(s),
          ),
          slugTouched: slugIsOwned(t.slug),
          priceStr: (t.price / 100).toFixed(2),
          trackNumber: t.trackNumber,
          inRadio: t.inRadio,
          audioFile: null,
          existingWavName: wav?.fileName,
          existingWavStorageKey: wav?.storageKey,
          existingWavFileSize: wav?.fileSize ?? undefined,
          existingMp3Name: mp3?.fileName,
          existingMp3StorageKey: mp3?.storageKey,
          existingMp3FileSize: mp3?.fileSize ?? undefined,
        };
      });
    }
    return [{ artist: "", title: "", genre: "", slug: "", priceStr: "1.99", trackNumber: 1, inRadio: true, audioFile: null }];
  });

  function addTrack() {
    setTracks((prev) => [
      ...prev,
      { artist: "", title: "", genre: "", slug: "", priceStr: "1.99", trackNumber: prev.length + 1, inRadio: true, audioFile: null },
    ]);
  }

  function removeTrack(index: number) {
    setTracks((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, trackNumber: i + 1 })));
  }

  function moveTrack(index: number, direction: "up" | "down") {
    setTracks((prev) => {
      const next = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next.map((t, i) => ({ ...t, trackNumber: i + 1 }));
    });
  }

  function updateTrack(index: number, field: keyof TrackInput, value: string | boolean | File | null) {
    setTracks((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  // Slug rules live in `@/lib/release-form` so they're unit-testable; both
  // take the *persisted* publish state, so ticking "publish" on this save
  // doesn't retroactively freeze a slug that never went live.
  const trackSlugOnEdit = (track: TrackInput, name: string) =>
    nextTrackSlug(track, name, release?.isPublished ?? false);
  const trackSlugOnSave = (track: TrackInput, name: string) =>
    slugToPersist(track, name, release?.isPublished ?? false);

  /** Take the slug as the admin's own — the form stops deriving it from here on. */
  function editTrackSlug(index: number, value: string) {
    setTracks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, slug: value, slugTouched: true } : t)),
    );
  }

  /** Hand the slug back to the form and re-derive it from the current name. */
  function resetTrackSlug(index: number) {
    setTracks((prev) =>
      prev.map((t, i) =>
        i === index
          ? {
              ...t,
              slug: slugify(combinedName(t.artist, t.title)),
              slugTouched: false,
            }
          : t,
      ),
    );
  }

  /** True when the slug has drifted from what the track's name would produce. */
  function slugDiffersFromName(track: TrackInput): boolean {
    const derived = slugify(combinedName(track.artist, track.title));
    return Boolean(derived) && track.slug !== derived;
  }

  /**
   * Read embedded ID3/RIFF tags and cover art from a freshly selected audio
   * file (WAV or MP3) and auto-fill the track's still-empty fields. The parsed
   * tags and artwork are retained on the track so the UI can flag overrides and
   * preview the art that will be embedded. Release-level fields (name, slug)
   * are deliberately never touched here.
   *
   * Rejects anything that isn't a WAV or MP3 outright — `accept` on the input
   * is only a hint, and an unrecognized extension would otherwise be uploaded
   * under a key the presign handler rejects, failing deep into the save.
   */
  async function handleAudioSelect(index: number, file: File | null) {
    if (file && !audioFormatOf(file)) {
      setError(`"${file.name}" isn't a WAV or MP3.`);
      updateTrack(index, "audioFile", null);
      return;
    }
    if (file) {
      const tooBig = oversizeMessage(file);
      if (tooBig) {
        setError(tooBig);
        updateTrack(index, "audioFile", null);
        return;
      }
    }
    updateTrack(index, "audioFile", file);
    if (!file) return;
    try {
      const { parseBlob } = await import("music-metadata");
      const { common } = await parseBlob(file);
      const fileArtist = common.artist?.trim() || undefined;
      const fileTitle = common.title?.trim() || undefined;
      const fileGenre = common.genre?.[0]?.trim() || undefined;
      const picture = common.picture?.[0];
      const audioArtDataUrl = picture
        ? await blobToDataUrl(
            new Blob([new Uint8Array(picture.data)], {
              type: picture.format || "image/jpeg",
            }),
          )
        : null;

      setTracks((prev) =>
        prev.map((t, i) => {
          if (i !== index) return t;
          const artist = t.artist || fileArtist || "";
          const title = t.title || fileTitle || "";
          const genre = t.genre || fileGenre || "";
          return {
            ...t,
            artist,
            title,
            genre,
            slug: trackSlugOnEdit(t, combinedName(artist, title)),
            audioTags: { artist: fileArtist, title: fileTitle, genre: fileGenre },
            audioArtDataUrl,
          };
        }),
      );
    } catch (err) {
      console.warn("Could not read audio metadata:", err);
    }
  }

  /** Toggle track.inRadio with immediate persistence for existing tracks (skips the heavy PUT). */
  function toggleTrackInRadio(index: number, next: boolean) {
    const trackId = tracks[index].existingId;
    updateTrack(index, "inRadio", next);
    if (trackId == null) return; // unsaved track — will get saved with the next full Update Release
    void fetch(`/api/admin/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inRadio: next }),
    })
      .then((r) => {
        if (!r.ok) updateTrack(index, "inRadio", !next);
      })
      .catch(() => updateTrack(index, "inRadio", !next));
  }

  /** Toggle release.inRadio with immediate persistence when editing an existing release. */
  function toggleReleaseInRadio(next: boolean) {
    setInRadio(next);
    const id = release?.id;
    if (id == null) return; // creating a new release — flush on submit
    void fetch(`/api/admin/releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inRadio: next }),
    })
      .then((r) => {
        if (!r.ok) setInRadio(!next);
      })
      .catch(() => setInRadio(!next));
  }

  interface UploadMetadata {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    trackNumber?: number;
    trackTotal?: number;
    year?: number;
  }

  async function uploadWav(
    file: File,
    prefix: string,
    metadata: UploadMetadata,
    artUrl: string | null,
  ): Promise<{ url: string; mp3Url: string }> {
    const key = `${prefix}/${file.name}`;
    const url = await presignAndUpload(file, key);

    const processRes = await fetch("/api/admin/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        metadata,
        coverImageUrl: artUrl || undefined,
      }),
    });
    throwIfSessionExpired(processRes);
    const data = await readJsonBody(processRes);

    if (!processRes.ok) {
      const detail = data.mp3Error || data.error || "Unknown error";
      throw new Error(`Transcoding ${file.name} failed: ${String(detail)}`);
    }
    const mp3Url = typeof data.mp3Url === "string" ? data.mp3Url : "";
    if (!mp3Url) {
      throw new Error(`Transcoding ${file.name} incomplete: mp3 missing`);
    }

    return { url, mp3Url };
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const key = `${prefix}/${file.name}`;
    return presignAndUpload(file, key);
  }

  const missingWavMaster = tracksMissingWavMaster(buildFormState());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Confirm before silently unpublishing a release that's currently live.
    if (release?.isPublished && !isPublished) {
      setUnpublishConfirmOpen(true);
      return;
    }
    await executeSubmit();
  }

  function buildFormState(): ReleaseFormState {
    const parsedPrice = parseFloat(priceStr);
    const price = isNaN(parsedPrice) ? 0 : Math.round(parsedPrice * 100);
    return {
      name,
      slug,
      description,
      priceCents: price,
      type,
      coverImageUrl: release?.coverImageUrl ?? null,
      hasNewCover: coverImage != null,
      releasedAt: releasedAt
        ? new Date(releasedAt + "T00:00:00Z").toISOString()
        : null,
      isPublished,
      inRadio,
      tracks: tracks.map((t) => {
        const parsedTrackPrice = parseFloat(t.priceStr);
        const trackPrice = isNaN(parsedTrackPrice)
          ? 0
          : Math.round(parsedTrackPrice * 100);
        const trackName = combinedName(t.artist, t.title);
        return {
          existingId: t.existingId,
          name: trackName,
          artist: t.artist,
          genre: t.genre,
          slug: trackSlugOnSave(t, trackName),
          priceCents: trackPrice,
          trackNumber: t.trackNumber,
          inRadio: t.inRadio,
          newAudioFormat: audioFormatOf(t.audioFile),
          existingAudioFormats: existingAudioFormatsOf(t),
        };
      }),
    };
  }

  async function executeSubmit() {
    setLoading(true);
    setError("");
    setFieldErrors({});
    setStatus("");

    try {
      // Pre-flight: validate against the same server schema BEFORE any
      // uploads start. Otherwise the admin can wait minutes for transcoding
      // only to learn they forgot an artist name. Same fieldErrors shape the
      // server would have returned, so the banner + inline error rendering
      // below handles both paths identically.
      const preflight = validateReleaseFormState(buildFormState());
      if (!preflight.ok) {
        setError("Please fix the issues below before saving.");
        setFieldErrors(flattenFieldErrors(preflight.errors.fieldErrors));
        setLoading(false);
        return;
      }

      const tracksWithFiles = tracks.filter((t) => audioFormatOf(t.audioFile));
      const totalSteps = (coverImage ? 1 : 0) + tracksWithFiles.length + 1;
      let currentStep = 0;
      setProgress({ current: 0, total: totalSteps });

      let coverImageUrl = release?.coverImageUrl || null;
      if (coverImage) {
        currentStep++;
        setProgress({ current: currentStep, total: totalSteps });
        setStatus("Uploading cover image...");
        coverImageUrl = await uploadFile(coverImage, "images/covers");
      }

      const releaseYear = releasedAt ? new Date(releasedAt + "T00:00:00Z").getUTCFullYear() : undefined;
      const trackTotal = tracks.length;

      const trackData = [];
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const parsedTrackPrice = parseFloat(track.priceStr);
        const trackPrice = isNaN(parsedTrackPrice)
          ? 0
          : Math.round(parsedTrackPrice * 100);
        const files: { format: string; fileName: string; storageKey: string; fileSize: number }[] = [];
        const trackName = combinedName(track.artist, track.title);

        const newAudioFormat = audioFormatOf(track.audioFile);

        if (track.audioFile && newAudioFormat) {
          currentStep++;
          setProgress({ current: currentStep, total: totalSteps });
          setStatus(
            newAudioFormat === "wav"
              ? `Uploading & transcoding "${trackName || track.audioFile.name}"...`
              : `Uploading "${trackName || track.audioFile.name}"...`,
          );
          // A track's own embedded art wins over the release cover for its
          // tags. Store it first so the transcode request can reference it by
          // URL — art is cosmetic, so a failure here falls back to the cover
          // rather than sinking the whole save.
          let trackArtUrl: string | null = null;
          if (track.audioArtDataUrl) {
            try {
              trackArtUrl = await uploadTrackArt(
                track.audioArtDataUrl,
                `images/track-art/${slug}/${track.trackNumber}`,
              );
            } catch (err) {
              console.warn("Track art upload failed; using release cover:", err);
            }
          }
          const metadata = {
            title: track.title || undefined,
            artist: track.artist || undefined,
            album: name || undefined,
            genre: track.genre || undefined,
            trackNumber: track.trackNumber,
            trackTotal,
            year: releaseYear,
          };
          const prefix = `audio/${slug}/${track.trackNumber}`;

          if (newAudioFormat === "wav") {
            const result = await uploadWav(
              track.audioFile,
              prefix,
              metadata,
              trackArtUrl ?? coverImageUrl,
            );
            files.push({
              format: "wav",
              fileName: track.audioFile.name,
              storageKey: result.url,
              fileSize: track.audioFile.size,
            });
            files.push({
              format: "mp3",
              fileName: track.audioFile.name.replace(/\.wav$/i, ".mp3"),
              storageKey: result.mp3Url,
              fileSize: 0,
            });
          } else {
            // An MP3 is already the deliverable — there's nothing to transcode,
            // so it skips /upload/process entirely (which only accepts .wav
            // keys). The save-time retag stamps the authoritative tags and
            // cover art onto it once the release row exists.
            const url = await uploadFile(track.audioFile, prefix);
            files.push({
              format: "mp3",
              fileName: track.audioFile.name,
              storageKey: url,
              fileSize: track.audioFile.size,
            });
          }
        } else {
          if (track.existingWavStorageKey) {
            files.push({
              format: "wav",
              fileName: track.existingWavName || "track.wav",
              storageKey: track.existingWavStorageKey,
              fileSize: track.existingWavFileSize || 0,
            });
          }
          // Kept outside the WAV branch so an MP3-only track (a mix) doesn't
          // lose its only file when the release is re-saved.
          if (track.existingMp3StorageKey) {
            files.push({
              format: "mp3",
              fileName: track.existingMp3Name || "track.mp3",
              storageKey: track.existingMp3StorageKey,
              fileSize: track.existingMp3FileSize || 0,
            });
          }
        }

        trackData.push({
          id: track.existingId,
          name: trackName,
          artist: track.artist || null,
          genre: track.genre || null,
          slug: trackSlugOnSave(track, trackName),
          price: trackPrice,
          trackNumber: track.trackNumber,
          inRadio: track.inRadio,
          files,
        });
      }

      currentStep++;
      setProgress({ current: currentStep, total: totalSteps });
      setStatus("Saving release...");

      const parsedReleasePrice = parseFloat(priceStr);
      const releasePriceCents = isNaN(parsedReleasePrice)
        ? 0
        : Math.round(parsedReleasePrice * 100);

      const body = {
        name,
        slug,
        description: description || null,
        price: releasePriceCents,
        type,
        coverImageUrl,
        releasedAt: releasedAt ? new Date(releasedAt + "T00:00:00Z").toISOString() : null,
        isPublished,
        inRadio,
        tracks: trackData,
      };

      const url = release
        ? `/api/admin/releases/${release.id}`
        : "/api/admin/releases";

      const res = await fetch(url, {
        method: release ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      throwIfSessionExpired(res);
      if (!res.ok) {
        const data = await readJsonBody(res);
        setError(typeof data.error === "string" ? data.error : "Something went wrong");
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(
            flattenFieldErrors(
              data.fieldErrors as Record<string, unknown>,
            ),
          );
        }
        setLoading(false);
        setStatus("");
        return;
      }

      const saved = await res.json();
      // Merge server-assigned track IDs + stored file URLs back into form state.
      // This makes the download buttons appear and lets a re-save carry the IDs,
      // without remounting the form — a remount would drop the client-parsed WAV
      // artwork preview and reset other transient state.
      if (Array.isArray(saved.tracks)) {
        setTracks((prev) =>
          prev.map((t) => {
            const savedTrack = saved.tracks.find(
              (st: { trackNumber: number }) => st.trackNumber === t.trackNumber,
            );
            if (!savedTrack) return t;
            const savedFiles: ExistingTrack["files"] = savedTrack.files ?? [];
            const wav = savedFiles.find((f) => f.format === "wav");
            const mp3 = savedFiles.find((f) => f.format === "mp3");
            return {
              ...t,
              existingId: savedTrack.id,
              slug: savedTrack.slug,
              // Re-seed from what was persisted so continuing to edit after a
              // save behaves exactly like editing after a reload.
              slugTouched: slugIsOwned(savedTrack.slug),
              audioFile: null,
              existingWavName: wav?.fileName,
              existingWavStorageKey: wav?.storageKey,
              existingWavFileSize: wav?.fileSize ?? undefined,
              existingMp3Name: mp3?.fileName,
              existingMp3StorageKey: mp3?.storageKey,
              existingMp3FileSize: mp3?.fileSize ?? undefined,
            };
          }),
        );
      }
      setLoading(false);
      setStatus("");
      setProgress({ current: 0, total: 0 });
      router.push(`/admin/releases/${saved.id}/edit`);
      router.refresh();
    } catch (err) {
      console.error("Release save failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-6">
      {Object.keys(fieldErrors).length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2"
        >
          <p className="text-sm font-medium text-destructive">
            Please fix these issues before saving:
          </p>
          <ul className="space-y-1 text-sm">
            {Object.keys(fieldErrors).map((key) => (
              <li key={key}>
                <button
                  type="button"
                  className="text-left underline hover:no-underline"
                  onClick={() => {
                    const el = document.getElementById(fieldDomId(key));
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      el.focus({ preventScroll: true });
                    }
                  }}
                >
                  <span className="font-medium">{friendlyFieldLabel(key)}:</span>{" "}
                  <span className="text-muted-foreground">{fieldErrors[key]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Release Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="slug">Slug</Label>
          {slugify(name) && slug !== slugify(name) && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:no-underline"
              onClick={() => {
                setSlug(slugify(name));
                setSlugTouched(false);
              }}
            >
              Reset from name
            </button>
          )}
        </div>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          required
        />
        {fieldErrors.slug && (
          <p className="text-xs text-destructive">{fieldErrors.slug}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Release Price (USD)</Label>
          <Input id="price" type="number" step="0.01" min="0" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
          {fieldErrors.price && (
            <p className="text-xs text-destructive">{fieldErrors.price}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as "album" | "single")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="single">Single</option>
            <option value="album">Album</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="releasedAt">Release Date</Label>
        <Input
          id="releasedAt"
          type="date"
          value={releasedAt}
          onChange={(e) => setReleasedAt(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cover">Cover Image</Label>
        {(coverPreviewSrc || release?.coverImageUrl) && (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted">
            <Image
              src={coverPreviewSrc || release?.coverImageUrl || ""}
              alt="Cover preview"
              fill
              className="object-cover"
            />
          </div>
        )}
        <Input
          id="cover"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setCoverImage(file);
            if (file) {
              setCoverPreviewSrc(URL.createObjectURL(file));
            } else {
              setCoverPreviewSrc(null);
            }
          }}
        />
      </div>

      <div id="tracks-section" className="space-y-4">
        <Label>Tracks</Label>

        {tracks.map((track, index) => (
          <div key={index} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveTrack(index, "up")}
                  >
                    ▲
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === tracks.length - 1}
                    onClick={() => moveTrack(index, "down")}
                  >
                    ▼
                  </Button>
                </div>
                <span className="text-sm font-medium">Track {track.trackNumber}</span>
              </div>
              <div className="flex items-center gap-3">
                <label
                  className={`flex items-center gap-1.5 text-xs ${
                    inRadio ? "text-muted-foreground" : "text-muted-foreground/40 cursor-not-allowed"
                  }`}
                  title={inRadio ? undefined : "Release is excluded from Party Pupils Radio"}
                >
                  <input
                    type="checkbox"
                    checked={inRadio && track.inRadio}
                    disabled={!inRadio}
                    onChange={(e) => toggleTrackInRadio(index, e.target.checked)}
                    className="h-3.5 w-3.5 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  In radio
                </label>
                {tracks.length > 1 && (
                  <Dialog>
                    <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                      Remove
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Remove track?</DialogTitle>
                        <DialogDescription>
                          {track.existingId ? (
                            <>
                              <strong>
                                Customers who purchased this track — individually or as part of
                                this release — will permanently lose access to their download.
                              </strong>
                              <br />
                              <br />
                              <strong>{combinedName(track.artist, track.title) || `Track ${track.trackNumber}`}</strong> will be
                              deleted from the database and its audio file removed from storage when
                              you click Update Release. This cannot be undone.
                            </>
                          ) : (
                            <>
                              Remove <strong>{combinedName(track.artist, track.title) || `Track ${track.trackNumber}`}</strong>{" "}
                              from this release? It hasn&apos;t been saved yet, so no data will be
                              destroyed.
                            </>
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>
                          Cancel
                        </DialogClose>
                        <DialogClose
                          render={<Button type="button" variant="destructive" />}
                          onClick={() => removeTrack(index)}
                        >
                          Remove
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`track-${index}-artist`}>Artist</Label>
                <Input
                  id={`track-${index}-artist`}
                  value={track.artist}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTracks((prev) =>
                      prev.map((t, i) =>
                        i === index
                          ? {
                              ...t,
                              artist: value,
                              slug: trackSlugOnEdit(t, combinedName(value, t.title)),
                            }
                          : t,
                      ),
                    );
                  }}
                />
                {fieldErrors[`tracks[${index}].artist`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].artist`]}</p>
                )}
                {track.audioTags?.artist &&
                  track.artist.trim() &&
                  track.artist.trim() !== track.audioTags.artist && (
                    <p className="text-xs text-amber-500">
                      Overrides tag: «{track.audioTags.artist}»
                    </p>
                  )}
              </div>
              <div className="space-y-1">
                <Label>Track Title</Label>
                <Input
                  value={track.title}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTracks((prev) =>
                      prev.map((t, i) =>
                        i === index
                          ? {
                              ...t,
                              title: value,
                              slug: trackSlugOnEdit(t, combinedName(t.artist, value)),
                            }
                          : t,
                      ),
                    );
                  }}
                />
                {fieldErrors[`tracks[${index}].name`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].name`]}</p>
                )}
                {track.audioTags?.title &&
                  track.title.trim() &&
                  track.title.trim() !== track.audioTags.title && (
                    <p className="text-xs text-amber-500">
                      Overrides tag: «{track.audioTags.title}»
                    </p>
                  )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`track-${index}-price`}>Price (USD)</Label>
                <Input
                  id={`track-${index}-price`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={track.priceStr}
                  onChange={(e) => updateTrack(index, "priceStr", e.target.value)}
                />
                {fieldErrors[`tracks[${index}].price`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].price`]}</p>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`track-${index}-slug`}>Slug</Label>
                  {slugDiffersFromName(track) && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:no-underline"
                      onClick={() => resetTrackSlug(index)}
                    >
                      Reset from title
                    </button>
                  )}
                </div>
                <Input
                  id={`track-${index}-slug`}
                  value={track.slug}
                  onChange={(e) => editTrackSlug(index, e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Genre</Label>
              <Input
                value={track.genre}
                onChange={(e) => updateTrack(index, "genre", e.target.value)}
              />
              {track.audioTags?.genre &&
                track.genre.trim() &&
                track.genre.trim() !== track.audioTags.genre && (
                  <p className="text-xs text-amber-500">
                    Overrides tag: «{track.audioTags.genre}»
                  </p>
                )}
            </div>
            {(() => {
              if (!track.existingId) return null;
              const mp3Url = track.existingMp3StorageKey;
              const trackName = combinedName(track.artist, track.title) || `Track ${track.trackNumber}`;
              const previewTrack: PlayerTrack | null = mp3Url
                ? {
                    trackId: track.existingId,
                    trackName,
                    trackSlug: track.slug,
                    trackNumber: track.trackNumber,
                    releaseId: release?.id ?? 0,
                    releaseName: name || "Release",
                    releaseSlug: slug,
                    coverImageUrl: release?.coverImageUrl ?? null,
                    streamUrl: mp3Url,
                  }
                : null;
              return (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {previewTrack && (
                    <>
                      <PlayButton track={previewTrack} queue={[previewTrack]} index={0} />
                      <TrackProgress trackId={track.existingId} alwaysShow />
                    </>
                  )}
                  <DownloadButtons
                    className="ml-auto"
                    formats={[
                      {
                        format: "mp3",
                        href: track.existingMp3StorageKey
                          ? `/api/admin/download?trackId=${track.existingId}&format=mp3`
                          : null,
                      },
                      {
                        format: "wav",
                        href: track.existingWavStorageKey
                          ? `/api/admin/download?trackId=${track.existingId}&format=wav`
                          : null,
                      },
                    ]}
                  />
                </div>
              );
            })()}
            <div className="space-y-1">
              <Label htmlFor={`track-${index}-wav`}>
                Audio File
                {isPublished &&
                  !track.existingWavName &&
                  !track.existingMp3Name &&
                  " (required to publish)"}
              </Label>
              <Input
                id={`track-${index}-wav`}
                type="file"
                accept=".wav,.mp3"
                onChange={(e) => void handleAudioSelect(index, e.target.files?.[0] || null)}
                required={
                  isPublished && !track.existingWavName && !track.existingMp3Name
                }
              />
              {fieldErrors[`tracks[${index}].files`] && (
                <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].files`]}</p>
              )}
              {track.existingWavName && !track.audioFile && (
                <p className="text-xs text-muted-foreground">
                  Current: {track.existingWavName}
                  {track.existingMp3StorageKey && " (320k mp3 generated)"}
                </p>
              )}
              {!track.existingWavName && track.existingMp3Name && !track.audioFile && (
                <p className="text-xs text-muted-foreground">
                  Current: {track.existingMp3Name} — MP3 only, no WAV master.
                </p>
              )}
              {!track.existingWavName && !track.existingMp3Name && (
                <p className="text-xs text-muted-foreground">
                  Upload a WAV and a 320kbps MP3 is auto-generated from it. Upload
                  an MP3 on its own — for a DJ mix — and it ships as-is, with no
                  WAV master.
                </p>
              )}
              {track.audioFile && (
                <p className="text-xs text-muted-foreground">
                  {track.audioTags
                    ? "Empty fields were filled from the file's tags. The delivered file is tagged from the form fields above — any “Overrides tag” note means the file's own value won't be used."
                    : "New file selected — the delivered file will be tagged from the form fields above."}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Artwork</Label>
              {(() => {
                const releaseCover = coverPreviewSrc || release?.coverImageUrl || null;
                const src = track.audioArtDataUrl || releaseCover;
                const caption = track.audioArtDataUrl
                  ? "From the selected file — embedded in the delivered audio."
                  : releaseCover
                    ? "Release cover shown. A track's own embedded art previews here only right after you select its audio file."
                    : "No artwork — add a release cover image above.";
                return (
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
                      {src && (
                        <Image src={src} alt="Track artwork" fill className="object-cover" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{caption}</p>
                  </div>
                );
              })()}
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addTrack}>
          Add Track
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input id="published" type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4" />
          <Label htmlFor="published">Published</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1 ml-6">
          Required fields are only checked when publishing. Save as draft to keep working on it.
        </p>
        <div className="flex items-center gap-2">
          <RadioCheckbox
            id="inRadio"
            checked={inRadio}
            partial={inRadio && tracks.some((t) => !t.inRadio)}
            onChange={toggleReleaseInRadio}
          />
          <Label htmlFor="inRadio">Include in Party Pupils Radio</Label>
          <span className="text-xs text-muted-foreground">(uncheck to exclude every track in this release from the radio mix)</span>
        </div>
      </div>

      {release && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <Label>Link Pages</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              href={`/admin/link-pages/new?releaseId=${release.id}`}
            >
              + New link page for this release
            </Button>
          </div>
          {linkPages && linkPages.length > 0 ? (
            <ul className="text-sm space-y-1">
              {linkPages.map((lp) => (
                <li key={lp.id} className="flex items-center justify-between gap-3">
                  <a
                    href={`/admin/link-pages/${lp.id}/edit`}
                    className="hover:underline"
                  >
                    {lp.title}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    <code>/links/{lp.slug}</code>
                    {!lp.isPublished && " · draft"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No link pages yet. Create one to share a single URL with
              Spotify/Apple/YouTube buttons for this release.
            </p>
          )}
        </div>
      )}

      {loading && status && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {status}
            </span>
            {progress.total > 0 && (
              <span className="text-muted-foreground whitespace-nowrap">
                Step {progress.current} of {progress.total}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-neon rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
      {/*
        MP3-only tracks are valid — that's how a DJ mix ships — but on a normal
        release it nearly always means the wrong file got picked, and the
        mistake is invisible until a customer downloads a release with no
        lossless master. Warn, don't block.
      */}
      {missingWavMaster.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {missingWavMaster.length === 1
            ? `Track ${missingWavMaster[0] + 1} has no WAV master and will ship as MP3 only.`
            : `Tracks ${missingWavMaster.map((i) => i + 1).join(", ")} have no WAV master and will ship as MP3 only.`}{" "}
          Expected for a DJ mix; otherwise upload the WAV.
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>{error}</p>
          {error === SESSION_EXPIRED_MESSAGE && (
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Open the admin login in a new tab
            </a>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitButtonLabel(release, isPublished)}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <Dialog open={unpublishConfirmOpen} onOpenChange={setUnpublishConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpublish this release?</DialogTitle>
            <DialogDescription>
              <strong>{name || "This release"}</strong> is currently live. Unpublishing will
              remove it from the storefront, sitemap, and checkout immediately. Existing
              customers keep access to their downloads.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <DialogClose
              render={<Button type="button" variant="destructive" />}
              onClick={() => void executeSubmit()}
            >
              Unpublish &amp; save
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/** Picks the submit button label based on the current vs. target publish state. */
function submitButtonLabel(
  release: ReleaseFormProps["release"],
  isPublished: boolean,
): string {
  if (!release) return isPublished ? "Publish Release" : "Save Draft";
  if (release.isPublished && !isPublished) return "Unpublish & Save";
  if (!release.isPublished && isPublished) return "Publish";
  return isPublished ? "Update Release" : "Save Draft";
}
