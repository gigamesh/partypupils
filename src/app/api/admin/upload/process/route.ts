import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getFileStream, uploadStream } from "@/lib/storage";
import { convertWavStreamToMp3 } from "@/lib/preview";

export const maxDuration = 300;

function describeError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

async function transcodeAndUpload(
  sourceKey: string,
  outputKey: string,
  bitrate: string,
): Promise<{ url: string; storageKey: string }> {
  const wavStream = await getFileStream(sourceKey);
  const mp3Stream = convertWavStreamToMp3(wavStream, bitrate);
  return uploadStream(mp3Stream, outputKey, "audio/mpeg");
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await req.json();

  if (!key || !key.endsWith(".wav")) {
    return NextResponse.json(
      { error: "A .wav storage key is required" },
      { status: 400 }
    );
  }

  const previewKey = key
    .replace(/\.wav$/i, "-preview.mp3")
    .replace(/^([^/]+\/[^/]+\/[^/]+)\//, "$1/previews/");
  const mp3Key = key.replace(/\.wav$/i, ".mp3");

  // Two independent R2 GETs let us run both encodes in parallel without
  // buffering the WAV. Each pipes R2 → ffmpeg → R2 multipart upload.
  const [previewResult, mp3Result] = await Promise.allSettled([
    transcodeAndUpload(key, previewKey, "128k"),
    transcodeAndUpload(key, mp3Key, "320k"),
  ]);

  const previewUrl =
    previewResult.status === "fulfilled" ? previewResult.value.url : undefined;
  const mp3Url =
    mp3Result.status === "fulfilled" ? mp3Result.value.url : undefined;

  const previewError =
    previewResult.status === "rejected" ? describeError(previewResult.reason) : undefined;
  const mp3Error =
    mp3Result.status === "rejected" ? describeError(mp3Result.reason) : undefined;

  if (previewResult.status === "rejected") {
    console.error("Preview generation failed:", previewResult.reason);
  }
  if (mp3Result.status === "rejected") {
    console.error("MP3 generation failed:", mp3Result.reason);
  }

  if (!previewUrl && !mp3Url) {
    return NextResponse.json(
      { error: "Transcoding failed", previewError, mp3Error },
      { status: 500 }
    );
  }

  return NextResponse.json({ previewUrl, mp3Url, previewError, mp3Error });
}
