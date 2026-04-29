import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();

  const data: { inRadio?: boolean } = {};
  if (typeof body.inRadio === "boolean") data.inRadio = body.inRadio;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }

  const track = await prisma.track.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json(track);
}
