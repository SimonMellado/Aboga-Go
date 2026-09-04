/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const passport = require('./config/passport');
const { iniciarCronRenovacion } = require('./jobs/renewPremium');
const { ensureDeviceCookie } = require('./utils/security');
const { ensureCreatorAccount } = require('./utils/ensureCreator');
const { verifyMailer } = require('./config/mailer');
const { flowConfig } = require('./config/flow');

function requireProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['FRONTEND_URL','BACKEND_URL','MONGODB_URI','JWT_SECRET','SECURITY_PEPPER','RESEND_API_KEY','MAIL_FROM_EMAIL','MAIL_FROM_NAME','CREATOR_EMAIL','CREATOR_PASSWORD','DATA_ENCRYPTION_KEY','BACKUP_ENCRYPTION_KEY'];
  const missing = required.filter(k => !String(process.env[k] || '').trim());
  if (missing.length) throw new Error(`Faltan variables obligatorias de producción: ${missing.join(', ')}`);
  if (String(process.env.JWT_SECRET).length < 48) throw new Error('JWT_SECRET debe tener al menos 48 caracteres en producción');
  if (String(process.env.SECURITY_PEPPER).length < 48) throw new Error('SECURITY_PEPPER debe tener al menos 48 caracteres en producción');
  if (process.env.SECURITY_PEPPER === process.env.JWT_SECRET) throw new Error('SECURITY_PEPPER debe ser distinto de JWT_SECRET');
  if (String(process.env.DATA_ENCRYPTION_KEY).length < 32) throw new Error('DATA_ENCRYPTION_KEY debe tener al menos 32 caracteres o ser una clave Base64/hex de 32 bytes');
  if (String(process.env.BACKUP_ENCRYPTION_KEY).length < 32) throw new Error('BACKUP_ENCRYPTION_KEY debe tener al menos 32 caracteres o ser una clave Base64/hex de 32 bytes');
  if ([process.env.JWT_SECRET, process.env.SECURITY_PEPPER].includes(process.env.DATA_ENCRYPTION_KEY)) throw new Error('DATA_ENCRYPTION_KEY debe ser distinta de JWT_SECRET y SECURITY_PEPPER');
  if ([process.env.JWT_SECRET, process.env.SECURITY_PEPPER, process.env.DATA_ENCRYPTION_KEY].includes(process.env.BACKUP_ENCRYPTION_KEY)) throw new Error('BACKUP_ENCRYPTION_KEY debe ser distinta de las claves de aplicación');
  if (!String(process.env.FRONTEND_URL).startsWith('https://') || !String(process.env.BACKEND_URL).startsWith('https://')) throw new Error('FRONTEND_URL y BACKEND_URL deben usar HTTPS en producción');
  if (String(process.env.FLOW_ENABLED || 'true').toLowerCase() === 'true') {
    const flowMissing = ['FLOW_API_KEY','FLOW_SECRET_KEY'].filter(k => !String(process.env[k] || '').trim());
    if (flowMissing.length) throw new Error(`Flow está habilitado y faltan variables: ${flowMissing.join(', ')}`);
  }
  if (String(process.env.TRANSBANK_ENABLED || 'false').toLowerCase() === 'true') {
    const tbkMissing = ['TBK_WEBPAY_COMMERCE_CODE','TBK_WEBPAY_API_KEY','TBK_ONECLICK_COMMERCE_CODE','TBK_ONECLICK_API_KEY'].filter(k => !String(process.env[k] || '').trim());
    if (tbkMissing.length) throw new Error(`Transbank está habilitado y faltan variables: ${tbkMissing.join(', ')}`);
  }
}

requireProductionEnv();
const app = express();

function resolveTrustProxyHops() {
  const raw = String(process.env.TRUST_PROXY_HOPS || '1').trim();
  const hops = Number.parseInt(raw, 10);
  if (!Number.isInteger(hops) || hops < 1 || hops > 10) {
    throw new Error('TRUST_PROXY_HOPS debe ser un entero entre 1 y 10');
  }
  return hops;
}

