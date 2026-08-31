/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isAllowedFileSignature, recordSecurityEvent } = require('../utils/security');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const ManualPayment = require('../models/ManualPayment');
const Notification = require('../models/Notification');
const {
  CREDIT_PRICE, CREDIT_PACKS, PLANS, matchesCatalogProduct,
  webpayPlusTx, oneclickInscriptionTx, oneclickChargeTx, oneclickCommerceCode,
} = require('../config/transbank');


const transferUploadDir = path.join(__dirname, '..', 'private_uploads', 'transfers');
fs.mkdirSync(transferUploadDir, { recursive: true });
const transferUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, transferUploadDir),
    filename: (req, file, cb) => cb(null, `${req.user?._id || 'user'}-${Date.now()}${path.extname(file.originalname || '').toLowerCase()}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato no permitido'), ok);
  }
});


function providerVerificationFromWebpay(commit) {
  return {
    verified: commit?.status === 'AUTHORIZED' && Number(commit?.response_code) === 0,
    verifiedAt: new Date(),
    providerStatus: String(commit?.status || ''),
    responseCode: Number.isFinite(Number(commit?.response_code)) ? Number(commit.response_code) : undefined,
    authorizationCode: String(commit?.authorization_code || ''),
    paymentTypeCode: String(commit?.payment_type_code || ''),
    cardLast4: String(commit?.card_detail?.card_number || '').slice(-4),
    installmentsNumber: Number.isFinite(Number(commit?.installments_number)) ? Number(commit.installments_number) : undefined,
    transactionDate: commit?.transaction_date ? new Date(commit.transaction_date) : new Date(),
    amount: Number.isFinite(Number(commit?.amount)) ? Number(commit.amount) : undefined
  };
}

function providerVerificationFromOneclick(detail) {
  return {
    verified: Number(detail?.response_code) === 0,
    verifiedAt: new Date(),
    providerStatus: Number(detail?.response_code) === 0 ? 'AUTHORIZED' : 'REJECTED',
    responseCode: Number.isFinite(Number(detail?.response_code)) ? Number(detail.response_code) : undefined,
    authorizationCode: String(detail?.authorization_code || ''),
    paymentTypeCode: String(detail?.payment_type_code || ''),
    cardLast4: '',
    installmentsNumber: Number.isFinite(Number(detail?.installments_number)) ? Number(detail.installments_number) : undefined,
    transactionDate: new Date(),
    amount: Number.isFinite(Number(detail?.amount)) ? Number(detail.amount) : undefined
  };
}

function transferBankData() {
  const data = {
    bankName: process.env.TRANSFER_BANK_NAME || '',
    accountType: process.env.TRANSFER_ACCOUNT_TYPE || '',
    accountNumber: process.env.TRANSFER_ACCOUNT_NUMBER || '',
    holder: process.env.TRANSFER_ACCOUNT_HOLDER || '',
    rut: process.env.TRANSFER_RUT || '',
    email: process.env.TRANSFER_EMAIL || ''
  };
  return { ...data, configured: Boolean(data.bankName && data.accountNumber && data.holder && data.rut) };
}

function requireChile(req, res, next) {
  const country = String(req.body?.country || 'CL').toUpperCase();
  if (country !== 'CL') return res.status(400).json({ error: 'Este medio de pago está habilitado solamente para Chile' });
  next();
}
function getPlan(planId) {
  return PLANS[String(planId || '').toLowerCase()] || null;
}

function getCreditPack(packId) {
  return CREDIT_PACKS[String(packId || '').toLowerCase()] || null;
}

function normalizeRut(value) {
  return String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function formatRut(value) {
  const rut = normalizeRut(value);
  if (rut.length < 2) return '';
  const dv = rut.slice(-1);
  let body = rut.slice(0, -1);
  let formatted = '';
  while (body.length > 3) {
    formatted = `.${body.slice(-3)}${formatted}`;
    body = body.slice(0, -3);
  }
  return `${body}${formatted}-${dv}`;
}

function transferAutomationConfigured() {
  return process.env.TRANSFER_AUTOMATION_ENABLED === 'true' && Boolean(process.env.TRANSFER_WEBHOOK_SECRET);
}

function safeSecretEqual(received, expected) {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function applyTransferPayment(payment, { reviewedBy = null, verificationSource = 'manual', settlementId = undefined } = {}) {
  if (!matchesCatalogProduct(payment.kind, payment.productId, payment.amount, payment.credits)) {
    throw new Error('La compra no coincide con el catálogo oficial de precios');
  }
  const session = await mongoose.startSession();
  let userId = null;
  try {
    await session.withTransaction(async () => {
      const freshPayment = await ManualPayment.findOne({ _id: payment._id, status: 'processing' }).session(session);
      if (!freshPayment) throw new Error('La transferencia ya fue procesada');
      const user = await User.findById(freshPayment.user).session(session);
      if (!user) throw new Error('Usuario no encontrado');

      if (freshPayment.kind === 'credit_pack') {
        user.credits += freshPayment.credits;
      } else {
        const now = new Date();
        const end = new Date(now); end.setDate(end.getDate() + 30);
        user.credits += freshPayment.credits;
        user.premium = { active: true, tier: freshPayment.productId, planStart: now, planEnd: end, autoRenew: false };
      }
      await user.save({ session });

      freshPayment.status = 'approved';
      freshPayment.reviewedBy = reviewedBy || freshPayment.reviewedBy;
      freshPayment.reviewedAt = new Date();
      freshPayment.verificationSource = verificationSource;
      if (settlementId) freshPayment.settlementId = settlementId;
      if (verificationSource === 'provider_webhook') freshPayment.autoApprovedAt = new Date();
      await freshPayment.save({ session });
      userId = user._id;
    });
  } finally {
    await session.endSession();
  }

  const approved = await ManualPayment.findById(payment._id).lean();
  if (userId && approved) {
    await Notification.create({
      user: userId,
      type: 'account',
      title: verificationSource === 'provider_webhook' ? 'Transferencia confirmada automáticamente' : 'Transferencia aprobada',
      message: approved.kind === 'credit_pack' ? `Se agregaron ${approved.credits} créditos a tu cuenta.` : 'Tu plan fue activado por 30 días. El pago por transferencia no se renueva automáticamente.',
      linkView: 'abogado'
    });
  }
  return approved;
}

router.get('/precios', (req, res) => {
  res.json({ creditPrice: CREDIT_PRICE, creditPacks: CREDIT_PACKS, plans: PLANS, priorityHours: 24 });
});

router.get('/metodos', (_req, res) => {
  res.json({
    country: 'CL',
    methods: {
      webpay: { enabled: true, label: 'Tarjeta débito, crédito o prepago', provider: 'Transbank Webpay', country: 'CL' },
      oneclick: { enabled: true, label: 'Tarjeta para plan mensual', provider: 'Transbank Oneclick', country: 'CL' },
      transfer: { enabled: transferBankData().configured, label: 'Transferencia bancaria', country: 'CL', bank: transferBankData(), automaticReconciliation: transferAutomationConfigured(), rutMatchRequired: true }
    }
  });
});

router.post('/transfer/webhook', async (req, res) => {
  if (!transferAutomationConfigured()) return res.status(404).json({ error: 'Automatización de transferencias no habilitada' });
  const receivedSecret = req.get('x-abogago-transfer-secret');
  if (!safeSecretEqual(receivedSecret, process.env.TRANSFER_WEBHOOK_SECRET)) return res.status(401).json({ error: 'Webhook no autorizado' });

  const reference = String(req.body?.reference || '').trim();
  const settlementId = String(req.body?.settlementId || '').trim();
  const payerRut = normalizeRut(req.body?.payerRut);
  const amount = Number(req.body?.amount);
  const status = String(req.body?.status || '').toLowerCase();
  if (!reference || !settlementId || !payerRut || !Number.isFinite(amount)) return res.status(400).json({ error: 'Datos de conciliación incompletos' });
  if (!['paid', 'settled', 'confirmed'].includes(status)) return res.status(202).json({ ok: true, applied: false, reason: 'not_settled' });

  const duplicateSettlement = await ManualPayment.findOne({ settlementId }).lean();
  if (duplicateSettlement) return res.json({ ok: true, applied: duplicateSettlement.status === 'approved', duplicate: true });

  const payment = await ManualPayment.findOne({ reference });
  if (!payment) return res.status(404).json({ error: 'Referencia no encontrada' });
  if (payment.status === 'approved') return res.json({ ok: true, applied: true, duplicate: true });
  if (payment.status === 'rejected') return res.status(409).json({ error: 'La transferencia fue rechazada previamente' });
  if (Number(payment.amount) !== amount) return res.status(409).json({ error: 'El monto recibido no coincide con la compra' });
  if (payment.payerRutNormalized !== payerRut) return res.status(409).json({ error: 'El RUT del titular de origen no coincide con el RUT registrado' });

  const claimed = await ManualPayment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending_proof', 'under_review'] }, $or: [{ settlementId: { $exists: false } }, { settlementId: null }] },
    { $set: { status: 'processing', settlementId, verificationSource: 'provider_webhook' } },
    { new: true }
  );
  if (!claimed) {
    const fresh = await ManualPayment.findById(payment._id).lean();
    return res.json({ ok: true, applied: fresh?.status === 'approved', processing: fresh?.status === 'processing' });
  }
  try {
    await applyTransferPayment(claimed, { verificationSource: 'provider_webhook', settlementId });
    await recordSecurityEvent({ req, user: claimed.user, type: 'transfer_auto_approved', outcome: 'success', metadata: { reference: claimed.reference, settlementId } });
    return res.json({ ok: true, applied: true });
  } catch (err) {
    await ManualPayment.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'under_review' }, $unset: { settlementId: 1, verificationSource: 1 } }).catch(() => {});
    return res.status(500).json({ error: 'No se pudo aplicar automáticamente la transferencia' });
  }
});

router.post('/transfer/init', requireAuth, requireRole('abogado'), requireChile, async (req, res) => {
  const kind = String(req.body.kind || 'credit_pack');
  const productId = String(req.body.productId || '');
  const bank = transferBankData();
  if (!bank.configured) return res.status(503).json({ error: 'La transferencia bancaria todavía no está configurada por administración' });
  const payerRutNormalized = normalizeRut(req.user.rutNormalized || req.user.rut);
  if (!payerRutNormalized) return res.status(400).json({ error: 'Para pagar por transferencia debes tener tu RUT registrado en Mi cuenta' });
  const payerRutDisplay = formatRut(payerRutNormalized);
  let amount = 0, credits = 0;
  if (kind === 'credit_pack') {
    const pack = getCreditPack(productId);
    if (!pack) return res.status(400).json({ error: 'Pack no válido' });
    amount = pack.price; credits = pack.credits;
  } else if (kind === 'plan') {
    const plan = getPlan(productId);
    if (!plan) return res.status(400).json({ error: 'Plan no válido' });
    amount = plan.price; credits = plan.credits;
  } else return res.status(400).json({ error: 'Tipo de compra no válido' });
  const reference = `TR-${Date.now()}-${String(req.user._id).slice(-6).toUpperCase()}`;
  const payment = await ManualPayment.create({ user: req.user._id, kind, productId, amount, credits, country: 'CL', reference, payerRutNormalized, payerRutDisplay });
  res.json({ paymentId: payment._id, reference, amount, bank, payerRut: payerRutDisplay, automaticReconciliation: transferAutomationConfigured(), rutMatchRequired: true, note: kind === 'plan' ? 'El plan pagado por transferencia dura 30 días y no se renueva automáticamente.' : '' });
});

router.post('/transfer/:id/comprobante', requireAuth, requireRole('abogado'), transferUpload.single('proof'), async (req, res) => {
  const payment = await ManualPayment.findOne({ _id: req.params.id, user: req.user._id });
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Selecciona un comprobante PDF, JPG o PNG' });
  if (!isAllowedFileSignature(req.file.path, req.file.mimetype)) { try { fs.unlinkSync(req.file.path); } catch (_) {} return res.status(400).json({ error: 'El archivo no coincide con un PDF, JPG o PNG válido' }); }
  if (payment.status === 'approved') return res.status(409).json({ error: 'Este pago ya fue aprobado' });
  payment.proof = { path: req.file.path, originalName: req.file.originalname, mimeType: req.file.mimetype, uploadedAt: new Date() };
  payment.status = 'under_review';
  await payment.save();
  res.json({ ok: true, status: payment.status, reference: payment.reference });
});

router.post('/credits/init', requireAuth, requireRole('abogado'), requireChile, async (req, res) => {
  const pack = getCreditPack(req.body.packId);
  if (!pack) {
    return res.status(400).json({ error: 'Pack de créditos no válido' });
  }

  const amount = pack.price;
  const qty = pack.credits;
  const buyOrder = 'CR-' + Date.now();
  const sessionId = String(req.user._id);
  const returnUrl = `${process.env.BACKEND_URL}/api/payments/credits/return`;

  try {
    const tx = webpayPlusTx();
    const response = await tx.create(buyOrder, sessionId, amount, returnUrl);
    await CreditTransaction.create({
      user: req.user._id, kind: 'pack', productId: pack.id, credits: qty, clpAmount: amount,
      buyOrder, webpayToken: response.token, status: 'pending', provider: 'webpay',
    });
    res.json({ url: response.url, token: response.token, pack });
  } catch (err) {
    console.error('Error creando transacción Webpay:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});

router.all('/credits/return', async (req, res) => {
  const token = req.body.token_ws || req.query.token_ws;
  if (!token) return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
  try {
    const record = await CreditTransaction.findOne({ webpayToken: token });
    if (!record) return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
    if (record.status === 'approved') return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=exitoso`);
    const tx = webpayPlusTx();
    const commit = await tx.commit(token);
    const verification = providerVerificationFromWebpay(commit);
    const productId = record.productId || Object.values(CREDIT_PACKS).find(p => Number(p.price) === Number(record.clpAmount) && Number(p.credits) === Number(record.credits))?.id;
    const catalogOk = matchesCatalogProduct('credit_pack', productId, record.clpAmount, record.credits);
    const providerAmountOk = Number(commit.amount) === Number(record.clpAmount);
    if (!catalogOk || !providerAmountOk || commit.status !== 'AUTHORIZED' || Number(commit.response_code) !== 0) {
      await CreditTransaction.updateOne({ _id: record._id, status: 'pending' }, { $set: { status: 'failed', provider: 'webpay', providerVerification: verification } });
      return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
    }
    const claimed = await CreditTransaction.findOneAndUpdate({ _id: record._id, status: 'pending' }, { $set: { status: 'processing' } }, { new: true });
    if (!claimed) {
      const fresh = await CreditTransaction.findById(record._id);
      return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=${fresh?.status === 'approved' ? 'exitoso' : 'procesando'}`);
    }
    await User.findByIdAndUpdate(claimed.user, { $inc: { credits: claimed.credits } });
    claimed.status = 'approved';
    claimed.provider = 'webpay';
    claimed.providerVerification = verification;
    await claimed.save();
    return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=exitoso`);
  } catch (err) {
    console.error('Error confirmando pago Webpay:', err);
    res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
  }
});

