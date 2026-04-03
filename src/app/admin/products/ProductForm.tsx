"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";

interface ProductFormProps {
  product?: {
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

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(product?.name || "");
  const [slug, setSlug] = useState(product?.slug || "");
  const [description, setDescription] = useState(product?.description || "");
  const [priceStr, setPriceStr] = useState(
    product ? (product.price / 100).toFixed(2) : ""
  );
  const [type, setType] = useState(product?.type || "track");
  const [isPublished, setIsPublished] = useState(product?.isPublished || false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null);

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
        setError("Please enter a valid price.");
        setLoading(false);
        return;
      }

      let coverImageUrl = product?.coverImageUrl || null;
      if (coverImage) {
        coverImageUrl = await uploadFile(coverImage, `images/covers`);
      }

      const audioFileUploads: { format: string; fileName: string; storageKey: string; fileSize: number }[] = [];
      if (audioFiles) {
        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          const format = file.name.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
          const url = await uploadFile(file, `audio/${slug}/${format}`);
          audioFileUploads.push({
            format,
            fileName: file.name,
            storageKey: url,
            fileSize: file.size,
          });
        }
      }

      const body = {
        name,
        slug,
        description: description || null,
        price,
        type,
        coverImageUrl,
        isPublished,
        files: audioFileUploads,
      };

      const url = product
        ? `/api/admin/products/${product.id}`
        : "/api/admin/products";

      const res = await fetch(url, {
        method: product ? "PUT" : "POST",
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!product) setSlug(slugify(e.target.value));
          }}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price (USD)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="track">Track</option>
            <option value="release">Release</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cover">Cover Image</Label>
        <Input
          id="cover"
          type="file"
          accept="image/*"
          onChange={(e) => setCoverImage(e.target.files?.[0] || null)}
        />
        {product?.coverImageUrl && (
          <p className="text-xs text-muted-foreground">
            Current: {product.coverImageUrl.split("/").pop()}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="audio">Audio Files (MP3, WAV)</Label>
        <Input
          id="audio"
          type="file"
          accept=".mp3,.wav"
          multiple
          onChange={(e) => setAudioFiles(e.target.files)}
        />
        <p className="text-xs text-muted-foreground">
          {product
            ? "Upload new files to add to existing ones."
            : "Select MP3 and WAV files."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="published"
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="published">Published</Label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : product ? "Update Product" : "Create Product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
