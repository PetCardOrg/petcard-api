import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar.service';
import {
  eventoDesejado,
  HealthCalendarService,
} from '../health-calendar.service';

const pet = { name: 'Thor', tutorId: 'tutor-1' };

const vacina = {
  id: 'vac-1',
  vaccineName: 'V10',
  nextDoseAt: new Date('2026-11-20T00:00:00.000Z'),
  deletedAt: null as Date | null,
  pet,
};

describe('eventoDesejado', () => {
  it('vacina vira evento de dia inteiro na data da próxima dose', () => {
    expect(eventoDesejado('VACINA', vacina)).toMatchObject({
      titulo: expect.stringContaining('V10') as string,
      inicio: '2026-11-20',
      fim: '2026-11-21',
    });
  });

  it('vacina sem próxima dose ou apagada não tem evento', () => {
    expect(
      eventoDesejado('VACINA', { ...vacina, nextDoseAt: null }),
    ).toBeNull();
    expect(
      eventoDesejado('VACINA', { ...vacina, deletedAt: new Date() }),
    ).toBeNull();
  });

  it('medicação cobre o período do tratamento, com dose e frequência', () => {
    const evento = eventoDesejado('MEDICACAO', {
      medicationName: 'Amoxicilina',
      dosage: '250mg',
      frequency: 'a cada 12h',
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: new Date('2026-10-27T00:00:00.000Z'),
      deletedAt: null,
      pet,
    });

    // `fim` é exclusivo no Google: o último dia do tratamento entra.
    expect(evento).toMatchObject({ inicio: '2026-10-20', fim: '2026-10-28' });
    expect(evento?.descricao).toContain('250mg');
    expect(evento?.descricao).toContain('a cada 12h');
  });

  it('medicação de uso contínuo marca só o início', () => {
    const evento = eventoDesejado('MEDICACAO', {
      medicationName: 'Fenobarbital',
      dosage: '1 comprimido',
      frequency: '1x ao dia',
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: null,
      deletedAt: null,
      pet,
    });

    expect(evento).toMatchObject({ inicio: '2026-10-20', fim: '2026-10-21' });
    expect(evento?.descricao).toContain('Uso contínuo');
  });
});

describe('HealthCalendarService.reconcile', () => {
  let service: HealthCalendarService;
  let events: { insert: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let google: { getCalendarClient: jest.Mock };
  let prisma: {
    vaccineRecord: { findUnique: jest.Mock; findMany: jest.Mock };
    dewormingRecord: { findMany: jest.Mock };
    medicationRecord: { findMany: jest.Mock };
    tutor: { findUnique: jest.Mock };
    healthCalendarEvent: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const goneError = Object.assign(new Error('Not Found'), { code: 404 });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    events = {
      insert: jest.fn().mockResolvedValue({ data: { id: 'evt-novo' } }),
      update: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({}),
    };
    google = { getCalendarClient: jest.fn().mockResolvedValue({ events }) };
    prisma = {
      vaccineRecord: {
        findUnique: jest.fn().mockResolvedValue(vacina),
        findMany: jest.fn().mockResolvedValue([]),
      },
      dewormingRecord: { findMany: jest.fn().mockResolvedValue([]) },
      medicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tutor: { findUnique: jest.fn().mockResolvedValue({ timezone: null }) },
      healthCalendarEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new HealthCalendarService(
      prisma as unknown as PrismaService,
      google as unknown as GoogleCalendarService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('cria o evento e guarda o vínculo na primeira vez', async () => {
    await service.reconcile('VACINA', 'vac-1');

    expect(events.insert).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: expect.objectContaining({
        start: { date: '2026-11-20' },
        end: { date: '2026-11-21' },
      }) as object,
    });
    expect(prisma.healthCalendarEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          entidade: 'VACINA',
          registroId: 'vac-1',
          tutorId: 'tutor-1',
          googleEventId: 'evt-novo',
        },
      }),
    );
  });

  it('atualiza o evento existente em vez de duplicar', async () => {
    prisma.healthCalendarEvent.findUnique.mockResolvedValue({
      id: 'link-1',
      googleEventId: 'evt-1',
    });

    await service.reconcile('VACINA', 'vac-1');

    expect(events.update).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1' }),
    );
    expect(events.insert).not.toHaveBeenCalled();
  });

  it('recria o evento que o tutor apagou na agenda', async () => {
    prisma.healthCalendarEvent.findUnique.mockResolvedValue({
      id: 'link-1',
      googleEventId: 'evt-1',
    });
    events.update.mockRejectedValue(goneError);

    await service.reconcile('VACINA', 'vac-1');

    expect(events.insert).toHaveBeenCalled();
    expect(prisma.healthCalendarEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { googleEventId: 'evt-novo', tutorId: 'tutor-1' },
      }),
    );
  });

  it('apaga o evento quando o registro é apagado', async () => {
    prisma.vaccineRecord.findUnique.mockResolvedValue({
      ...vacina,
      deletedAt: new Date(),
    });
    prisma.healthCalendarEvent.findUnique.mockResolvedValue({
      id: 'link-1',
      googleEventId: 'evt-1',
    });

    await service.reconcile('VACINA', 'vac-1');

    expect(events.delete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-1',
    });
    expect(prisma.healthCalendarEvent.delete).toHaveBeenCalledWith({
      where: { id: 'link-1' },
    });
  });

  it('não faz nada se o tutor não conectou o Google Agenda', async () => {
    google.getCalendarClient.mockResolvedValue(null);

    await service.reconcile('VACINA', 'vac-1');

    expect(events.insert).not.toHaveBeenCalled();
    expect(prisma.healthCalendarEvent.upsert).not.toHaveBeenCalled();
  });

  it('erro do Google sobe para o consumer decidir o retry', async () => {
    events.insert.mockRejectedValue(new Error('503'));

    await expect(service.reconcile('VACINA', 'vac-1')).rejects.toThrow('503');
    expect(prisma.healthCalendarEvent.upsert).not.toHaveBeenCalled();
  });

  it('catch-up ao conectar só busca o que ainda vai acontecer', async () => {
    prisma.vaccineRecord.findMany.mockResolvedValue([{ id: 'vac-1' }]);

    const total = await service.syncAllForTutor('tutor-1');

    expect(total).toBe(1);
    expect(prisma.vaccineRecord.findMany).toHaveBeenCalledWith({
      where: {
        pet: { tutorId: 'tutor-1' },
        deletedAt: null,
        nextDoseAt: { gte: expect.any(Date) as Date },
      },
      select: { id: true },
    });
  });
});
