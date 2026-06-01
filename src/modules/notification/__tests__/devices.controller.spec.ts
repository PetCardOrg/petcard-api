import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@petcardorg/shared';
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
