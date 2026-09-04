/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
const mongoose = require('mongoose');
const { encryptString, PREFIX } = require('../utils/encryption');
const User = require('../models/User');
const Case = require('../models/Case');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está configurada');
  await mongoose.connect(process.env.MONGODB_URI);
  let users = 0;
  let cases = 0;

  const rawUsers = await User.collection.find({}).toArray();
  for (const u of rawUsers) {
    const set = {};
    if (u.rut && !String(u.rut).startsWith(PREFIX)) set.rut = encryptString(u.rut);
    const phone = u.lawyerProfile?.phone;
    if (phone && !String(phone).startsWith(PREFIX)) set['lawyerProfile.phone'] = encryptString(phone);
    if (Object.keys(set).length) {
      await User.collection.updateOne({ _id: u._id }, { $set: set });
      users += 1;
    }
  }

  const rawCases = await Case.collection.find({}).toArray();
  for (const c of rawCases) {
    const set = {};
    for (const key of ['descripcion', 'contactName', 'contactWhatsapp', 'contactEmail']) {
      if (c[key] && !String(c[key]).startsWith(PREFIX)) set[key] = encryptString(c[key]);
    }
    if (Object.keys(set).length) {
      await Case.collection.updateOne({ _id: c._id }, { $set: set });
      cases += 1;
    }
  }

  console.log(`Migración completada. Usuarios cifrados: ${users}. Casos cifrados: ${cases}.`);
  await mongoose.disconnect();
})().catch(async err => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
