import { throwIfSessionExpired } from "./session-expired";

/** Bytes transferred so far out of the total, for an in-flight upload. */
export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Presigns an upload via the admin presign endpoint, PUTs the file to the
 * returned URL, and resolves to the file's public URL. Browser-only.
 *
 * A DJ mix runs to a couple hundred MB, which is minutes of transfer on a
 * typical upstream connection, so `onProgress` exists to keep the admin form
 * from looking hung. That is also why the PUT goes through `XMLHttpRequest`
 * rather than `fetch`: `fetch` has no upload-progress hook at all — its
 * `Response.body` stream covers the download direction only, and request
 * streaming (`duplex: "half"`) is Chromium-only. `xhr.upload` is the one
 * portable way to observe bytes leaving the browser.
 */
export async function presignAndUpload(
  file: File,
  key: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
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

  await putWithProgress(url, file, contentType, onProgress);

  return publicUrl;
}

/** PUT `file` to a presigned URL, reporting upload progress as it goes. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        // `lengthComputable` is false for the brief window before the request
        // body is measured; reporting a 0/0 there would flash an empty bar.
        if (event.lengthComputable) {
          onProgress({ loaded: event.loaded, total: event.total });
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Failed to upload file (${xhr.status})`));
    });
    // A dropped connection mid-transfer lands here with no status at all —
    // there's no resume, so the whole file has to go again.
    xhr.addEventListener("error", () => reject(new Error("Failed to upload file")));
    xhr.addEventListener("abort", () => reject(new Error("Failed to upload file")));

    xhr.send(file);
  });
}
