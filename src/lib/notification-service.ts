import { prisma } from "./prisma";
import type { Channel } from "./types";
import { getNotificationQueue } from "./queue";

export function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => variables[key] ?? match);
}

export interface EnqueueInput {
  ownerId: string;
  channel: Channel;
  recipient: string;
  templateKey?: string;
  variables?: Record<string, string>;
  subject?: string;
  body?: string;
  maxAttempts?: number;
}

export async function enqueueNotification(input: EnqueueInput) {
  let subject = input.subject ?? null;
  let body = input.body ?? "";
  let templateId: string | null = null;

  if (input.templateKey) {
    const template = await prisma.notificationTemplate.findUnique({
      where: { key: input.templateKey },
    });
    if (!template) {
      throw new Error(`Template dengan key "${input.templateKey}" tidak ditemukan`);
    }
    templateId = template.id;
    const variables = input.variables ?? {};
    subject = template.subject ? renderTemplate(template.subject, variables) : subject;
    body = renderTemplate(template.bodyTemplate, variables);
  }

  if (!body) {
    throw new Error("Body notifikasi tidak boleh kosong");
  }

  const maxAttempts = input.maxAttempts ?? Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 5);

  const notification = await prisma.notification.create({
    data: {
      ownerId: input.ownerId,
      channel: input.channel,
      recipient: input.recipient,
      subject,
      body,
      maxAttempts,
      templateId,
      events: {
        create: { status: "QUEUED", message: "Notifikasi dibuat dan dimasukkan ke antrean" },
      },
    },
  });

  const queue = getNotificationQueue();
  const job = await queue.add(
    "send-notification",
    { notificationId: notification.id },
    {
      attempts: maxAttempts,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    }
  );

  await prisma.notification.update({
    where: { id: notification.id },
    data: { jobId: job.id },
  });

  return notification;
}
