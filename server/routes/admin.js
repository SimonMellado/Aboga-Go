/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireStaff, requireStaffPermission, hasStaffPermission, effectiveStaffRole } = require('../middleware/auth');
const User = require('../models/User');
const Case = require('../models/Case');
const Notification = require('../models/Notification');
const ManualPayment = require('../models/ManualPayment');
const CreditTransaction = require('../models/CreditTransaction');
const { sendTransactional } = require('../config/mailer');
const SecurityEvent = require('../models/SecurityEvent');
const SignupBonusClaim = require('../models/SignupBonusClaim');
const { recordSecurityEvent } = require('../utils/security');
const { matchesCatalogProduct } = require('../config/transbank');
const { decryptDeep } = require('../utils/encryption');

const STAFF_PERMISSIONS = ['users_manage', 'users_delete', 'roles_manage', 'credits_manage', 'verification_manage', 'payments_manage', 'cases_manage', 'security_view'];

function safeStaffUser(user) {
  const obj = user?.toObject ? user.toObject({ getters: true }) : { ...user };
  delete obj.passwordHash;
  delete obj.providerId;
  delete obj.rutNormalized;
  if (obj.titleDocument) delete obj.titleDocument.storagePath;
  if (obj.security) {
    obj.security = {
      lastLoginAt: obj.security.lastLoginAt,
      passwordChangedAt: obj.security.passwordChangedAt,
      twoFactor: {
        enabled: Boolean(obj.security.twoFactor?.enabled),
        enabledAt: obj.security.twoFactor?.enabledAt,
        lastUsedAt: obj.security.twoFactor?.lastUsedAt
      }
    };
  }
  if (obj.oneclick) obj.oneclick = { inscribed: Boolean(obj.oneclick.inscribed) };
  return obj;
}

router.use(requireAuth);

router.get('/me', (req, res) => {
  const staffRole = effectiveStaffRole(req.user);
  res.json({ staffRole, permissions: req.user.staffPermissions || [], effectivePermissions: STAFF_PERMISSIONS.filter(p => hasStaffPermission(req.user, p)) });
});


router.get('/security/summary', requireStaffPermission('security_view'), async (req, res) => {
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

router.get('/usuarios', requireStaffPermission('users_manage'), async (req, res) => {
  const users = await User.find().select('name firstName lastName email role staffRole staffPermissions verified verificationStatus credits premium active deletedAt createdAt').sort({ createdAt: -1 });
  res.json(users.map(u => safeStaffUser(u)));
});

router.post('/usuarios/:id/cambiar-tipo', requireStaffPermission('users_manage'), async (req, res) => {
  const role = String(req.body?.role || '').trim();
  if (!['cliente', 'abogado'].includes(role)) return res.status(400).json({ error: 'Tipo de cuenta no válido' });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.staffRole === 'creador') return res.status(403).json({ error: 'La cuenta creadora no puede ser modificada desde este panel' });
  if (['admin','moderador'].includes(target.staffRole) && effectiveStaffRole(req.user) !== 'creador') return res.status(403).json({ error: 'Solo la cuenta creadora puede modificar el tipo de una cuenta del equipo interno' });
  const previousRole = target.role;
  target.role = role;
  target.verified = false;
  target.verificationStatus = 'not_submitted';
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'account_type_changed', outcome: 'success', metadata: { targetUserId: String(target._id), previousRole, role } });
  res.json({ ok: true, user: safeStaffUser(target), previousRole, role });
});

