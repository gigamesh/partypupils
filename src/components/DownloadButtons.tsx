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

  function handleClick(format: string) {
    setLoading(format);
    setTimeout(() => setLoading(null), 3000);
  }

  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => (
        <a
          key={format}
          href={`/download/${token}?trackId=${trackId}&format=${format}`}
          download
          onClick={() => handleClick(format)}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          {loading === format ? (
            <><Loader2Icon className="h-4 w-4 animate-spin" /> Downloading</>
          ) : (
            format.toUpperCase()
          )}
        </a>
      ))}
    </div>
  );
}
