import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CHANNELS } from "@/lib/types";

const templateSchema = z.object({
  key: z.string().min(2),
  channel: z.enum(CHANNELS),
  subject: z.string().optional(),
  bodyTemplate: z.string().min(1),
});

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }
  const templates = await prisma.notificationTemplate.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.notificationTemplate.findUnique({ where: { key: parsed.data.key } });
  if (existing) {
    return NextResponse.json({ error: "Key template sudah dipakai" }, { status: 409 });
  }

  const template = await prisma.notificationTemplate.create({
    data: { ...parsed.data, ownerId: user.id },
  });

  return NextResponse.json({ template }, { status: 201 });
}
