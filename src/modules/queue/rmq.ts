import type { Channel, ConsumeMessage } from 'amqplib';
import {
  CALENDAR_SYNC_CLIENT,
  CALENDAR_SYNC_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_CLIENT,
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  QR_CODE_CLIENT,
  QR_CODE_DLQ_ROUTING_KEY,
  RETRY_HEADER,
} from './queue.constants';

/**
 * As filas da API, com as chaves de configuração de cada uma. Fonte única para
 * o publicador (`queue.module.ts`), o consumidor (`main.ts`) e a topologia
 * de DLX/DLQ (`rabbitmq-topology.service.ts`).
 */
export const FILAS = [
  {
    client: QR_CODE_CLIENT,
    queue: 'rabbitmq.qrCodeQueue',
    dlx: 'rabbitmq.qrCodeDlx',
    dlq: 'rabbitmq.qrCodeDlq',
    dlqRoutingKey: QR_CODE_DLQ_ROUTING_KEY,
  },
  {
    client: NOTIFICATION_PUSH_CLIENT,
    queue: 'rabbitmq.notificationPushQueue',
    dlx: 'rabbitmq.notificationPushDlx',
    dlq: 'rabbitmq.notificationPushDlq',
    dlqRoutingKey: NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  },
  {
    client: CALENDAR_SYNC_CLIENT,
    queue: 'rabbitmq.calendarSyncQueue',
    dlx: 'rabbitmq.calendarSyncDlx',
    dlq: 'rabbitmq.calendarSyncDlq',
    dlqRoutingKey: CALENDAR_SYNC_DLQ_ROUTING_KEY,
  },
] as const;

/**
 * Parte comum das opções RMQ de uma fila com DLX/DLQ.
 *
 * Quem publica (`ClientsModule`, em `queue.module.ts`) e quem consome
 * (`connectMicroservice`, em `main.ts`) declaram a mesma fila; se os
 * argumentos divergirem, o RabbitMQ recusa a segunda declaração
 * (`PRECONDITION_FAILED`). Por isso saem daqui, e cada lado só acrescenta o
 * que é dele (`persistent` de um, `noAck`/`prefetchCount` do outro).
 */
export function rmqOptions(
  url: string,
  queue: string,
  dlx: string,
  dlqRoutingKey: string,
) {
  return {
    urls: [url],
    queue,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlx,
        'x-dead-letter-routing-key': dlqRoutingKey,
      },
    },
  };
}

export function getRetryCount(message: ConsumeMessage): number {
  const raw: unknown = message.properties.headers?.[RETRY_HEADER];
  return typeof raw === 'number' ? raw : 0;
}

/**
 * Republica a mensagem com o contador +1 ou, esgotadas as tentativas, a manda
 * para a DLQ (`nack` sem requeue). Os logs e o que fazer ao desistir ficam com
 * cada consumidor, nos ganchos.
 */
export async function retryOrDlq(
  channel: Channel,
  message: ConsumeMessage,
  maxRetries: number,
  hooks: {
    onRetry: (attempt: number) => void;
    onExhausted: () => void | Promise<void>;
  },
): Promise<void> {
  const retryCount = getRetryCount(message);

  if (retryCount < maxRetries) {
    hooks.onRetry(retryCount + 1);
    channel.publish('', message.fields.routingKey, message.content, {
      ...message.properties,
      headers: {
        ...message.properties.headers,
        [RETRY_HEADER]: retryCount + 1,
      },
    });
    channel.ack(message);
    return;
  }

  await hooks.onExhausted();
  channel.nack(message, false, false);
}
