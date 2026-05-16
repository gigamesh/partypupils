"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

interface DownloadButtonsProps {
  token: string;
  trackId: number;
  availableFormats: string[];
}

export function DownloadButtons({ token, trackId, availableFormats }: DownloadButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function handleClick(format: string) {
    setLoading(format);
    setTimeout(() => setLoading(null), 3000);
  }

  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => (
        <Button
          key={format}
          href={`/download/${token}?trackId=${trackId}&format=${format}`}
          download
          prefetch={false}
          size="sm"
          variant="secondary"
          onClick={() => handleClick(format)}
        >
          {loading === format ? (
            <><Loader2Icon className="h-4 w-4 animate-spin" /> Downloading</>
          ) : (
            format.toUpperCase()
          )}
        </Button>
      ))}
    </div>
  );
}
