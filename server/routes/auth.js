/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const EmailCode = require('../models/EmailCode');
const { sendLoginCode, sendResetCode } = require('../config/mailer');
const { requireAuth } = require('../middleware/auth');
const { recordSecurityEvent, grantSignupBonus } = require('../utils/security');

function issueToken(user) {
  return jwt.sign({ id: user._id, role: user.role, ver: Number(user.security?.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256', issuer: 'abogago-api', audience: 'abogago-web' });
}

function setAuthCookie(res, user) {
  const token = issueToken(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function frontendBase() {
  return String(process.env.FRONTEND_URL || 'https://abogago.online').trim().replace(/\/$/, '');
}

function loginAndRedirect(req, res, user, redirectPath) {
  setAuthCookie(res, user);
  res.redirect(`${frontendBase()}${redirectPath}`);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function cleanName(value, max = 60) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 72 && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) && /\d/.test(password);
}
function normalizeRut(value) {
  return String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
}
function isValidRut(value) {
  const rut = normalizeRut(value);
  if (rut.length < 8 || rut.length > 9) return false;
  const body = rut.slice(0, -1);
  const dv = rut.slice(-1);
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expected;
}
function cleanText(value, max = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function cleanList(value, maxItems = 12, maxLen = 100) {
  return Array.isArray(value) ? value.map(v => cleanText(v, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}
function hashCode(email, code) {
  return crypto.createHmac('sha256', process.env.SECURITY_PEPPER || process.env.JWT_SECRET).update(`email-code:${email}:${code}`).digest('hex');
}
function staffRoleOf(user) {
  if (!user) return 'none';
  if (user.staffRole && user.staffRole !== 'none') return user.staffRole;
  return user.role === 'admin' ? 'admin' : 'none';
}

async function ensurePrivilegedLawyerAccess(user) {
  if (!user || !['creador', 'admin'].includes(staffRoleOf(user))) return user;
  let changed = false;
  if (user.role !== 'abogado') { user.role = 'abogado'; changed = true; }
  if (!user.verified) { user.verified = true; changed = true; }
  if (user.verificationStatus !== 'verified') { user.verificationStatus = 'verified'; changed = true; }
  if (changed) await user.save();
  return user;
}

function publicUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.providerId;
  if (obj.titleDocument) delete obj.titleDocument.storagePath;
  delete obj.rutNormalized;
  obj.security = { lastLoginAt: obj.security?.lastLoginAt, passwordChangedAt: obj.security?.passwordChangedAt };
  obj.oneclick = { inscribed: Boolean(obj.oneclick?.inscribed) };
  return obj;
}

router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google Login aún no está configurado.');
  }
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${frontendBase()}/index.html?login=error`);
  }
  return passport.authenticate('google', {
    session: false,
    failureRedirect: `${frontendBase()}/index.html?login=error`,
  })(req, res, () => {
    const path = req.user.role === 'sin_definir' ? '/index.html?login=elegir_rol' : '/index.html?login=exitoso';
    loginAndRedirect(req, res, req.user, path);
  });
});

router.get('/apple', (req, res, next) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY_PATH) {
    return res.status(503).send('Apple Login estará disponible próximamente.');
  }
  return passport.authenticate('apple', { session: false })(req, res, next);
});

router.post('/apple/callback', (req, res, next) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY_PATH) {
    return res.redirect(`${frontendBase()}/index.html?login=error`);
  }
  return passport.authenticate('apple', {
    session: false,
    failureRedirect: `${frontendBase()}/index.html?login=error`,
  })(req, res, () => {
    const path = req.user.role === 'sin_definir' ? '/index.html?login=elegir_rol' : '/index.html?login=exitoso';
    loginAndRedirect(req, res, req.user, path);
  });
});

router.post('/local/register/request-code', async (req, res) => {
  try {
    if (String(req.body.website || '').trim()) return res.status(400).json({ error: 'No se pudo procesar el registro' });
    const firstName = cleanName(req.body.firstName);
    const lastName = cleanName(req.body.lastName);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const intendedRole = req.body.accountType === 'abogado' ? 'abogado' : 'cliente';

    if (firstName.length < 2) return res.status(400).json({ error: 'Ingresa tu nombre' });
    if (lastName.length < 2) return res.status(400).json({ error: 'Ingresa tu apellido' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Ingresa un correo válido' });
    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 72 caracteres e incluir letras y números' });
    }

    const existing = await User.findOne({ email }).select('+passwordHash');
    const alreadyLocal = existing && (
      Boolean(existing.passwordHash) ||
      existing.provider === 'local' ||
      existing.authProviders?.some(p => p.provider === 'local' && p.providerId === email)
    );
    if (alreadyLocal) {
      return res.status(409).json({ error: 'Ya existe una cuenta local con este correo. Inicia sesión.' });
    }

    const recent = await EmailCode.findOne({ email, purpose: 'register', used: false }).sort({ createdAt: -1 });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Espera 60 segundos antes de solicitar otro código' });
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const passwordHash = await bcrypt.hash(password, 12);

    const record = await EmailCode.create({
      email,
      purpose: 'register',
      firstName,
      lastName,
      intendedRole,
      passwordHash,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    let mailResult;
    try {
      mailResult = await sendLoginCode({ to: email, code });
    } catch (mailError) {
      await EmailCode.deleteOne({ _id: record._id }).catch(() => {});
      console.error('No se pudo enviar código de registro:', mailError.message);
      return res.status(503).json({ error: 'No pudimos enviar el código por correo. Intenta nuevamente en unos minutos.' });
    }
    res.json({
      ok: true,
      email,
      expiresIn: 600,
      message: 'Te enviamos un código de 6 dígitos para verificar tu correo',
      devMode: Boolean(mailResult.devMode),
    });
  } catch (err) {
    console.error('local register request-code:', err);
    res.status(500).json({ error: 'No se pudo iniciar el registro. Intenta nuevamente.' });
  }
});

router.post('/local/register/verify-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').replace(/\D/g, '').slice(0, 6);

    if (!isValidEmail(email) || code.length !== 6) {
      return res.status(400).json({ error: 'Código o correo inválido' });
    }

    const record = await EmailCode.findOne({ email, purpose: 'register', used: false }).sort({ createdAt: -1 });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
    }
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Demasiados intentos. Solicita un código nuevo.' });
    }

    const supplied = Buffer.from(hashCode(email, code));
    const expected = Buffer.from(record.codeHash);
    const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!valid) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ error: 'Código incorrecto' });
    }

    let user = await User.findOne({ email }).select('+passwordHash');
    const isNew = !user;

    if (!user) {
      user = await User.create({
        firstName: record.firstName,
        lastName: record.lastName,
        name: `${record.firstName} ${record.lastName}`.trim(),
        email,
        passwordHash: record.passwordHash,
        provider: 'local',
        providerId: email,
        authProviders: [{ provider: 'local', providerId: email }],
        emailVerified: true,
        role: record.intendedRole === 'cliente' ? 'cliente' : 'sin_definir',
      });
    } else {
      user.firstName = user.firstName || record.firstName;
      user.lastName = user.lastName || record.lastName;
      user.name = user.name || `${record.firstName} ${record.lastName}`.trim();
      user.passwordHash = record.passwordHash;
      user.emailVerified = true;
      if (user.role === 'sin_definir' && record.intendedRole === 'cliente') user.role = 'cliente';

      const linked = user.authProviders?.some(p => p.provider === 'local' && p.providerId === email);
      if (!linked) user.authProviders.push({ provider: 'local', providerId: email });
      await user.save();
    }

    record.used = true;
    record.passwordHash = undefined;
    await record.save();

    let bonus = { granted: false, credits: 0, reason: 'not_applicable' };
    if (record.intendedRole === 'cliente' && user.role === 'cliente' && !user.security?.signupBonusGrantedAt) bonus = await grantSignupBonus({ req, user });
    setAuthCookie(res, user);
    res.json({ user: publicUser(user), isNew, intendedRole: record.intendedRole, needsRole: user.role === 'sin_definir', bonusGranted: bonus.granted, bonusCredits: bonus.credits, bonusReason: bonus.reason });
  } catch (err) {
    console.error('local register verify-code:', err);
    res.status(500).json({ error: 'No se pudo verificar el código' });
  }
});

router.post('/local/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const portal = ['cliente', 'abogado'].includes(req.body.portal) ? req.body.portal : '';

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ error: 'Ingresa tu correo y contraseña' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      await recordSecurityEvent({ req, email, type: 'login_failed', outcome: 'failed', metadata: { reason: 'invalid_credentials' } });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    if (user.security?.lockUntil && user.security.lockUntil.getTime() > Date.now()) {
      await recordSecurityEvent({ req, user, email, type: 'login_blocked', outcome: 'blocked', metadata: { reason: 'temporary_lock' } });
      return res.status(429).json({ error: 'Cuenta temporalmente bloqueada por seguridad. Intenta nuevamente más tarde.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = Number(user.security?.failedLoginAttempts || 0) + 1;
      user.security.failedLoginAttempts = attempts;
      if (attempts >= 5) {
        user.security.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.security.failedLoginAttempts = 0;
      }
      await user.save();
      await recordSecurityEvent({ req, user, email, type: attempts >= 5 ? 'account_locked' : 'login_failed', outcome: attempts >= 5 ? 'blocked' : 'failed', metadata: { attempts } });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión' });
    }

    await ensurePrivilegedLawyerAccess(user);
    if (portal === 'abogado' && user.role !== 'abogado') return res.status(403).json({ error: 'Esta cuenta está registrada como cliente. Elige Cliente para ingresar.' });
    if (portal === 'cliente' && user.role === 'abogado') return res.status(403).json({ error: 'Esta cuenta está registrada como abogado. Elige Abogado para ingresar.' });
    user.security.failedLoginAttempts = 0;
    user.security.lockUntil = undefined;
    user.security.lastLoginAt = new Date();
    user.security.lastLoginIpHash = req.securitySignals?.ipHash || '';
    user.security.lastLoginDeviceHash = req.securitySignals?.deviceHash || '';
    await user.save();
    await recordSecurityEvent({ req, user, email, type: 'login_success', outcome: 'success' });
    setAuthCookie(res, user);
    res.json({ user: publicUser(user), needsRole: user.role === 'sin_definir' });
  } catch (err) {
    console.error('local login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await ensurePrivilegedLawyerAccess(req.user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});

router.post('/elegir-rol', requireAuth, async (req, res) => {
  const { role } = req.body;
  if (!['cliente', 'abogado'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.role !== 'sin_definir') return res.status(409).json({ error: 'El tipo de cuenta ya fue definido' });

  if (role === 'cliente') {
    user.role = 'cliente';
    await user.save();
    const bonus = await grantSignupBonus({ req, user });
    setAuthCookie(res, user);
    return res.json({ user: publicUser(user), bonusGranted: bonus.granted, bonusCredits: bonus.credits, bonusReason: bonus.reason });
  }

  const rut = cleanText(req.body.rut, 20);
  if (!isValidRut(rut)) return res.status(400).json({ error: 'Ingresa un RUT chileno válido' });
  if (!user.tituloDocUrl && !req.body.tituloDocUrl) {
    return res.status(400).json({ error: 'Debes subir tu certificado o título de abogado antes de enviar la verificación' });
  }

  const p = req.body.lawyerProfile || {};
  const phone = cleanText(p.phone, 30);
  const region = cleanText(p.region, 100);
  const comuna = cleanText(p.comuna, 100);
  const university = cleanText(p.university, 160);
  const specialties = cleanList(p.specialties, 12, 100);
  const serviceModes = cleanList(p.serviceModes, 4, 60);

  if (phone.length < 8) return res.status(400).json({ error: 'Ingresa un teléfono profesional válido' });
  if (!region || !comuna) return res.status(400).json({ error: 'Región y comuna son obligatorias para abogados' });
  if (!university) return res.status(400).json({ error: 'Indica la universidad o institución de egreso' });
  if (!specialties.length) return res.status(400).json({ error: 'Selecciona al menos una especialidad' });
  if (!serviceModes.length) return res.status(400).json({ error: 'Selecciona al menos una modalidad de atención' });

  user.role = 'abogado';
  user.rut = rut;
  user.rutNormalized = normalizeRut(rut);
  if (req.body.tituloDocUrl) user.tituloDocUrl = cleanText(req.body.tituloDocUrl, 500);
  user.verified = false;
  user.verificationStatus = 'pending';
  user.verificationSubmittedAt = new Date();
  user.verificationNotes = '';
  user.lawyerProfile.phone = phone;
  user.lawyerProfile.region = region;
  user.lawyerProfile.comuna = comuna;
  user.lawyerProfile.university = university;
  user.lawyerProfile.registryNumber = cleanText(p.registryNumber, 100);
  user.lawyerProfile.titleNumber = cleanText(p.titleNumber, 120);
  user.lawyerProfile.titleYear = p.titleYear ? Math.max(1900, Math.min(2100, Number(p.titleYear))) : undefined;
  user.lawyerProfile.specialties = specialties;
  user.lawyerProfile.serviceModes = serviceModes;
  user['oneclick.username'] = String(user._id);
  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.rutNormalized) return res.status(409).json({ error: 'Este RUT profesional ya está asociado a otra cuenta' });
    throw err;
  }
  const bonus = await grantSignupBonus({ req, user });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user), bonusGranted: bonus.granted, bonusCredits: bonus.credits, bonusReason: bonus.reason });
});


router.post('/local/password/request-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Ingresa un correo válido' });
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) return res.json({ ok: true, message: 'Si existe una cuenta local, enviaremos un código al correo' });
    const recent = await EmailCode.findOne({ email, purpose: 'password_reset', used: false }).sort({ createdAt: -1 });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) return res.status(429).json({ error: 'Espera 60 segundos antes de solicitar otro código' });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const record = await EmailCode.create({ email, purpose: 'password_reset', codeHash: hashCode(email, code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    let mailResult;
    try {
      mailResult = await sendResetCode({ to: email, code });
    } catch (mailError) {
      await EmailCode.deleteOne({ _id: record._id }).catch(() => {});
      console.error('No se pudo enviar código de recuperación:', mailError.message);
      return res.status(503).json({ error: 'No pudimos enviar el código por correo. Intenta nuevamente en unos minutos.' });
    }
    res.json({ ok: true, expiresIn: 600, devMode: Boolean(mailResult.devMode), message: 'Si existe una cuenta local, enviaremos un código al correo' });
  } catch (err) {
    console.error('password reset request:', err);
    res.status(500).json({ error: 'No se pudo iniciar la recuperación' });
  }
});

router.post('/local/password/reset', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').replace(/\D/g, '').slice(0, 6);
    const newPassword = String(req.body.newPassword || '');
    if (!isValidEmail(email) || code.length !== 6) return res.status(400).json({ error: 'Correo o código inválido' });
    if (!isStrongEnoughPassword(newPassword)) return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 72 caracteres e incluir letras y números' });
    const record = await EmailCode.findOne({ email, purpose: 'password_reset', used: false }).sort({ createdAt: -1 });
    if (!record || record.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: 'El código expiró o no existe' });
    if (record.attempts >= 5) return res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo código' });
    if (record.codeHash !== hashCode(email, code)) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ error: 'Código incorrecto' });
    }
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.security.tokenVersion = Number(user.security?.tokenVersion || 0) + 1;
    user.security.passwordChangedAt = new Date();
    user.security.failedLoginAttempts = 0;
    user.security.lockUntil = undefined;
    if (!user.authProviders.some(p => p.provider === 'local' && p.providerId === email)) user.authProviders.push({ provider: 'local', providerId: email });
    user.emailVerified = true;
    await user.save();
    await recordSecurityEvent({ req, user, email, type: 'password_reset', outcome: 'success' });
    record.used = true;
    await record.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('password reset:', err);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
});

module.exports = router;
