import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.R2_BUCKET_NAME!;
const publicUrl = process.env.R2_PUBLIC_URL!;

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

/** Delete a file by its public URL (storageKey). */
export async function deleteFile(storageKey: string) {
  const key = storageKey.replace(`${publicUrl}/`, "");
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
