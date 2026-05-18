/**
 * One-off R2 cleanup for the deprecated 128k preview MP3s.
 *
 * Lists every object under `audio/<slug>/<n>/previews/*` (the path the old
 * upload pipeline used for `-preview.mp3` files) and deletes them. Dry-run by
 * default — pass `--execute` to actually delete.
 *
 *   pnpm tsx scripts/delete-preview-files.ts            # list keys, no deletes
 *   pnpm tsx scripts/delete-preview-files.ts --execute  # actually delete
 */
import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const bucket = process.env.R2_BUCKET_NAME!;

async function* listAllUnderPrefix(prefix: string) {
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) yield obj.Key;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function main() {
  const execute = process.argv.includes("--execute");

  const previewKeys: string[] = [];
  for await (const key of listAllUnderPrefix("audio/")) {
    if (key.includes("/previews/")) previewKeys.push(key);
  }

  console.log(`Found ${previewKeys.length} preview objects under audio/*/previews/`);
  for (const k of previewKeys) console.log(`  ${k}`);

  if (previewKeys.length === 0) return;

  if (!execute) {
    console.log("\nDRY RUN — re-run with --execute to delete.");
    return;
  }

  // DeleteObjects accepts up to 1000 keys per request.
  let deleted = 0;
  for (let i = 0; i < previewKeys.length; i += 1000) {
    const batch = previewKeys.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += batch.length - (res.Errors?.length ?? 0);
    for (const err of res.Errors ?? []) {
      console.error(`  ✗ ${err.Key}: ${err.Code} ${err.Message}`);
    }
  }
  console.log(`\nDeleted ${deleted} / ${previewKeys.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
