"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";

interface TrackInput {
  name: string;
  priceStr: string;
  trackNumber: number;
  mp3File: File | null;
  wavFile: File | null;
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
    isPublished: boolean;
  };
}

export function ReleaseForm({ release }: ReleaseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(release?.name || "");
  const [slug, setSlug] = useState(release?.slug || "");
  const [description, setDescription] = useState(release?.description || "");
  const [priceStr, setPriceStr] = useState(
    release ? (release.price / 100).toFixed(2) : ""
  );
  const [type, setType] = useState(release?.type || "single");
  const [isPublished, setIsPublished] = useState(release?.isPublished || false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [tracks, setTracks] = useState<TrackInput[]>([
    { name: "", priceStr: "1.99", trackNumber: 1, mp3File: null, wavFile: null },
  ]);

  function addTrack() {
    setTracks((prev) => [
      ...prev,
      { name: "", priceStr: "1.99", trackNumber: prev.length + 1, mp3File: null, wavFile: null },
    ]);
  }

  function removeTrack(index: number) {
    setTracks((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, trackNumber: i + 1 })));
  }

  function updateTrack(index: number, field: keyof TrackInput, value: string | File | null) {
    setTracks((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("prefix", prefix);
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    return data.url;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price <= 0) {
        setError("Please enter a valid release price.");
        setLoading(false);
        return;
      }

      let coverImageUrl = release?.coverImageUrl || null;
      if (coverImage) {
        coverImageUrl = await uploadFile(coverImage, "images/covers");
      }

      const trackData = await Promise.all(
        tracks.map(async (track) => {
          const trackPrice = Math.round(parseFloat(track.priceStr) * 100);
          const files: { format: string; fileName: string; storageKey: string; fileSize: number }[] = [];

          if (track.mp3File) {
            const url = await uploadFile(track.mp3File, `audio/${slug}/${track.trackNumber}/mp3`);
            files.push({ format: "mp3", fileName: track.mp3File.name, storageKey: url, fileSize: track.mp3File.size });
          }
          if (track.wavFile) {
            const url = await uploadFile(track.wavFile, `audio/${slug}/${track.trackNumber}/wav`);
            files.push({ format: "wav", fileName: track.wavFile.name, storageKey: url, fileSize: track.wavFile.size });
          }

          return {
            name: track.name,
            price: trackPrice,
            trackNumber: track.trackNumber,
            files,
          };
        })
      );

      const body = {
        name,
        slug,
        description: description || null,
        price,
        type,
        coverImageUrl,
        isPublished,
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
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
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
        <Label htmlFor="cover">Cover Image</Label>
        <Input id="cover" type="file" accept="image/*" onChange={(e) => setCoverImage(e.target.files?.[0] || null)} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Tracks</Label>
          <Button type="button" variant="outline" size="sm" onClick={addTrack}>
            Add Track
          </Button>
        </div>

        {tracks.map((track, index) => (
          <div key={index} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Track {track.trackNumber}</span>
              {tracks.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeTrack(index)}>
                  Remove
                </Button>
              )}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>MP3</Label>
                <Input type="file" accept=".mp3" onChange={(e) => updateTrack(index, "mp3File", e.target.files?.[0] || null)} />
              </div>
              <div className="space-y-1">
                <Label>WAV</Label>
                <Input type="file" accept=".wav" onChange={(e) => updateTrack(index, "wavFile", e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input id="published" type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4" />
        <Label htmlFor="published">Published</Label>
      </div>

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
