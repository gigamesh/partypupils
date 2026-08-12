import type { NextRequest } from "next/server";
import { createAdminUploadPresignHandler } from "@gigamusic/admin/server";
import { storageProvider } from "@/lib/storage";
import {
  oversizeAudioMessage,
  type LimitedAudioFormat,
} from "@/lib/upload-limits";

const handler = createAdminUploadPresignHandler({ storage: storageProvider() });

/** Audio format implied by a storage key's extension, or null for non-audio. */
function audioFormatOfKey(key: string): LimitedAudioFormat | null {
  if (/\.wav$/i.test(key)) return "wav";
  if (/\.mp3$/i.test(key)) return "mp3";
  return null;
}

/**
 * Refuse an audio upload that would exceed what the server-side paths can
 * process, before the client spends minutes pushing bytes to R2.
 *
 * The size is self-reported by the browser and never enforced by R2 — a
 * presigned PUT accepts whatever it's given. This is a fast-failure
 * convenience for the admin, not a security control; the real ceilings are the
 * `/tmp` limits documented in `upload-limits.ts`.
 */
function oversizeError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { key, size } = body as { key?: unknown; size?: unknown };
  if (typeof key !== "string" || typeof size !== "number") return null;
  const format = audioFormatOfKey(key);
  if (!format) return null;
  const fileName = key.slice(key.lastIndexOf("/") + 1);
  return oversizeAudioMessage(fileName, size, format);
}

export async function POST(req: NextRequest) {
  // Read the size off a clone — the package handler parses the body itself,
  // and a consumed stream would surface as a spurious "key is required".
  let error: string | null = null;
  try {
    error = oversizeError(await req.clone().json());
  } catch {
    // Malformed JSON is the package handler's error to report, not ours.
  }
  if (error) {
    return Response.json({ error }, { status: 413 });
  }
  return handler(req);
}
