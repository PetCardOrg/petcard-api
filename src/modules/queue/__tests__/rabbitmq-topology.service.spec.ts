/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMqTopologyService } from '../rabbitmq-topology.service';
import {
  CALENDAR_SYNC_DLX,
  NOTIFICATION_PUSH_DLX,
  QR_CODE_DLX,
} from '../queue.constants';

const mockChannel = {
  assertExchange: jest.fn(),
  assertQueue: jest.fn(),
  bindQueue: jest.fn(),
  close: jest.fn(),
};
const mockConnection = {
  createChannel: jest.fn(),
  close: jest.fn(),
};
const mockConnect = jest.fn();

jest.mock('amqplib', () => ({
  connect: (url: string) => mockConnect(url),
}));

const config = {
  get: (key: string) =>
    (
      ({
        'rabbitmq.url': 'amqp://localhost:5672',
        'rabbitmq.qrCodeDlq': 'qr-code.dlq',
        'rabbitmq.notificationPushDlq': 'notification.push.dlq',
        'rabbitmq.calendarSyncDlq': 'calendar.sync.dlq',
      }) as Record<string, string>
    )[key],
} as unknown as ConfigService;

describe('RabbitMqTopologyService', () => {
  let service: RabbitMqTopologyService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannel.assertExchange.mockResolvedValue(undefined);
    mockChannel.assertQueue.mockResolvedValue(undefined);
    mockChannel.bindQueue.mockResolvedValue(undefined);
    mockChannel.close.mockResolvedValue(undefined);
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    mockConnection.close.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(mockConnection);
    service = new RabbitMqTopologyService(config);
  });

  it('declara as 3 DLX/DLQ e fecha canal e conexão', async () => {
    await service.onModuleInit();

    expect(mockConnect).toHaveBeenCalledWith('amqp://localhost:5672');

    const declaredExchanges = mockChannel.assertExchange.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(declaredExchanges).toEqual([
      QR_CODE_DLX,
      NOTIFICATION_PUSH_DLX,
      CALENDAR_SYNC_DLX,
    ]);

    const declaredQueues = mockChannel.assertQueue.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(declaredQueues).toEqual([
      'qr-code.dlq',
      'notification.push.dlq',
      'calendar.sync.dlq',
    ]);

    expect(mockChannel.bindQueue).toHaveBeenCalledTimes(3);
    expect(mockChannel.close).toHaveBeenCalledTimes(1);
    expect(mockConnection.close).toHaveBeenCalledTimes(1);
  });

  it('declara cada exchange como direct e durável', async () => {
    await service.onModuleInit();

    for (const call of mockChannel.assertExchange.mock.calls) {
      expect(call[1]).toBe('direct');
      expect(call[2]).toEqual({ durable: true });
    }
  });

  it('fecha a conexão mesmo se a topologia falhar', async () => {
    mockChannel.assertQueue.mockRejectedValueOnce(new Error('broker down'));

    await expect(service.onModuleInit()).rejects.toThrow('broker down');
    expect(mockConnection.close).toHaveBeenCalledTimes(1);
  });
});
