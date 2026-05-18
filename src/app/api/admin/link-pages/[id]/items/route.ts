import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { LINK_PAGES_TAG } from "@/lib/cache-tags";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const pageId = Number(id);
  const { title, url } = (await req.json()) as { title?: string; url?: string };

  if (!title?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "Title and URL are required" }, { status: 400 });
  }

  const max = await prisma.linkPageItem.aggregate({
    where: { pageId },
    _max: { position: true },
  });
  const item = await prisma.linkPageItem.create({
    data: {
      pageId,
      title: title.trim(),
      url: url.trim(),
      position: (max._max.position ?? -1) + 1,
    },
  });
  revalidateTag(LINK_PAGES_TAG, "max");
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const pageId = Number(id);
  const body = (await req.json()) as {
    itemId: number;
    title?: string;
    url?: string;
    position?: number;
    isVisible?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.url !== undefined) data.url = body.url;
  if (body.position !== undefined) data.position = body.position;
  if (body.isVisible !== undefined) data.isVisible = body.isVisible;

  const item = await prisma.linkPageItem.update({
    where: { id: body.itemId, pageId },
    data,
  });
  revalidateTag(LINK_PAGES_TAG, "max");
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const pageId = Number(id);
  const { searchParams } = new URL(req.url);
  const itemId = Number(searchParams.get("itemId"));
  await prisma.linkPageItem.delete({ where: { id: itemId, pageId } });
  revalidateTag(LINK_PAGES_TAG, "max");
  return NextResponse.json({ ok: true });
}
