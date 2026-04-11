import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getPresignedUploadUrl } from "@/lib/storage";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key, contentType } = await req.json();

  if (!key || !contentType) {
    return NextResponse.json(
      { error: "key and contentType are required" },
      { status: 400 }
    );
  }

  const result = await getPresignedUploadUrl(key, contentType);
  return NextResponse.json(result);
}
