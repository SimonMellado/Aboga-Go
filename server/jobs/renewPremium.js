/* Creado por LimónStudioss. s.melladoo */
const cron = require('node-cron');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { PLANS, oneclickChargeTx, oneclickCommerceCode, transbankEnabled } = require('../config/transbank');

let running = false;

async function renovarPlanesVencidos() {
  if (running) return { skipped: true };
  running = true;
  try {
    const now = new Date();
    await User.updateMany({ 'premium.active': true, 'premium.planEnd': { $lte: now }, $or: [{ 'premium.autoRenew': false }, { 'oneclick.inscribed': { $ne: true } }] }, { $set: { 'premium.active': false }, $unset: { 'premium.renewalLockUntil': 1 } });

    if (process.env.NODE_ENV === 'production' && !transbankEnabled()) {
      await User.updateMany({ 'premium.active': true, 'premium.planEnd': { $lte: now }, 'premium.autoRenew': { $ne: false }, 'oneclick.inscribed': true }, { $set: { 'premium.active': false }, $unset: { 'premium.renewalLockUntil': 1 } });
      return { transbankDisabled: true };
    }

    const ids = await User.find({
      'premium.active': true,
      'premium.autoRenew': { $ne: false },
      'premium.planEnd': { $lte: now },
      'oneclick.inscribed': true,
      $or: [{ 'premium.renewalLockUntil': { $exists: false } }, { 'premium.renewalLockUntil': { $lte: now } }]
    }).select('_id').lean();

    for (const item of ids) {
      const lockUntil = new Date(Date.now() + 20 * 60 * 1000);
      const user = await User.findOneAndUpdate({
        _id: item._id,
        'premium.active': true,
        'premium.planEnd': { $lte: new Date() },
        $or: [{ 'premium.renewalLockUntil': { $exists: false } }, { 'premium.renewalLockUntil': { $lte: new Date() } }]
      }, { $set: { 'premium.renewalLockUntil': lockUntil } }, { new: true });
      if (!user) continue;

      const plan = PLANS[user.premium?.tier] || PLANS.premium;
      const periodKey = user.premium?.planEnd ? new Date(user.premium.planEnd).toISOString().slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const buyOrder = `PLANREN-${plan.id.toUpperCase()}-${periodKey}-${String(user._id).slice(-8)}`;
      const existing = await CreditTransaction.findOne({ buyOrder }).lean();
      if (existing?.status === 'approved') {
        user.premium.renewalLockUntil = undefined;
        await user.save();
        continue;
      }
      if (existing && ['pending', 'processing'].includes(existing.status)) {
        user.premium.renewalLockUntil = undefined;
        await user.save();
        continue;
      }

      const record = existing || await CreditTransaction.create({ user: user._id, kind: 'plan_renovacion', plan: plan.id, productId: plan.id, credits: plan.credits, clpAmount: plan.price, buyOrder, status: 'processing', provider: 'oneclick' });
      const detailBuyOrder = `${buyOrder}-D1`;
      try {
        const response = await oneclickChargeTx().authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
          { commerce_code: oneclickCommerceCode(), buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
        ]);
        const detail = response.details?.[0] || {};
        const approved = detail.response_code === 0 && Number(detail.amount) === Number(plan.price);
        record.status = approved ? 'approved' : 'failed';
        record.providerVerification = { verified: approved, verifiedAt: new Date(), providerStatus: approved ? 'AUTHORIZED' : 'REJECTED', responseCode: Number.isFinite(Number(detail.response_code)) ? Number(detail.response_code) : undefined, authorizationCode: String(detail.authorization_code || ''), paymentTypeCode: String(detail.payment_type_code || ''), installmentsNumber: Number.isFinite(Number(detail.installments_number)) ? Number(detail.installments_number) : undefined, transactionDate: new Date(), amount: Number.isFinite(Number(detail.amount)) ? Number(detail.amount) : undefined };
        await record.save();
        if (approved) {
          const start = new Date();
          const end = new Date(start); end.setDate(end.getDate() + 30);
          user.credits += plan.credits;
          user.premium.planStart = start;
          user.premium.planEnd = end;
          user.premium.active = true;
        } else user.premium.active = false;
        user.premium.renewalLockUntil = undefined;
        await user.save();
      } catch (err) {
        record.status = 'failed';
        await record.save().catch(() => {});
        user.premium.renewalLockUntil = undefined;
        await user.save().catch(() => {});
        console.error(`Error renovando plan de ${user.email}:`, err.message);
      }
    }
    return { processed: ids.length };
  } finally {
    running = false;
  }
}

function iniciarCronRenovacion() {
  renovarPlanesVencidos().catch(err => console.error('Renovación premium inicial:', err.message));
  cron.schedule('*/30 * * * *', () => renovarPlanesVencidos().catch(err => console.error('Renovación premium:', err.message)), { timezone: process.env.APP_TIMEZONE || 'America/Santiago' });
}

module.exports = { iniciarCronRenovacion, renovarPlanesVencidos };
