import {
  detectLinkPlatform as gigamusicDetectLinkPlatform,
  LinkPlatformIcon,
  PLATFORM_LABELS as GIGAMUSIC_PLATFORM_LABELS,
  type KnownLinkPlatform,
} from "@gigamusic/links";
import { cn } from "@/lib/utils";

// Party-pupils' legacy `LinkPlatform` union used "apple" (no "x"); the
// gigamusic package uses "apple-music" and adds "x". Map between the two so
// existing call sites keep working without churn.
export type LinkPlatform =
  | "spotify"
  | "apple"
  | "youtube"
  | "soundcloud"
  | "instagram"
  | "facebook"
  | "bandcamp"
  | "tiktok";

const GIGAMUSIC_TO_PARTY_PUPILS: Partial<Record<KnownLinkPlatform, LinkPlatform>> = {
  spotify: "spotify",
  "apple-music": "apple",
  youtube: "youtube",
  soundcloud: "soundcloud",
  instagram: "instagram",
  facebook: "facebook",
  bandcamp: "bandcamp",
  tiktok: "tiktok",
};

const PARTY_PUPILS_TO_GIGAMUSIC: Record<LinkPlatform, KnownLinkPlatform> = {
  spotify: "spotify",
  apple: "apple-music",
  youtube: "youtube",
  soundcloud: "soundcloud",
  instagram: "instagram",
  facebook: "facebook",
  bandcamp: "bandcamp",
  tiktok: "tiktok",
};

/** Match a URL to a known streaming/social platform by hostname. Returns null when nothing matches. */
export function detectLinkPlatform(url: string): LinkPlatform | null {
  const platform = gigamusicDetectLinkPlatform(url);
  if (!platform) return null;
  return GIGAMUSIC_TO_PARTY_PUPILS[platform] ?? null;
}

/** Human-readable label for a platform; used as default button text suggestions. */
export const PLATFORM_LABELS: Record<LinkPlatform, string> = {
  spotify: GIGAMUSIC_PLATFORM_LABELS.spotify,
  apple: GIGAMUSIC_PLATFORM_LABELS["apple-music"],
  youtube: GIGAMUSIC_PLATFORM_LABELS.youtube,
  soundcloud: GIGAMUSIC_PLATFORM_LABELS.soundcloud,
  instagram: GIGAMUSIC_PLATFORM_LABELS.instagram,
  facebook: GIGAMUSIC_PLATFORM_LABELS.facebook,
  bandcamp: GIGAMUSIC_PLATFORM_LABELS.bandcamp,
  tiktok: GIGAMUSIC_PLATFORM_LABELS.tiktok,
};

interface PlatformIconProps {
  platform: LinkPlatform;
  size?: number;
  className?: string;
}

/** Inline SVG icon for a given platform. Inherits color via `currentColor`. */
export function PlatformIcon({ platform, size = 24, className }: PlatformIconProps) {
  return (
    <LinkPlatformIcon
      platform={PARTY_PUPILS_TO_GIGAMUSIC[platform]}
      size={size}
      className={cn(className)}
    />
  );
}
