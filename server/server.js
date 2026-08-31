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

function requireProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['FRONTEND_URL','BACKEND_URL','MONGODB_URI','JWT_SECRET','SECURITY_PEPPER','SMTP_HOST','SMTP_USER','SMTP_PASS','MAIL_FROM','TBK_WEBPAY_COMMERCE_CODE','TBK_WEBPAY_API_KEY','TBK_ONECLICK_COMMERCE_CODE','TBK_ONECLICK_API_KEY','CREATOR_EMAIL','CREATOR_PASSWORD'];
  const missing = required.filter(k => !String(process.env[k] || '').trim());
  if (missing.length) throw new Error(`Faltan variables obligatorias de producción: ${missing.join(', ')}`);
  if (String(process.env.JWT_SECRET).length < 48) throw new Error('JWT_SECRET debe tener al menos 48 caracteres en producción');
  if (String(process.env.SECURITY_PEPPER).length < 48) throw new Error('SECURITY_PEPPER debe tener al menos 48 caracteres en producción');
  if (process.env.SECURITY_PEPPER === process.env.JWT_SECRET) throw new Error('SECURITY_PEPPER debe ser distinto de JWT_SECRET');
  if (!String(process.env.FRONTEND_URL).startsWith('https://') || !String(process.env.BACKEND_URL).startsWith('https://')) throw new Error('FRONTEND_URL y BACKEND_URL deben usar HTTPS en producción');
}

requireProductionEnv();
const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', Math.max(1, Number(process.env.TRUST_PROXY_HOPS || 1)));
const extraOrigins = String(process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean);
const configuredFrontend = String(process.env.FRONTEND_URL || 'https://abogago.online').trim().replace(/\/$/, '');
const allowedOrigins = new Set([
  configuredFrontend,
  'https://abogago.online',
  'https://www.abogago.online',
  ...extraOrigins,
].filter(Boolean));
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
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
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados intentos de registro desde esta red. Intenta más tarde.' } });
const sensitiveLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 25, standardHeaders: 'draft-7', legacyHeaders: false, skip: req => req.path === '/transfer/webhook', message: { error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' } });
const transferWebhookLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiadas confirmaciones de transferencia.' } });
function mutationOriginGuard(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const exempt = ['/api/payments/credits/return','/api/payments/oneclick/inscribir/return','/api/payments/transfer/webhook','/api/auth/apple/callback'];
  if (exempt.includes(req.path)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origen no permitido' });
  next();
}
app.use(mutationOriginGuard);
app.use(['/api/auth','/api/account','/api/admin','/api/payments'], (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/auth/local/login', loginLimiter);
app.use('/api/auth/local/register', registerLimiter);
app.use('/api/auth/local', authLimiter);
app.use('/api/payments/transfer/webhook', transferWebhookLimiter);
app.use('/api/payments', sensitiveLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/account', require('./routes/account'));
app.use('/api/notifications', require('./routes/notifications'));
app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'ABOGA GO API', version: '6.10.12', env: process.env.NODE_ENV || 'development' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  if (res.headersSent) return next(err);
  res.status(err.message === 'Origen no permitido por CORS' ? 403 : 500).json({ error: 'Ocurrió un error inesperado' });
});

const PORT = process.env.PORT || 4000;
connectDB().then(async () => {
  await ensureCreatorAccount();
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
