import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import { env } from "./env";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID()}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY(),
  },
  // AWS SDK v3 began auto-adding x-amz-checksum-crc32 to PUT requests in late-2024.
  // For presigned URLs this bakes the checksum of an *empty* body into the URL —
  // R2 then rejects the actual upload with BadDigest. Restrict checksums to ops
  // that explicitly need them.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const bucket = env.R2_BUCKET_NAME();
const publicUrl = env.R2_PUBLIC_URL();

/** Strip the R2 public-URL prefix from a stored URL to recover the bare object key. */
export function keyFromPublicUrl(url: string): string {
  return url.replace(`${publicUrl}/`, "");
}

/** Upload a File object and return its public URL. */
export async function uploadFile(
  file: File,
  pathname: string
): Promise<{ url: string; storageKey: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    })
  );
  const url = `${publicUrl}/${pathname}`;
  return { url, storageKey: url };
}

/** Upload a raw buffer and return its public URL. */
export async function uploadBuffer(
  buffer: Buffer,
  pathname: string,
  contentType: string
): Promise<{ url: string; storageKey: string }> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const url = `${publicUrl}/${pathname}`;
  return { url, storageKey: url };
}

/** Generate a presigned PUT URL for direct browser-to-R2 uploads. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<{ url: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { url, publicUrl: `${publicUrl}/${key}` };
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
  const key = keyFromPublicUrl(storageKey);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 600 });
}

/** Download a file from R2 as a Buffer. */
export async function getFileBuffer(key: string): Promise<Buffer> {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  return Buffer.from(await Body!.transformToByteArray());
}

/** Open a streaming read from R2. Caller must consume or destroy the returned stream. */
export async function getFileStream(key: string): Promise<Readable> {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  // The SDK returns the Node stream as Readable on Node runtimes.
  return Body as Readable;
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
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: pathname,
      Body: stream,
      ContentType: contentType,
    },
  });
  await upload.done();
  const url = `${publicUrl}/${pathname}`;
  return { url, storageKey: url };
}

/** Delete a file by its public URL (storageKey). */
export async function deleteFile(storageKey: string) {
  const key = keyFromPublicUrl(storageKey);
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
