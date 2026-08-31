/* Creado por LimónStudioss. s.melladoo */
const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

async function sendCode({ to, code, purpose = 'register' }) {
  const tx = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const isReset = purpose === 'password_reset';
  if (!tx) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Código ${isReset ? 'de recuperación' : 'de verificación'} para ${to}: ${code}`);
      return { devMode: true };
    }
    throw new Error('El servicio de correo no está configurado');
  }
  const title = isReset ? 'Recupera tu contraseña' : 'Verifica tu correo';
  const intro = isReset ? 'Usa este código para crear una nueva contraseña en ABOGA GO.' : 'Usa este código para terminar de crear tu cuenta en ABOGA GO.';
  await tx.sendMail({
    from,
    to,
    subject: `${title} — ABOGA GO`,
    text: `Tu código es ${code}. Expira en 10 minutos.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#0f172a"><h2 style="margin:0 0 8px">${title}</h2><p style="color:#64748b">${intro}</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;background:#f1f5f9;padding:18px 22px;border-radius:12px;text-align:center;margin:24px 0">${code}</div><p style="font-size:13px;color:#64748b">El código expira en 10 minutos. Si no solicitaste esta acción, ignora este mensaje.</p></div>`
  });
  return { devMode: false };
}

async function sendTransactional({ to, subject, text }) {
  const tx = getTransporter();
  if (!tx) { if (process.env.NODE_ENV !== 'production') { console.log(`[DEV MAIL] ${to}: ${subject}`); return { devMode: true }; } return { skipped: true }; }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const safe = String(text || '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  await tx.sendMail({ from, to, subject: `${subject} — ABOGA GO`, text, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#0f172a"><h2 style="margin:0 0 16px">${subject}</h2><p style="line-height:1.6;color:#475569">${safe}</p><p style="font-size:12px;color:#94a3b8;margin-top:26px">Mensaje automático de ABOGA GO.</p></div>` });
  return { devMode: false };
}

async function sendLoginCode({ to, code }) { return sendCode({ to, code, purpose: 'register' }); }
async function sendResetCode({ to, code }) { return sendCode({ to, code, purpose: 'password_reset' }); }

module.exports = { sendLoginCode, sendResetCode, sendTransactional };
