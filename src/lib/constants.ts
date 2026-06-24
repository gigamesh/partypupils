export const SITE_NAME = "Party Pupils";
// Stable site identifier stamped onto Stripe session metadata so the webhook
// only records orders belonging to this deployment. Must stay consistent
// between the checkout and webhook handlers; never rename once live.
export const SITE_ALIAS = "party-pupils";
export const SITE_DESCRIPTION =
  "Music by Party Pupils — download tracks and releases.";

export const DEFAULT_CURRENCY = "usd";
export const AUDIO_FORMATS = ["mp3", "wav"] as const;

export const CATALOG_DISCOUNT_KEY = "catalog_discount_percent";
export const DEFAULT_DISCOUNT_PERCENT = 15;

export const SEATED_ARTIST_ID = "f5bd3ef2-2234-4972-8124-93f835758465";
export const SEATED_WIDGET_ID = "seated-55fdf2c0";

export const MERCH_URL = "https://party-pupils-shop.fourthwall.com";

export const SOCIAL_LINKS = [
  {
    name: "YouTube",
    href: "https://www.youtube.com/c/partypupils",
    icon: "youtube",
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
    name: "Apple Music",
    href: "https://music.apple.com/us/artist/party-pupils/1158467787?app=itunes",
    icon: "apple",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/PartyPupilsmusic/",
    icon: "facebook",
  },
  {
    name: "SoundCloud",
    href: "https://soundcloud.com/partypupils",
    icon: "soundcloud",
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
