import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getNotificationQueue } from "@/lib/queue";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const notification = await prisma.notification.findUnique({ where: { id: params.id } });
  if (!notification || notification.ownerId !== user.id) {
    return NextResponse.json({ error: "Notifikasi tidak ditemukan" }, { status: 404 });
  }

  if (notification.status !== "DEAD_LETTER" && notification.status !== "FAILED") {
    return NextResponse.json({ error: "Hanya notifikasi FAILED/DEAD_LETTER yang bisa di-retry" }, { status: 400 });
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: "QUEUED",
      attempts: 0,
      lastError: null,
      events: { create: { status: "QUEUED", message: "Dikirim ulang secara manual oleh pengguna" } },
    },
  });

  const queue = getNotificationQueue();
  const job = await queue.add(
    "send-notification",
    { notificationId: notification.id },
    {
      attempts: notification.maxAttempts,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    }
  );

  await prisma.notification.update({ where: { id: notification.id }, data: { jobId: job.id } });

  return NextResponse.json({ ok: true });
}
