import { Queue } from "bullmq";
import { redisConnection } from "./redis-connection";

export const NOTIFICATION_QUEUE_NAME = "notifications";
export const DLQ_QUEUE_NAME = "notifications-dlq";

const globalForQueue = globalThis as unknown as {
  notificationQueue: Queue | undefined;
  dlqQueue: Queue | undefined;
};

export function getNotificationQueue() {
  if (!globalForQueue.notificationQueue) {
    globalForQueue.notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: redisConnection,
    });
  }
  return globalForQueue.notificationQueue;
}

export function getDlqQueue() {
  if (!globalForQueue.dlqQueue) {
    globalForQueue.dlqQueue = new Queue(DLQ_QUEUE_NAME, {
      connection: redisConnection,
    });
  }
  return globalForQueue.dlqQueue;
}
