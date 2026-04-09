"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

interface DownloadZipButtonsProps {
  token: string;
  releaseId?: number;
  trackIds?: number[];
  availableFormats: string[];
}

export function DownloadZipButtons({ token, releaseId, trackIds, availableFormats }: DownloadZipButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleDownload(format: string) {
    setLoading(format);
    try {
      const query = releaseId
        ? `releaseId=${releaseId}&format=${format}`
        : `trackIds=${trackIds!.join(",")}&format=${format}`;
      const res = await fetch(`/download/${token}/zip?${query}`);
      if (!res.ok) {
        setLoading(null);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `download.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
    setLoading(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {availableFormats.map((format) => (
          <button
            key={format}
            onClick={() => handleDownload(format)}
            disabled={loading !== null}
            className={cn(buttonVariants({ size: "sm", variant: "default" }))}
          >
            {loading === format ? (
              <><Loader2Icon className="h-4 w-4 animate-spin" /> Zipping</>
            ) : (
              `${format.toUpperCase()} ZIP`
            )}
          </button>
        ))}
      </div>
      {loading && (
        <p className="text-sm text-muted-foreground">
          Preparing your zip file — this may take a few minutes depending on the number of tracks.
        </p>
      )}
    </div>
  );
}
