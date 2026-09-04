/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { encryptString, decryptString, recoveryCodeHash } = require('../utils/encryption');
const { recordSecurityEvent, isAllowedFileSignature } = require('../utils/security');

function clean(v, max = 300) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function cleanArray(v, maxItems = 10, maxLen = 80) { return Array.isArray(v) ? v.map(x => clean(x, maxLen)).filter(Boolean).slice(0, maxItems) : []; }
function safeUser(user) { const o = user.toObject({ getters: true }); delete o.passwordHash; delete o.providerId; if (o.titleDocument) delete o.titleDocument.storagePath; delete o.rutNormalized; o.security = { lastLoginAt: o.security?.lastLoginAt, passwordChangedAt: o.security?.passwordChangedAt, twoFactorEnabled: Boolean(o.security?.twoFactor?.enabled), twoFactorEnabledAt: o.security?.twoFactor?.enabledAt }; o.oneclick = { inscribed: Boolean(o.oneclick?.inscribed) }; return o; }


function makeRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}
function verifyTwoFactorCode(user, rawCode) {
  const raw = String(rawCode || '').trim().replace(/\s+/g, '').toUpperCase();
  if (!user?.security?.twoFactor?.enabled || !user.security.twoFactor.secretEncrypted) return false;
  if (/^\d{6}$/.test(raw)) return authenticator.check(raw, decryptString(user.security.twoFactor.secretEncrypted));
  return false;
}

const uploadDir = path.join(__dirname, '..', 'private_uploads', 'lawyer-titles');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext) ? ext : '';
    cb(null, `${req.user._id}-${Date.now()}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Formato no permitido. Usa PDF, JPG o PNG.'));
    cb(null, true);
  }
});

router.post('/lawyer-title', requireAuth, (req, res) => {
  upload.single('document')(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el documento' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Selecciona un certificado o título' });
      if (!isAllowedFileSignature(req.file.path, req.file.mimetype)) { try { fs.unlinkSync(req.file.path); } catch (_) {} return res.status(400).json({ error: 'El archivo no coincide con un PDF, JPG o PNG válido' }); }
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      const url = '/api/account/lawyer-title/view';
      user.tituloDocUrl = url;
      user.titleDocument = {
        url,
        originalName: clean(req.file.originalname, 220),
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
        storagePath: req.file.path
      };
      if (user.role === 'abogado') {
        user.verified = false;
        user.verificationStatus = 'pending';
        user.verificationSubmittedAt = new Date();
      }
      await user.save();
      res.json({ ok: true, url, user: safeUser(user) });
    } catch (e) {
      res.status(500).json({ error: 'No se pudo guardar el documento' });
    }
  });
});

router.get('/lawyer-title/view', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'Documento no encontrado' });
  const privateBase = path.resolve(uploadDir);
  const oldBase = path.resolve(__dirname, '..', 'uploads', 'lawyer-titles');
  let absolute = user.titleDocument?.storagePath ? path.resolve(user.titleDocument.storagePath) : '';
  if (!absolute && user.tituloDocUrl) {
    const filename = path.basename(String(user.tituloDocUrl).split('?')[0]);
    const candidate = path.join(oldBase, filename);
    if (fs.existsSync(candidate)) absolute = candidate;
  }
  const allowed = absolute && ((absolute.startsWith(privateBase + path.sep)) || (absolute.startsWith(oldBase + path.sep)));
  if (!allowed || !fs.existsSync(absolute)) return res.status(404).json({ error: 'Documento no disponible' });
  res.type(user.titleDocument?.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(user.titleDocument?.originalName || 'certificado')}"`);
  res.sendFile(absolute);
});

router.patch('/profile', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  user.firstName = clean(req.body.firstName ?? user.firstName, 60);
  user.lastName = clean(req.body.lastName ?? user.lastName, 60);
  user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name;
  if (user.role === 'abogado') {
    const p = req.body.lawyerProfile || {};
    user.lawyerProfile.headline = clean(p.headline, 120);
    user.lawyerProfile.bio = clean(p.bio, 1200);
    user.lawyerProfile.region = clean(p.region, 100);
    user.lawyerProfile.comuna = clean(p.comuna, 100);
    user.lawyerProfile.specialties = cleanArray(p.specialties, 12, 100);
    user.lawyerProfile.yearsExperience = Math.max(0, Math.min(70, Number(p.yearsExperience) || 0));
    user.lawyerProfile.university = clean(p.university, 160);
    user.lawyerProfile.registryNumber = clean(p.registryNumber, 100);
    user.lawyerProfile.titleYear = p.titleYear ? Math.max(1900, Math.min(2100, Number(p.titleYear))) : undefined;
    user.lawyerProfile.titleNumber = clean(p.titleNumber, 120);
    user.lawyerProfile.serviceModes = cleanArray(p.serviceModes, 4, 60);
    user.lawyerProfile.professionalUrl = clean(p.professionalUrl, 300);
    user.lawyerProfile.phone = clean(p.phone, 30);
  }
  await user.save();
  res.json({ user: safeUser(user) });
});

router.patch('/settings', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  ['emailNotifications', 'opportunityNotifications', 'proposalNotifications'].forEach(k => {
    if (typeof req.body[k] === 'boolean') user.settings[k] = req.body[k];
  });
  await user.save();
  res.json({ user: safeUser(user) });
});

