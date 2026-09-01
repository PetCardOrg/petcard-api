/**
 * Páginas HTML servidas para o navegador a partir dos links dos e-mails de auth
 * (mobile#54). Links `http(s)` abrem em qualquer cliente de e-mail — ao
 * contrário de `petcard://`, que o Gmail bloqueia.
 *
 * Identidade visual do app: azul `#27A9D8`, texto `#14313F`, fundo `#F6FBFE`.
 * O `<script>` do formulário carrega com `nonce` (ver `AuthWebController`),
 * porque a CSP global da API é `script-src 'self'`.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const STYLE = `<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F6FBFE; color: #14313F; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 440px; margin: 0 auto; padding: 40px 20px; }
  .card { background: #fff; border: 1px solid #D8EEF6; border-radius: 16px; overflow: hidden; }
  .head { background: #27A9D8; color: #fff; padding: 20px 28px; font-size: 18px; font-weight: 700; letter-spacing: .3px; display: flex; align-items: center; gap: 10px; }
  .badge { width: 32px; height: 32px; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
  .body { padding: 28px; }
  h1 { margin: 0 0 10px; font-size: 21px; color: #14313F; }
  p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #3D525C; }
  label { display: block; font-size: 13px; font-weight: 700; margin: 16px 0 6px; color: #14313F; }
  .field { position: relative; }
  .field input { width: 100%; padding: 12px 76px 12px 14px; font-size: 16px; border: 1px solid #D8EEF6; border-radius: 12px; background: #fff; color: #14313F; }
  .field input:focus { outline: none; border-color: #27A9D8; }
  .toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: #107FA8; font-size: 13px; font-weight: 700; padding: 6px 8px; cursor: pointer; }
  .rules { margin: 10px 0 0; padding: 0; list-style: none; font-size: 13px; line-height: 1.9; color: #7C93A0; }
  .rules li .dot { display: inline-block; width: 16px; color: #B4B2A9; }
  .rules li.ok { color: #06A77D; }
  .rules li.ok .dot { color: #06A77D; }
  .msg { font-size: 14px; margin-top: 12px; min-height: 18px; color: #E63946; }
  button.primary { width: 100%; margin-top: 22px; padding: 14px; font-size: 16px; font-weight: 700; color: #fff; background: #27A9D8; border: 0; border-radius: 12px; cursor: pointer; }
  .foot { background: #E6F7FC; padding: 16px 28px; font-size: 12px; color: #7C93A0; text-align: center; }
  .ok-mark { font-size: 40px; }
</style>`;

function shell(title: string, inner: string, headExtra = ''): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>${STYLE}${headExtra}</head>
<body><div class="wrap"><div class="card">
<div class="head"><span class="badge">🐾</span>PetCard</div>
<div class="body">${inner}</div>
<div class="foot">PetCard — carteira digital de saúde para pets</div>
</div></div></body></html>`;
}

export function resultPage(
  ok: boolean,
  heading: string,
  message: string,
): string {
  return shell(
    heading,
    `<div class="ok-mark">${ok ? '✅' : '⚠️'}</div>
     <h1>${escapeHtml(heading)}</h1>
     <p>${escapeHtml(message)}</p>`,
  );
}

/** Formulário de nova senha. `nonce` libera o `<script>` sob a CSP da API. */
export function resetFormPage(token: string, nonce: string): string {
  const safeToken = escapeHtml(token);
  return shell(
    'Redefinir senha',
    `<h1>Criar nova senha</h1>
     <p>Defina a nova senha da sua conta PetCard.</p>
     <form id="f" method="post" action="/auth/reset-password">
       <input type="hidden" name="token" value="${safeToken}">

       <label for="p">Nova senha</label>
       <div class="field">
         <input id="p" name="password" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false">
         <button type="button" class="toggle" data-target="p">Mostrar</button>
       </div>

       <ul class="rules">
         <li data-rule="len"><span class="dot">○</span>Pelo menos 8 caracteres</li>
         <li data-rule="upper"><span class="dot">○</span>Uma letra maiúscula</li>
         <li data-rule="num"><span class="dot">○</span>Um número</li>
         <li data-rule="spec"><span class="dot">○</span>Um caractere especial</li>
       </ul>

       <label for="c">Confirmar nova senha</label>
       <div class="field">
         <input id="c" name="confirm" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false">
         <button type="button" class="toggle" data-target="c">Mostrar</button>
       </div>

       <div class="msg" id="m"></div>
       <button type="submit" class="primary">Redefinir senha</button>
     </form>
     <script nonce="${nonce}">
     (function () {
       var p = document.getElementById('p');
       var c = document.getElementById('c');
       var m = document.getElementById('m');
       var f = document.getElementById('f');
       var items = document.querySelectorAll('.rules li');
       var rules = {
         len: function (v) { return v.length >= 8; },
         upper: function (v) { return /[A-Z]/.test(v); },
         num: function (v) { return /[0-9]/.test(v); },
         spec: function (v) { return /[^A-Za-z0-9]/.test(v); }
       };
       function refresh() {
         var v = p.value, allOk = true;
         for (var i = 0; i < items.length; i++) {
           var li = items[i];
           var ok = rules[li.getAttribute('data-rule')](v);
           li.className = ok ? 'ok' : '';
           li.querySelector('.dot').textContent = ok ? '✓' : '○';
           if (!ok) allOk = false;
         }
         return allOk;
       }
       p.addEventListener('input', refresh);
       var toggles = document.querySelectorAll('.toggle');
       for (var j = 0; j < toggles.length; j++) {
         toggles[j].addEventListener('click', function () {
           var input = document.getElementById(this.getAttribute('data-target'));
           var show = input.type === 'password';
           input.type = show ? 'text' : 'password';
           this.textContent = show ? 'Ocultar' : 'Mostrar';
         });
       }
       f.addEventListener('submit', function (e) {
         m.textContent = '';
         if (!refresh()) { e.preventDefault(); m.textContent = 'A senha não cumpre todos os requisitos.'; return; }
         if (p.value !== c.value) { e.preventDefault(); m.textContent = 'As senhas não coincidem.'; }
       });
     })();
     </script>`,
  );
}
