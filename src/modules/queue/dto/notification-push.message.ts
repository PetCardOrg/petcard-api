import { NotificationKind } from '@prisma/client';

export interface NotificationPushMessage {
  notification_id: string;
  tutor_id: string;
  device_token: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Record<string, string>;
}