router.patch('/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 10 || newPassword.length > 72 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(newPassword) || !/\d/.test(newPassword)) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 10 y 72 caracteres e incluir letras y números' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (user.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.security.tokenVersion = Number(user.security?.tokenVersion || 0) + 1;
  user.security.passwordChangedAt = new Date();
  user.security.failedLoginAttempts = 0;
  user.security.lockUntil = undefined;
  if (!user.authProviders.some(p => p.provider === 'local' && p.providerId === user.email)) user.authProviders.push({ provider: 'local', providerId: user.email });
  await user.save();
  const token = jwt.sign({ id: user._id, role: user.role, ver: Number(user.security?.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256', issuer: 'abogago-api', audience: 'abogago-web' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
  await recordSecurityEvent({ req, user, email: user.email, type: 'password_changed', outcome: 'success' });
  res.json({ ok: true });
});


router.post('/security/2fa/setup', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.security?.twoFactor?.enabled) return res.status(409).json({ error: '2FA ya está activado' });
    if (user.passwordHash) {
      const currentPassword = String(req.body.currentPassword || '');
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Confirma tu contraseña actual para activar 2FA' });
    }
    const secret = authenticator.generateSecret();
    const issuer = String(process.env.TWO_FACTOR_ISSUER || 'ABOGA GO').slice(0, 60);
    const otpauth = authenticator.keyuri(user.email, issuer, secret);
    user.security.twoFactor.pendingSecretEncrypted = encryptString(secret);
    user.security.twoFactor.pendingCreatedAt = new Date();
    await user.save();
    const qrDataUrl = await QRCode.toDataURL(otpauth, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
    await recordSecurityEvent({ req, user, email: user.email, type: '2fa_setup_started', outcome: 'info' });
    res.json({ secret, otpauth, qrDataUrl, expiresIn: 600 });
  } catch (err) {
    console.error('2fa setup:', err);
    res.status(500).json({ error: 'No se pudo iniciar la configuración 2FA' });
  }
});

router.post('/security/2fa/enable', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const pending = user.security?.twoFactor?.pendingSecretEncrypted;
    const created = user.security?.twoFactor?.pendingCreatedAt;
    if (!pending || !created || Date.now() - new Date(created).getTime() > 10 * 60 * 1000) return res.status(400).json({ error: 'La configuración 2FA expiró. Iníciala nuevamente.' });
    const code = String(req.body.code || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6 || !authenticator.check(code, decryptString(pending))) return res.status(400).json({ error: 'Código de autenticación incorrecto' });
    const recoveryCodes = makeRecoveryCodes(10);
    user.security.twoFactor.enabled = true;
    user.security.twoFactor.secretEncrypted = pending;
    user.security.twoFactor.pendingSecretEncrypted = '';
    user.security.twoFactor.pendingCreatedAt = undefined;
    user.security.twoFactor.recoveryCodeHashes = recoveryCodes.map(recoveryCodeHash);
    user.security.twoFactor.enabledAt = new Date();
    user.security.twoFactor.lastUsedAt = new Date();
    user.security.tokenVersion = Number(user.security?.tokenVersion || 0) + 1;
    await user.save();
    await recordSecurityEvent({ req, user, email: user.email, type: '2fa_enabled', outcome: 'success' });
    const token = jwt.sign({ id: user._id, role: user.role, ver: Number(user.security?.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256', issuer: 'abogago-api', audience: 'abogago-web' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ ok: true, recoveryCodes, user: safeUser(user) });
  } catch (err) {
    console.error('2fa enable:', err);
    res.status(500).json({ error: 'No se pudo activar 2FA' });
  }
});

router.post('/security/2fa/disable', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!user.security?.twoFactor?.enabled) return res.status(409).json({ error: '2FA no está activado' });
    if (!verifyTwoFactorCode(user, req.body.code)) return res.status(401).json({ error: 'Código 2FA incorrecto' });
    if (user.passwordHash) {
      const currentPassword = String(req.body.currentPassword || '');
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    user.security.twoFactor.enabled = false;
    user.security.twoFactor.secretEncrypted = '';
    user.security.twoFactor.pendingSecretEncrypted = '';
    user.security.twoFactor.pendingCreatedAt = undefined;
    user.security.twoFactor.recoveryCodeHashes = [];
    user.security.twoFactor.enabledAt = undefined;
    user.security.tokenVersion = Number(user.security?.tokenVersion || 0) + 1;
    await user.save();
    await recordSecurityEvent({ req, user, email: user.email, type: '2fa_disabled', outcome: 'success' });
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    res.json({ ok: true, message: '2FA desactivado. Inicia sesión nuevamente.' });
  } catch (err) {
    console.error('2fa disable:', err);
    res.status(500).json({ error: 'No se pudo desactivar 2FA' });
  }
});

router.post('/security/2fa/recovery-codes', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!verifyTwoFactorCode(user, req.body.code)) return res.status(401).json({ error: 'Código 2FA incorrecto' });
  const recoveryCodes = makeRecoveryCodes(10);
  user.security.twoFactor.recoveryCodeHashes = recoveryCodes.map(recoveryCodeHash);
  await user.save();
  await recordSecurityEvent({ req, user, email: user.email, type: '2fa_recovery_regenerated', outcome: 'success' });
  res.json({ ok: true, recoveryCodes });
});

router.post('/security/logout-all', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.security.tokenVersion = Number(user.security?.tokenVersion || 0) + 1;
  await user.save();
  await recordSecurityEvent({ req, user, email: user.email, type: 'logout_all', outcome: 'success' });
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.json({ ok: true, message: 'Todas las sesiones fueron cerradas' });
});

module.exports = router;
