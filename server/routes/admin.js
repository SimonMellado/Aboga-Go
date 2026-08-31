/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, requireStaff, effectiveStaffRole } = require('../middleware/auth');
const User = require('../models/User');
const Case = require('../models/Case');
const Notification = require('../models/Notification');
const ManualPayment = require('../models/ManualPayment');
const { sendTransactional } = require('../config/mailer');
const SecurityEvent = require('../models/SecurityEvent');
const SignupBonusClaim = require('../models/SignupBonusClaim');
const { recordSecurityEvent } = require('../utils/security');

router.use(requireAuth);

router.get('/me', (req, res) => {
  res.json({ staffRole: effectiveStaffRole(req.user) });
});


router.get('/security/summary', requireStaff('creador', 'admin'), async (req, res) => {
  const now = new Date();
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [failedLogins24h, blocked24h, lockedAccounts, bonusesGranted30d, bonusesDenied30d, recent] = await Promise.all([
    SecurityEvent.countDocuments({ type: 'login_failed', createdAt: { $gte: day } }),
    SecurityEvent.countDocuments({ outcome: 'blocked', createdAt: { $gte: day } }),
    User.countDocuments({ 'security.lockUntil': { $gt: now } }),
    SignupBonusClaim.countDocuments({ granted: true, createdAt: { $gte: month } }),
    SignupBonusClaim.countDocuments({ granted: false, createdAt: { $gte: month } }),
    SecurityEvent.find({ createdAt: { $gte: day }, type: { $in: ['account_locked','login_blocked','signup_bonus_denied','password_reset','logout_all'] } }).select('type outcome metadata createdAt').sort({ createdAt: -1 }).limit(20).lean()
  ]);
  res.json({ failedLogins24h, blocked24h, lockedAccounts, bonusesGranted30d, bonusesDenied30d, recent });
});

router.get('/usuarios', requireStaff('creador', 'admin'), async (req, res) => {
  const users = await User.find().select('name firstName lastName email role staffRole verified verificationStatus credits premium createdAt').sort({ createdAt: -1 });
  res.json(users);
});

router.get('/usuarios/:id/portal', requireStaff('creador', 'admin'), async (req, res) => {
  const target = await User.findById(req.params.id).select('name firstName lastName email role staffRole verified verificationStatus credits premium lawyerProfile createdAt settings');
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!['cliente', 'abogado'].includes(target.role)) return res.status(400).json({ error: 'Este usuario no tiene un portal de cliente o abogado' });

  const baseUser = {
    _id: target._id,
    name: target.name,
    firstName: target.firstName,
    lastName: target.lastName,
    email: target.email,
    role: target.role,
    staffRole: target.staffRole,
    verified: target.verified,
    verificationStatus: target.verificationStatus,
    credits: target.credits,
    premium: target.premium,
    lawyerProfile: target.lawyerProfile,
    createdAt: target.createdAt
  };

  if (target.role === 'cliente') {
    const cases = await Case.find({ client: target._id })
      .populate('selectedLawyer', 'name firstName lastName email verified lawyerProfile')
      .sort({ createdAt: -1 })
      .lean();
    await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'admin_portal_preview', outcome: 'success', metadata: { targetUserId: String(target._id), portalRole: 'cliente' } });
    return res.json({ mode: 'readonly', portal: 'cliente', user: baseUser, cases });
  }

  const now = Date.now();
  const priorityHours = Math.max(0, Number(process.env.PREMIUM_PRIORITY_HOURS || 24));
  const premiumActive = Boolean(target.premium?.active && target.premium?.planEnd && new Date(target.premium.planEnd).getTime() > now);
  const [availableRaw, history] = await Promise.all([
    Case.find({ status: { $in: ['abierta', 'en_proceso'] } }).sort({ createdAt: -1 }).lean(),
    Case.find({ selectedLawyer: target._id }).sort({ acquiredAt: -1, createdAt: -1 }).lean()
  ]);
  const available = availableRaw.map(c => {
    const ageHours = (now - new Date(c.createdAt).getTime()) / 3600000;
    const taken = Boolean(c.selectedLawyer) || c.status === 'en_proceso';
    const priority = !taken && priorityHours > 0 && ageHours < priorityHours;
    const owned = String(c.selectedLawyer || '') === String(target._id);
    return {
      _id: c._id, numero: c.numero, tipo: c.tipo, comuna: c.comuna, atencion: c.atencion, intencion: c.intencion, urgencia: c.urgencia, descripcion: c.descripcion, status: c.status, createdAt: c.createdAt, acquiredAt: c.acquiredAt, acquisitionMode: c.acquisitionMode,
      taken, priority, freeAvailable: !taken && !priority, canTake: !taken && (!priority || premiumActive), requiresCredit: !taken && priority, hoursRemaining: priority ? Math.max(0, Math.ceil(priorityHours - ageHours)) : 0,
      owned, contactUnlocked: owned, contactName: owned ? c.contactName : '', contactWhatsapp: owned ? c.contactWhatsapp : '', contactEmail: owned ? c.contactEmail : ''
    };
  });
  const premiumAcquired = history.filter(c => c.acquisitionMode === 'premium_credit').length;
  const freeAcquired = history.filter(c => c.acquisitionMode === 'free_after_priority').length;
  const stats = { acquired: history.length, premiumAcquired, freeAcquired, creditsSpent: premiumAcquired, profileViews: target.lawyerProfile?.profileViews || 0 };
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'admin_portal_preview', outcome: 'success', metadata: { targetUserId: String(target._id), portalRole: 'abogado' } });
  res.json({ mode: 'readonly', portal: 'abogado', user: baseUser, available, history, stats, priorityHours });
});

