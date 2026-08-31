/* Creado por LimónStudioss. s.melladoo */
const cron = require('node-cron');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { PLANS, oneclickChargeTx, oneclickCommerceCode } = require('../config/transbank');

async function renovarPlanesVencidos() {
  await User.updateMany({ 'premium.active': true, 'premium.planEnd': { $lte: new Date() }, $or: [{ 'premium.autoRenew': false }, { 'oneclick.inscribed': { $ne: true } }] }, { $set: { 'premium.active': false } });
  const ids = await User.find({
    'premium.active': true,
    'premium.autoRenew': { $ne: false },
    'premium.planEnd': { $lte: new Date() },
    'oneclick.inscribed': true,
    $or: [{ 'premium.renewalLockUntil': { $exists: false } }, { 'premium.renewalLockUntil': { $lte: new Date() } }]
  }).select('_id').lean();

  for (const item of ids) {
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    const user = await User.findOneAndUpdate({
      _id: item._id,
      'premium.active': true,
      'premium.planEnd': { $lte: new Date() },
      $or: [{ 'premium.renewalLockUntil': { $exists: false } }, { 'premium.renewalLockUntil': { $lte: new Date() } }]
    }, { $set: { 'premium.renewalLockUntil': lockUntil } }, { new: true });
    if (!user) continue;

    const plan = PLANS[user.premium?.tier] || PLANS.premium;
    const buyOrder = `PLANREN-${plan.id.toUpperCase()}-${Date.now()}-${String(user._id).slice(-8)}`;
    const detailBuyOrder = buyOrder + '-D1';
    try {
      const tx = oneclickChargeTx();
      const response = await tx.authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
        { commerce_code: oneclickCommerceCode(), buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
      ]);
      const detail = response.details?.[0] || {};
      const aprobado = detail.response_code === 0 && Number(detail.amount) === Number(plan.price);
      await CreditTransaction.create({ user: user._id, kind: 'plan_renovacion', plan: plan.id, productId: plan.id, credits: plan.credits, clpAmount: plan.price, buyOrder, status: aprobado ? 'approved' : 'failed', provider: 'oneclick', providerVerification: { verified: aprobado, verifiedAt: new Date(), providerStatus: aprobado ? 'AUTHORIZED' : 'REJECTED', responseCode: Number.isFinite(Number(detail.response_code)) ? Number(detail.response_code) : undefined, authorizationCode: String(detail.authorization_code || ''), paymentTypeCode: String(detail.payment_type_code || ''), installmentsNumber: Number.isFinite(Number(detail.installments_number)) ? Number(detail.installments_number) : undefined, transactionDate: new Date(), amount: Number.isFinite(Number(detail.amount)) ? Number(detail.amount) : undefined } });
      if (aprobado) {
        const start = new Date();
        const end = new Date(start); end.setDate(end.getDate() + 30);
        user.credits += plan.credits;
        user.premium.planStart = start;
        user.premium.planEnd = end;
      } else {
        user.premium.active = false;
      }
      user.premium.renewalLockUntil = undefined;
      await user.save();
    } catch (err) {
      user.premium.renewalLockUntil = undefined;
      await user.save().catch(() => {});
      console.error(`Error renovando plan de ${user.email}:`, err.message);
    }
  }
}

function iniciarCronRenovacion() {
  cron.schedule('0 4 * * *', () => renovarPlanesVencidos().catch(err => console.error('Renovación premium:', err.message)), { timezone: 'America/Santiago' });
}

module.exports = { iniciarCronRenovacion, renovarPlanesVencidos };
