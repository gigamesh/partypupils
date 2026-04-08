"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

interface DownloadButtonsProps {
  token: string;
  trackId: number;
  availableFormats: string[];
}

export function DownloadButtons({ token, trackId, availableFormats }: DownloadButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleDownload(format: string) {
    setLoading(format);
    try {
      const res = await fetch(`/download/${token}?trackId=${trackId}&format=${format}`);
      if (!res.ok) {
        setLoading(null);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `download.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
    setLoading(null);
  }

  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => (
        <button
          key={format}
          onClick={() => handleDownload(format)}
          disabled={loading !== null}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          {loading === format ? (
            <><Loader2Icon className="h-4 w-4 animate-spin" /> Downloading</>
          ) : (
            format.toUpperCase()
          )}
        </button>
      ))}
    </div>
  );
}