router.post('/usuarios/:id/eliminar', requireStaffPermission('users_delete'), async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (String(target._id) === String(req.user._id)) return res.status(403).json({ error: 'No puedes eliminar tu propia cuenta desde este panel' });
  if (target.staffRole === 'creador') return res.status(403).json({ error: 'La cuenta creadora está protegida' });
  if (target.staffRole && target.staffRole !== 'none' && effectiveStaffRole(req.user) !== 'creador') return res.status(403).json({ error: 'Solo la cuenta creadora puede eliminar cuentas del equipo interno' });
  if (target.active === false) return res.status(409).json({ error: 'La cuenta ya está desactivada' });
  const reason = String(req.body?.reason || 'Desactivación realizada desde el panel administrativo').trim().slice(0, 300);
  target.active = false;
  target.deletedAt = new Date();
  target.deletedBy = req.user._id;
  target.deletionReason = reason;
  target.security.tokenVersion = Number(target.security?.tokenVersion || 0) + 1;
  target.oneclick = target.oneclick || {};
  target.oneclick.pendingToken = '';
  target.oneclick.pendingPlan = undefined;
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'account_disabled_admin', outcome: 'success', metadata: { targetUserId: String(target._id), reason } });
  res.json({ ok: true, user: safeStaffUser(target), message: 'Cuenta desactivada. Los registros históricos se conservan para auditoría.' });
});

router.post('/usuarios/:id/restaurar', requireStaffPermission('users_manage'), async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.staffRole === 'creador') return res.status(403).json({ error: 'La cuenta creadora no requiere restauración' });
  target.active = true;
  target.deletedAt = undefined;
  target.deletedBy = undefined;
  target.deletionReason = '';
  target.security.tokenVersion = Number(target.security?.tokenVersion || 0) + 1;
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'account_restored_admin', outcome: 'success', metadata: { targetUserId: String(target._id) } });
  res.json({ ok: true, user: safeStaffUser(target) });
});

router.post('/usuarios/:id/premium', requireStaffPermission('users_manage'), async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.role !== 'abogado') return res.status(400).json({ error: 'El plan Premium solo puede asignarse a abogados' });
  const tier = String(req.body?.tier || '').trim();
  if (!['free','premium','pro'].includes(tier)) return res.status(400).json({ error: 'Plan no válido' });
  if (tier === 'free') {
    target.premium = { ...(target.premium?.toObject?.() || target.premium || {}), active: false, tier: undefined, planStart: undefined, planEnd: undefined, autoRenew: false, renewalLockUntil: undefined };
  } else {
    const days = Math.max(1, Math.min(365, Number(req.body?.days || 30)));
    const start = new Date();
    target.premium = { ...(target.premium?.toObject?.() || target.premium || {}), active: true, tier, planStart: start, planEnd: new Date(Date.now() + days * 86400000), autoRenew: false, renewalLockUntil: undefined };
  }
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'premium_admin_adjustment', outcome: 'success', metadata: { targetUserId: String(target._id), tier, days: tier === 'free' ? 0 : Math.max(1, Math.min(365, Number(req.body?.days || 30))) } });
  res.json({ ok: true, user: safeStaffUser(target) });
});

router.post('/usuarios/:id/portal-session', requireStaffPermission('users_manage'), async (req, res) => {
  const target = await User.findById(req.params.id).select('_id role active staffRole');
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.active === false) return res.status(403).json({ error: 'No puedes abrir el portal de una cuenta desactivada' });
  if (!['cliente', 'abogado'].includes(target.role)) return res.status(400).json({ error: 'Este usuario no tiene un portal de cliente o abogado' });
  const token = jwt.sign(
    { typ: 'admin_portal', actorId: req.user._id.toString(), targetId: target._id.toString(), portalRole: target.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'abogago-api', audience: 'abogago-web', expiresIn: '30m' }
  );
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'admin_portal_session', outcome: 'success', metadata: { targetUserId: String(target._id), portalRole: target.role } });
  res.json({ ok: true, token, portal: target.role, expiresIn: 1800 });
});

