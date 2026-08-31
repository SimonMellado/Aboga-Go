/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const {
  CREDIT_PRICE, CREDIT_PACKS, PLANS,
  webpayPlusTx, oneclickInscriptionTx, oneclickChargeTx,
} = require('../config/transbank');

function getPlan(planId) {
  return PLANS[String(planId || '').toLowerCase()] || null;
}

function getCreditPack(packId) {
  return CREDIT_PACKS[String(packId || '').toLowerCase()] || null;
}

router.get('/precios', (req, res) => {
  res.json({ creditPrice: CREDIT_PRICE, creditPacks: CREDIT_PACKS, plans: PLANS, priorityHours: 24 });
});

router.post('/credits/init', requireAuth, requireRole('abogado'), async (req, res) => {
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
      user: req.user._id, kind: 'pack', credits: qty, clpAmount: amount,
      buyOrder, webpayToken: response.token, status: 'pending',
    });
    res.json({ url: response.url, token: response.token, pack });
  } catch (err) {
    console.error('Error creando transacción Webpay:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});

router.all('/credits/return', async (req, res) => {
  const token = req.body.token_ws || req.query.token_ws;
  try {
    const tx = webpayPlusTx();
    const commit = await tx.commit(token);
    const record = await CreditTransaction.findOne({ webpayToken: token });

    if (commit.status === 'AUTHORIZED' && record) {
      record.status = 'approved';
      await record.save();
      await User.findByIdAndUpdate(record.user, { $inc: { credits: record.credits } });
      return res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=exitoso`);
    }
    if (record) { record.status = 'failed'; await record.save(); }
    res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
  } catch (err) {
    console.error('Error confirmando pago Webpay:', err);
    res.redirect(`${process.env.FRONTEND_URL}/index.html?pago=fallido`);
  }
});

router.post('/oneclick/inscribir', requireAuth, requireRole('abogado'), async (req, res) => {
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
        { commerce_code: process.env.TBK_COMMERCE_CODE || '597055555541', buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
      ]);
      const aprobado = charge.details?.[0]?.response_code === 0;

      await CreditTransaction.create({
        user: user._id, kind: 'plan_inicial', plan: plan.id,
        credits: plan.credits, clpAmount: plan.price,
        buyOrder, status: aprobado ? 'approved' : 'failed',
      });

      if (aprobado) {
        const now = new Date();
        const end = new Date(now); end.setDate(end.getDate() + 30);
        user.credits += plan.credits;
        user.premium = { active: true, tier: plan.id, planStart: now, planEnd: end };
        user.oneclick.pendingPlan = undefined;
        await user.save();
        return res.redirect(`${process.env.FRONTEND_URL}/index.html?plan=exitoso&tier=${plan.id}`);
      }
      return res.redirect(`${process.env.FRONTEND_URL}/index.html?plan=fallido`);
    }
    res.redirect(`${process.env.FRONTEND_URL}/index.html?tarjeta=fallida`);
  } catch (err) {
    console.error('Error finalizando inscripción Oneclick:', err);
    res.redirect(`${process.env.FRONTEND_URL}/index.html?tarjeta=fallida`);
  }
});

router.post('/oneclick/plan/activar', requireAuth, requireRole('abogado'), async (req, res) => {
  const user = await User.findById(req.user._id);
  const plan = getPlan(req.body.plan);
  if (!plan) return res.status(400).json({ error: 'Plan no válido' });
  if (!user.oneclick?.inscribed) return res.status(400).json({ error: 'Primero debes inscribir una tarjeta' });

  const buyOrder = `PLAN-${plan.id.toUpperCase()}-` + Date.now();
  const detailBuyOrder = buyOrder + '-D1';

  try {
    const tx = oneclickChargeTx();
    const response = await tx.authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
      { commerce_code: process.env.TBK_COMMERCE_CODE || '597055555541', buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
    ]);

    const aprobado = response.details?.[0]?.response_code === 0;
    await CreditTransaction.create({
      user: user._id, kind: 'plan_inicial', plan: plan.id,
      credits: plan.credits, clpAmount: plan.price,
      buyOrder, status: aprobado ? 'approved' : 'failed',
    });

    if (!aprobado) return res.status(400).json({ error: 'El cobro fue rechazado por el banco' });

    const now = new Date();
    const end = new Date(now); end.setDate(end.getDate() + 30);
    user.credits += plan.credits;
    user.premium = { active: true, tier: plan.id, planStart: now, planEnd: end };
    await user.save();

    res.json({ ok: true, user, plan });
  } catch (err) {
    console.error('Error cobrando plan Oneclick:', err);
    res.status(500).json({ error: 'No se pudo procesar el cobro del plan' });
  }
});

module.exports = router;
