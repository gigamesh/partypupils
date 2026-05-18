import { cn } from "@/lib/utils";

export type LinkPlatform =
  | "spotify"
  | "apple"
  | "youtube"
  | "soundcloud"
  | "instagram"
  | "facebook"
  | "bandcamp"
  | "tiktok";

const HOSTNAME_PATTERNS: Array<{ platform: LinkPlatform; match: RegExp }> = [
  { platform: "spotify", match: /(^|\.)spotify\.com$|(^|\.)spotify\.link$/i },
  { platform: "apple", match: /(^|\.)music\.apple\.com$|(^|\.)apple\.co$/i },
  { platform: "youtube", match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i },
  { platform: "soundcloud", match: /(^|\.)soundcloud\.com$|(^|\.)snd\.sc$/i },
  { platform: "instagram", match: /(^|\.)instagram\.com$|(^|\.)instagr\.am$/i },
  { platform: "facebook", match: /(^|\.)facebook\.com$|(^|\.)fb\.com$/i },
  { platform: "bandcamp", match: /(^|\.)bandcamp\.com$/i },
  { platform: "tiktok", match: /(^|\.)tiktok\.com$/i },
];

/** Match a URL to a known streaming/social platform by hostname. Returns null when nothing matches. */
export function detectLinkPlatform(url: string): LinkPlatform | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const { platform, match } of HOSTNAME_PATTERNS) {
    if (match.test(host)) return platform;
  }
  return null;
}

/** Human-readable label for a platform; used as default button text suggestions. */
export const PLATFORM_LABELS: Record<LinkPlatform, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  instagram: "Instagram",
  facebook: "Facebook",
  bandcamp: "Bandcamp",
  tiktok: "TikTok",
};

const PLATFORM_PATHS: Record<Exclude<LinkPlatform, "soundcloud">, React.ReactNode> = {
  spotify: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.84.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 1 1-.28-1.18c3.7-.88 6.9-.5 9.5 1.04a.6.6 0 0 1 .22.84zm1.2-2.72a.78.78 0 0 1-1.06.26c-2.6-1.6-6.6-2.06-9.7-1.12a.78.78 0 1 1-.44-1.5c3.5-1.06 7.9-.54 10.94 1.3a.78.78 0 0 1 .26 1.06zm.1-2.84C14.6 8.8 9.5 8.6 6.4 9.56a.94.94 0 1 1-.54-1.8c3.5-1.06 9.4-.86 13.1 1.34a.94.94 0 0 1-.54 1.74z" />
  ),
  apple: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  youtube: (
    <>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
  instagram: (
    <>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>
  ),
  facebook: (
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  ),
  bandcamp: <path d="M3 17h11l7-10H10z" />,
  tiktok: (
    <path d="M16 3v3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.25V16a5 5 0 1 1-5-5h1v3.5h-1A1.5 1.5 0 1 0 12 16V3z" />
  ),
};

function SoundCloudGlyph({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 10000 4000"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <g transform="translate(0,7000) scale(1,-1)">
        <path d="M5610 6761 c-14 -5 -67 -14 -119 -21 -146 -19 -272 -56 -406 -120 -72 -35 -113 -61 -142 -93 -79 -85 -74 37 -71 -1703 3 -1742 -4 -1582 81 -1661 25 -23 62 -46 83 -52 54 -15 2926 -15 3043 -1 304 39 585 195 773 429 164 206 238 416 238 681 0 146 -15 240 -61 370 -122 348 -416 618 -775 710 -158 41 -348 46 -508 14 -71 -15 -85 -11 -86 23 0 35 -94 291 -139 382 -104 206 -200 338 -368 503 -165 163 -285 248 -498 353 -188 93 -345 142 -565 177 -82 13 -447 20 -480 9z" />
        <path d="M4367 6211 c-22 -26 -25 -43 -36 -187 -7 -88 -16 -213 -21 -279 -34 -431 -44 -702 -44 -1255 0 -567 8 -773 44 -1060 5 -41 14 -122 21 -180 11 -92 16 -108 40 -132 37 -37 81 -37 118 0 23 23 29 41 40 122 7 52 16 124 21 160 48 348 74 1187 50 1585 -4 66 -11 197 -14 290 -4 94 -9 177 -11 185 -2 8 -6 65 -10 125 -3 61 -8 130 -10 155 -3 25 -12 132 -20 238 -19 236 -29 261 -107 262 -28 0 -42 -7 -61 -29z" />
        <path d="M3242 5964 c-45 -31 -44 -20 -81 -509 -35 -453 -43 -655 -43 -1060 1 -395 11 -601 47 -945 31 -296 35 -315 77 -344 55 -39 124 -2 138 74 9 49 43 347 59 525 23 236 32 702 21 1035 -10 329 -15 407 -51 830 -30 352 -31 359 -63 387 -31 27 -72 30 -104 7z" />
        <path d="M3834 5893 c-44 -8 -66 -46 -75 -130 -13 -120 -28 -295 -46 -543 -21 -286 -25 -1261 -5 -1500 23 -287 50 -533 63 -567 17 -47 85 -69 134 -43 44 24 48 38 84 390 28 272 29 283 41 580 18 440 -6 1077 -60 1560 -5 47 -12 109 -15 138 -7 69 -19 90 -60 108 -19 8 -36 13 -37 13 -2 -1 -13 -4 -24 -6z" />
        <path d="M2662 5695 c-39 -33 -44 -59 -82 -495 -53 -617 -45 -1232 25 -1870 9 -74 18 -147 21 -162 7 -34 58 -78 90 -78 28 0 71 25 83 49 9 16 41 257 60 451 58 583 44 1349 -34 1945 -17 127 -30 160 -71 175 -40 15 -60 12 -92 -15z" />
        <path d="M1517 5179 c-30 -18 -44 -66 -66 -224 -65 -486 -65 -882 -1 -1455 33 -299 37 -310 120 -310 73 0 91 23 105 135 3 28 13 102 21 165 34 265 46 430 51 690 6 295 -3 458 -38 692 -33 225 -44 270 -74 295 -28 25 -86 30 -118 12z" />
      </g>
    </svg>
  );
}

interface PlatformIconProps {
  platform: LinkPlatform;
  size?: number;
  className?: string;
}

/** Inline SVG icon for a given platform. Inherits color via `currentColor`. */
export function PlatformIcon({ platform, size = 24, className }: PlatformIconProps) {
  if (platform === "soundcloud") {
    return (
      <span className={cn("inline-flex items-center justify-center", className)}>
        <SoundCloudGlyph size={size * 0.7} />
      </span>
    );
  }
  const path = PLATFORM_PATHS[platform];
  const dim = platform === "youtube" ? size * 1.2 : size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
