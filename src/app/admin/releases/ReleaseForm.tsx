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
import { combinedName, deriveTrackArtistTitle } from "@/lib/track-name";
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
  priceStr: string;
  trackNumber: number;
  inRadio: boolean;
  wavFile: File | null;
  /** Embedded tags read from the selected WAV — kept so the UI can flag overrides. */
  wavTags?: { artist?: string; title?: string; genre?: string };
  /** Cover art embedded in the selected WAV as a `data:` URL — `null` if the WAV has none. */
  wavArtDataUrl?: string | null;
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

/** Read a Blob into a base64 `data:` URL — used for inline artwork preview and transport. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
  const [slug, setSlug] = useState(release?.slug || "");
  const [description, setDescription] = useState(release?.description || "");
  const [priceStr, setPriceStr] = useState(
    release ? (release.price / 100).toFixed(2) : ""
  );
  const [type, setType] = useState(release?.type || "single");
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
          slug: t.slug,
          priceStr: (t.price / 100).toFixed(2),
          trackNumber: t.trackNumber,
          inRadio: t.inRadio,
          wavFile: null,
          existingWavName: wav?.fileName,
          existingWavStorageKey: wav?.storageKey,
          existingWavFileSize: wav?.fileSize ?? undefined,
          existingMp3Name: mp3?.fileName,
          existingMp3StorageKey: mp3?.storageKey,
          existingMp3FileSize: mp3?.fileSize ?? undefined,
        };
      });
    }
    return [{ artist: "", title: "", genre: "", slug: "", priceStr: "1.99", trackNumber: 1, inRadio: true, wavFile: null }];
  });

  function addTrack() {
    setTracks((prev) => [
      ...prev,
      { artist: "", title: "", genre: "", slug: "", priceStr: "1.99", trackNumber: prev.length + 1, inRadio: true, wavFile: null },
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

  /**
   * Read embedded ID3/RIFF tags and cover art from a freshly selected WAV and
   * auto-fill the track's still-empty fields. The parsed tags and artwork are
   * retained on the track so the UI can flag overrides and preview the art that
   * will be embedded in the MP3. Release-level fields (name, slug) are
   * deliberately never touched here.
   */
  async function handleWavSelect(index: number, file: File | null) {
    updateTrack(index, "wavFile", file);
    if (!file) return;
    try {
      const { parseBlob } = await import("music-metadata");
      const { common } = await parseBlob(file);
      const wavArtist = common.artist?.trim() || undefined;
      const wavTitle = common.title?.trim() || undefined;
      const wavGenre = common.genre?.[0]?.trim() || undefined;
      const picture = common.picture?.[0];
      const wavArtDataUrl = picture
        ? await blobToDataUrl(
            new Blob([new Uint8Array(picture.data)], {
              type: picture.format || "image/jpeg",
            }),
          )
        : null;

      setTracks((prev) =>
        prev.map((t, i) => {
          if (i !== index) return t;
          const artist = t.artist || wavArtist || "";
          const title = t.title || wavTitle || "";
          const genre = t.genre || wavGenre || "";
          return {
            ...t,
            artist,
            title,
            genre,
            slug: t.existingId == null ? slugify(combinedName(artist, title)) : t.slug,
            wavTags: { artist: wavArtist, title: wavTitle, genre: wavGenre },
            wavArtDataUrl,
          };
        }),
      );
    } catch (err) {
      console.warn("Could not read WAV metadata:", err);
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

  async function presignAndUpload(file: File, key: string): Promise<string> {
    const contentType = file.type || "application/octet-stream";
    const presignRes = await fetch("/api/admin/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType }),
    });
    if (!presignRes.ok) {
      const body = await presignRes.text();
      throw new Error(
        `Failed to get upload URL (${presignRes.status}) for key="${key}" contentType="${contentType}": ${body.slice(0, 300)}`,
      );
    }
    const { url, publicUrl } = await presignRes.json();

    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("Failed to upload file");

    return publicUrl;
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
    artwork: { artDataUrl?: string | null; coverImageUrl?: string | null },
  ): Promise<{ url: string; mp3Url: string }> {
    const key = `${prefix}/${file.name}`;
    const url = await presignAndUpload(file, key);

    const processRes = await fetch("/api/admin/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        metadata,
        artDataUrl: artwork.artDataUrl || undefined,
        coverImageUrl: artwork.coverImageUrl || undefined,
      }),
    });
    const data = await processRes.json();

    if (!processRes.ok) {
      const detail = data.mp3Error || data.error || "Unknown error";
      throw new Error(`Transcoding ${file.name} failed: ${detail}`);
    }
    if (!data.mp3Url) {
      throw new Error(`Transcoding ${file.name} incomplete: mp3 missing`);
    }

    return { url, mp3Url: data.mp3Url };
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const key = `${prefix}/${file.name}`;
    return presignAndUpload(file, key);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Confirm before silently unpublishing a release that's currently live.
    if (release?.isPublished && !isPublished) {
      setUnpublishConfirmOpen(true);
      return;
    }
    await executeSubmit();
  }

  async function executeSubmit() {
    setLoading(true);
    setError("");
    setFieldErrors({});
    setStatus("");

    try {
      const parsedPrice = parseFloat(priceStr);
      const price = isNaN(parsedPrice) ? 0 : Math.round(parsedPrice * 100);
      if (isPublished && price <= 0) {
        setError("Please enter a valid release price.");
        setLoading(false);
        return;
      }

      const tracksWithFiles = tracks.filter((t) => t.wavFile);
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

        if (track.wavFile) {
          currentStep++;
          setProgress({ current: currentStep, total: totalSteps });
          setStatus(`Uploading & transcoding "${trackName || track.wavFile.name}"...`);
          const result = await uploadWav(
            track.wavFile,
            `audio/${slug}/${track.trackNumber}`,
            {
              title: track.title || undefined,
              artist: track.artist || undefined,
              album: name || undefined,
              genre: track.genre || undefined,
              trackNumber: track.trackNumber,
              trackTotal,
              year: releaseYear,
            },
            { artDataUrl: track.wavArtDataUrl, coverImageUrl },
          );
          files.push({
            format: "wav",
            fileName: track.wavFile.name,
            storageKey: result.url,
            fileSize: track.wavFile.size,
          });
          files.push({
            format: "mp3",
            fileName: track.wavFile.name.replace(/\.wav$/i, ".mp3"),
            storageKey: result.mp3Url,
            fileSize: 0,
          });
        } else if (track.existingWavStorageKey) {
          files.push({
            format: "wav",
            fileName: track.existingWavName || "track.wav",
            storageKey: track.existingWavStorageKey,
            fileSize: track.existingWavFileSize || 0,
          });
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
          slug: track.slug || slugify(trackName) || `track-${track.trackNumber}`,
          price: trackPrice,
          trackNumber: track.trackNumber,
          inRadio: track.inRadio,
          files,
        });
      }

      currentStep++;
      setProgress({ current: currentStep, total: totalSteps });
      setStatus("Saving release...");

      const body = {
        name,
        slug,
        description: description || null,
        price,
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

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        // Server returns { fieldErrors: { "tracks[0].artist": [msg], ... } }
        // Flatten to first-message-per-field for inline display.
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          const flat: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.fieldErrors)) {
            if (Array.isArray(msgs) && msgs.length > 0 && typeof msgs[0] === "string") {
              flat[key] = msgs[0];
            }
          }
          setFieldErrors(flat);
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
              wavFile: null,
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
      <div className="space-y-2">
        <Label htmlFor="name">Release Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!release) setSlug(slugify(e.target.value));
          }}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
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
            onChange={(e) => setType(e.target.value)}
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

      <div className="space-y-4">
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
                <Label>Artist</Label>
                <Input
                  value={track.artist}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTracks((prev) =>
                      prev.map((t, i) =>
                        i === index
                          ? {
                              ...t,
                              artist: value,
                              slug: t.existingId == null ? slugify(combinedName(value, t.title)) : t.slug,
                            }
                          : t,
                      ),
                    );
                  }}
                />
                {fieldErrors[`tracks[${index}].artist`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].artist`]}</p>
                )}
                {track.wavTags?.artist &&
                  track.artist.trim() &&
                  track.artist.trim() !== track.wavTags.artist && (
                    <p className="text-xs text-amber-500">
                      Overrides WAV tag: «{track.wavTags.artist}»
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
                              slug: t.existingId == null ? slugify(combinedName(t.artist, value)) : t.slug,
                            }
                          : t,
                      ),
                    );
                  }}
                />
                {fieldErrors[`tracks[${index}].name`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].name`]}</p>
                )}
                {track.wavTags?.title &&
                  track.title.trim() &&
                  track.title.trim() !== track.wavTags.title && (
                    <p className="text-xs text-amber-500">
                      Overrides WAV tag: «{track.wavTags.title}»
                    </p>
                  )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Price (USD)</Label>
                <Input type="number" step="0.01" min="0" value={track.priceStr} onChange={(e) => updateTrack(index, "priceStr", e.target.value)} />
                {fieldErrors[`tracks[${index}].price`] && (
                  <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].price`]}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Slug</Label>
                <Input
                  value={track.slug}
                  onChange={(e) => updateTrack(index, "slug", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Genre</Label>
              <Input
                value={track.genre}
                onChange={(e) => updateTrack(index, "genre", e.target.value)}
              />
              {track.wavTags?.genre &&
                track.genre.trim() &&
                track.genre.trim() !== track.wavTags.genre && (
                  <p className="text-xs text-amber-500">
                    Overrides WAV tag: «{track.wavTags.genre}»
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
                        format: "wav",
                        href: track.existingWavStorageKey
                          ? `/api/admin/download?trackId=${track.existingId}&format=wav`
                          : null,
                      },
                      {
                        format: "mp3",
                        href: track.existingMp3StorageKey
                          ? `/api/admin/download?trackId=${track.existingId}&format=mp3`
                          : null,
                      },
                    ]}
                  />
                </div>
              );
            })()}
            <div className="space-y-1">
              <Label>
                WAV File
                {isPublished && !track.existingWavName && " (required to publish)"}
              </Label>
              <Input
                type="file"
                accept=".wav"
                onChange={(e) => void handleWavSelect(index, e.target.files?.[0] || null)}
                required={isPublished && !track.existingWavName}
              />
              {fieldErrors[`tracks[${index}].files`] && (
                <p className="text-xs text-destructive">{fieldErrors[`tracks[${index}].files`]}</p>
              )}
              {track.existingWavName && !track.wavFile && (
                <p className="text-xs text-muted-foreground">
                  Current: {track.existingWavName}
                  {track.existingMp3StorageKey && " (320k mp3 generated)"}
                </p>
              )}
              {!track.existingWavName && (
                <p className="text-xs text-muted-foreground">
                  A 320kbps MP3 will be auto-generated from the WAV with embedded ID3 tags.
                </p>
              )}
              {track.wavFile && (
                <p className="text-xs text-muted-foreground">
                  {track.wavTags
                    ? "Empty fields were filled from the file's tags. The MP3 is tagged from the form fields above — any “Overrides WAV tag” note means the file's own value won't be used."
                    : "New file selected — the MP3 will be tagged from the form fields above."}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Artwork</Label>
              {(() => {
                const releaseCover = coverPreviewSrc || release?.coverImageUrl || null;
                // Saved tracks: read the art actually embedded in the track's MP3.
                const trackArt =
                  track.existingId != null && track.existingMp3StorageKey
                    ? `/api/admin/track-artwork?trackId=${track.existingId}`
                    : null;
                const src = track.wavArtDataUrl || trackArt || releaseCover;
                const caption = track.wavArtDataUrl
                  ? "From the WAV file — embedded in the generated MP3."
                  : trackArt
                    ? "Artwork embedded in this track's MP3."
                    : releaseCover
                      ? "Will use the release cover."
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
      {error && <p className="text-sm text-destructive">{error}</p>}

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
