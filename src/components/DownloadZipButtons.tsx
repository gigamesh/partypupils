import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AUDIO_FORMATS } from "@/lib/constants";

interface DownloadZipButtonsProps {
  token: string;
  releaseId: number;
}

export function DownloadZipButtons({ token, releaseId }: DownloadZipButtonsProps) {
  return (
    <div className="flex gap-2">
      {AUDIO_FORMATS.map((format) => (
        <a
          key={format}
          href={`/download/${token}/zip?releaseId=${releaseId}&format=${format}`}
          className={cn(buttonVariants({ size: "sm", variant: "default" }))}
        >
          {format.toUpperCase()} ZIP
        </a>
      ))}
    </div>
  );
}
