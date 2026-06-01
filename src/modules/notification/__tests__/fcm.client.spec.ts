import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FcmClient } from '../fcm.client';

jest.mock('firebase-admin', () => {
  const send = jest.fn();
  const messaging = jest.fn(() => ({ send }));
  return {
    __esModule: true,
    initializeApp: jest.fn(() => ({ name: 'test-app' })),
    credential: { cert: jest.fn((c: unknown) => c) },
    messaging,
    __send: send,
  };
});

describe('FcmClient', () => {
  const cfg = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips initialization when FCM_ENABLED=false', () => {
    const client = new FcmClient(cfg({ 'firebase.enabled': false }));
    client.onModuleInit();
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });

  it('returns empty result when send is called while disabled', async () => {
    const client = new FcmClient(cfg({ 'firebase.enabled': false }));
    client.onModuleInit();
    const result = await client.send('token-xyz', { title: 't', body: 'b' });
    expect(result).toEqual({});
  });

  it('initializes Firebase Admin when FCM_ENABLED=true', () => {
    const client = new FcmClient(
      cfg({
        'firebase.enabled': true,
        'firebase.projectId': 'pid',
        'firebase.clientEmail': 'a@b.com',
        'firebase.privateKey': 'pk',
      }),
    );
    client.onModuleInit();
    expect(admin.initializeApp).toHaveBeenCalled();
  });

  it('returns messageId on successful send', async () => {
    const client = new FcmClient(
      cfg({
        'firebase.enabled': true,
        'firebase.projectId': 'pid',
        'firebase.clientEmail': 'a@b.com',
        'firebase.privateKey': 'pk',
      }),
    );
    client.onModuleInit();
    (admin as unknown as { __send: jest.Mock }).__send.mockResolvedValueOnce(
      'msg-123',
    );

    const result = await client.send('token-xyz', { title: 't', body: 'b' });
    expect(result).toEqual({ messageId: 'msg-123' });
  });

  it('returns errorCode on failed send (degrades gracefully)', async () => {
    const client = new FcmClient(
      cfg({
        'firebase.enabled': true,
        'firebase.projectId': 'pid',
        'firebase.clientEmail': 'a@b.com',
        'firebase.privateKey': 'pk',
      }),
    );
    client.onModuleInit();
    jest.spyOn(client['logger'], 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('boom'), {
      code: 'messaging/registration-token-not-registered',
    });
    (admin as unknown as { __send: jest.Mock }).__send.mockRejectedValueOnce(
      err,
    );

    const result = await client.send('token-xyz', { title: 't', body: 'b' });
    expect(result).toEqual({
      errorCode: 'messaging/registration-token-not-registered',
    });
  });
});
