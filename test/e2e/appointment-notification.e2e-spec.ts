/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { NotificationKind, NotificationStatus } from '@prisma/client';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Exclusão de agendamento leva as notificações junto (api#112).
 *
 * A cascata é do banco (`Notification.appointmentId` com `onDelete: Cascade`),
 * então só um Postgres de verdade prova que ela existe — um mock de Prisma
 * não exercita a FK. Mesmo raciocínio de `conta-do-tutor.e2e-spec.ts`.
 */
describe('Agendamento — exclusão leva as notificações (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let tutorId: string;
  let appointmentId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    ({ app, prisma } = ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const tutor = await registerTutor(app);
    tutorToken = tutor.token;
    tutorId = tutor.user.id;

    const appt = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({
        title: 'Consulta de rotina',
        scheduled_at: '2026-12-01T14:00:00Z',
      })
      .expect(201);
    appointmentId = appt.body.id as string;

    // Simula o lembrete que o cron (AppointmentReminderService) teria criado.
    await prisma.notification.create({
      data: {
        tutorId,
        appointmentId,
        kind: NotificationKind.APPOINTMENT_REMINDER,
        referenceType: 'APPOINTMENT',
        referenceId: appointmentId,
        payload: { title: 'Consulta chegando', body: 'Consulta de rotina' },
        status: NotificationStatus.SENT,
      },
    });
  });

  it('apaga a notificação vinculada quando o agendamento é excluído', async () => {
    expect(await prisma.notification.count({ where: { appointmentId } })).toBe(
      1,
    );

    await request(app.getHttpServer())
      .delete(`/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    expect(await prisma.notification.count({ where: { appointmentId } })).toBe(
      0,
    );
    // A notificação some — não fica órfã com appointmentId nulo.
    expect(await prisma.notification.count()).toBe(0);
  });

  it('reagendar libera um novo lembrete (zera lastNotifiedAt)', async () => {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { lastNotifiedAt: new Date() },
    });

    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ scheduled_at: '2026-12-05T10:00:00Z' })
      .expect(200);

    const updated = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    expect(updated?.lastNotifiedAt).toBeNull();
  });
});
