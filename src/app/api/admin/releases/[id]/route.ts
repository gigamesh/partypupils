import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const { name, slug, description, price, type, coverImageUrl, isPublished, tracks } = body;

  const release = await prisma.release.update({
    where: { id: parseInt(id) },
    data: {
      name,
      slug,
      description,
      price,
      type,
      coverImageUrl,
      isPublished,
      ...(tracks && tracks.length > 0
        ? {
            tracks: {
              create: tracks.map((t: { name: string; price: number; trackNumber: number; files: { format: string; fileName: string; storageKey: string; fileSize: number }[] }) => ({
                name: t.name,
                price: t.price,
                trackNumber: t.trackNumber,
                files: { create: t.files },
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
