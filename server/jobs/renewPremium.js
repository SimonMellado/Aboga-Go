/* Creado por LimónStudioss. s.melladoo */
const cron = require('node-cron');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { PLANS, oneclickChargeTx } = require('../config/transbank');

async function renovarPlanesVencidos() {
  const vencidos = await User.find({
    'premium.active': true,
    'premium.planEnd': { $lte: new Date() },
    'oneclick.inscribed': true,
  });

  for (const user of vencidos) {
    const plan = PLANS[user.premium?.tier] || PLANS.premium;
    const buyOrder = `PLANREN-${plan.id.toUpperCase()}-${Date.now()}-${user._id}`;
    const detailBuyOrder = buyOrder + '-D1';

    try {
      const tx = oneclickChargeTx();
      const response = await tx.authorize(String(user._id), user.oneclick.tbkUser, buyOrder, [
        { commerce_code: process.env.TBK_COMMERCE_CODE || '597055555541', buy_order: detailBuyOrder, amount: plan.price, installments_number: 1 },
      ]);

      const aprobado = response.details?.[0]?.response_code === 0;
      await CreditTransaction.create({
        user: user._id, kind: 'plan_renovacion', plan: plan.id,
        credits: plan.credits, clpAmount: plan.price,
        buyOrder, status: aprobado ? 'approved' : 'failed',
      });

      if (aprobado) {
        const end = new Date(); end.setDate(end.getDate() + 30);
        user.credits += plan.credits;
        user.premium.planStart = new Date();
        user.premium.planEnd = end;
        console.log(`Plan ${plan.name} renovado para ${user.email}`);
      } else {
        user.premium.active = false;
        console.log(`Renovación rechazada para ${user.email} — plan desactivado`);
      }
      await user.save();
    } catch (err) {
      console.error(`Error renovando plan de ${user.email}:`, err.message);
    }
  }
}

function iniciarCronRenovacion() {
  cron.schedule('0 4 * * *', () => {
    console.log('Ejecutando renovación de planes premium...');
    renovarPlanesVencidos();
  });
}

module.exports = { iniciarCronRenovacion, renovarPlanesVencidos };
