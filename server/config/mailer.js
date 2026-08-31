/* Creado por LimónStudioss. s.melladoo */
const nodemailer = require('nodemailer');

let transporter;
let transporterFingerprint = '';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function smtpConfig() {
  const host = env('SMTP_HOST', 'authsmtp.securemail.pro');
  const port = Number(env('SMTP_PORT', '465'));
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const secureRaw = env('SMTP_SECURE', port === 465 ? 'true' : 'false').toLowerCase();
  const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT inválido');
  }

  return { host, port, user, pass, secure };
}

function getTransporter() {
  const cfg = smtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) return null;

  const fingerprint = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (transporter && transporterFingerprint === fingerprint) return transporter;

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
    tls: { servername: cfg.host, minVersion: 'TLSv1.2' },
  });
  transporterFingerprint = fingerprint;
  return transporter;
}

function senderAddress() {
  const configured = env('MAIL_FROM');
  if (configured) return configured;
  const user = env('SMTP_USER');
  return user ? `ABOGA GO <${user}>` : '';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

async function verifyMailer() {
  const tx = getTransporter();
  if (!tx) return { configured: false, ready: false, error: 'SMTP incompleto' };
  try {
    await tx.verify();
    return { configured: true, ready: true };
  } catch (err) {
    return { configured: true, ready: false, error: err?.message || 'SMTP no disponible' };
  }
}

async function deliver(message) {
  const tx = getTransporter();
  if (!tx) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV MAIL] ${message.to}: ${message.subject}`);
      return { devMode: true };
    }
    throw new Error('El servicio de correo no está configurado');
  }

  const from = senderAddress();
  if (!from) throw new Error('MAIL_FROM o SMTP_USER no está configurado');

  const replyTo = env('MAIL_REPLY_TO');
  const payload = { ...message, from };
  if (replyTo) payload.replyTo = replyTo;

  try {
    const info = await tx.sendMail(payload);
    return { devMode: false, messageId: info.messageId };
  } catch (firstError) {
    transporter = null;
    transporterFingerprint = '';
    const retryTx = getTransporter();
    if (!retryTx) throw firstError;
    try {
      const info = await retryTx.sendMail(payload);
      return { devMode: false, messageId: info.messageId };
    } catch (secondError) {
      secondError.cause = firstError;
      throw secondError;
    }
  }
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
