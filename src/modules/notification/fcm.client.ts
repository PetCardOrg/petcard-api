import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmSendResult {
  messageId?: string;
  errorCode?: string;
}

@Injectable()
export class FcmClient implements OnModuleInit {
  private readonly logger = new Logger(FcmClient.name);
  private app?: admin.app.App;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.enabled = this.config.get<boolean>('firebase.enabled') ?? false;

    if (!this.enabled) {
      this.logger.warn('FCM disabled (FCM_ENABLED=false); send() will no-op');
      return;
    }

    const projectId = this.config.get<string>('firebase.projectId')!;
    const clientEmail = this.config.get<string>('firebase.clientEmail')!;
    const privateKey = this.config.get<string>('firebase.privateKey')!;

    this.app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    this.logger.log(`Firebase Admin initialized for project ${projectId}`);
  }

  async send(token: string, payload: FcmPayload): Promise<FcmSendResult> {
    if (!this.enabled || !this.app) {
      this.logger.debug(
        `FCM disabled — skipping send to token ${token.slice(0, 12)}…`,
      );
      return {};
    }

    try {
      const messageId = await admin.messaging(this.app).send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
      return { messageId };
    } catch (error) {
      const errorCode = this.extractErrorCode(error);
      this.logger.error(
        `FCM send failed for token ${token.slice(0, 12)}… (code=${errorCode})`,
        error instanceof Error ? error.stack : error,
      );
      return { errorCode };
    }
  }

  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(error.code);
    }
    return 'unknown';
  }
}
