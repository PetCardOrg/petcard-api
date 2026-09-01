/**
 * Templates dos e-mails transacionais do PetCard.
 *
 * HTML compatível com clientes de e-mail: layout por `<table>`, estilos inline,
 * sem flexbox/grid/SVG. Identidade visual do app (azul `#27A9D8`, texto
 * `#14313F`, fundo `#F6FBFE`).
 */

const BRAND = {
  primary: '#27A9D8',
  primaryDark: '#107FA8',
  primarySoft: '#E6F7FC',
  text: '#14313F',
  bodyText: '#3D525C',
  muted: '#7C93A0',
  border: '#D8EEF6',
  pageBg: '#F6FBFE',
  surface: '#FFFFFF',
};

export type EmailContent = {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta: string;
  link: string;
  footnote: string;
};

export function verificationEmail(link: string): EmailContent {
  return {
    subject: 'Confirme seu e-mail no PetCard',
    preheader: 'Falta só um toque para ativar sua conta.',
    heading: 'Bem-vindo ao PetCard 🐾',
    body: 'Confirme este endereço de e-mail para ativar todos os recursos da sua conta e manter a carteira de saúde dos seus pets sempre com você.',
    cta: 'Confirmar e-mail',
    link,
    footnote:
      'Se você não criou uma conta no PetCard, é só ignorar este e-mail.',
  };
}

export function passwordResetEmail(link: string): EmailContent {
  return {
    subject: 'Redefinição de senha do PetCard',
    preheader: 'Crie uma nova senha para a sua conta PetCard.',
    heading: 'Redefinir sua senha',
    body: 'Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para criar uma nova senha.',
    cta: 'Redefinir senha',
    link,
    footnote:
      'Se não foi você, ignore este e-mail — sua senha atual continua valendo. O link expira em 1 hora.',
  };
}

/** Versão texto puro (fallback para clientes sem HTML). */
export function renderText(c: EmailContent): string {
  return [
    c.heading,
    '',
    c.body,
    '',
    `${c.cta}: ${c.link}`,
    '',
    c.footnote,
    '',
    'PetCard — carteira digital de saúde para pets',
  ].join('\n');
}

export function renderHtml(c: EmailContent): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${c.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="background:${BRAND.primary};padding:22px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;background:#ffffff;border-radius:10px;text-align:center;font-size:18px;line-height:36px;">🐾</td>
                  <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">PetCard</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${BRAND.text};">${c.heading}</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BRAND.bodyText};">${c.body}</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${BRAND.primary};border-radius:10px;">
                    <a href="${c.link}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${c.cta}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">
                Se o botão não abrir o app, copie e cole este endereço:<br>
                <span style="color:${BRAND.primaryDark};word-break:break-all;">${c.link}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.primarySoft};padding:20px 32px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${c.footnote}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${BRAND.muted};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          PetCard — carteira digital de saúde para pets
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