router.get('/verificacion-pendiente', requireStaff('creador', 'admin', 'moderador'), async (req, res) => {
  const pendientes = await User.find({ role: 'abogado', verified: false }).select('name firstName lastName email role rut tituloDocUrl titleDocument.originalName titleDocument.mimeType verificationStatus verificationSubmittedAt verificationNotes lawyerProfile').sort({ verificationSubmittedAt: 1, createdAt: 1 });
  res.json(pendientes);
});

router.post('/verificar/:id', requireStaff('creador', 'admin', 'moderador'), async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'abogado' },
    { verified: true, verificationStatus: 'verified', verificationReviewedAt: new Date(), verificationNotes: '' },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'Abogado no encontrado' });
  await Notification.create({ user: user._id, type: 'account', title: 'Cuenta de abogado verificada', message: 'Tu cuenta fue verificada. Ya puedes acceder a oportunidades disponibles según tu plan.', linkView: 'abogado' });
  if (user.email && user.settings?.emailNotifications !== false) sendTransactional({ to:user.email, subject:'Cuenta de abogado verificada', text:'Tu perfil profesional fue aprobado. Ya puedes ingresar a ABOGA GO y acceder a oportunidades según tu plan.' }).catch(() => {});
  res.json(user);
});

router.post('/rechazar/:id', requireStaff('creador', 'admin', 'moderador'), async (req, res) => {
  const note = String(req.body?.note || 'Revisa tus antecedentes profesionales y vuelve a enviar la documentación.').trim().slice(0, 600);
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'abogado' },
    { verified: false, verificationStatus: 'rejected', verificationReviewedAt: new Date(), verificationNotes: note },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'Abogado no encontrado' });
  await Notification.create({ user: user._id, type: 'account', title: 'Se requieren cambios en tu verificación', message: note, linkView: 'cuenta' });
  if (user.email && user.settings?.emailNotifications !== false) sendTransactional({ to:user.email, subject:'Revisa tu verificación profesional', text:note }).catch(() => {});
  res.json(user);
});

router.get('/abogados/:id/documento', requireStaff('creador', 'admin', 'moderador'), async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'abogado' });
  if (!user) return res.status(404).json({ error: 'Documento no encontrado' });
  const privateBase = path.resolve(__dirname, '..', 'private_uploads', 'lawyer-titles');
  const oldBase = path.resolve(__dirname, '..', 'uploads', 'lawyer-titles');
  let absolute = user.titleDocument?.storagePath ? path.resolve(user.titleDocument.storagePath) : '';
  if (!absolute && user.tituloDocUrl) {
    const filename = path.basename(String(user.tituloDocUrl).split('?')[0]);
    const candidate = path.join(oldBase, filename);
    if (fs.existsSync(candidate)) absolute = candidate;
  }
  const allowed = absolute && (absolute.startsWith(privateBase + path.sep) || absolute.startsWith(oldBase + path.sep));
  if (!allowed || !fs.existsSync(absolute)) return res.status(404).json({ error: 'Documento no disponible' });
  res.type(user.titleDocument?.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(user.titleDocument?.originalName || 'certificado')}"`);
  res.sendFile(absolute);
});

