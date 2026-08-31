/* Creado por LimónStudioss. s.melladoo */
const { WebpayPlus, Oneclick, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } = require('transbank-sdk');

const PREMIUM_PRIORITY_HOURS = Number(process.env.PREMIUM_PRIORITY_HOURS || 24);

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
const isProduction = process.env.NODE_ENV === 'production';

function webpayOptions() {
  if (!isProduction) return new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration);
  if (!process.env.TBK_WEBPAY_COMMERCE_CODE || !process.env.TBK_WEBPAY_API_KEY) throw new Error('Faltan credenciales de producción TBK_WEBPAY_COMMERCE_CODE/TBK_WEBPAY_API_KEY');
  return new Options(process.env.TBK_WEBPAY_COMMERCE_CODE, process.env.TBK_WEBPAY_API_KEY, Environment.Production);
}

function oneclickOptions() {
  if (!isProduction) return new Options(IntegrationCommerceCodes.ONECLICK_MALL, IntegrationApiKeys.WEBPAY, Environment.Integration);
  if (!process.env.TBK_ONECLICK_COMMERCE_CODE || !process.env.TBK_ONECLICK_API_KEY) throw new Error('Faltan credenciales de producción TBK_ONECLICK_COMMERCE_CODE/TBK_ONECLICK_API_KEY');
  return new Options(process.env.TBK_ONECLICK_COMMERCE_CODE, process.env.TBK_ONECLICK_API_KEY, Environment.Production);
}

function webpayPlusTx() { return new WebpayPlus.Transaction(webpayOptions()); }
function oneclickInscriptionTx() { return new Oneclick.MallInscription(oneclickOptions()); }
function oneclickChargeTx() { return new Oneclick.MallTransaction(oneclickOptions()); }
function oneclickCommerceCode() { return isProduction ? process.env.TBK_ONECLICK_COMMERCE_CODE : IntegrationCommerceCodes.ONECLICK_MALL; }

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
  oneclickCommerceCode,
};
