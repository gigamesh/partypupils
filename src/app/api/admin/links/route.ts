import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const links = await prisma.link.findMany({
    orderBy: { position: "asc" },
  });

  return NextResponse.json(links);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, url } = (await req.json()) as { title: string; url: string };

  const maxPosition = await prisma.link.aggregate({ _max: { position: true } });
  const link = await prisma.link.create({
    data: { title, url, position: (maxPosition._max.position ?? -1) + 1 },
  });

  return NextResponse.json(link);
}

export async function PUT(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, title, url, position, isVisible, showOnHero } =
    (await req.json()) as {
      id: number;
      title?: string;
      url?: string;
      position?: number;
      isVisible?: boolean;
      showOnHero?: boolean;
    };

  const link = await prisma.link.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(url !== undefined && { url }),
      ...(position !== undefined && { position }),
      ...(isVisible !== undefined && { isVisible }),
      ...(showOnHero !== undefined && { showOnHero }),
    },
  });

  return NextResponse.json(link);
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  await prisma.link.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
