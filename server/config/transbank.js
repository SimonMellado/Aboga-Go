/* Creado por LimónStudioss. s.melladoo */
const { WebpayPlus, Oneclick, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } = require('transbank-sdk');

const PREMIUM_PRIORITY_HOURS = 24;

const CREDIT_PACKS = {
  credit_1: { id: 'credit_1', name: '1 crédito', credits: 1, price: 1990 },
  credit_5: { id: 'credit_5', name: '5 créditos', credits: 5, price: 4990 },
  credit_100: { id: 'credit_100', name: '100 créditos', credits: 100, price: 69990 },
};

const CREDIT_PRICE = CREDIT_PACKS.credit_1.price;

const PLANS = {
  premium: { id: 'premium', name: 'Premium', price: 14990, credits: 10 },
  pro: { id: 'pro', name: 'Premium Pro', price: 29990, credits: 30 },
};

const PLAN_CREDITS = PLANS.premium.credits;
const PLAN_PRICE = PLANS.premium.price;

function webpayPlusTx() {
  const options = new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration
  );
  return new WebpayPlus.Transaction(options);
}

function oneclickInscriptionTx() {
  const options = new Options(
    IntegrationCommerceCodes.ONECLICK_MALL,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration
  );
  return new Oneclick.MallInscription(options);
}

function oneclickChargeTx() {
  const options = new Options(
    IntegrationCommerceCodes.ONECLICK_MALL,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration
  );
  return new Oneclick.MallTransaction(options);
}

module.exports = {
  CREDIT_PRICE,
  CREDIT_PACKS,
  PREMIUM_PRIORITY_HOURS,
  PLANS,
  PLAN_CREDITS,
  PLAN_PRICE,
  webpayPlusTx,
  oneclickInscriptionTx,
  oneclickChargeTx,
};
