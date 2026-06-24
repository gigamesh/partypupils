import * as audio from "@gigamusic/audio";
import { deriveTrackArtistTitle } from "@gigamusic/audio";
import { retagTrackFiles, type RetagFile } from "@gigamusic/admin/server";
import { queries } from "./db";
import { storageProvider } from "./storage";

/** A release joined with its tracks and their stored files. */
type SavedRelease = {
  name: string;
  coverImageUrl: string | null;
  releasedAt: Date | null;
  tracks: {
    id: number;
    name: string;
    artist: string | null;
    genre: string | null;
    trackNumber: number | null;
    files: { format: string; fileName: string; storageKey: string }[];
  }[];
};

/**
 * Rewrite the authoritative ID3/RIFF tags (and embed the release cover art)
 * onto every already-uploaded track file after a release save, in place and
 * without re-transcoding. This is the save-time counterpart to the provisional
 * tagging done at upload — the admin form is the source of truth for
 * title/artist/album, so we re-stamp the files whenever the release is saved.
 *
 * Best-effort: `retagTrackFiles` swallows per-file failures (stale metadata is
 * non-fatal and must never roll back a save), and we additionally guard the
 * whole call so an unexpected throw can't fail the request.
 */
export async function retagReleaseFiles(release: SavedRelease | null | undefined): Promise<void> {
  if (!release) return;

  const trackTotal = release.tracks.length;
  const year = release.releasedAt ? release.releasedAt.getFullYear() : undefined;

  const files: RetagFile[] = release.tracks.flatMap((track) => {
    const { artist, title } = deriveTrackArtistTitle(track.name, track.artist);
    return track.files.map((file) => ({
      trackId: track.id,
      format: file.format as RetagFile["format"],
      storageKey: file.storageKey,
      fileName: file.fileName,
      // `albumArtist` is intentionally omitted — the package never writes TPE2.
      tags: {
        title,
        artist,
        album: release.name,
        trackNumber: track.trackNumber ?? undefined,
        trackTotal,
        genre: track.genre ?? undefined,
        date: year != null ? String(year) : undefined,
      },
    }));
  });

  if (files.length === 0) return;

  try {
    await retagTrackFiles(
      { queries, storage: storageProvider(), audio },
      { files, coverImageUrl: release.coverImageUrl ?? undefined },
    );
  } catch (err) {
    console.error("retagReleaseFiles failed", err);
  }
}
