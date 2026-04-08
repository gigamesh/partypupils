import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, description, price, type, coverImageUrl, releasedAt, isPublished, tracks } = body;

  const existing = await prisma.release.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
  }

  const release = await prisma.release.create({
    data: {
      name,
      slug,
      description,
      price,
      type,
      coverImageUrl,
      releasedAt: releasedAt ? new Date(releasedAt) : null,
      isPublished,
      tracks: {
        create: (tracks || []).map((t: { name: string; price: number; trackNumber: number; previewUrl?: string; files: { format: string; fileName: string; storageKey: string; fileSize: number }[] }) => ({
          name: t.name,
          price: t.price,
          trackNumber: t.trackNumber,
          previewUrl: t.previewUrl || null,
          files: { create: t.files },
        })),
      },
    },
  });

  return NextResponse.json(release, { status: 201 });
}
