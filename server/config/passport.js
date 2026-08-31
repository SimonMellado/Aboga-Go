/* Creado por LimónStudioss. s.melladoo */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const User = require('../models/User');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findOrLinkOAuthUser({ provider, providerId, email, name, avatar }) {
  const normalizedEmail = normalizeEmail(email);

  let user = await User.findOne({
    $or: [
      { provider, providerId },
      { authProviders: { $elemMatch: { provider, providerId } } },
    ],
  });

  if (!user && normalizedEmail) user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return User.create({
      name,
      email: normalizedEmail,
      avatar,
      provider,
      providerId,
      authProviders: [{ provider, providerId }],
      emailVerified: true,
    });
  }

  const alreadyLinked = user.authProviders?.some(p => p.provider === provider && p.providerId === providerId);
  if (!alreadyLinked) user.authProviders.push({ provider, providerId });
  if (!user.name && name) user.name = name;
  if (!user.avatar && avatar) user.avatar = avatar;
  if (normalizedEmail) {
    user.email = normalizedEmail;
    user.emailVerified = true;
  }
  await user.save();
  return user;
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${String(process.env.BACKEND_URL || 'https://api.abogago.online').trim().replace(/\/$/, '')}/api/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await findOrLinkOAuthUser({
        provider: 'google',
        providerId: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        avatar: profile.photos?.[0]?.value,
      });
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));
  console.log('✅ Google OAuth habilitado');
} else {
  console.log('ℹ️ Google OAuth deshabilitado: faltan credenciales');
}

if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY_PATH
) {
  passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
    callbackURL: `${String(process.env.BACKEND_URL || 'https://api.abogago.online').trim().replace(/\/$/, '')}/api/auth/apple/callback`,
    scope: ['name', 'email'],
    passReqToCallback: false,
  }, async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      const nombre = profile.name?.firstName
        ? `${profile.name.firstName} ${profile.name.lastName || ''}`.trim()
        : 'Usuario Apple';
      const user = await findOrLinkOAuthUser({
        provider: 'apple',
        providerId: profile.id,
        email: profile.email,
        name: nombre,
      });
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));
  console.log('✅ Apple OAuth habilitado');
} else {
  console.log('ℹ️ Apple OAuth deshabilitado - Próximamente');
}

module.exports = passport;
