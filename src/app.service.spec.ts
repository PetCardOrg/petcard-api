import { AppService } from './app.service';

describe('AppService', () => {
  it('getHello retorna a mensagem de saúde padrão', () => {
    expect(new AppService().getHello()).toBe('Hello World!');
  });
});