router.post('/oneclick/inscribir', requireAuth, requireRole('abogado'), requireChile, async (req, res) => {
  const plan = getPlan(req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Plan no válido' });

  const username = String(req.user._id);
  const email = req.user.email;
  const responseUrl = `${process.env.BACKEND_URL}/api/payments/oneclick/inscribir/return`;

  try {
    const tx = oneclickInscriptionTx();
    const response = await tx.start(username, email, responseUrl);
    await User.findByIdAndUpdate(req.user._id, {
      'oneclick.pendingToken': response.token,
      'oneclick.pendingPlan': plan.id,
      'oneclick.username': username,
    });
    res.json({ url: response.url_webpay, token: response.token });
  } catch (err) {
    console.error('Error iniciando inscripción Oneclick:', err);
    res.status(500).json({ error: 'No se pudo iniciar la inscripción de la tarjeta' });
  }
});

router.all('/oneclick/inscribir/return', async (req, res) => {
  const token = req.body.TBK_TOKEN || req.query.TBK_TOKEN;
  try {
    const tx = oneclickInscriptionTx();
    const finish = await tx.finish(token);
    const user = await User.findOne({ 'oneclick.pendingToken': token });

    if (finish.response_code === 0 && user) {
      const plan = getPlan(user.oneclick.pendingPlan);
      if (!plan) return res.redirect(`${process.env.FRONTEND_URL}/index.html?plan=fallido`);

      user.oneclick.inscribed = true;
      user.oneclick.tbkUser = finish.tbk_user;
      user.oneclick.pendingToken = undefined;
      await user.save();

      const buyOrder = `PLAN-${plan.id.toUpperCase()}-` + Date.now();
      const detailBuyOrder = buyOrder + '-D1';
      const chargeTx = oneclickChargeTx();
      const charge = await chargeTx.authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
        { commerce_code: oneclickCommerceCode(), buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
      ]);
      const detail = charge.details?.[0] || {};
      const aprobado = detail.response_code === 0 && Number(detail.amount) === Number(plan.price);

      await CreditTransaction.create({
        user: user._id, kind: 'plan_inicial', plan: plan.id, productId: plan.id,
        credits: plan.credits, clpAmount: plan.price,
        buyOrder, status: aprobado ? 'approved' : 'failed', provider: 'oneclick',
        providerVerification: providerVerificationFromOneclick(detail)
      });

      if (aprobado) {
        const now = new Date();
        const end = new Date(now); end.setDate(end.getDate() + 30);
        user.credits += plan.credits;
        user.premium = { active: true, tier: plan.id, planStart: now, planEnd: end, autoRenew: true };
        user.oneclick.pendingPlan = undefined;
        await user.save();
        return res.redirect(`${process.env.FRONTEND_URL}/index.html?plan=exitoso&tier=${plan.id}`);
      }
      user.oneclick.pendingPlan = undefined;
      await user.save();
      return res.redirect(`${process.env.FRONTEND_URL}/index.html?plan=fallido`);
    }
    res.redirect(`${process.env.FRONTEND_URL}/index.html?tarjeta=fallida`);
  } catch (err) {
    console.error('Error finalizando inscripción Oneclick:', err);
    res.redirect(`${process.env.FRONTEND_URL}/index.html?tarjeta=fallida`);
  }
});

