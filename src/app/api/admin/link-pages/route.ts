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

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await prisma.linkPage.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      release: { select: { id: true, name: true, slug: true, coverImageUrl: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json(pages);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    title?: string;
    slug?: string;
    description?: string | null;
    releaseId?: number | null;
    coverImageUrl?: string | null;
    isPublished?: boolean;
  };

  const title = body.title?.trim();
  const slug = body.slug?.trim().toLowerCase();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: INVALID_SLUG_MESSAGE }, { status: 400 });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ error: RESERVED_SLUG_MESSAGE }, { status: 400 });
  }

  try {
    const page = await prisma.linkPage.create({
      data: {
        title,
        slug,
        description: body.description ?? null,
        releaseId: body.releaseId ?? null,
        coverImageUrl: body.coverImageUrl ?? null,
        isPublished: body.isPublished ?? true,
      },
    });
    revalidateTag(LINK_PAGES_TAG, "max");
    return NextResponse.json(page, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    throw err;
  }
}
