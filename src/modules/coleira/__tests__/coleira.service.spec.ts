import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import type { SchedulePushInput } from '../../notification/notification.service';
import { ColeiraService } from '../coleira.service';

describe('ColeiraService', () => {
  let service: ColeiraService;
  let prisma: {
    tagColeira: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    pet: { findFirst: jest.Mock };
    petScan: { create: jest.Mock; findMany: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let notificationService: {
    schedulePush: jest.Mock<Promise<unknown[]>, [SchedulePushInput]>;
  };

  const petDaTag = { pet: { id: 'pet-1', name: 'Rex', tutorId: 'tutor-1' } };

  function scanCriado(overrides: Record<string, unknown> = {}) {
    return {
      id: 'scan-1',
      petId: 'pet-1',
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      createdAt: new Date('2026-09-07T12:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      tagColeira: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      pet: { findFirst: jest.fn() },
      petScan: { create: jest.fn(), findMany: jest.fn() },
    };
    configService = {
      get: jest.fn().mockReturnValue('https://card.petcard.app/#/achei'),
    };
    notificationService = {
      schedulePush: jest.fn<Promise<unknown[]>, [SchedulePushInput]>(),
    };
    notificationService.schedulePush.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ColeiraService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<ColeiraService>(ColeiraService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findPublicByToken', () => {
    // A razão de a coleira ter token próprio: se este teste quebrar, um
    // estranho na rua passou a enxergar o prontuário do pet.
    it('não expõe histórico clínico, só o que ajuda a devolver o pet', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue({
        pet: {
          id: 'pet-1',
          name: 'Rex',
          species: 'DOG',
          breed: 'Labrador',
          sex: 'MALE',
          photoUrl: 'https://s3/rex.png',
          tutor: { name: 'Alice', phone: '+55 85 99999-0000' },
        },
      });

      const result = await service.findPublicByToken('tok-abc');

      expect(result).toEqual({
        pet_id: 'pet-1',
        pet_name: 'Rex',
        species: 'DOG',
        breed: 'Labrador',
        sex: 'MALE',
        photo_url: 'https://s3/rex.png',
        tutor_name: 'Alice',
        tutor_phone: '+55 85 99999-0000',
      });
      expect(Object.keys(result)).not.toContain('vaccines');
      expect(Object.keys(result)).not.toContain('medications');
    });

    it('omite o telefone quando o tutor não cadastrou', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue({
        pet: {
          id: 'pet-1',
          name: 'Rex',
          species: 'DOG',
          breed: null,
          sex: 'MALE',
          photoUrl: null,
          tutor: { name: 'Alice', phone: null },
        },
      });

      const result = await service.findPublicByToken('tok-abc');

      expect(result.tutor_phone).toBeUndefined();
      expect(result.breed).toBeUndefined();
    });

    it('responde 404 para token inexistente', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(null);

      await expect(service.findPublicByToken('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('registrarLeitura', () => {
    it('grava a leitura e avisa o tutor com a localização', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(petDaTag);
      prisma.petScan.create.mockResolvedValue(
        scanCriado({ latitude: -3.73, longitude: -38.52, accuracyMeters: 12 }),
      );

      const result = await service.registrarLeitura('tok-abc', {
        latitude: -3.73,
        longitude: -38.52,
        accuracy_meters: 12,
      });

      expect(result).toMatchObject({ id: 'scan-1', latitude: -3.73 });
      const push = notificationService.schedulePush.mock.calls[0][0];
      expect(push.tutorId).toBe('tutor-1');
      expect(push.body).toContain('compartilhou');
    });

    it('avisa o tutor mesmo sem localização', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(petDaTag);
      prisma.petScan.create.mockResolvedValue(scanCriado());

      await service.registrarLeitura('tok-abc', {});

      const push = notificationService.schedulePush.mock.calls[0][0];
      expect(push.body).toContain('não compartilhou');
      expect(push.data).not.toHaveProperty('latitude');
    });

    it('manda coordenada como string — o FCM não transporta número no data', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(petDaTag);
      prisma.petScan.create.mockResolvedValue(
        scanCriado({ latitude: -3.73, longitude: -38.52 }),
      );

      await service.registrarLeitura('tok-abc', {
        latitude: -3.73,
        longitude: -38.52,
      });

      const { data } = notificationService.schedulePush.mock.calls[0][0];
      Object.values(data!).forEach((valor) =>
        expect(typeof valor).toBe('string'),
      );
    });

    it('mantém a leitura gravada quando o push falha', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(petDaTag);
      prisma.petScan.create.mockResolvedValue(scanCriado());
      notificationService.schedulePush.mockRejectedValue(
        new Error('fila fora'),
      );
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const result = await service.registrarLeitura('tok-abc', {});

      expect(result.id).toBe('scan-1');
    });

    it('não grava nada quando o token não existe', async () => {
      prisma.tagColeira.findUnique.mockResolvedValue(null);

      await expect(service.registrarLeitura('bad', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.petScan.create).not.toHaveBeenCalled();
    });
  });

  describe('listScansForTutor', () => {
    it('responde 404 para pet de outro tutor, sem consultar as leituras', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);

      await expect(
        service.listScansForTutor('pet-1', 'tutor-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petScan.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findTagForTutor', () => {
    it('monta a URL pública a partir da base da coleira', async () => {
      prisma.pet.findFirst.mockResolvedValue({
        tagColeira: { token: 'tok-abc', qrCodeUrl: 'https://s3/qr.png' },
      });

      const result = await service.findTagForTutor('pet-1', 'tutor-1');

      // Base da coleira, não a da carteira: apontar para /card exporia o
      // prontuário a quem lesse o QR da coleira.
      expect(result.public_url).toBe(
        'https://card.petcard.app/#/achei/tok-abc',
      );
      expect(result.qr_code_url).toBe('https://s3/qr.png');
    });

    it('responde 404 quando o pet ainda não tem tag gerada', async () => {
      prisma.pet.findFirst.mockResolvedValue({ tagColeira: null });

      await expect(service.findTagForTutor('pet-1', 'tutor-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
