import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { verifyAdminSession } from "@/lib/admin-auth";
import { generatePreview } from "@/lib/preview";

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

  const blob = await put(`${prefix}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  let previewUrl: string | undefined;

  if (autoPreview && file.name.toLowerCase().endsWith(".wav")) {
    try {
      const wavBuffer = Buffer.from(await file.arrayBuffer());
      const previewBuffer = await generatePreview(wavBuffer);
      const previewName = file.name.replace(/\.wav$/i, "-preview.mp3");
      const previewBlob = await put(`${prefix}/previews/${previewName}`, previewBuffer, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      previewUrl = previewBlob.url;
    } catch (err) {
      console.error("Preview generation failed:", err);
      // Continue without preview — WAV upload still succeeds
    }
  }

  return NextResponse.json({ url: blob.url, previewUrl });
}
