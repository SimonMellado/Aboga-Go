/* Creado por LimónStudioss. s.melladoo */
const fs = require('fs');
const configured = String(process.env.BACKEND_URL || 'https://api.abogago.online').trim().replace(/\/$/, '');
if (!configured.startsWith('https://')) throw new Error('BACKEND_URL debe usar HTTPS');
const api = `${configured}/api`;
const adsId = String(process.env.GOOGLE_ADS_ID || 'AW-18421015765').trim();
const conversions = {
  registration: String(process.env.GOOGLE_ADS_CONVERSION_REGISTRATION || '').trim(),
  case_published: String(process.env.GOOGLE_ADS_CONVERSION_CASE_PUBLISHED || '').trim(),
  payment_success: String(process.env.GOOGLE_ADS_CONVERSION_PAYMENT_SUCCESS || '').trim(),
  whatsapp_contact: String(process.env.GOOGLE_ADS_CONVERSION_WHATSAPP || '').trim()
};
const content = `/* Creado por LimónStudioss. s.melladoo */\nwindow.ABOGAGO_API_BASE = ${JSON.stringify(api)};\nwindow.ABOGAGO_GOOGLE_ADS_ID = ${JSON.stringify(adsId)};\nwindow.ABOGAGO_GOOGLE_ADS_CONVERSIONS = ${JSON.stringify(conversions)};\n`;
fs.writeFileSync('js/runtime-config.js', content, 'utf8');
console.log(`ABOGA GO API configurada: ${api}`);
console.log(`Google Ads configurado: ${adsId}`);
