import { createR2Provider } from "@gigamusic/storage";
import type { Readable } from "stream";
import { env } from "./env";

let _provider: ReturnType<typeof createR2Provider> | undefined;
function provider() {
  if (!_provider) {
    _provider = createR2Provider({
      accountId: env.R2_ACCOUNT_ID(),
      accessKeyId: env.R2_ACCESS_KEY_ID(),
      secretAccessKey: env.R2_SECRET_ACCESS_KEY(),
      bucket: env.R2_BUCKET_NAME(),
      publicUrl: env.R2_PUBLIC_URL(),
    });
  }
  return _provider;
}

/** Strip the R2 public-URL prefix from a stored URL to recover the bare object key. */
export function keyFromPublicUrl(url: string): string {
  return provider().keyFromPublicUrl(url);
}

/** Upload a File object and return its public URL. */
export async function uploadFile(
  file: File,
  pathname: string,
): Promise<{ url: string; storageKey: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return provider().uploadBuffer(
    buffer,
    pathname,
    file.type || "application/octet-stream",
  );
}

/** Upload a raw buffer and return its public URL. */
export async function uploadBuffer(
  buffer: Buffer,
  pathname: string,
  contentType: string,
): Promise<{ url: string; storageKey: string }> {
  return provider().uploadBuffer(buffer, pathname, contentType);
}

/** Generate a presigned PUT URL for direct browser-to-R2 uploads. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<{ url: string; publicUrl: string }> {
  return provider().getPresignedUploadUrl(key, {
    contentType,
    expiresInSeconds: 600,
  });
}

/**
 * Generate a presigned GET URL with response-header overrides so a 302
 * redirect to it triggers a same-tab download with the right filename and
 * MIME type. Accepts the public URL (storageKey, what the DB stores) and
 * strips the bucket prefix the same way `deleteFile` does.
 */
export async function getPresignedDownloadUrl(
  storageKey: string,
  { filename, contentType }: { filename: string; contentType: string },
): Promise<string> {
  return provider().getPresignedDownloadUrl(storageKey, {
    filename,
    contentType,
    expiresInSeconds: 600,
  });
}

/** Download a file from R2 as a Buffer. */
export async function getFileBuffer(key: string): Promise<Buffer> {
  return provider().getFileBuffer(key);
}

/** Open a streaming read from R2. Caller must consume or destroy the returned stream. */
export async function getFileStream(key: string): Promise<Readable> {
  return provider().getFileStream(key);
}

/**
 * Upload a Readable stream to R2 using a multipart upload (lib-storage), so the
 * total size doesn't have to be known up front. Returns the public URL.
 */
export async function uploadStream(
  stream: Readable,
  pathname: string,
  contentType: string,
): Promise<{ url: string; storageKey: string }> {
  return provider().uploadStream(stream, pathname, contentType);
}

/** Delete a file by its public URL (storageKey). */
export async function deleteFile(storageKey: string) {
  await provider().deleteFile(storageKey);
}
