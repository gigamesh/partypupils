import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { LINK_PAGES_TAG } from "@/lib/cache-tags";
import {
  INVALID_SLUG_MESSAGE,
  RESERVED_SLUGS,
  RESERVED_SLUG_MESSAGE,
  SLUG_PATTERN,
  isUniqueConstraintError,
} from "@/lib/link-page-validation";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const page = await prisma.linkPage.findUnique({
    where: { id: Number(id) },
    include: {
      release: { select: { id: true, name: true, slug: true, coverImageUrl: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(page);
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    slug?: string;
    description?: string | null;
    releaseId?: number | null;
    coverImageUrl?: string | null;
    isPublished?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    data.title = title;
  }
  if (body.slug !== undefined) {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ error: INVALID_SLUG_MESSAGE }, { status: 400 });
    }
    if (RESERVED_SLUGS.has(slug)) {
      return NextResponse.json({ error: RESERVED_SLUG_MESSAGE }, { status: 400 });
    }
    data.slug = slug;
  }
  if (body.description !== undefined) data.description = body.description;
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
  if (body.isPublished !== undefined) data.isPublished = body.isPublished;

  try {
    const page = await prisma.linkPage.update({
      where: { id: Number(id) },
      data,
    });
    revalidateTag(LINK_PAGES_TAG, "max");
    return NextResponse.json(page);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.linkPage.delete({ where: { id: Number(id) } });
  revalidateTag(LINK_PAGES_TAG, "max");
  return NextResponse.json({ ok: true });
}
