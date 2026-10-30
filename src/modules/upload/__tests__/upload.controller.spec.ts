/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { LIMITE_DE_UPLOAD } from '../../../config/throttler.config';
import { UploadController } from '../upload.controller';
import { UploadService } from '../upload.service';

describe('UploadController (integração)', () => {
  let harness: ControllerHarness;
  let upload: { uploadFile: jest.Mock };

  beforeAll(async () => {
    upload = { uploadFile: jest.fn() };

    harness = await createControllerTestApp({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: upload }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
  });

  it('faz upload do arquivo e retorna a URL (201)', async () => {
    upload.uploadFile.mockResolvedValue('https://s3/pets/foto.png');

    const res = await request(harness.app.getHttpServer())
      .post('/upload/image')
      .attach('file', Buffer.from('fake-image'), 'foto.png')
      .expect(201);

    expect(res.body.url).toBe('https://s3/pets/foto.png');
    const folderArg = upload.uploadFile.mock.calls[0][1];
    expect(folderArg).toBe('pets');
  });

  it('usa a pasta informada na query (tutors)', async () => {
    upload.uploadFile.mockResolvedValue('https://s3/tutors/foto.png');

    await request(harness.app.getHttpServer())
      .post('/upload/image?folder=tutors')
      .attach('file', Buffer.from('fake-image'), 'foto.png')
      .expect(201);

    expect(upload.uploadFile.mock.calls[0][1]).toBe('tutors');
  });

  it('usa a pasta informada na query (vets)', async () => {
    upload.uploadFile.mockResolvedValue('https://s3/vets/foto.png');

    await request(harness.app.getHttpServer())
      .post('/upload/image?folder=vets')
      .attach('file', Buffer.from('fake-image'), 'foto.png')
      .expect(201);

    expect(upload.uploadFile.mock.calls[0][1]).toBe('vets');
  });

  it('rejeita pasta inválida (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/upload/image?folder=hacker')
      .attach('file', Buffer.from('fake-image'), 'foto.png')
      .expect(400);

    expect(upload.uploadFile).not.toHaveBeenCalled();
  });

  it('exige autenticação (401)', async () => {
    harness.setUser(null);

    await request(harness.app.getHttpServer())
      .post('/upload/image')
      .attach('file', Buffer.from('fake-image'), 'foto.png')
      .expect(401);
  });
});

describe('UploadController: rate limit (AUD API-10)', () => {
  let harness: ControllerHarness;
  let upload: { uploadFile: jest.Mock };

  const enviar = () =>
    request(harness.app.getHttpServer())
      .post('/upload/image')
      .attach('file', Buffer.from('fake-image'), 'foto.png');

  beforeAll(async () => {
    upload = {
      uploadFile: jest.fn().mockResolvedValue('https://s3/pets/foto.png'),
    };
    harness = await createControllerTestApp({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: upload }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('corta o usuário que passa do limite de uploads na janela', async () => {
    harness.setUser(TUTOR);
    for (let i = 0; i < LIMITE_DE_UPLOAD; i++) {
      await enviar().expect(201);
    }
    await enviar().expect(429);
  });

  it('conta por usuário, não por IP: outro usuário na mesma rede segue enviando', async () => {
    harness.setUser(VET);
    await enviar().expect(201);
  });
});
