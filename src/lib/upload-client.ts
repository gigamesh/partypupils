/**
 * Presigns an upload via the admin presign endpoint, PUTs the file to the
 * returned URL, and resolves to the file's public URL. Browser-only.
 */
export async function presignAndUpload(file: File, key: string): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const presignRes = await fetch("/api/admin/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType }),
  });
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
