import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { uploadFile, uploadBuffer } from "@/lib/storage";
import { generatePreview, convertToMp3 } from "@/lib/preview";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const prefix = (formData.get("prefix") as string) || "uploads";
  const autoPreview = formData.get("autoPreview") === "true";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const { url } = await uploadFile(file, `${prefix}/${file.name}`);

  let previewUrl: string | undefined;
  let mp3Url: string | undefined;

  if (autoPreview && file.name.toLowerCase().endsWith(".wav")) {
    const wavBuffer = Buffer.from(await file.arrayBuffer());

    const [previewResult, mp3Result] = await Promise.allSettled([
      (async () => {
        const previewBuffer = await generatePreview(wavBuffer);
        const previewName = file.name.replace(/\.wav$/i, "-preview.mp3");
        return uploadBuffer(previewBuffer, `${prefix}/previews/${previewName}`, "audio/mpeg");
      })(),
      (async () => {
        const mp3Buffer = await convertToMp3(wavBuffer, "320k");
        const mp3Name = file.name.replace(/\.wav$/i, ".mp3");
        return uploadBuffer(mp3Buffer, `${prefix}/${mp3Name}`, "audio/mpeg");
      })(),
    ]);

    if (previewResult.status === "fulfilled") {
      previewUrl = previewResult.value.url;
    } else {
      console.error("Preview generation failed:", previewResult.reason);
    }

    if (mp3Result.status === "fulfilled") {
      mp3Url = mp3Result.value.url;
    } else {
      console.error("MP3 generation failed:", mp3Result.reason);
    }
  }

  return NextResponse.json({ url, previewUrl, mp3Url });
}
