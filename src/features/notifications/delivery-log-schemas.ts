export type NotificationDeliveryStatus = "sent" | "failed" | "skipped";

export type NotificationDeliveryRecord = {
  provider: string;
  templateKey: string;
  recipientId: string;
  status: NotificationDeliveryStatus;
  error?: string;
};
