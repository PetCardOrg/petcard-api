import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_TIMEZONE,
  formatDateInTimeZone,
} from '../../common/time/timezone';
import { NotificationService } from '../notification/notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Modelos que carregam `lastNotifiedAt` e entram na varredura de doses. */
type ReminderModel = 'vaccineRecord' | 'dewormingRecord' | 'medicationRecord';

interface DueRecord {
  id: string;
  petId: string;
  nextDoseAt: Date | null;
  lastNotifiedAt: Date | null;
  pet: { name: string; tutorId: string; tutor: { timezone: string } };
}

/** `pet` como todo `findMany` daqui precisa: dono, nome e fuso do tutor. */
const PET_SELECT = {
  select: {
    name: true,
    tutorId: true,
    tutor: { select: { timezone: true } },
  },
} as const;

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
    timeZone: DEFAULT_TIMEZONE,
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
   *
   * Cada processo roda o próprio `@Cron`, e a Fase 2 da M7 sobe mais de uma
   * task no ECS: sem coordenação, duas instâncias acordam às 9h, selecionam o
   * mesmo conjunto e mandam o push antes de qualquer uma marcar
   * `lastNotifiedAt` — o tutor recebe duplicado. Por isso o registro é
   * *reivindicado* antes do envio (ver `claim`).
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
      include: { pet: PET_SELECT },
    });

    let scheduled = 0;
    for (const record of records) {
      const enviado = await this.notifyOnce(
        'vaccineRecord',
        record,
        windowDays,
        now,
        'VACCINE_RECORD',
        'Vacina chegando',
        () => this.describe(record, 'vacina'),
      );
      if (enviado) scheduled++;
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
      include: { pet: PET_SELECT },
    });

    let scheduled = 0;
    for (const record of records) {
      const enviado = await this.notifyOnce(
        'dewormingRecord',
        record,
        windowDays,
        now,
        'DEWORMING_RECORD',
        'Vermifugo chegando',
        () => this.describe(record, 'vermifugo'),
      );
      if (enviado) scheduled++;
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
      include: { pet: PET_SELECT },
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

      const enviado = await this.notifyOnce(
        'medicationRecord',
        dueRecord,
        windowDays,
        now,
        'MEDICATION_RECORD',
        'Medicacao chegando',
        () => {
          const date = formatDateInTimeZone(
            record.startDate,
            record.pet.tutor.timezone,
          );
          return `${record.pet.name}: inicio do tratamento com ${record.medicationName} previsto para ${date}.`;
        },
      );
      if (enviado) scheduled++;
    }
    return scheduled;
  }

  /**
   * Reivindica o registro, envia o push e devolve se o aviso saiu.
   *
   * A reivindicação vem antes do envio de propósito: é ela que decide, no
   * banco, qual instância manda o push. Se o tutor não tem device token, nada
   * foi enviado e a marca é desfeita — senão o lembrete daquela janela sumiria
   * para quem registrasse um aparelho no mesmo dia.
   */
  private async notifyOnce(
    model: ReminderModel,
    record: DueRecord,
    windowDays: number,
    now: Date,
    referenceType: string,
    title: string,
    body: () => string,
  ): Promise<boolean> {
    if (!this.isDue(record, windowDays)) return false;
    if (!(await this.claim(model, record, windowDays, now))) {
      this.logger.debug(
        `Lembrete de ${record.id} já reivindicado por outra instância; pulando`,
      );
      return false;
    }

    let delivered = false;
    try {
      delivered = await this.notify(record, referenceType, title, body());
    } finally {
      if (!delivered) await this.release(model, record);
    }
    return delivered;
  }

  /**
   * Marca `lastNotifiedAt` condicionado a o registro ainda estar pendente.
   *
   * `updateMany` com a mesma condição do `isDue` é o claim: o UPDATE é atômico
   * no Postgres, então de duas instâncias que enxergaram o mesmo registro só
   * uma vê `count = 1` e segue para o push. A outra vê `0` e desiste. Foi a
   * opção escolhida em vez de advisory lock ou eleição de executor: não precisa
   * de tabela nem de migration, não deixa lock pendurado se a task morrer no
   * meio, e reparte o trabalho entre as instâncias em vez de deixar uma ociosa.
   */
  private async claim(
    model: ReminderModel,
    record: DueRecord,
    windowDays: number,
    now: Date,
  ): Promise<boolean> {
    const where = { id: record.id, ...this.pendingWhere(record, windowDays) };
    const data = { lastNotifiedAt: now };

    switch (model) {
      case 'vaccineRecord': {
        const { count } = await this.prisma.vaccineRecord.updateMany({
          where,
          data,
        });
        return count > 0;
      }
      case 'dewormingRecord': {
        const { count } = await this.prisma.dewormingRecord.updateMany({
          where,
          data,
        });
        return count > 0;
      }
      case 'medicationRecord': {
        const { count } = await this.prisma.medicationRecord.updateMany({
          where,
          data,
        });
        return count > 0;
      }
    }
  }

  /** Devolve `lastNotifiedAt` ao valor anterior quando o push não saiu. */
  private async release(
    model: ReminderModel,
    record: DueRecord,
  ): Promise<void> {
    const args = {
      where: { id: record.id },
      data: { lastNotifiedAt: record.lastNotifiedAt },
    };

    switch (model) {
      case 'vaccineRecord':
        await this.prisma.vaccineRecord.update(args);
        return;
      case 'dewormingRecord':
        await this.prisma.dewormingRecord.update(args);
        return;
      case 'medicationRecord':
        await this.prisma.medicationRecord.update(args);
        return;
    }
  }

  /** O `isDue` escrito como filtro de banco, para o claim ser atômico. */
  private pendingWhere(record: DueRecord, windowDays: number) {
    const windowStart = new Date(
      record.nextDoseAt!.getTime() - windowDays * DAY_MS,
    );
    return {
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: windowStart } }],
    };
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
    const date = formatDateInTimeZone(
      record.nextDoseAt!,
      record.pet.tutor.timezone,
    );
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
