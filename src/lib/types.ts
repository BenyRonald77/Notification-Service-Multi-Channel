export const CHANNELS = ["EMAIL", "WHATSAPP", "PUSH"] as const;
export type Channel = (typeof CHANNELS)[number];

export const NOTIFICATION_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "SENT",
  "FAILED",
  "DEAD_LETTER",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