router.get('/usuarios/:id/portal', requireStaffPermission('users_manage'), async (req, res) => {
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
    const safeCases = decryptDeep(cases);
    await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'admin_portal_preview', outcome: 'success', metadata: { targetUserId: String(target._id), portalRole: 'cliente' } });
    return res.json({ mode: 'admin', portal: 'cliente', user: baseUser, cases: safeCases });
  }

  const now = Date.now();
  const priorityHours = Math.max(0, Number(process.env.PREMIUM_PRIORITY_HOURS || 24));
  const premiumActive = Boolean(target.premium?.active && target.premium?.planEnd && new Date(target.premium.planEnd).getTime() > now);
  const [availableRaw, history] = await Promise.all([
    Case.find({ status: { $in: ['abierta', 'en_proceso'] } }).sort({ createdAt: -1 }).lean(),
    Case.find({ selectedLawyer: target._id }).sort({ acquiredAt: -1, createdAt: -1 }).lean()
  ]);
  const availableSafe = decryptDeep(availableRaw);
  const historySafe = decryptDeep(history);
  const available = availableSafe.map(c => {
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
  const premiumAcquired = historySafe.filter(c => c.acquisitionMode === 'premium_credit').length;
  const freeAcquired = historySafe.filter(c => c.acquisitionMode === 'free_after_priority').length;
  const stats = { acquired: historySafe.length, premiumAcquired, freeAcquired, creditsSpent: premiumAcquired, profileViews: target.lawyerProfile?.profileViews || 0 };
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'admin_portal_preview', outcome: 'success', metadata: { targetUserId: String(target._id), portalRole: 'abogado' } });
  res.json({ mode: 'admin', portal: 'abogado', user: baseUser, available, history: historySafe, stats, priorityHours });
});

router.get('/verificacion-pendiente', requireStaffPermission('verification_manage'), async (req, res) => {
  const pendientes = await User.find({ role: 'abogado', verified: false }).select('name firstName lastName email role rut tituloDocUrl titleDocument.originalName titleDocument.mimeType verificationStatus verificationSubmittedAt verificationNotes lawyerProfile').sort({ verificationSubmittedAt: 1, createdAt: 1 });
  res.json(pendientes);
});

router.post('/verificar/:id', requireStaffPermission('verification_manage'), async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'abogado' },
    { verified: true, verificationStatus: 'verified', verificationReviewedAt: new Date(), verificationNotes: '' },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'Abogado no encontrado' });
  await Notification.create({ user: user._id, type: 'account', title: 'Cuenta de abogado verificada', message: 'Tu cuenta fue verificada. Ya puedes acceder a oportunidades disponibles según tu plan.', linkView: 'abogado' });
  if (user.email && user.settings?.emailNotifications !== false) sendTransactional({ to:user.email, subject:'Cuenta de abogado verificada', text:'Tu perfil profesional fue aprobado. Ya puedes ingresar a ABOGA GO y acceder a oportunidades según tu plan.' }).catch(() => {});
  res.json(safeStaffUser(user));
});

router.post('/rechazar/:id', requireStaffPermission('verification_manage'), async (req, res) => {
  const note = String(req.body?.note || 'Revisa tus antecedentes profesionales y vuelve a enviar la documentación.').trim().slice(0, 600);
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'abogado' },
    { verified: false, verificationStatus: 'rejected', verificationReviewedAt: new Date(), verificationNotes: note },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'Abogado no encontrado' });
  await Notification.create({ user: user._id, type: 'account', title: 'Se requieren cambios en tu verificación', message: note, linkView: 'cuenta' });
  if (user.email && user.settings?.emailNotifications !== false) sendTransactional({ to:user.email, subject:'Revisa tu verificación profesional', text:note }).catch(() => {});
  res.json(safeStaffUser(user));
});

router.get('/abogados/:id/documento', requireStaffPermission('verification_manage'), async (req, res) => {
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

router.get('/causas', requireStaffPermission('cases_manage'), async (req, res) => {
  const causas = decryptDeep(await Case.find().sort({ createdAt: -1 }).lean());
  res.json(causas.map(c => ({ ...c, taken: Boolean(c.selectedLawyer) || c.status === 'en_proceso' })));
});

router.post('/creditos/:userId', requireStaffPermission('credits_manage'), async (req, res) => {
  const delta = Number(req.body?.delta);
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000) return res.status(400).json({ error: 'El ajuste debe ser un entero entre -1000 y 1000 y distinto de cero' });
  const user = await User.findOne({ _id: req.params.userId, role: 'abogado' });
  if (!user) return res.status(404).json({ error: 'Abogado no encontrado' });
  const previousCredits = Number(user.credits || 0);
  const nextCredits = previousCredits + delta;
  if (!Number.isSafeInteger(nextCredits) || nextCredits < 0) return res.status(400).json({ error: 'El saldo no puede quedar negativo' });
  user.credits = nextCredits;
  await user.save();
  await CreditTransaction.create({ user: user._id, kind: 'admin_adjust', credits: delta, clpAmount: 0, status: 'approved', provider: 'admin', buyOrder: `ADMIN-${Date.now()}-${String(user._id).slice(-8)}` });
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'credits_admin_adjustment', outcome: 'success', metadata: { targetUserId: String(user._id), delta, previousCredits, nextCredits } });
  res.json({ ok: true, user: safeStaffUser(user), previousCredits, nextCredits });
});

