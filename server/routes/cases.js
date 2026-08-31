/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const Case = require('../models/Case');
const User = require('../models/User');
const Proposal = require('../models/Proposal');
const Notification = require('../models/Notification');
const { nextCaseNumber } = require('../models/Counter');
const { sendTransactional } = require('../config/mailer');

const H = 3600000;
const PREMIUM_PRIORITY_HOURS = Math.max(0, Number(process.env.PREMIUM_PRIORITY_HOURS || 24));

function hoursSince(date) { return (Date.now() - new Date(date).getTime()) / H; }
function clean(v, max = 300) { return String(v || '').trim().slice(0, max); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function normalizeChilePhone(v) {
  let digits = String(v || '').replace(/\D/g, '');
  if (digits.startsWith('56')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 9 && digits.startsWith('9')) return `+56${digits}`;
  return null;
}

function caseState(c, user) {
  const ageHours = hoursSince(c.createdAt);
  const taken = Boolean(c.selectedLawyer) || c.status === 'en_proceso';
  const priority = !taken && PREMIUM_PRIORITY_HOURS > 0 && ageHours < PREMIUM_PRIORITY_HOURS;
  const premium = Boolean(user?.premium?.active && user?.premium?.planEnd && new Date(user.premium.planEnd).getTime() > Date.now());
  return {
    taken,
    priority,
    freeAvailable: !taken && !priority,
    canTake: !taken && (!priority || premium),
    requiresCredit: !taken && priority,
    hoursRemaining: priority ? Math.max(0, Math.ceil(PREMIUM_PRIORITY_HOURS - ageHours)) : 0
  };
}

function publicCase(c, user) {
  const s = caseState(c, user);
  return {
    _id: c._id,
    numero: c.numero,
    tipo: c.tipo,
    comuna: c.comuna,
    atencion: c.atencion,
    intencion: c.intencion,
    urgencia: c.urgencia,
    descripcion: c.descripcion,
    status: c.status,
    createdAt: c.createdAt,
    acquiredAt: c.acquiredAt,
    acquisitionMode: c.acquisitionMode,
    priorityHours: PREMIUM_PRIORITY_HOURS,
    ...s
  };
}

router.post('/', requireAuth, requireRole('cliente'), async (req, res) => {
  try {
    const tipo = clean(req.body.tipo, 120);
    const comuna = clean(req.body.comuna, 80);
    const atencion = clean(req.body.atencion, 40);
    const intencion = clean(req.body.intencion, 40);
    const urgencia = clean(req.body.urgencia, 20) || 'Media';
    const descripcion = clean(req.body.descripcion, 1200);
    const contactName = clean(req.body.contactName, 100);
    const contactEmail = clean(req.body.contactEmail, 160).toLowerCase();
    const contactWhatsapp = normalizeChilePhone(req.body.contactWhatsapp);
    const contactConsent = req.body.contactConsent === true;

    if (!tipo || !comuna || !atencion || !intencion || !contactName || !contactWhatsapp || !contactEmail || !descripcion) return res.status(400).json({ error: 'Completa todos los campos obligatorios' });
    if (!validEmail(contactEmail)) return res.status(400).json({ error: 'Ingresa un correo válido' });
    if (!['Baja', 'Media', 'Alta'].includes(urgencia)) return res.status(400).json({ error: 'Urgencia inválida' });
    if (!contactConsent) return res.status(400).json({ error: 'Debes aceptar el uso de tus datos de contacto' });

    const numero = await nextCaseNumber();
    const nuevaCausa = await Case.create({ numero, client: req.user._id, tipo, comuna, atencion, intencion, urgencia, descripcion, contactName, contactWhatsapp, contactEmail, contactConsent, creditCost: 1 });

    const lawyers = await User.find({ role: 'abogado', verified: true, 'settings.opportunityNotifications': { $ne: false } }).select('_id premium lawyerProfile');
    const notifications = lawyers.filter(l => {
      const specialties = l.lawyerProfile?.specialties || [];
      return specialties.length === 0 || specialties.some(s => tipo.toLowerCase().includes(String(s).toLowerCase()) || String(s).toLowerCase().includes(tipo.toLowerCase()));
    }).map(l => ({
      user: l._id,
      type: 'case_new',
      title: l.premium?.active ? 'Nueva oportunidad Premium' : 'Nueva oportunidad publicada',
      message: `${tipo} en ${comuna}. ${l.premium?.active ? 'Puedes acceder ahora usando 1 crédito.' : `Se habilitará gratis si sigue disponible después de ${PREMIUM_PRIORITY_HOURS} horas.`}`,
      linkView: 'abogado',
      caseId: nuevaCausa._id
    }));
    if (notifications.length) await Notification.insertMany(notifications);

    res.status(201).json(nuevaCausa);
  } catch (err) {
    console.error('create case:', err);
    res.status(500).json({ error: 'No se pudo publicar la causa' });
  }
});

router.get('/mias', requireAuth, requireRole('cliente'), async (req, res) => {
  const causas = await Case.find({ client: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(causas.map(c => ({ ...c, taken: Boolean(c.selectedLawyer) || c.status === 'en_proceso' })));
});

router.patch('/:id', requireAuth, requireRole('cliente'), async (req, res) => {
  const causa = await Case.findOne({ _id: req.params.id, client: req.user._id });
  if (!causa) return res.status(404).json({ error: 'Causa no encontrada' });
  if (causa.status !== 'abierta' || causa.selectedLawyer) return res.status(400).json({ error: 'Solo puedes editar una causa que todavía no ha sido tomada' });
  ['tipo', 'comuna', 'descripcion', 'urgencia'].forEach(k => { if (req.body[k] !== undefined) causa[k] = clean(req.body[k], k === 'descripcion' ? 1200 : 120); });
  await causa.save();
  res.json(causa);
});

router.patch('/:id/cerrar', requireAuth, requireRole('cliente'), async (req, res) => {
  const causa = await Case.findOne({ _id: req.params.id, client: req.user._id });
  if (!causa) return res.status(404).json({ error: 'Causa no encontrada' });
  causa.status = 'cerrada';
  causa.closedAt = new Date();
  await causa.save();
  res.json(causa);
});

router.get('/disponibles', requireAuth, requireRole('abogado'), async (req, res) => {
  const causas = await Case.find({ status: { $in: ['abierta', 'en_proceso'] } }).sort({ createdAt: -1 });
  res.json(causas.map(c => publicCase(c, req.user)));
});

router.post('/:id/tomar', requireAuth, requireRole('abogado'), async (req, res) => {
  let charged = false;
  let acquired = false;
  try {
    if (!req.user.verified) return res.status(403).json({ error: 'Tu cuenta de abogado aún no está verificada' });
    const causa = await Case.findById(req.params.id);
    if (!causa) return res.status(404).json({ error: 'Causa no encontrada' });
    if (causa.status !== 'abierta' || causa.selectedLawyer) return res.status(409).json({ error: 'Esta oportunidad ya fue tomada por otro abogado' });

    const abogado = await User.findById(req.user._id);
    const state = caseState(causa, abogado);
    if (state.priority && !abogado.premium?.active) return res.status(403).json({ error: `Oportunidad Premium. Se habilita gratis en aproximadamente ${state.hoursRemaining} h si nadie la toma antes.` });

    if (state.requiresCredit) {
      const chargedUser = await User.findOneAndUpdate({ _id: abogado._id, credits: { $gte: 1 } }, { $inc: { credits: -1 } }, { new: true });
      if (!chargedUser) return res.status(400).json({ error: 'Necesitas 1 crédito para acceder durante la ventana Premium' });
      charged = true;
    }

    const acquiredAt = new Date();
    const acquisitionMode = state.requiresCredit ? 'premium_credit' : 'free_after_priority';
    const updated = await Case.findOneAndUpdate(
      { _id: causa._id, status: 'abierta', selectedLawyer: null },
      { $set: { selectedLawyer: abogado._id, status: 'en_proceso', acquiredAt, acquisitionMode } },
      { new: true }
    );

    if (!updated) {
      if (charged) await User.findByIdAndUpdate(abogado._id, { $inc: { credits: 1 } });
      return res.status(409).json({ error: 'Otro abogado tomó esta oportunidad antes que tú' });
    }

    acquired = true;
    await Proposal.updateMany({ case: updated._id, status: 'enviada' }, { $set: { status: 'rechazada' } }).catch(() => {});
    await Notification.create({
      user: updated.client,
      type: 'account',
      title: 'Un abogado accedió a tu consulta',
      message: `Tu causa N° ${updated.numero} fue tomada por un abogado verificado. El profesional ya puede ver tus datos de contacto.`,
      linkView: 'cliente',
      caseId: updated._id
    }).catch(() => {});
    const clientUser = await User.findById(updated.client).select('email settings').lean().catch(() => null);
    if (clientUser?.email && clientUser.settings?.emailNotifications !== false) sendTransactional({ to: clientUser.email, subject: 'Tu consulta fue tomada', text: `La consulta N° ${updated.numero} fue tomada por un abogado verificado. Ingresa a tu portal para revisar su estado.` }).catch(() => {});

    const freshUser = await User.findById(abogado._id);
    res.json({
      ok: true,
      credits: freshUser?.credits ?? abogado.credits,
      acquisitionMode,
      contact: { name: updated.contactName, whatsapp: updated.contactWhatsapp, email: updated.contactEmail }
    });
  } catch (err) {
    if (charged && !acquired) await User.findByIdAndUpdate(req.user._id, { $inc: { credits: 1 } }).catch(() => {});
    console.error('take case:', err);
    res.status(500).json({ error: 'No se pudo acceder a la oportunidad' });
  }
});

router.get('/historial', requireAuth, requireRole('abogado'), async (req, res) => {
  const cases = await Case.find({ selectedLawyer: req.user._id }).sort({ acquiredAt: -1, createdAt: -1 }).lean();
  res.json(cases.map(c => ({
    _id: c._id,
    numero: c.numero,
    tipo: c.tipo,
    comuna: c.comuna,
    atencion: c.atencion,
    intencion: c.intencion,
    urgencia: c.urgencia,
    descripcion: c.descripcion,
    createdAt: c.createdAt,
    acquiredAt: c.acquiredAt,
    acquisitionMode: c.acquisitionMode,
    status: c.status,
    contactUnlocked: true,
    contactName: c.contactName,
    contactWhatsapp: c.contactWhatsapp,
    contactEmail: c.contactEmail
  })));
});

router.get('/stats/pro', requireAuth, requireRole('abogado'), async (req, res) => {
  if (!(req.user.premium?.active && req.user.premium?.tier === 'pro')) return res.status(403).json({ error: 'Disponible para Premium Pro' });
  const acquired = await Case.countDocuments({ selectedLawyer: req.user._id });
  const premiumAcquired = await Case.countDocuments({ selectedLawyer: req.user._id, acquisitionMode: 'premium_credit' });
  const freeAcquired = await Case.countDocuments({ selectedLawyer: req.user._id, acquisitionMode: 'free_after_priority' });
  res.json({ acquired, premiumAcquired, freeAcquired, creditsSpent: premiumAcquired, profileViews: req.user.lawyerProfile?.profileViews || 0 });
});

module.exports = router;
