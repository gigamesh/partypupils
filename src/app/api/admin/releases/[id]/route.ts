import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

interface TrackInput {
  name: string;
  price: number;
  trackNumber: number;
  previewUrl?: string | null;
  files: { format: string; fileName: string; storageKey: string; fileSize: number }[];
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);
  const body = await req.json();
  const { name, slug, description, price, type, coverImageUrl, releasedAt, isPublished, tracks } = body;

  // Delete existing tracks (cascade deletes their files too)
  await prisma.track.deleteMany({ where: { releaseId } });

  const release = await prisma.release.update({
    where: { id: releaseId },
    data: {
      name,
      slug,
      description,
      price,
      type,
      coverImageUrl,
      releasedAt: releasedAt ? new Date(releasedAt) : null,
      isPublished,
      ...(tracks && tracks.length > 0
        ? {
            tracks: {
              create: (tracks as TrackInput[]).map((t) => ({
                name: t.name,
                price: t.price,
                trackNumber: t.trackNumber,
                previewUrl: t.previewUrl || null,
                files: t.files.length > 0 ? { create: t.files } : undefined,
              })),
            },
          }
        : {}),
    },
  });

  return NextResponse.json(release);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await prisma.release.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}
