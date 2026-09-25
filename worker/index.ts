import "dotenv/config";
import { Worker, Job } from "bullmq";
import { redisConnection } from "../src/lib/redis-connection";
import { NOTIFICATION_QUEUE_NAME, getDlqQueue } from "../src/lib/queue";
import { prisma } from "../src/lib/prisma";
import { sendEmail } from "../src/lib/channels/email-sender";
import { sendWhatsapp } from "../src/lib/channels/whatsapp-sender";
import { sendPush } from "../src/lib/channels/push-sender";

async function dispatch(channel: string, recipient: string, subject: string | null, body: string) {
  switch (channel) {
    case "EMAIL":
      return sendEmail(recipient, subject, body);
    case "WHATSAPP":
      return sendWhatsapp(recipient, body);
    case "PUSH":
      return sendPush(recipient, body);
    default:
      throw new Error(`Channel tidak dikenal: ${channel}`);
  }
}

const worker = new Worker(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job) => {
    const { notificationId } = job.data as { notificationId: string };
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new Error(`Notifikasi ${notificationId} tidak ditemukan`);
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        events: {
          create: {
            status: "PROCESSING",
            message: `Percobaan ke-${job.attemptsMade + 1}`,
          },
        },
      },
    });

    await dispatch(notification.channel, notification.recipient, notification.subject, notification.body);

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        events: { create: { status: "SENT", message: "Berhasil dikirim" } },
      },
    });
  },
  { connection: redisConnection, concurrency: 5 }
);

worker.on("failed", async (job, error) => {
  if (!job) return;
  const { notificationId } = job.data as { notificationId: string };
  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: isFinalAttempt ? "DEAD_LETTER" : "FAILED",
      lastError: error.message,
      events: {
        create: {
          status: isFinalAttempt ? "DEAD_LETTER" : "FAILED",
          message: error.message,
        },
      },
    },
  });

  if (isFinalAttempt) {
    const dlq = getDlqQueue();
    await dlq.add("dead-letter", {
      notificationId,
      failedAt: new Date().toISOString(),
      reason: error.message,
    });
    console.error(`[worker] Notifikasi ${notificationId} masuk Dead Letter Queue: ${error.message}`);
  } else {
    console.warn(`[worker] Percobaan ${job.attemptsMade} gagal untuk notifikasi ${notificationId}, akan dicoba lagi`);
  }
});

worker.on("completed", (job) => {
  console.log(`[worker] Notifikasi ${job.data.notificationId} berhasil dikirim`);
});

console.log("[worker] Notification worker berjalan, menunggu pekerjaan...");
