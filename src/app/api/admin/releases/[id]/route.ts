import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { cleanupR2Objects, syncReleaseAndTracks, type TrackInput } from "@/lib/release-tracks";

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
  const incoming: TrackInput[] = Array.isArray(body.tracks) ? body.tracks : [];

  await syncReleaseAndTracks(
    releaseId,
    {
      name: body.name,
      slug: body.slug,
      description: body.description,
      price: body.price,
      type: body.type,
      coverImageUrl: body.coverImageUrl,
      releasedAt: body.releasedAt,
      isPublished: body.isPublished,
    },
    incoming,
  );

  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  return NextResponse.json(release);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);

  // Capture every R2 object referenced by this release before the cascade nukes the rows.
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { tracks: { include: { files: true } } },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const r2KeysToDelete: string[] = [
    ...(release.coverImageUrl ? [release.coverImageUrl] : []),
    ...release.tracks.flatMap((t) => [
      ...t.files.map((f) => f.storageKey),
      ...(t.previewUrl ? [t.previewUrl] : []),
    ]),
  ];

  await prisma.release.delete({ where: { id: releaseId } });

  if (r2KeysToDelete.length > 0) {
    await cleanupR2Objects(r2KeysToDelete);
  }

  return NextResponse.json({ ok: true });
}
