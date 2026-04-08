import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface DownloadZipButtonsProps {
  token: string;
  releaseId: number;
  availableFormats: string[];
}

export function DownloadZipButtons({ token, releaseId, availableFormats }: DownloadZipButtonsProps) {
  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => (
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
