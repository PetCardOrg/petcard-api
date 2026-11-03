import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@petcardorg/shared';
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { TutorService } from '../../tutor/tutor.service';
import { DevicesController } from '../devices.controller';
import { NotificationService } from '../notification.service';

describe('DevicesController', () => {
  let controller: DevicesController;
  let notificationService: { registerDevice: jest.Mock };
  let tutorService: { findById: jest.Mock };

  beforeEach(async () => {
    notificationService = { registerDevice: jest.fn() };
    tutorService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [
        { provide: NotificationService, useValue: notificationService },
        { provide: TutorService, useValue: tutorService },
      ],
    }).compile();

    controller = module.get(DevicesController);
  });

  it('looks up tutor by id and forwards to NotificationService', async () => {
    tutorService.findById.mockResolvedValue({
      id: 'tutor-db-1',
    });
    notificationService.registerDevice.mockResolvedValue({ id: 'd1' });

    const result = await controller.register(
      { sub: 'tutor-db-1' },
      {
        token: 'fcm-token-abc',
        platform: DevicePlatform.IOS,
      },
    );

    expect(tutorService.findById).toHaveBeenCalledWith('tutor-db-1');
    expect(notificationService.registerDevice).toHaveBeenCalledWith(
      'tutor-db-1',
      { token: 'fcm-token-abc', platform: DevicePlatform.IOS },
    );
    expect(result).toEqual({ id: 'd1' });
  });
});

describe('DELETE /devices/:token (AUD API-23)', () => {
  let harness: ControllerHarness;
  const notificationService = { unregisterDevice: jest.fn() };

  beforeAll(async () => {
    harness = await createControllerTestApp({
      controllers: [DevicesController],
      providers: [
        { provide: NotificationService, useValue: notificationService },
        { provide: TutorService, useValue: {} },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    notificationService.unregisterDevice.mockResolvedValue(undefined);
  });

  it('descadastra o token em nome de quem está autenticado (204)', async () => {
    // Token FCM tem ":"; o app manda com encodeURIComponent.
    const token = 'abc:APA91b-x_y';

    await request(harness.app.getHttpServer())
      .delete(`/devices/${encodeURIComponent(token)}`)
      .expect(204);

    expect(notificationService.unregisterDevice).toHaveBeenCalledWith(
      'tutor-1',
      token,
    );
  });

  it('proíbe VET (403) e exige autenticação (401)', async () => {
    harness.setUser(VET);
    await request(harness.app.getHttpServer())
      .delete('/devices/abc')
      .expect(403);

    harness.setUser(null);
    await request(harness.app.getHttpServer())
      .delete('/devices/abc')
      .expect(401);

    expect(notificationService.unregisterDevice).not.toHaveBeenCalled();
  });
});