router.get('/roles', requireStaff('creador'), async (req, res) => {
  const users = await User.find().select('name firstName lastName email role staffRole staffPermissions active createdAt').sort({ createdAt: -1 });
  res.json(users);
});

router.post('/roles/:userId', requireStaff('creador'), async (req, res) => {
  const allowed = new Set(['none', 'moderador', 'admin']);
  const staffRole = String(req.body?.staffRole || 'none');
  const permissions = Array.isArray(req.body?.permissions) ? [...new Set(req.body.permissions.map(String))] : [];
  if (!allowed.has(staffRole)) return res.status(400).json({ error: 'Rol interno no válido' });
  if (permissions.some(p => !STAFF_PERMISSIONS.includes(p))) return res.status(400).json({ error: 'Uno o más permisos no son válidos' });
  const target = await User.findById(req.params.userId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.staffRole === 'creador') return res.status(403).json({ error: 'La cuenta creadora no puede ser modificada desde este panel' });
  const previousStaffRole = target.staffRole;
  target.staffRole = staffRole;
  target.staffPermissions = staffRole === 'moderador' ? permissions : [];
  if (staffRole === 'admin') {
    target.role = 'abogado';
    target.verified = true;
    target.verificationStatus = 'verified';
  } else if (target.role === 'admin') {
    target.role = 'cliente';
  }
  await target.save();
  await recordSecurityEvent({ req, user: req.user, email: req.user.email, type: 'staff_role_changed', outcome: 'success', metadata: { targetUserId: String(target._id), previousStaffRole, staffRole, permissions: target.staffPermissions } });
  res.json({ ok: true, user: safeStaffUser(target) });
});


