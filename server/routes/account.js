/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');

function clean(v, max = 300) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function cleanArray(v, maxItems = 10, maxLen = 80) { return Array.isArray(v) ? v.map(x => clean(x, maxLen)).filter(Boolean).slice(0, maxItems) : []; }
function safeUser(user) { const o = user.toObject(); delete o.passwordHash; return o; }

const uploadDir = path.join(__dirname, '..', 'uploads', 'lawyer-titles');
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
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      const url = `${req.protocol}://${req.get('host')}/uploads/lawyer-titles/${req.file.filename}`;
      user.tituloDocUrl = url;
      user.titleDocument = {
        url,
        originalName: clean(req.file.originalname, 220),
        mimeType: req.file.mimetype,
        uploadedAt: new Date()
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
  if (newPassword.length < 8 || newPassword.length > 72) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 8 y 72 caracteres' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (user.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  if (!user.authProviders.some(p => p.provider === 'local' && p.providerId === user.email)) user.authProviders.push({ provider: 'local', providerId: user.email });
  await user.save();
  res.json({ ok: true });
});

module.exports = router;
