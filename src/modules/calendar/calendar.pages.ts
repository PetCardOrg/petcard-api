import { shell } from '../auth/auth-web.pages';

/**
 * Páginas do retorno do consentimento do Google Agenda. Mesma identidade das
 * páginas de auth (`auth-web.pages.ts`).
 *
 * O app atual não chega a ver a página de sucesso: o callback o devolve direto
 * para o app, que mostra a confirmação nativa. Ela fica para quem conecta por
 * outro caminho (versão antiga do app, `dev-connect`) — e por isso explica o
 * que muda, em vez de só dizer "pode fechar".
 */
export function calendarConnectedPage(): string {
  return shell(
    'Google Agenda conectado',
    `<div class="ok-mark">✅</div>
     <h1>Google Agenda conectado!</h1>
     <p>A partir de agora, o PetCard cuida da sua agenda:</p>
     <ul class="perks">
       <li><span class="ico">📅</span><span><strong>Consultas na agenda</strong>Tudo o que você agendar no app aparece no seu Google Agenda.</span></li>
       <li><span class="ico">🔔</span><span><strong>Lembretes automáticos</strong>Aviso 1 hora e 15 minutos antes de cada compromisso.</span></li>
       <li><span class="ico">🔄</span><span><strong>Sempre em dia</strong>Remarcou ou cancelou no app? A agenda acompanha sozinha.</span></li>
     </ul>
     <p class="hint">Pode fechar esta janela e voltar ao PetCard.</p>`,
  );
}