router.post('/oneclick/plan/activar', requireAuth, requireRole('abogado'), requireChile, async (req, res) => {
  const user = await User.findById(req.user._id);
  const plan = getPlan(req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Plan no válido' });
  if (!user.oneclick?.inscribed) return res.status(400).json({ error: 'Primero debes inscribir una tarjeta' });

  const buyOrder = `PLAN-${plan.id.toUpperCase()}-` + Date.now();
  const detailBuyOrder = buyOrder + '-D1';

  try {
    const tx = oneclickChargeTx();
    const response = await tx.authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
      { commerce_code: oneclickCommerceCode(), buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
    ]);

    const detail = response.details?.[0] || {};
    const aprobado = detail.response_code === 0 && Number(detail.amount) === Number(plan.price);
    await CreditTransaction.create({
      user: user._id, kind: 'plan_inicial', plan: plan.id, productId: plan.id,
      credits: plan.credits, clpAmount: plan.price,
      buyOrder, status: aprobado ? 'approved' : 'failed', provider: 'oneclick',
      providerVerification: providerVerificationFromOneclick(detail)
    });

    if (!aprobado) return res.status(400).json({ error: 'El cobro fue rechazado por el banco' });

    const now = new Date();
    const end = new Date(now); end.setDate(end.getDate() + 30);
    user.credits += plan.credits;
    user.premium = { active: true, tier: plan.id, planStart: now, planEnd: end, autoRenew: true };
    await user.save();

    res.json({ ok: true, user, plan });
  } catch (err) {
    console.error('Error cobrando plan Oneclick:', err);
    res.status(500).json({ error: 'No se pudo procesar el cobro del plan' });
  }
});


router.post('/oneclick/plan/cancelar-renovacion', requireAuth, requireRole('abogado'), async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user?.premium?.active) return res.status(400).json({ error: 'No tienes un plan activo' });
  user.premium.autoRenew = false;
  await user.save();
  res.json({ ok: true, planEnd: user.premium.planEnd, message: 'La renovación automática fue desactivada. Mantendrás el plan hasta su fecha de término.' });
});

module.exports = router;
