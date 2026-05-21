export interface YouTubeVideo {
  id: string;
  isShort: boolean;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Parses a raw string into a URL, tolerating a missing scheme by retrying with https://. */
function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  for (const candidate of [trimmed, `https://${trimmed}`]) {
    try {
      return new URL(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Validates a candidate video id and pairs it with whether the source URL was a Short. */
function toVideo(id: string | null | undefined, isShort: boolean): YouTubeVideo | null {
  return id && VIDEO_ID_RE.test(id) ? { id, isShort } : null;
}

/**
 * Extracts the video id from a YouTube watch, share, Shorts, or embed URL.
 * Returns null for anything that is not a recognizable YouTube video link.
 */
export function parseYouTubeVideo(url: string): YouTubeVideo | null {
  const parsed = toUrl(url);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return toVideo(segments[0], false);
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      return toVideo(parsed.searchParams.get("v"), false);
    }
    if (segments[0] === "shorts") {
      return toVideo(segments[1], true);
    }
    if (segments[0] === "embed" || segments[0] === "v") {
      return toVideo(segments[1], false);
    }
  }

  return null;
}

/** Builds the privacy-enhanced embed URL for a parsed YouTube video. */
export function youTubeEmbedUrl(video: YouTubeVideo): string {
  return `https://www.youtube-nocookie.com/embed/${video.id}`;
}
