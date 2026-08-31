/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
if (process.env.NODE_ENV === 'production') { console.error('Este script de prueba está bloqueado en producción.'); process.exit(1); }
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function main() {
  try {
    if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en server/.env');
    await mongoose.connect(process.env.MONGODB_URI);

    const email = (process.env.TEST_USER_EMAIL || 'prueba@abogago.cl').toLowerCase();
    const password = process.env.TEST_USER_PASSWORD || 'Prueba1234';
    const passwordHash = await bcrypt.hash(password, 12);

    let user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      user = new User({
        firstName: 'Usuario',
        lastName: 'Prueba',
        name: 'Usuario Prueba',
        email,
        passwordHash,
        provider: 'local',
        providerId: email,
        authProviders: [{ provider: 'local', providerId: email }],
        emailVerified: true,
        role: 'cliente',
      });
    } else {
      user.firstName = user.firstName || 'Usuario';
      user.lastName = user.lastName || 'Prueba';
      user.name = user.name || 'Usuario Prueba';
      user.passwordHash = passwordHash;
      user.emailVerified = true;
      if (user.role === 'sin_definir') user.role = 'cliente';
      if (!user.authProviders?.some(p => p.provider === 'local' && p.providerId === email)) {
        user.authProviders = user.authProviders || [];
        user.authProviders.push({ provider: 'local', providerId: email });
      }
    }

    await user.save();
    console.log('✅ Cuenta local de prueba lista y verificada');
    console.log(`Correo: ${email}`);
    console.log(`Contraseña: ${password}`);
    console.log('Rol: cliente');
  } catch (err) {
    console.error('❌ No se pudo crear la cuenta de prueba:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
main();
