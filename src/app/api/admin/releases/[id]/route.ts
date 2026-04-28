import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { syncReleaseAndTracks, type TrackInput } from "@/lib/release-tracks";

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
  await prisma.release.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}