router.get('/compras', requireStaffPermission('payments_manage'), async (req, res) => {
  const [cardPayments, transfers] = await Promise.all([
    CreditTransaction.find().populate('user', 'name firstName lastName email rut rutNormalized credits premium').sort({ createdAt: -1 }).lean(),
    ManualPayment.find().populate('user', 'name firstName lastName email rut rutNormalized credits premium').sort({ createdAt: -1 }).lean()
  ]);

  const cardRows = cardPayments.map(p => {
    const verification = p.providerVerification || {};
    const providerVerified = Boolean(p.status === 'approved' && verification.verified);
    return {
      id: p._id,
      source: 'card',
      method: p.provider === 'oneclick' ? 'Oneclick' : p.provider === 'flow' ? 'Flow' : 'Webpay',
      provider: p.provider || (p.kind === 'pack' ? 'webpay' : 'oneclick'),
      user: p.user || null,
      kind: p.kind,
      productId: p.plan || (p.kind === 'pack' ? 'credit_pack' : p.kind),
      credits: p.credits,
      amount: p.clpAmount,
      status: p.status,
      createdAt: p.createdAt,
      paymentVerified: providerVerified,
      verificationLevel: providerVerified ? 'provider' : (p.status === 'approved' ? 'historical_without_evidence' : 'not_verified'),
      evidence: {
        buyOrder: p.buyOrder || '',
        providerStatus: verification.providerStatus || '',
        responseCode: verification.responseCode,
        authorizationCode: verification.authorizationCode || '',
        paymentTypeCode: verification.paymentTypeCode || '',
        cardLast4: verification.cardLast4 || '',
        installmentsNumber: verification.installmentsNumber,
        transactionDate: verification.transactionDate || null,
        verifiedAt: verification.verifiedAt || null,
        amountReportedByProvider: verification.amount
      }
    };
  });

  const transferRows = transfers.map(p => {
    const automatic = p.verificationSource === 'provider_webhook' && p.status === 'approved' && Boolean(p.settlementId);
    const manualApproved = p.verificationSource === 'manual' && p.status === 'approved';
    return {
      id: p._id,
      source: 'transfer',
      method: 'Transferencia',
      provider: p.verificationSource === 'provider_webhook' ? 'conciliacion_webhook' : 'manual',
      user: p.user || null,
      kind: p.kind,
      productId: p.productId,
      credits: p.credits,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      paymentVerified: automatic,
      verificationLevel: automatic ? 'provider' : (manualApproved ? 'manual_bank_check' : 'not_verified'),
      evidence: {
        reference: p.reference,
        payerRut: p.payerRutDisplay || '',
        settlementId: p.settlementId || '',
        verificationSource: p.verificationSource || '',
        autoApprovedAt: p.autoApprovedAt || null,
        reviewedAt: p.reviewedAt || null,
        reviewedBy: p.reviewedBy || null,
        reviewNote: p.reviewNote || '',
        proofUploaded: Boolean(p.proof?.path),
        proofOriginalName: p.proof?.originalName || ''
      }
    };
  });

  const rows = decryptDeep([...cardRows, ...transferRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  res.json({
    generatedAt: new Date(),
    totals: {
      purchases: rows.length,
      approved: rows.filter(r => r.status === 'approved').length,
      providerVerified: rows.filter(r => r.paymentVerified).length,
      needsReview: rows.filter(r => r.verificationLevel === 'manual_bank_check' || r.verificationLevel === 'historical_without_evidence').length
    },
    purchases: rows
  });
});

router.get('/compras/:source/:id/json', requireStaffPermission('payments_manage'), async (req, res) => {
  const source = String(req.params.source || '');
  if (source === 'card') {
    const payment = await CreditTransaction.findById(req.params.id).populate('user', 'name firstName lastName email rut rutNormalized credits premium createdAt').lean();
    if (!payment) return res.status(404).json({ error: 'Compra no encontrada' });
    const safePayment = decryptDeep(payment);
    const verification = safePayment.providerVerification || {};
    return res.json({
      compra: {
        id: safePayment._id,
        metodo: safePayment.provider === 'oneclick' ? 'Oneclick' : safePayment.provider === 'flow' ? 'Flow' : 'Webpay',
        proveedor: safePayment.provider || 'transbank',
        estado: safePayment.status,
        montoCLP: safePayment.clpAmount,
        creditos: safePayment.credits,
        tipo: safePayment.kind,
        plan: safePayment.plan || null,
        fechaCreacion: safePayment.createdAt
      },
      abogado: safePayment.user || null,
      verificacionPago: {
        pagoConfirmadoPorProveedor: Boolean(safePayment.status === 'approved' && verification.verified),
        estadoProveedor: verification.providerStatus || null,
        codigoRespuesta: verification.responseCode ?? null,
        codigoAutorizacion: verification.authorizationCode || null,
        tipoPago: verification.paymentTypeCode || null,
        tarjetaUltimos4: verification.cardLast4 || null,
        cuotas: verification.installmentsNumber ?? null,
        montoInformadoPorProveedor: verification.amount ?? null,
        fechaTransaccion: verification.transactionDate || null,
        fechaVerificacion: verification.verifiedAt || null,
        ordenCompra: safePayment.buyOrder || null,
        ordenFlow: safePayment.flowOrder || null,
        tokenFlowRegistrado: Boolean(safePayment.flowToken),
        pagadorFlow: verification.payerEmail || null,
        medioPagoFlow: verification.paymentMedia || null,
        moneda: verification.currency || 'CLP',
        nota: safePayment.status === 'approved' && !verification.verified ? 'Compra histórica aprobada antes de guardar evidencia detallada del proveedor.' : null
      }
    });
  }
  if (source === 'transfer') {
    const payment = await ManualPayment.findById(req.params.id).populate('user', 'name firstName lastName email rut rutNormalized credits premium createdAt').populate('reviewedBy', 'name email staffRole').lean();
    if (!payment) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const safePayment = decryptDeep(payment);
    const autoVerified = safePayment.status === 'approved' && safePayment.verificationSource === 'provider_webhook' && Boolean(safePayment.settlementId);
    return res.json({
      compra: {
        id: safePayment._id,
        metodo: 'Transferencia bancaria',
        estado: safePayment.status,
        montoCLP: safePayment.amount,
        creditos: safePayment.credits,
        tipo: safePayment.kind,
        producto: safePayment.productId,
        referencia: safePayment.reference,
        fechaCreacion: safePayment.createdAt
      },
      abogado: safePayment.user || null,
      verificacionPago: {
        pagoConfirmadoAutomaticamente: autoVerified,
        origenValidacion: safePayment.verificationSource || 'pendiente',
        idLiquidacionBancoProveedor: safePayment.settlementId || null,
        rutTitularEsperado: safePayment.payerRutDisplay || null,
        comprobanteCargado: Boolean(safePayment.proof?.path),
        nombreComprobante: safePayment.proof?.originalName || null,
        aprobadoAutomaticamenteEn: safePayment.autoApprovedAt || null,
        revisadoEn: safePayment.reviewedAt || null,
        revisadoPor: safePayment.reviewedBy || null,
        notaRevision: safePayment.reviewNote || null,
        advertencia: safePayment.verificationSource === 'manual' ? 'La aprobación manual indica que un administrador declaró haber verificado el abono. Confirma el movimiento en la cuenta bancaria si necesitas una segunda comprobación.' : null
      }
    });
  }
  res.status(400).json({ error: 'Origen de compra no válido' });
});

router.get('/transferencias', requireStaffPermission('payments_manage'), async (req, res) => {
  const rows = await ManualPayment.find().populate('user', 'name firstName lastName email rut').sort({ createdAt: -1 }).lean();
  res.json(decryptDeep(rows));
});

router.get('/transferencias/:id/comprobante', requireStaffPermission('payments_manage'), async (req, res) => {
  const payment = await ManualPayment.findById(req.params.id);
  if (!payment || !payment.proof?.path) return res.status(404).json({ error: 'Comprobante no encontrado' });
  const proofBase = path.resolve(__dirname, '..', 'private_uploads', 'transfers');
  const absolute = path.resolve(payment.proof.path);
  if (!absolute.startsWith(proofBase + path.sep) || !fs.existsSync(absolute)) return res.status(404).json({ error: 'Archivo no disponible' });
  res.type(payment.proof.mimeType || 'application/octet-stream');
  res.sendFile(absolute);
});

function safeManualPayment(payment) {
  const p = payment?.toObject ? payment.toObject({ getters: true }) : { ...payment };
  if (p.proof) p.proof = { originalName: p.proof.originalName || '', mimeType: p.proof.mimeType || '', uploadedAt: p.proof.uploadedAt || null };
  delete p.payerRutNormalized;
  delete p.proof?.path;
  return p;
}

router.post('/transferencias/:id/revisar', requireStaffPermission('payments_manage'), async (req, res) => {
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
    return res.json({ ok: true, payment: safeManualPayment(payment) });
  }
  if (!payment.proof?.path) {
    payment.status = 'pending_proof';
    await payment.save();
    return res.status(400).json({ error: 'El pago no tiene comprobante cargado' });
  }
  try {
    if (!matchesCatalogProduct(payment.kind, payment.productId, payment.amount, payment.credits)) {
      payment.status = 'under_review';
      await payment.save();
      return res.status(409).json({ error: 'El monto o los créditos no coinciden con el catálogo oficial. No se aplicó el pago.' });
    }
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
    payment.verificationSource = 'manual';
    await payment.save();
    await Notification.create({ user: user._id, type: 'account', title: 'Transferencia aprobada', message: payment.kind === 'credit_pack' ? `Se agregaron ${payment.credits} créditos a tu cuenta.` : 'Tu plan fue activado por 30 días. El pago por transferencia no se renueva automáticamente.', linkView: 'abogado' });
    return res.json({ ok: true, payment: safeManualPayment(payment) });
  } catch (err) {
    payment.status = 'under_review';
    await payment.save();
    return res.status(500).json({ error: err.message || 'No se pudo aplicar el pago' });
  }
});

module.exports = router;
