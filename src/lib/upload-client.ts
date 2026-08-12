import { throwIfSessionExpired } from "./session-expired";

/**
 * Presigns an upload via the admin presign endpoint, PUTs the file to the
 * returned URL, and resolves to the file's public URL. Browser-only.
 */
export async function presignAndUpload(file: File, key: string): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  // `size` is advisory to the presign route's audio ceiling check — the upload
  // itself goes straight to R2, so this is the only point at which the server
  // can refuse an oversized file before it's spent minutes transferring.
  const presignRes = await fetch("/api/admin/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType, size: file.size }),
  });
  // Presign is the first admin call of a save, so an expired session surfaces
  // here first — as a 401 from the proxy gate, not an upload problem.
  throwIfSessionExpired(presignRes);
  if (!presignRes.ok) {
    const body = await presignRes.text();
    throw new Error(
      `Failed to get upload URL (${presignRes.status}) for key="${key}" contentType="${contentType}": ${body.slice(0, 300)}`,
    );
  }
  const { url, publicUrl } = await presignRes.json();

  const uploadRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Failed to upload file");

  return publicUrl;
}
