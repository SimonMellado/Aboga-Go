/* Creado por LimónStudioss. s.melladoo */

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function resendConfig() {
  const apiKey = env('RESEND_API_KEY');
  const fromEmail = env('MAIL_FROM_EMAIL', 'no-reply@abogago.online');
  const fromName = env('MAIL_FROM_NAME', 'ABOGA GO');
  const replyTo = env('MAIL_REPLY_TO');
  return { apiKey, fromEmail, fromName, replyTo };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

async function verifyMailer() {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { configured: false, ready: false, provider: 'resend', error: 'RESEND_API_KEY no configurada' };
  if (!cfg.fromEmail || !cfg.fromEmail.includes('@')) return { configured: false, ready: false, provider: 'resend', error: 'MAIL_FROM_EMAIL inválido' };
  return { configured: true, ready: true, provider: 'resend', from: `${cfg.fromName} <${cfg.fromEmail}>` };
}

async function deliver(message) {
  const cfg = resendConfig();

  if (!cfg.apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV MAIL] ${message.to}: ${message.subject}`);
      return { devMode: true, provider: 'dev' };
    }
    throw new Error('RESEND_API_KEY no está configurada');
  }

  const payload = {
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };

  if (cfg.replyTo) payload.reply_to = cfg.replyTo;

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ABOGA-GO/6.10.17',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const e = new Error(`No se pudo conectar con Resend: ${err?.message || 'error de red'}`);
    e.cause = err;
    throw e;
  }

  let data = {};
  const raw = await response.text();
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = { raw }; }
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || data?.name || `HTTP ${response.status}`;
    throw new Error(`Resend rechazó el correo: ${detail}`);
  }

  return { devMode: false, provider: 'resend', messageId: data?.id || '' };
}

async function sendCode({ to, code, purpose = 'register' }) {
  const isReset = purpose === 'password_reset';
  const title = isReset ? 'Recupera tu contraseña' : 'Verifica tu correo';
  const intro = isReset
    ? 'Usa este código para crear una nueva contraseña en ABOGA GO.'
    : 'Usa este código para terminar de crear tu cuenta en ABOGA GO.';
  const safeCode = escapeHtml(code);

  return deliver({
    to,
    subject: `${title} — ABOGA GO`,
    text: `ABOGA GO\n\n${title}\n\nTu código es ${code}.\nExpira en 10 minutos.\n\nSi no solicitaste esta acción, ignora este mensaje.`,
    html: `<div style="background:#f8fafc;padding:32px 14px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:540px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden"><div style="padding:24px 28px;background:#0f172a;color:#ffffff"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#a5b4fc">ABOGA GO</div><div style="font-size:24px;font-weight:800;margin-top:6px">${title}</div></div><div style="padding:28px"><p style="margin:0;color:#475569;line-height:1.6">${escapeHtml(intro)}</p><div style="font-size:36px;letter-spacing:10px;font-weight:800;background:#eef2ff;color:#312e81;padding:20px;border-radius:14px;text-align:center;margin:26px 0">${safeCode}</div><p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">El código expira en 10 minutos. Nunca compartas este código con otra persona. Si no solicitaste esta acción, puedes ignorar este correo.</p></div><div style="padding:18px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">ABOGA GO · Marketplace legal en Chile · abogago.online</div></div></div>`
  });
}

async function sendTransactional({ to, subject, text }) {
  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  return deliver({
    to,
    subject: `${subject} — ABOGA GO`,
    text,
    html: `<div style="background:#f8fafc;padding:30px 14px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#4f46e5;margin-bottom:8px">ABOGA GO</div><h2 style="margin:0 0 16px">${escapeHtml(subject)}</h2><p style="line-height:1.65;color:#475569">${safeText}</p><p style="font-size:12px;color:#94a3b8;margin-top:26px">Mensaje automático de ABOGA GO.</p></div></div>`
  });
}

async function sendLoginCode({ to, code }) { return sendCode({ to, code, purpose: 'register' }); }
async function sendResetCode({ to, code }) { return sendCode({ to, code, purpose: 'password_reset' }); }

module.exports = { sendLoginCode, sendResetCode, sendTransactional, verifyMailer };
