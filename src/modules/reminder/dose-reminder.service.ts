import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface DueRecord {
  id: string;
  petId: string;
  nextDoseAt: Date | null;
  lastNotifiedAt: Date | null;
  pet: { name: string; tutorId: string };
}

@Injectable()
export class DoseReminderService {
  private readonly logger = new Logger(DoseReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'dose-reminder',
    timeZone: 'America/Fortaleza',
  })
  async handleCron(): Promise<void> {
    if (!this.config.get<boolean>('reminder.enabled')) {
      this.logger.debug('Dose reminder cron disabled; skipping run');
      return;
    }
    await this.runDoseReminders();
  }

  /**
   * Scans vaccine, deworming and medication records whose next dose (ou, para
   * medicação, o início do tratamento) falls within the reminder window and
   * schedules a single push per record. Idempotent via `lastNotifiedAt`: a
   * record is re-notified only once its current dose window opens, so a vet
   * setting a new future dose triggers a fresh push.
   */
  async runDoseReminders(): Promise<{
    vaccine: number;
    deworming: number;
    medication: number;
  }> {
    const windowDays = this.config.get<number>('reminder.windowDays') ?? 3;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * DAY_MS);

    const vaccine = await this.processVaccineReminders(
      now,
      windowEnd,
      windowDays,
    );
    const deworming = await this.processDewormingReminders(
      now,
      windowEnd,
      windowDays,
    );
    const medication = await this.processMedicationReminders(
      now,
      windowEnd,
      windowDays,
    );

    this.logger.log(
      `Dose reminders: ${vaccine} vaccine + ${deworming} deworming + ${medication} medication notification(s) scheduled`,
    );
    return { vaccine, deworming, medication };
  }

  private async processVaccineReminders(
    now: Date,
    windowEnd: Date,
    windowDays: number,
  ): Promise<number> {
    const records = await this.prisma.vaccineRecord.findMany({
      // Registro excluído não gera lembrete (api#117).
      where: { nextDoseAt: { gte: now, lte: windowEnd }, deletedAt: null },
      include: { pet: { select: { name: true, tutorId: true } } },
    });

    let scheduled = 0;
    for (const record of records) {
      if (!this.isDue(record, windowDays)) continue;
      const label = this.describe(record, `vacina`);
      const delivered = await this.notify(
        record,
        'VACCINE_RECORD',
        'Vacina chegando',
        label,
      );
      if (delivered) {
        await this.prisma.vaccineRecord.update({
          where: { id: record.id },
          data: { lastNotifiedAt: new Date() },
        });
        scheduled++;
      }
    }
    return scheduled;
  }

  private async processDewormingReminders(
    now: Date,
    windowEnd: Date,
    windowDays: number,
  ): Promise<number> {
    const records = await this.prisma.dewormingRecord.findMany({
      where: { nextDoseAt: { gte: now, lte: windowEnd }, deletedAt: null },
      include: { pet: { select: { name: true, tutorId: true } } },
    });

    let scheduled = 0;
    for (const record of records) {
      if (!this.isDue(record, windowDays)) continue;
      const label = this.describe(record, `vermifugo`);
      const delivered = await this.notify(
        record,
        'DEWORMING_RECORD',
        'Vermifugo chegando',
        label,
      );
      if (delivered) {
        await this.prisma.dewormingRecord.update({
          where: { id: record.id },
          data: { lastNotifiedAt: new Date() },
        });
        scheduled++;
      }
    }
    return scheduled;
  }

  /**
   * Lembrete de medicação (api#111): um único aviso quando o tratamento
   * começa, não um aviso recorrente por dose — `startDate` faz o papel de
   * `nextDoseAt` para reaproveitar `isDue`/`notify` sem duplicar a lógica.
   */
  private async processMedicationReminders(
    now: Date,
    windowEnd: Date,
    windowDays: number,
  ): Promise<number> {
    const records = await this.prisma.medicationRecord.findMany({
      where: { startDate: { gte: now, lte: windowEnd }, deletedAt: null },
      include: { pet: { select: { name: true, tutorId: true } } },
    });

    let scheduled = 0;
    for (const record of records) {
      const dueRecord: DueRecord = {
        id: record.id,
        petId: record.petId,
        nextDoseAt: record.startDate,
        lastNotifiedAt: record.lastNotifiedAt,
        pet: record.pet,
      };
      if (!this.isDue(dueRecord, windowDays)) continue;

      const date = record.startDate.toLocaleDateString('pt-BR', {
        timeZone: 'America/Fortaleza',
      });
      const label = `${record.pet.name}: inicio do tratamento com ${record.medicationName} previsto para ${date}.`;
      const delivered = await this.notify(
        dueRecord,
        'MEDICATION_RECORD',
        'Medicacao chegando',
        label,
      );
      if (delivered) {
        await this.prisma.medicationRecord.update({
          where: { id: record.id },
          data: { lastNotifiedAt: new Date() },
        });
        scheduled++;
      }
    }
    return scheduled;
  }

  /** True when the record has not yet been notified for its current dose. */
  private isDue(record: DueRecord, windowDays: number): boolean {
    if (!record.nextDoseAt) return false;
    if (!record.lastNotifiedAt) return true;
    const windowStart = new Date(
      record.nextDoseAt.getTime() - windowDays * DAY_MS,
    );
    return record.lastNotifiedAt < windowStart;
  }

  private describe(record: DueRecord, kind: string): string {
    const date = record.nextDoseAt!.toLocaleDateString('pt-BR', {
      timeZone: 'America/Fortaleza',
    });
    return `${record.pet.name}: proxima dose de ${kind} prevista para ${date}.`;
  }

  /** Schedules the push; returns true when at least one device was targeted. */
  private async notify(
    record: DueRecord,
    referenceType: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    const notifications = await this.notificationService.schedulePush({
      tutorId: record.pet.tutorId,
      kind: NotificationKind.DOSE_REMINDER,
      referenceType,
      referenceId: record.id,
      title,
      body,
      data: { reference_type: referenceType, reference_id: record.id },
    });
    return notifications.length > 0;
  }
}
