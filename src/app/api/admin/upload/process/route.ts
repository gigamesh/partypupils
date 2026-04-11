import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getFileBuffer, uploadBuffer } from "@/lib/storage";
import { generatePreview, convertToMp3 } from "@/lib/preview";

export const maxDuration = 60;

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

  const wavBuffer = await getFileBuffer(key);

  const [previewResult, mp3Result] = await Promise.allSettled([
    (async () => {
      const previewBuffer = await generatePreview(wavBuffer);
      const previewKey = key.replace(/\.wav$/i, "-preview.mp3").replace(
        /^([^/]+\/[^/]+\/[^/]+)\//,
        "$1/previews/"
      );
      return uploadBuffer(previewBuffer, previewKey, "audio/mpeg");
    })(),
    (async () => {
      const mp3Buffer = await convertToMp3(wavBuffer, "320k");
      const mp3Key = key.replace(/\.wav$/i, ".mp3");
      return uploadBuffer(mp3Buffer, mp3Key, "audio/mpeg");
    })(),
  ]);

  const previewUrl =
    previewResult.status === "fulfilled" ? previewResult.value.url : undefined;
  const mp3Url =
    mp3Result.status === "fulfilled" ? mp3Result.value.url : undefined;

  if (previewResult.status === "rejected") {
    console.error("Preview generation failed:", previewResult.reason);
  }
  if (mp3Result.status === "rejected") {
    console.error("MP3 generation failed:", mp3Result.reason);
  }

  return NextResponse.json({ previewUrl, mp3Url });
}
