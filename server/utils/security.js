/* Creado por LimónStudioss. s.melladoo */
const crypto = require('crypto');
const fs = require('fs');
const SignupBonusClaim = require('../models/SignupBonusClaim');
const SecurityEvent = require('../models/SecurityEvent');

function securityKey() {
  return process.env.SECURITY_PEPPER || process.env.JWT_SECRET || 'dev-only-security-key';
}
function hashSignal(value, purpose = 'signal') {
  return crypto.createHmac('sha256', securityKey()).update(`${purpose}:${String(value || '')}`).digest('hex');
}
function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}
function canonicalBonusEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const [localRaw, domainRaw] = normalized.split('@');
  if (!localRaw || !domainRaw) return normalized;
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  if (domain === 'gmail.com') {
    const local = localRaw.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return normalized;
}
function ensureDeviceCookie(req, res, next) {
  let deviceId = String(req.cookies?.ag_device || '');
  if (!/^[a-f0-9]{48}$/.test(deviceId)) {
    deviceId = crypto.randomBytes(24).toString('hex');
    res.cookie('ag_device', deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/'
    });
  }
  req.securitySignals = {
    ipHash: hashSignal(clientIp(req), 'ip'),
    deviceHash: hashSignal(deviceId, 'device')
  };
  next();
}
async function recordSecurityEvent({ req, user, email, type, outcome = 'info', metadata = {} }) {
  try {
    await SecurityEvent.create({
      user: user?._id || user || undefined,
      emailHash: email ? hashSignal(canonicalBonusEmail(email), 'email') : '',
      ipHash: req?.securitySignals?.ipHash || '',
      deviceHash: req?.securitySignals?.deviceHash || '',
      type,
      outcome,
      metadata,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });
  } catch (_) {}
}
async function grantSignupBonus({ req, user }) {
  const credits = Math.max(0, Math.min(100, Number(process.env.SIGNUP_BONUS_CREDITS || 10)));
  if (!credits) return { granted: false, credits: 0, reason: 'disabled' };
  const emailHash = hashSignal(canonicalBonusEmail(user.email), 'bonus-email');
  const ipHash = req.securitySignals?.ipHash || hashSignal(clientIp(req), 'ip');
  const deviceHash = req.securitySignals?.deviceHash || '';
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const maxPerIp = Math.max(1, Math.min(20, Number(process.env.SIGNUP_BONUS_MAX_PER_IP_30D || 3)));

  const [sameEmail, sameDevice, ipCount] = await Promise.all([
    SignupBonusClaim.findOne({ emailHash, granted: true }).lean(),
    deviceHash ? SignupBonusClaim.findOne({ deviceHash, granted: true }).lean() : null,
    SignupBonusClaim.countDocuments({ ipHash, granted: true, createdAt: { $gte: since } })
  ]);
  let reason = '';
  if (sameEmail) reason = 'email_used';
  else if (sameDevice) reason = 'device_used';
  else if (ipCount >= maxPerIp) reason = 'network_limit';

  if (reason) {
    await SignupBonusClaim.create({ user: user._id, emailHash, ipHash, deviceHash, granted: false, reason, expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) }).catch(() => {});
    await recordSecurityEvent({ req, user, email: user.email, type: 'signup_bonus_denied', outcome: 'blocked', metadata: { reason } });
    return { granted: false, credits: 0, reason };
  }

  try {
    await SignupBonusClaim.create({ user: user._id, emailHash, ipHash, deviceHash, granted: true, credits, reason: 'eligible', expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) });
    user.credits = Number(user.credits || 0) + credits;
    user.security.signupBonusGrantedAt = new Date();
    await user.save();
    await recordSecurityEvent({ req, user, email: user.email, type: 'signup_bonus_granted', outcome: 'success', metadata: { credits } });
    return { granted: true, credits, reason: 'eligible' };
  } catch (err) {
    await recordSecurityEvent({ req, user, email: user.email, type: 'signup_bonus_denied', outcome: 'blocked', metadata: { reason: 'duplicate_signal' } });
    return { granted: false, credits: 0, reason: 'duplicate_signal' };
  }
}

function isAllowedFileSignature(filePath, mimeType) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    const bytes = fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, bytes);
    if (mimeType === 'application/pdf') return head.subarray(0, 5).toString() === '%PDF-';
    if (mimeType === 'image/jpeg') return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    if (mimeType === 'image/png') return head.length >= 8 && head.equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    return false;
  } catch (_) { return false; }
}

module.exports = { ensureDeviceCookie, hashSignal, clientIp, canonicalBonusEmail, recordSecurityEvent, grantSignupBonus, isAllowedFileSignature };
