/* Creado por LimónStudioss. s.melladoo */
const crypto = require('crypto');

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function flowConfig() {
  const enabled = String(process.env.FLOW_ENABLED || 'true').toLowerCase() === 'true';
  const environment = String(process.env.FLOW_ENV || 'production').toLowerCase();
  const apiBase = environment === 'sandbox' ? 'https://sandbox.flow.cl/api' : 'https://www.flow.cl/api';
  return {
    enabled,
    environment,
    apiBase,
    apiKey: String(process.env.FLOW_API_KEY || '').trim(),
    secretKey: String(process.env.FLOW_SECRET_KEY || '').trim(),
    configured: enabled && Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY)
  };
}

function signParams(params, secretKey) {
  const keys = Object.keys(params).filter(key => key !== 's' && params[key] !== undefined && params[key] !== null).sort();
  const toSign = keys.map(key => `${key}${params[key]}`).join('');
  return crypto.createHmac('sha256', secretKey).update(toSign).digest('hex');
}

async function parseFlowResponse(response) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  if (!response.ok) {
    const message = data?.message || data?.error || `Flow respondió HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.flow = data;
    throw err;
  }
  return data;
}

async function createFlowPayment({ commerceOrder, subject, amount, email, urlConfirmation, urlReturn, optional }) {
  const config = flowConfig();
  if (!config.configured) throw new Error('Flow no está configurado');
  const params = {
    apiKey: config.apiKey,
    commerceOrder,
    subject,
    currency: 'CLP',
    amount: Number(amount),
    email,
    paymentMethod: 9,
    urlConfirmation: normalizeBaseUrl(urlConfirmation),
    urlReturn: normalizeBaseUrl(urlReturn),
    optional: JSON.stringify(optional || {})
  };
  params.s = signParams(params, config.secretKey);
  const response = await fetch(`${config.apiBase}/payment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  });
  return parseFlowResponse(response);
}

async function getFlowPaymentStatus(token) {
  const config = flowConfig();
  if (!config.configured) throw new Error('Flow no está configurado');
  const params = { apiKey: config.apiKey, token: String(token || '') };
  params.s = signParams(params, config.secretKey);
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const response = await fetch(`${config.apiBase}/payment/getStatus?${query}`, { method: 'GET' });
  return parseFlowResponse(response);
}

module.exports = { flowConfig, createFlowPayment, getFlowPaymentStatus, signParams };
