import { Injectable, Logger } from '@nestjs/common';
import type { calendar_v3 } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTimeZone } from '../../common/time/timezone';
import type { HealthRecordType } from '../queue/dto/calendar-sync.message';
import { isAlreadyGoneError } from './google-api-error';
import { GoogleCalendarService } from './google-calendar.service';

const MS_PER_DAY = 86_400_000;

/**
 * Evento de dia inteiro: lembrete às 9h da véspera. Em evento de dia inteiro
 * o Google conta os minutos a partir da meia-noite do dia do evento.
 */
const VESPERA_9H_MINUTOS = 15 * 60;

/** Evento desejado para um registro: dias em `AAAA-MM-DD`, `fim` exclusivo. */
export interface HealthEvent {
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string;
}

/** Dia civil gravado no registro (as datas de saúde são meia-noite UTC). */
function dia(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function diaSeguinte(date: Date): string {
  return dia(new Date(date.getTime() + MS_PER_DAY));
}

type PetNome = { pet: { name: string; tutorId: string } };

type Vacina = PetNome & {
  vaccineName: string;
  nextDoseAt: Date | null;
  deletedAt: Date | null;
};
type Vermifugo = PetNome & {
  productName: string;
  nextDoseAt: Date | null;
  deletedAt: Date | null;
};
type Medicacao = PetNome & {
  medicationName: string;
  dosage: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  deletedAt: Date | null;
};

/**
 * Traduz um registro no evento que ele deve ter na agenda, ou `null` quando
 * não deve haver evento (apagado, sem próxima dose).
 *
 * Vacina e vermífugo marcam o dia da **próxima dose** — é o que o tutor
 * precisa lembrar; a dose aplicada já passou. Medicação cobre o período do
 * tratamento, de dia inteiro: a frequência é texto livre ("a cada 8h",
 * "1x ao dia"), então não há como gerar o horário de cada dose com segurança.
 */
export function eventoDesejado(
  tipo: HealthRecordType,
  registro: Vacina | Vermifugo | Medicacao,
): HealthEvent | null {
  if (registro.deletedAt) return null;
  const pet = registro.pet.name;

  if (tipo === 'MEDICACAO') {
    const med = registro as Medicacao;
    const continuo = !med.endDate;
    return {
      titulo: `💊 ${med.medicationName} — ${pet}`,
      descricao: [
        `Tratamento de ${pet} registrado no PetCard.`,
        `Dose: ${med.dosage}`,
        `Frequência: ${med.frequency}`,
        continuo ? 'Uso contínuo, sem data de término.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      inicio: dia(med.startDate),
      fim: diaSeguinte(med.endDate ?? med.startDate),
    };
  }

  const proximaDose = (registro as Vacina | Vermifugo).nextDoseAt;
  if (!proximaDose) return null;

  const nome =
    tipo === 'VACINA'
      ? (registro as Vacina).vaccineName
      : (registro as Vermifugo).productName;
  const titulo =
    tipo === 'VACINA'
      ? `💉 Vacina ${nome}: próxima dose — ${pet}`
      : `🐛 Vermífugo ${nome}: próxima dose — ${pet}`;

  return {
    titulo,
    descricao: `Próxima dose de ${nome} de ${pet}, registrada no PetCard.`,
    inicio: dia(proximaDose),
    fim: diaSeguinte(proximaDose),
  };
}

/**
 * Mantém a agenda do Google do tutor igual aos registros de saúde dos pets
 * dele: vacinas, vermífugos e medicações — inclusive os que um veterinário
 * registrou.
 *
 * A sincronização reconcilia em vez de repetir uma ação: relê o registro,
 * calcula o evento que ele deveria ter e cria, atualiza ou apaga o evento
 * para chegar lá. Mensagem duplicada ou fora de ordem chega ao mesmo estado.
 */
@Injectable()
export class HealthCalendarService {
  private readonly logger = new Logger(HealthCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
  ) {}

  async reconcile(tipo: HealthRecordType, registroId: string): Promise<void> {
    const registro = await this.carregar(tipo, registroId);
    // Registro sumido de vez (pet apagado em cascata): o vínculo some junto
    // com o tutor; não há de quem buscar a agenda.
    if (!registro) {
      await this.prisma.healthCalendarEvent.deleteMany({
        where: { entidade: tipo, registroId },
      });
      return;
    }

    const tutorId = registro.pet.tutorId;
    const calendar = await this.google.getCalendarClient(tutorId);
    if (!calendar) return;

    const vinculo = await this.prisma.healthCalendarEvent.findUnique({
      where: { entidade_registroId: { entidade: tipo, registroId } },
    });
    const desejado = eventoDesejado(tipo, registro);

    if (!desejado) {
      if (vinculo) {
        await this.apagar(calendar, vinculo.googleEventId);
        await this.prisma.healthCalendarEvent.delete({
          where: { id: vinculo.id },
        });
      }
      return;
    }

    if (vinculo) {
      const atualizado = await this.atualizar(
        calendar,
        vinculo.googleEventId,
        desejado,
      );
      if (atualizado) return;
      // Tutor apagou o evento na agenda: recria em vez de desistir.
    }

    const googleEventId = await this.criar(calendar, desejado);
    await this.prisma.healthCalendarEvent.upsert({
      where: { entidade_registroId: { entidade: tipo, registroId } },
      update: { googleEventId, tutorId },
      create: { entidade: tipo, registroId, tutorId, googleEventId },
    });
  }

  /**
   * Leva para a agenda o que ainda vai acontecer — próximas doses e
   * tratamentos não terminados. Roda ao conectar: o histórico de anos de
   * vacina não deve inundar a agenda de quem acabou de se conectar.
   * Devolve quantos registros foram sincronizados.
   */
  async syncAllForTutor(tutorId: string): Promise<number> {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { timezone: true },
    });
    const hoje = new Date().toLocaleDateString('en-CA', {
      timeZone: resolveTimeZone(tutor?.timezone),
    });
    // Datas de saúde são meia-noite UTC do dia: comparar com a meia-noite UTC
    // de "hoje do tutor" mantém o dia de hoje dentro.
    const desde = new Date(`${hoje}T00:00:00.000Z`);
    const doTutor = { pet: { tutorId }, deletedAt: null };

    const [vacinas, vermifugos, medicacoes] = await Promise.all([
      this.prisma.vaccineRecord.findMany({
        where: { ...doTutor, nextDoseAt: { gte: desde } },
        select: { id: true },
      }),
      this.prisma.dewormingRecord.findMany({
        where: { ...doTutor, nextDoseAt: { gte: desde } },
        select: { id: true },
      }),
      this.prisma.medicationRecord.findMany({
        where: {
          ...doTutor,
          OR: [
            { endDate: { gte: desde } },
            { endDate: null, startDate: { gte: desde } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const pendentes: Array<[HealthRecordType, string]> = [
      ...vacinas.map((r): [HealthRecordType, string] => ['VACINA', r.id]),
      ...vermifugos.map((r): [HealthRecordType, string] => ['VERMIFUGO', r.id]),
      ...medicacoes.map((r): [HealthRecordType, string] => ['MEDICACAO', r.id]),
    ];

    let sincronizados = 0;
    for (const [tipo, id] of pendentes) {
      try {
        await this.reconcile(tipo, id);
        sincronizados++;
      } catch (error) {
        this.logger.warn(
          `Falha ao sincronizar ${tipo} ${id} do tutor ${tutorId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return sincronizados;
  }

  private carregar(tipo: HealthRecordType, id: string) {
    const pet = { select: { name: true, tutorId: true } };
    switch (tipo) {
      case 'VACINA':
        return this.prisma.vaccineRecord.findUnique({
          where: { id },
          include: { pet },
        });
      case 'VERMIFUGO':
        return this.prisma.dewormingRecord.findUnique({
          where: { id },
          include: { pet },
        });
      case 'MEDICACAO':
        return this.prisma.medicationRecord.findUnique({
          where: { id },
          include: { pet },
        });
    }
  }

  private corpo(evento: HealthEvent): calendar_v3.Schema$Event {
    return {
      summary: evento.titulo,
      description: evento.descricao,
      start: { date: evento.inicio },
      end: { date: evento.fim },
      // Livre: um lembrete de dia inteiro não deve bloquear a agenda do tutor.
      transparency: 'transparent',
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: VESPERA_9H_MINUTOS }],
      },
    };
  }

  private async criar(
    calendar: calendar_v3.Calendar,
    evento: HealthEvent,
  ): Promise<string> {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: this.corpo(evento),
    });
    if (!res.data.id) {
      throw new Error('O Google não devolveu o id do evento criado.');
    }
    return res.data.id;
  }

  /** `false` quando o evento já não existe na agenda. */
  private async atualizar(
    calendar: calendar_v3.Calendar,
    eventId: string,
    evento: HealthEvent,
  ): Promise<boolean> {
    try {
      await calendar.events.update({
        calendarId: 'primary',
        eventId,
        requestBody: this.corpo(evento),
      });
      return true;
    } catch (error) {
      if (isAlreadyGoneError(error)) return false;
      throw error;
    }
  }

  private async apagar(
    calendar: calendar_v3.Calendar,
    eventId: string,
  ): Promise<void> {
    try {
      await calendar.events.delete({ calendarId: 'primary', eventId });
    } catch (error) {
      if (!isAlreadyGoneError(error)) throw error;
    }
  }
}
