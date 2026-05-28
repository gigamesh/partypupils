import { createR2Provider } from "@gigamusic/storage";
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

/**
 * Exposed `StorageProvider` accessor so route handlers can hand the same
 * singleton to `@gigamusic/checkout` and `@gigamusic/admin` factories
 * without each one building its own R2 client. Mirrors `emailProvider()`.
 */
export function storageProvider() {
  return provider();
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

/** Delete a file by its public URL (storageKey). */
export async function deleteFile(storageKey: string) {
  await provider().deleteFile(storageKey);
}
