import { parseYouTubeVideo, youTubeEmbedUrl } from "@/lib/youtube";

/** Renders an optional heading and an embedded YouTube video, sizing Shorts vertically and regular videos at 16:9. */
export function FaqVideo({ url, heading }: { url: string; heading?: string }) {
  const video = parseYouTubeVideo(url);
  if (!video) return null;

  return (
    <div className="space-y-3">
      {heading && <p className="text-sm font-medium">{heading}</p>}
      <div className={video.isShort ? "mx-auto w-full max-w-[320px]" : "w-full"}>
        <div
          className={`relative overflow-hidden rounded-lg border ${
            video.isShort ? "aspect-[9/16]" : "aspect-video"
          }`}
        >
          <iframe
            src={youTubeEmbedUrl(video)}
            title="FAQ video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
