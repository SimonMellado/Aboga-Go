/* Creado por LimónStudioss. s.melladoo */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function keyMaterial(name = 'DATA_ENCRYPTION_KEY') {
  const raw = String(process.env[name] || '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error(`${name} no está configurada`);
    return crypto.createHash('sha256').update(String(process.env.SECURITY_PEPPER || process.env.JWT_SECRET || 'dev-only-encryption-key')).digest();
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch (_) {}
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptString(value, keyName = 'DATA_ENCRYPTION_KEY') {
  if (value === undefined || value === null || value === '') return value;
  const text = String(value);
  if (text.startsWith(PREFIX)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(keyName), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptString(value, keyName = 'DATA_ENCRYPTION_KEY') {
  if (value === undefined || value === null || value === '') return value;
  const text = String(value);
  if (!text.startsWith(PREFIX)) return text;
  const payload = text.slice(PREFIX.length).split('.');
  if (payload.length !== 3) throw new Error('Dato cifrado inválido');
  const [ivRaw, tagRaw, dataRaw] = payload;
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(keyName), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

function decryptDeep(value) {
  if (Array.isArray(value)) return value.map(decryptDeep);
  if (value && typeof value === 'object') {
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decryptDeep(v);
    return out;
  }
  if (typeof value === 'string' && value.startsWith(PREFIX)) {
    try { return decryptString(value); } catch (_) { return '[dato cifrado no disponible]'; }
  }
  return value;
}

function recoveryCodeHash(code) {
  const pepper = String(process.env.SECURITY_PEPPER || process.env.JWT_SECRET || 'dev-only-security-key');
  return crypto.createHmac('sha256', pepper).update(`2fa-recovery:${String(code || '').trim().toUpperCase()}`).digest('hex');
}

module.exports = { PREFIX, encryptString, decryptString, decryptDeep, recoveryCodeHash, keyMaterial };
