import { Logger } from '@nestjs/common';
import { AppointmentReminderService } from '../appointment-reminder.service';
import { DoseReminderService } from '../dose-reminder.service';
import { ReminderTriggerService } from '../reminder-trigger.service';

/** Instante em UTC; Fortaleza fica 3h atrás o ano todo (sem horário de verão). */
const utc = (iso: string) => new Date(`${iso}Z`);

describe('ReminderTriggerService', () => {
  let dose: { handleCron: jest.Mock };
  let appointment: { handleCron: jest.Mock };
  let service: ReminderTriggerService;

  beforeEach(() => {
    dose = { handleCron: jest.fn().mockResolvedValue(undefined) };
    appointment = { handleCron: jest.fn().mockResolvedValue(undefined) };
    service = new ReminderTriggerService(
      dose as unknown as DoseReminderService,
      appointment as unknown as AppointmentReminderService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('runAll roda os dois lembretes, cada um respeitando a própria flag', async () => {
    await service.runAll();

    expect(dose.handleCron).toHaveBeenCalledTimes(1);
    expect(appointment.handleCron).toHaveBeenCalledTimes(1);
  });

  it('runAll roda o de agendamento mesmo se o de dose falhar', async () => {
    dose.handleCron.mockRejectedValueOnce(new Error('db down'));

    await expect(service.runAll()).rejects.toThrow('db down');
    expect(appointment.handleCron).toHaveBeenCalledTimes(1);
  });

  describe('runOnBoot', () => {
    it('dispara quando o servidor acorda de dia (9h no fuso padrão)', async () => {
      await service.runOnBoot(utc('2026-10-29T12:00:00'));

      expect(dose.handleCron).toHaveBeenCalledTimes(1);
      expect(appointment.handleCron).toHaveBeenCalledTimes(1);
    });

    it('não dispara de madrugada: o disparo das 9h cobre', async () => {
      // 2h em Fortaleza: alguém abriu o app e acordou o servidor.
      await service.runOnBoot(utc('2026-10-29T05:00:00'));

      expect(dose.handleCron).not.toHaveBeenCalled();
      expect(appointment.handleCron).not.toHaveBeenCalled();
    });

    it('não dispara a partir das 21h', async () => {
      await service.runOnBoot(utc('2026-10-30T00:00:00'));

      expect(dose.handleCron).not.toHaveBeenCalled();
    });

    it('engole o erro: falha no lembrete não derruba o boot', async () => {
      dose.handleCron.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.runOnBoot(utc('2026-10-29T15:00:00')),
      ).resolves.toBeUndefined();
    });
  });
});
