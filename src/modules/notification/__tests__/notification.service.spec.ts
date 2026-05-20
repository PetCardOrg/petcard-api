import { Test, TestingModule } from '@nestjs/testing';
import { NotificationKind } from '@prisma/client';
import { DevicePlatform } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationPushPublisher } from '../../queue/notification-push.publisher';
import { NotificationService } from '../notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: {
    deviceToken: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    notification: { create: jest.Mock };
  };
  let publisher: { publish: jest.Mock };

  beforeEach(async () => {
    prisma = {
      deviceToken: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      notification: { create: jest.fn() },
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationPushPublisher, useValue: publisher },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  describe('registerDevice', () => {
    it('upserts the token with current tutor', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);
      prisma.deviceToken.upsert.mockResolvedValue({ id: 'd1' });

      await service.registerDevice('tutor-1', {
        token: 'fcm-token-abc',
        platform: DevicePlatform.IOS,
      });

      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'fcm-token-abc' },
          create: {
            tutorId: 'tutor-1',
            token: 'fcm-token-abc',
            platform: DevicePlatform.IOS,
          },
        }),
      );
    });

    it('warns and reattributes when token belongs to another tutor', async () => {
      const warnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => {});
      prisma.deviceToken.findUnique.mockResolvedValue({
        id: 'd1',
        tutorId: 'tutor-OLD',
        token: 'fcm-token-abc',
        platform: DevicePlatform.ANDROID,
      });
      prisma.deviceToken.upsert.mockResolvedValue({ id: 'd1' });

      await service.registerDevice('tutor-NEW', {
        token: 'fcm-token-abc',
        platform: DevicePlatform.ANDROID,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'reattributed from tutor tutor-OLD to tutor-NEW',
        ),
      );
    });
  });

  describe('schedulePush', () => {
    it('returns empty when tutor has no device tokens', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([]);

      const result = await service.schedulePush({
        tutorId: 'tutor-1',
        kind: NotificationKind.DOSE_REMINDER,
        referenceType: 'VACCINE_RECORD',
        referenceId: 'vac-1',
        title: 'Vacina',
        body: 'Hora da próxima dose',
      });

      expect(result).toEqual([]);
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('creates a notification and publishes per device token', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([
        { token: 't1', platform: DevicePlatform.IOS },
        { token: 't2', platform: DevicePlatform.ANDROID },
      ]);
      prisma.notification.create
        .mockResolvedValueOnce({ id: 'n1' })
        .mockResolvedValueOnce({ id: 'n2' });

      const result = await service.schedulePush({
        tutorId: 'tutor-1',
        kind: NotificationKind.DOSE_REMINDER,
        referenceType: 'VACCINE_RECORD',
        referenceId: 'vac-1',
        title: 'Vacina',
        body: 'Hora da próxima dose',
        data: { vaccine_id: 'vac-1' },
      });

      expect(result).toHaveLength(2);
      expect(publisher.publish).toHaveBeenCalledTimes(2);
      expect(publisher.publish).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          notification_id: 'n1',
          device_token: 't1',
          kind: NotificationKind.DOSE_REMINDER,
        }),
      );
    });

    it('keeps the notification PENDING when publish fails', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 't1' }]);
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      publisher.publish.mockRejectedValueOnce(new Error('rmq down'));
      jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

      const result = await service.schedulePush({
        tutorId: 'tutor-1',
        kind: NotificationKind.APPOINTMENT_REMINDER,
        referenceType: 'APPOINTMENT',
        referenceId: 'apt-1',
        title: 'Consulta',
        body: 'Em 1h',
        metadata: { tier: '1h' },
      });

      expect(result).toHaveLength(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });
});
