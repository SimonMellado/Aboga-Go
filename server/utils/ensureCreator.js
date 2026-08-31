/* Creado por LimónStudioss. s.melladoo */
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function ensureCreatorAccount() {
  const email = String(process.env.CREATOR_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.CREATOR_PASSWORD || '');

  if (!email || !password) {
    console.warn('Cuenta creadora no sincronizada: faltan CREATOR_EMAIL o CREATOR_PASSWORD.');
    return { configured: false };
  }

  if (password.length < 8) {
    throw new Error('CREATOR_PASSWORD debe tener al menos 8 caracteres.');
  }

  let user = await User.findOne({ email }).select('+passwordHash');
  const passwordHash = await bcrypt.hash(password, 12);

  if (!user) {
    user = await User.create({
      firstName: 'Cuenta',
      lastName: 'Creadora',
      name: 'Cuenta Creadora',
      email,
      passwordHash,
      provider: 'local',
      providerId: `local:${email}`,
      authProviders: [{ provider: 'local', providerId: `local:${email}` }],
      emailVerified: true,
      role: 'abogado',
      staffRole: 'creador',
      verified: true,
      verificationStatus: 'verified'
    });
    console.log(`Cuenta creadora creada y verificada: ${email}`);
    return { configured: true, created: true };
  }

  user.passwordHash = passwordHash;
  user.emailVerified = true;
  user.staffRole = 'creador';
  user.verified = true;
  user.verificationStatus = 'verified';
  user.security = user.security || {};
  user.security.failedLoginAttempts = 0;
  user.security.lockUntil = undefined;
  user.role = 'abogado';

  const hasLocalProvider = Array.isArray(user.authProviders) && user.authProviders.some(p => p.provider === 'local');
  if (!hasLocalProvider) {
    user.authProviders = [...(user.authProviders || []), { provider: 'local', providerId: `local:${email}` }];
  }
  if (!user.provider) user.provider = 'local';
  if (!user.providerId) user.providerId = `local:${email}`;

  await user.save();
  console.log(`Cuenta creadora sincronizada y verificada: ${email}`);
  return { configured: true, created: false };
}

module.exports = { ensureCreatorAccount };
