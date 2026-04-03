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
  const { name, slug, description, price, type, coverImageUrl, isPublished, files } = body;

  const product = await prisma.product.update({
    where: { id: parseInt(id) },
    data: {
      name,
      slug,
      description,
      price,
      type,
      coverImageUrl,
      isPublished,
      ...(files && files.length > 0
        ? { files: { create: files } }
        : {}),
    },
  });

  return NextResponse.json(product);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await prisma.product.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}
