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
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
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
  name: string;
  priceStr: string;
  trackNumber: number;
  inRadio: boolean;
  wavFile: File | null;
  existingWavName?: string;
  existingWavStorageKey?: string;
  existingWavFileSize?: number;
  existingPreviewUrl?: string | null;
  existingMp3Name?: string;
  existingMp3StorageKey?: string;
  existingMp3FileSize?: number;
}

interface ExistingTrack {
  id: number;
  name: string;
  price: number;
  trackNumber: number;
  previewUrl: string | null;
  inRadio: boolean;
  files: { format: string; fileName: string; storageKey: string; fileSize: number | null }[];
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
}

export function ReleaseForm({ release }: ReleaseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
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
        return {
          existingId: t.id,
          name: t.name,
          priceStr: (t.price / 100).toFixed(2),
          trackNumber: t.trackNumber,
          inRadio: t.inRadio,
          wavFile: null,
          existingWavName: wav?.fileName,
          existingWavStorageKey: wav?.storageKey,
          existingWavFileSize: wav?.fileSize ?? undefined,
          existingPreviewUrl: t.previewUrl,
          existingMp3Name: mp3?.fileName,
          existingMp3StorageKey: mp3?.storageKey,
          existingMp3FileSize: mp3?.fileSize ?? undefined,
        };
      });
    }
    return [{ name: "", priceStr: "1.99", trackNumber: 1, inRadio: true, wavFile: null }];
  });

  function addTrack() {
    setTracks((prev) => [
      ...prev,
      { name: "", priceStr: "1.99", trackNumber: prev.length + 1, inRadio: true, wavFile: null },
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
    const presignRes = await fetch("/api/admin/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: file.type || "application/octet-stream" }),
    });
    if (!presignRes.ok) throw new Error("Failed to get upload URL");
    const { url, publicUrl } = await presignRes.json();

    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("Failed to upload file");

    return publicUrl;
  }

  async function uploadWav(file: File, prefix: string): Promise<{ url: string; previewUrl?: string; mp3Url?: string }> {
    const key = `${prefix}/${file.name}`;
    const url = await presignAndUpload(file, key);

    const processRes = await fetch("/api/admin/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const { previewUrl, mp3Url } = await processRes.json();

    return { url, previewUrl, mp3Url };
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const key = `${prefix}/${file.name}`;
    return presignAndUpload(file, key);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price <= 0) {
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

      const trackData = [];
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackPrice = Math.round(parseFloat(track.priceStr) * 100);
        const files: { format: string; fileName: string; storageKey: string; fileSize: number }[] = [];
        let previewUrl: string | undefined;

        if (track.wavFile) {
          currentStep++;
          setProgress({ current: currentStep, total: totalSteps });
          setStatus(`Uploading & generating preview for "${track.name || track.wavFile.name}"...`);
          const result = await uploadWav(track.wavFile, `audio/${slug}/${track.trackNumber}`);
          files.push({
            format: "wav",
            fileName: track.wavFile.name,
            storageKey: result.url,
            fileSize: track.wavFile.size,
          });
          if (result.mp3Url) {
            files.push({
              format: "mp3",
              fileName: track.wavFile.name.replace(/\.wav$/i, ".mp3"),
              storageKey: result.mp3Url,
              fileSize: 0,
            });
          }
          previewUrl = result.previewUrl;
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
          previewUrl = track.existingPreviewUrl ?? undefined;
        }

        trackData.push({
          id: track.existingId,
          name: track.name,
          price: trackPrice,
          trackNumber: track.trackNumber,
          previewUrl,
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
        setLoading(false);
        setStatus("");
        return;
      }

      const saved = await res.json();
      // Reset state explicitly — on edits the URL doesn't change so the form
      // stays mounted and would otherwise be stuck in "Saving..." forever.
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Release Price (USD)</Label>
          <Input id="price" type="number" step="0.01" min="0" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} required />
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
                              <strong>{track.name || `Track ${track.trackNumber}`}</strong> will be
                              deleted from the database and its audio file removed from storage when
                              you click Update Release. This cannot be undone.
                            </>
                          ) : (
                            <>
                              Remove <strong>{track.name || `Track ${track.trackNumber}`}</strong>{" "}
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
                <Label>Name</Label>
                <Input value={track.name} onChange={(e) => updateTrack(index, "name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Price (USD)</Label>
                <Input type="number" step="0.01" min="0" value={track.priceStr} onChange={(e) => updateTrack(index, "priceStr", e.target.value)} required />
              </div>
            </div>
            {(() => {
              if (!track.existingId) return null;
              const url = track.existingMp3StorageKey ?? track.existingPreviewUrl;
              if (!url) return null;
              const previewTrack: PlayerTrack = {
                trackId: track.existingId,
                trackName: track.name || `Track ${track.trackNumber}`,
                trackNumber: track.trackNumber,
                releaseId: release?.id ?? 0,
                releaseName: name || "Release",
                releaseSlug: slug,
                coverImageUrl: release?.coverImageUrl ?? null,
                streamUrl: url,
              };
              return (
                <div className="flex items-center gap-2 pt-1">
                  <PlayButton track={previewTrack} queue={[previewTrack]} index={0} />
                  <TrackProgress trackId={track.existingId} alwaysShow />
                </div>
              );
            })()}
            <div className="space-y-1">
              <Label>WAV File {!track.existingWavName && "(required)"}</Label>
              <Input
                type="file"
                accept=".wav"
                onChange={(e) => updateTrack(index, "wavFile", e.target.files?.[0] || null)}
                required={!release && !track.existingWavName}
              />
              {track.existingWavName && !track.wavFile && (
                <p className="text-xs text-muted-foreground">
                  Current: {track.existingWavName}
                  {track.existingPreviewUrl && " (preview generated)"}
                </p>
              )}
              {!track.existingWavName && (
                <p className="text-xs text-muted-foreground">
                  A preview MP3 will be auto-generated from the WAV.
                </p>
              )}
              {track.wavFile && (
                <p className="text-xs text-muted-foreground">
                  New file selected — preview will be regenerated.
                </p>
              )}
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
              <span className="text-muted-foreground">
                {progress.current}/{progress.total}
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
          {loading ? "Saving..." : release ? "Update Release" : "Create Release"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
