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

/** O que muda entre vacina, vermífugo e medicação; o resto é comum. */
interface ReminderKind<R extends DueRecord> {
  model: ReminderModel;
  referenceType: string;
  title: string;
  /** Registros cuja data de referência cai dentro da janela. */
  records: () => Promise<R[]>;
  body: (record: R) => string;
}

/**
 * A parte do delegate do Prisma que o claim e o release usam. Os três modelos
 * têm a mesma forma aqui, então um tipo só serve para todos.
 */
interface ReminderDelegate {
  updateMany(args: {
    where: { id: string; OR: Array<{ lastNotifiedAt: null | { lt: Date } }> };
    data: { lastNotifiedAt: Date };
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: string };
    data: { lastNotifiedAt: Date | null };
  }): Promise<unknown>;
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
   * A varredura roda por mais de um caminho: o `@Cron`, o disparo externo do
   * GitHub Actions e o boot do Render (AUD API-02), e cada instância roda o
   * próprio `@Cron`. Sem coordenação, duas execuções selecionam o mesmo
   * conjunto e mandam o push antes de qualquer uma marcar `lastNotifiedAt` —
   * o tutor recebe duplicado. Por isso o registro é *reivindicado* antes do
   * envio (ver `claim`).
   */
  async runDoseReminders(): Promise<{
    vaccine: number;
    deworming: number;
    medication: number;
  }> {
    const windowDays = this.config.get<number>('reminder.windowDays') ?? 3;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * DAY_MS);

    // Registro excluído não gera lembrete (api#117).
    const vaccine = await this.processReminders(now, windowDays, {
      model: 'vaccineRecord',
      referenceType: 'VACCINE_RECORD',
      title: 'Vacina chegando',
      records: () =>
        this.prisma.vaccineRecord.findMany({
          where: { nextDoseAt: { gte: now, lte: windowEnd }, deletedAt: null },
          include: { pet: PET_SELECT },
        }),
      body: (record) => this.describe(record, 'vacina'),
    });
    const deworming = await this.processReminders(now, windowDays, {
      model: 'dewormingRecord',
      referenceType: 'DEWORMING_RECORD',
      title: 'Vermifugo chegando',
      records: () =>
        this.prisma.dewormingRecord.findMany({
          where: { nextDoseAt: { gte: now, lte: windowEnd }, deletedAt: null },
          include: { pet: PET_SELECT },
        }),
      body: (record) => this.describe(record, 'vermifugo'),
    });
    // Lembrete de medicação (api#111): um único aviso quando o tratamento
    // começa, não um aviso recorrente por dose — `startDate` faz o papel de
    // `nextDoseAt` para reaproveitar `isDue`/`notify` sem duplicar a lógica.
    const medication = await this.processReminders(now, windowDays, {
      model: 'medicationRecord',
      referenceType: 'MEDICATION_RECORD',
      title: 'Medicacao chegando',
      records: async () => {
        const records = await this.prisma.medicationRecord.findMany({
          where: { startDate: { gte: now, lte: windowEnd }, deletedAt: null },
          include: { pet: PET_SELECT },
        });
        return records.map((record) => ({
          id: record.id,
          petId: record.petId,
          nextDoseAt: record.startDate,
          lastNotifiedAt: record.lastNotifiedAt,
          pet: record.pet,
          medicationName: record.medicationName,
        }));
      },
      body: (record) => {
        const date = formatDateInTimeZone(
          record.nextDoseAt,
          record.pet.tutor.timezone,
        );
        return `${record.pet.name}: inicio do tratamento com ${record.medicationName} previsto para ${date}.`;
      },
    });

    this.logger.log(
      `Dose reminders: ${vaccine} vaccine + ${deworming} deworming + ${medication} medication notification(s) scheduled`,
    );
    return { vaccine, deworming, medication };
  }

  /** Avisa cada registro da janela uma vez e devolve quantos avisos saíram. */
  private async processReminders<R extends DueRecord>(
    now: Date,
    windowDays: number,
    kind: ReminderKind<R>,
  ): Promise<number> {
    const records = await kind.records();

    let scheduled = 0;
    for (const record of records) {
      const enviado = await this.notifyOnce(
        kind.model,
        record,
        windowDays,
        now,
        kind.referenceType,
        kind.title,
        () => kind.body(record),
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
   * de tabela nem de migration, não deixa lock pendurado se o processo morrer
   * no meio, e reparte o trabalho entre as execuções em vez de deixar uma
   * ociosa.
   */
  private async claim(
    model: ReminderModel,
    record: DueRecord,
    windowDays: number,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.delegate(model).updateMany({
      where: { id: record.id, ...this.pendingWhere(record, windowDays) },
      data: { lastNotifiedAt: now },
    });
    return count > 0;
  }

  /** Devolve `lastNotifiedAt` ao valor anterior quando o push não saiu. */
  private async release(
    model: ReminderModel,
    record: DueRecord,
  ): Promise<void> {
    await this.delegate(model).update({
      where: { id: record.id },
      data: { lastNotifiedAt: record.lastNotifiedAt },
    });
  }

  private delegate(model: ReminderModel): ReminderDelegate {
    return this.prisma[model];
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
