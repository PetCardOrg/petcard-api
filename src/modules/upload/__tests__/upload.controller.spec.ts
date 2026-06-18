/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
} from '../../../../test/utils/controller-harness';
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
