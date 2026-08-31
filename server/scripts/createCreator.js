/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');

async function run() {
  const email = String(process.env.CREATOR_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.CREATOR_PASSWORD || '');
  if (!email || !password) throw new Error('Configura CREATOR_EMAIL y CREATOR_PASSWORD en .env antes de ejecutar este script.');
  if (password.length < 10) throw new Error('CREATOR_PASSWORD debe tener al menos 10 caracteres.');
  await connectDB();
  const passwordHash = await bcrypt.hash(password, 12);
  let user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    user = await User.create({
      firstName: 'Cuenta', lastName: 'Creadora', name: 'Cuenta Creadora', email,
      passwordHash, provider: 'local', providerId: `local:${email}`,
      authProviders: [{ provider: 'local', providerId: `local:${email}` }],
      emailVerified: true, role: 'cliente', staffRole: 'creador', verified: true
    });
  } else {
    user.passwordHash = passwordHash;
    user.emailVerified = true;
    user.staffRole = 'creador';
    if (!user.role || user.role === 'sin_definir' || user.role === 'admin') user.role = 'cliente';
    await user.save();
  }
  console.log(`Cuenta creadora lista: ${email}`);
  process.exit(0);
}
run().catch(err => { console.error(err.message); process.exit(1); });
