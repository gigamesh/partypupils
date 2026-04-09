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

  function handleClick(format: string) {
    setLoading(format);
    setTimeout(() => setLoading(null), 3000);
  }

  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => {
        const query = releaseId
          ? `releaseId=${releaseId}&format=${format}`
          : `trackIds=${trackIds!.join(",")}&format=${format}`;
        return (
          <a
            key={format}
            href={`/download/${token}/zip?${query}`}
            download
            onClick={() => handleClick(format)}
            className={cn(buttonVariants({ size: "sm", variant: "default" }))}
          >
            {loading === format ? (
              <><Loader2Icon className="h-4 w-4 animate-spin" /> Zipping</>
            ) : (
              `${format.toUpperCase()} ZIP`
            )}
          </a>
        );
      })}
    </div>
  );
}
