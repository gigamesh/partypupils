export const SITE_NAME = "Party Pupils";
export const SITE_DESCRIPTION =
  "Music by Party Pupils — buy and download tracks and releases.";

export const DOWNLOAD_TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours
export const DOWNLOAD_TOKEN_EXPIRY_HOURS = 72;
export const DOWNLOAD_TOKEN_MAX = 10;

export const DEFAULT_CURRENCY = "usd";
export const AUDIO_FORMATS = ["mp3", "wav"] as const;

export const SEATED_ARTIST_ID = "f5bd3ef2-2234-4972-8124-93f835758465";
export const SEATED_WIDGET_ID = "seated-55fdf2c0";

export const MERCH_URL =
  "https://partypupils.threadless.com/designs/party-pupils";

export const SOCIAL_LINKS = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/PartyPupilsmusic/",
    icon: "facebook",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/partypupils/",
    icon: "instagram",
  },
  {
    name: "Spotify",
    href: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt",
    icon: "spotify",
  },
  {
    name: "SoundCloud",
    href: "https://soundcloud.com/partypupils",
    icon: "soundcloud",
  },
  {
    name: "Apple Music",
    href: "https://music.apple.com/us/artist/party-pupils/1158467787?app=itunes",
    icon: "apple",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/c/partypupils",
    icon: "youtube",
  },
] as const;

export const STREAMING_LINKS = [
  {
    name: "Apple Music",
    href: "https://music.apple.com/us/artist/party-pupils/1158467787?app=itunes",
  },
  {
    name: "Spotify",
    href: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt",
  },
  { name: "SoundCloud", href: "https://soundcloud.com/partypupils" },
] as const;
