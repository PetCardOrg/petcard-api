import type { Channel, ConsumeMessage } from 'amqplib';
import { RETRY_HEADER } from '../queue.constants';
import { retryOrDlq } from '../rmq';

function mensagem(retryCount?: number): ConsumeMessage {
  return {
    content: Buffer.from('{}'),
    fields: { routingKey: 'fila' },
    properties: {
      headers: retryCount === undefined ? {} : { [RETRY_HEADER]: retryCount },
    },
  } as unknown as ConsumeMessage;
}

describe('retryOrDlq: espera antes de republicar (AUD API-09)', () => {
  let channel: { publish: jest.Mock; ack: jest.Mock; nack: jest.Mock };
  const hooks = { onRetry: jest.fn(), onExhausted: jest.fn() };

  beforeEach(() => {
    jest.useFakeTimers();
    channel = { publish: jest.fn(), ack: jest.fn(), nack: jest.fn() };
    hooks.onRetry.mockClear();
    hooks.onExhausted.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    [undefined, 1000],
    [1, 2000],
    [2, 4000],
  ])(
    'com retry-count %p, republica só depois de %pms',
    async (retryCount, esperaMs) => {
      const feito = retryOrDlq(
        channel as unknown as Channel,
        mensagem(retryCount),
        3,
        hooks,
      );

      await jest.advanceTimersByTimeAsync(esperaMs - 1);
      expect(channel.publish).not.toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await feito;
      expect(channel.publish).toHaveBeenCalledTimes(1);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    },
  );

  it('esgotadas as tentativas, manda para a DLQ sem esperar', async () => {
    await retryOrDlq(channel as unknown as Channel, mensagem(3), 3, hooks);

    expect(hooks.onExhausted).toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.publish).not.toHaveBeenCalled();
  });
});
