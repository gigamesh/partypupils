import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, description, price, type, coverImageUrl, isPublished, files } = body;

  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      name,
      slug,
      description,
      price,
      type,
      coverImageUrl,
      isPublished,
      files: {
        create: files || [],
      },
    },
  });

  return NextResponse.json(product, { status: 201 });
}
