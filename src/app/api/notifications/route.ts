import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { enqueueNotification } from "@/lib/notification-service";
import { CHANNELS, NOTIFICATION_STATUSES } from "@/lib/types";

const sendSchema = z.object({
  channel: z.enum(CHANNELS),
  recipient: z.string().min(1),
  templateKey: z.string().optional(),
  variables: z.record(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan (X-Api-Key atau login)" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.templateKey && !parsed.data.body) {
    return NextResponse.json({ error: "Isi 'body' atau 'templateKey' harus disertakan" }, { status: 400 });
  }

  try {
    const notification = await enqueueNotification({ ownerId: user.id, ...parsed.data });
    return NextResponse.json({ notification }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengantrekan notifikasi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = NOTIFICATION_STATUSES.includes(statusParam as never) ? statusParam : undefined;

  const notifications = await prisma.notification.findMany({
    where: { ownerId: user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { template: { select: { key: true } } },
  });

  return NextResponse.json({ notifications });
}