const trustProxyHops = resolveTrustProxyHops();
app.set('trust proxy', trustProxyHops);
console.log(`Express trust proxy configurado en ${trustProxyHops} salto(s)`);
const extraOrigins = String(process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean);
const configuredFrontend = String(process.env.FRONTEND_URL || 'https://abogago.online').trim().replace(/\/$/, '');
const allowedOrigins = new Set([
  configuredFrontend,
  'https://abogago.online',
  'https://www.abogago.online',
  ...extraOrigins,
].filter(Boolean));
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false }));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
function hasUnsafeKeys(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || ['__proto__','prototype','constructor'].includes(key)) return true;
    if (hasUnsafeKeys(child, depth + 1)) return true;
  }
  return false;
}
app.use((req, res, next) => {
  if (hasUnsafeKeys(req.body) || hasUnsafeKeys(req.query)) return res.status(400).json({ error: 'Solicitud inválida' });
  next();
});
app.use(cookieParser());
app.use(ensureDeviceCookie);
app.use(passport.initialize());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' } });
const twoFactorLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Demasiados intentos 2FA. Espera unos minutos.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados intentos de registro desde esta red. Intenta más tarde.' } });
const sensitiveLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 25, standardHeaders: 'draft-7', legacyHeaders: false, skip: req => req.path === '/transfer/webhook', message: { error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' } });
const passwordRecoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes de recuperación. Intenta nuevamente más tarde.' } });
const casesLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes de oportunidades. Intenta nuevamente en un momento.' } });
const accountLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes de cuenta. Intenta nuevamente en un momento.' } });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes administrativas. Intenta nuevamente en un momento.' } });
const notificationLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas solicitudes de notificaciones. Intenta nuevamente en un momento.' } });
const transferWebhookLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas confirmaciones de transferencia.' } });
function mutationOriginGuard(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const exempt = ['/api/payments/credits/return','/api/payments/oneclick/inscribir/return','/api/payments/transfer/webhook','/api/payments/flow/confirm','/api/payments/flow/return','/api/auth/apple/callback'];
  if (exempt.includes(req.path)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origen no permitido' });
  next();
}
app.use(mutationOriginGuard);
app.use(['/api/auth','/api/account','/api/admin','/api/payments'], (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/auth/local/login', loginLimiter);
app.use(['/api/auth/local/password'], passwordRecoveryLimiter);
app.use('/api/cases', casesLimiter);
app.use('/api/account', accountLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/notifications', notificationLimiter);
app.use('/api/auth/local/register', registerLimiter);
app.use('/api/auth/2fa/verify-login', twoFactorLimiter);
app.use('/api/auth/local', authLimiter);
app.use('/api/payments/transfer/webhook', transferWebhookLimiter);
app.use('/api/payments', sensitiveLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/account', require('./routes/account'));
app.use('/api/notifications', require('./routes/notifications'));
app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'ABOGA GO API', version: '7.1.3' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  if (res.headersSent) return next(err);
  res.status(err.message === 'Origen no permitido por CORS' ? 403 : 500).json({ error: 'Ocurrió un error inesperado' });
});

const PORT = process.env.PORT || 4000;
connectDB().then(async () => {
  const flowStatus = flowConfig();
  console.log(`Flow ${flowStatus.enabled ? (flowStatus.configured ? 'habilitado y configurado' : 'habilitado pero incompleto') : 'deshabilitado'}`);
  const transbankEnabled = String(process.env.TRANSBANK_ENABLED || 'false').toLowerCase() === 'true';
  console.log(`Transbank ${transbankEnabled ? 'habilitado' : 'deshabilitado hasta configurar credenciales'}`);
  await ensureCreatorAccount();
  if (String(process.env.MAIL_VERIFY_ON_START || 'false').toLowerCase() === 'true') {
    const mailStatus = await verifyMailer();
    if (mailStatus.ready) console.log(`Resend ABOGA GO configurado correctamente: ${mailStatus.from || 'remitente listo'}`);
    else console.error(`Resend ABOGA GO no disponible: ${mailStatus.error || 'configuración incompleta'}`);
  }
  const server = app.listen(PORT, () => {
    console.log(`ABOGA GO API lista en puerto ${PORT}`);
    iniciarCronRenovacion();
  });
  const shutdown = signal => {
    console.log(`${signal}: cerrando servidor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(err => {
  console.error('No se pudo iniciar ABOGA GO:', err.message);
  process.exit(1);
});