router.get('/causas', requireStaff('creador', 'admin'), async (req, res) => {
  const causas = await Case.find().sort({ createdAt: -1 }).lean();
  res.json(causas.map(c => ({ ...c, taken: Boolean(c.selectedLawyer) || c.status === 'en_proceso' })));
});

router.post('/creditos/:userId', requireStaff('creador', 'admin'), async (req, res) => {
  const { delta } = req.body;
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.credits = Math.max(0, user.credits + Number(delta || 0));
  await user.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'credits_admin_adjustment', outcome: 'success', metadata: { targetUserId: String(user._id), delta: Number(delta || 0) } });
  res.json(user);
});

router.get('/roles', requireStaff('creador'), async (req, res) => {
  const users = await User.find().select('name firstName lastName email role staffRole createdAt').sort({ createdAt: -1 });
  res.json(users);
});

router.post('/roles/:userId', requireStaff('creador'), async (req, res) => {
  const allowed = new Set(['none', 'moderador', 'admin']);
  const staffRole = String(req.body?.staffRole || 'none');
  if (!allowed.has(staffRole)) return res.status(400).json({ error: 'Rol interno no válido' });
  const target = await User.findById(req.params.userId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.staffRole === 'creador') return res.status(403).json({ error: 'La cuenta creadora no puede ser modificada desde este panel' });
  target.staffRole = staffRole;
  if (target.role === 'admin') target.role = 'cliente';
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'staff_role_changed', outcome: 'success', metadata: { targetUserId: String(target._id), staffRole } });
  res.json({ ok: true, user: target });
});

router.get('/transferencias', requireStaff('creador', 'admin'), async (req, res) => {
  const rows = await ManualPayment.find().populate('user', 'name firstName lastName email').sort({ createdAt: -1 }).lean();
  res.json(rows);
});

router.get('/transferencias/:id/comprobante', requireStaff('creador', 'admin'), async (req, res) => {
  const payment = await ManualPayment.findById(req.params.id);
  if (!payment || !payment.proof?.path) return res.status(404).json({ error: 'Comprobante no encontrado' });
  const absolute = path.resolve(payment.proof.path);
  if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'Archivo no disponible' });
  res.type(payment.proof.mimeType || 'application/octet-stream');
  res.sendFile(absolute);
});

router.post('/transferencias/:id/revisar', requireStaff('creador', 'admin'), async (req, res) => {
  const action = String(req.body?.action || '');
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Acción no válida' });
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const payment = await ManualPayment.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['pending_proof', 'under_review'] } },
    { $set: { status: 'processing', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note } },
    { new: true }
  );
  if (!payment) {
    const existing = await ManualPayment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado' });
    return res.status(409).json({ error: 'Este pago ya fue revisado o está siendo procesado' });
  }
  if (action === 'reject') {
    payment.status = 'rejected';
    await payment.save();
    await Notification.create({ user: payment.user, type: 'account', title: 'Transferencia rechazada', message: note || 'No pudimos validar el comprobante. Revisa los datos y contacta a soporte.', linkView: 'abogado' });
    return res.json({ ok: true, payment });
  }
  if (!payment.proof?.path) {
    payment.status = 'pending_proof';
    await payment.save();
    return res.status(400).json({ error: 'El pago no tiene comprobante cargado' });
  }
  try {
    const user = await User.findById(payment.user);
    if (!user) throw new Error('Usuario no encontrado');
    if (payment.kind === 'credit_pack') {
      user.credits += payment.credits;
    } else {
      const now = new Date();
      const end = new Date(now); end.setDate(end.getDate() + 30);
      user.credits += payment.credits;
      user.premium = { active: true, tier: payment.productId, planStart: now, planEnd: end, autoRenew: false };
    }
    await user.save();
    payment.status = 'approved';
    await payment.save();
    await Notification.create({ user: user._id, type: 'account', title: 'Transferencia aprobada', message: payment.kind === 'credit_pack' ? `Se agregaron ${payment.credits} créditos a tu cuenta.` : 'Tu plan fue activado por 30 días. El pago por transferencia no se renueva automáticamente.', linkView: 'abogado' });
    return res.json({ ok: true, payment });
  } catch (err) {
    payment.status = 'under_review';
    await payment.save();
    return res.status(500).json({ error: err.message || 'No se pudo aplicar el pago' });
  }
});

module.exports = router;
