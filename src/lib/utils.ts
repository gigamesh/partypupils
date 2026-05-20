import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
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
 * Trim stray leading/trailing whitespace from a download filename while keeping
 * its extension intact. Some stored filenames carry accidental spaces (e.g.
 * " Track.wav" or "Track .wav") that would otherwise surface in downloads.
 */
export function cleanDownloadFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name.trim();
  return `${name.slice(0, dot).trim()}${name.slice(dot).trim()}`;
}
