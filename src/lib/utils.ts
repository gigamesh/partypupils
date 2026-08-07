import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { AUDIO_FORMATS } from "./constants"
import { env } from "./env"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function getBaseUrl(): string {
  return env.NEXT_PUBLIC_BASE_URL();
}

/**
 * Comparator that puts download formats in their canonical display order
 * (`AUDIO_FORMATS`: MP3 before WAV). Unrecognized formats sort last, keeping
 * their relative order. Used so every page's download buttons read the same
 * regardless of the order files come back from the database.
 */
export function compareAudioFormats(a: string, b: string): number {
  const rank = (format: string) => {
    const i = (AUDIO_FORMATS as readonly string[]).indexOf(format.toLowerCase());
    return i === -1 ? AUDIO_FORMATS.length : i;
  };
  return rank(a) - rank(b);
}

/**
 * Trim stray leading/trailing whitespace from a download filename while keeping
 * its extension intact. Some stored filenames carry accidental spaces (e.g.
 * " Track.wav" or "Track .wav") that would otherwise surface in downloads.
 */
export function cleanDownloadFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name.trim();
  return `${name.slice(0, dot).trim()}${name.slice(dot).trim()}`;
}
