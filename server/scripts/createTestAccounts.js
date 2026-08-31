/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
if (process.env.NODE_ENV === 'production') { console.error('Este script de prueba está bloqueado en producción.'); process.exit(1); }
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Notification = require('../models/Notification');

const PASSWORD = process.env.TEST_ACCOUNTS_PASSWORD || 'Prueba1234';

const accounts = [
  {
    firstName: 'Cliente',
    lastName: 'Prueba',
    email: 'cliente@abogago.cl',
    role: 'cliente',
    verified: false,
    credits: 0,
  },
  {
    firstName: 'Abogado',
    lastName: 'Pendiente',
    email: 'abogado.pendiente@abogago.cl',
    role: 'abogado',
    verified: false,
    rut: '12.345.678-5',
    tituloDocUrl: 'https://example.com/titulo-pendiente.pdf',
    credits: 5,
    lawyerProfile: {
      headline: 'Abogado en proceso de verificación',
      bio: 'Cuenta de demostración para visualizar el portal de un abogado todavía no verificado.',
      region: 'Biobío',
      comuna: 'Concepción',
      specialties: ['Derecho Civil', 'Derecho Familiar'],
      yearsExperience: 2,
      university: 'Universidad de prueba',
      registryNumber: 'PEND-001',
      serviceModes: ['Online', 'Presencial'],
      professionalUrl: 'https://example.com',
      phone: '+56 9 1111 1111',
    },
  },
  {
    firstName: 'Abogada',
    lastName: 'Verificada',
    email: 'abogado@abogago.cl',
    role: 'abogado',
    verified: true,
    rut: '11.111.111-1',
    tituloDocUrl: 'https://example.com/titulo-verificado.pdf',
    credits: 10,
    lawyerProfile: {
      headline: 'Abogada verificada · Derecho de Familia',
      bio: 'Cuenta de demostración para visualizar la experiencia de un abogado verificado sin suscripción.',
      region: 'Biobío',
      comuna: 'Concepción',
      specialties: ['Derecho Familiar', 'Derecho Civil'],
      yearsExperience: 6,
      university: 'Universidad de prueba',
      registryNumber: 'VER-001',
      serviceModes: ['Online', 'Presencial'],
      professionalUrl: 'https://example.com',
      phone: '+56 9 2222 2222',
    },
  },
  {
    firstName: 'Abogado',
    lastName: 'Premium',
    email: 'premium@abogago.cl',
    role: 'abogado',
    verified: true,
    rut: '22.222.222-2',
    tituloDocUrl: 'https://example.com/titulo-premium.pdf',
    credits: 10,
    premium: { active: true, tier: 'premium' },
    lawyerProfile: {
      headline: 'Abogado Premium · Laboral y Civil',
      bio: 'Cuenta de demostración para revisar prioridad Premium, créditos y oportunidades.',
      region: 'Biobío',
      comuna: 'Concepción',
      specialties: ['Derecho Laboral', 'Derecho Civil'],
      yearsExperience: 8,
      university: 'Universidad de prueba',
      registryNumber: 'PREM-001',
      serviceModes: ['Online', 'Presencial'],
      professionalUrl: 'https://example.com',
      phone: '+56 9 3333 3333',
    },
  },
  {
    firstName: 'Abogada',
    lastName: 'Premium Pro',
    email: 'pro@abogago.cl',
    role: 'abogado',
    verified: true,
    rut: '33.333.333-3',
    tituloDocUrl: 'https://example.com/titulo-pro.pdf',
    credits: 30,
    premium: { active: true, tier: 'pro' },
    lawyerProfile: {
      headline: 'Abogada Premium Pro · Penal y Familia',
      bio: 'Cuenta de demostración para revisar el dashboard Premium Pro y sus estadísticas.',
      region: 'Biobío',
      comuna: 'Concepción',
      specialties: ['Derecho Penal', 'Derecho Familiar'],
      yearsExperience: 10,
      university: 'Universidad de prueba',
      registryNumber: 'PRO-001',
      serviceModes: ['Online', 'Presencial'],
      professionalUrl: 'https://example.com',
      phone: '+56 9 4444 4444',
    },
  },
  {
    firstName: 'Administrador',
    lastName: 'ABOGA GO',
    email: 'admin@abogago.cl',
    role: 'admin',
    verified: true,
    credits: 0,
  },
];

async function upsertAccount(data, passwordHash) {
  const email = data.email.toLowerCase();
  const now = new Date();
  const planEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    user = new User({
      provider: 'local',
      providerId: email,
      authProviders: [{ provider: 'local', providerId: email }],
      emailVerified: true,
      settings: {
        emailNotifications: true,
        opportunityNotifications: true,
        proposalNotifications: true,
      },
    });
  }

  user.firstName = data.firstName;
  user.lastName = data.lastName;
  user.name = `${data.firstName} ${data.lastName}`;
  user.email = email;
  user.passwordHash = passwordHash;
  user.provider = 'local';
  user.providerId = email;
  user.emailVerified = true;
  user.role = data.role;
  user.verified = Boolean(data.verified);
  user.credits = Number(data.credits || 0);
  user.rut = data.rut || undefined;
  user.tituloDocUrl = data.tituloDocUrl || undefined;
  user.lawyerProfile = data.lawyerProfile || {};
  user.authProviders = [{ provider: 'local', providerId: email }];

  if (data.premium?.active) {
    user.premium = {
      active: true,
      tier: data.premium.tier,
      planStart: now,
      planEnd,
    };
  } else {
    user.premium = { active: false };
  }

  if (data.role === 'abogado') {
    user.oneclick = user.oneclick || {};
    user.oneclick.username = String(user._id);
  }

  await user.save();
  return user;
}

async function seedNotifications(user) {
  await Notification.deleteMany({ user: user._id, message: /demostración/i });
  const notifications = [];

  if (user.role === 'abogado' && !user.verified) {
    notifications.push({
      user: user._id,
      type: 'account',
      title: 'Verificación pendiente',
      message: 'Notificación de demostración: tu cuenta de abogado está siendo revisada.',
      linkView: 'abogado',
    });
  }

  if (user.role === 'abogado' && user.verified) {
    notifications.push({
      user: user._id,
      type: 'case_new',
      title: 'Nueva oportunidad disponible',
      message: 'Notificación de demostración: hay una nueva consulta compatible con tus especialidades.',
      linkView: 'abogado',
    });
  }

  if (user.role === 'cliente') {
    notifications.push({
      user: user._id,
      type: 'account',
      title: 'Ejemplo de notificación',
      message: 'Notificación de demostración: aquí aparecerán las actualizaciones de tus consultas.',
      linkView: 'cliente',
    });
  }

  if (notifications.length) await Notification.insertMany(notifications);
}

async function main() {
  try {
    if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en server/.env');
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    const created = [];
    for (const account of accounts) {
      const user = await upsertAccount(account, passwordHash);
      await seedNotifications(user);
      created.push(user);
    }

    console.log('\n✅ Cuentas de demostración listas\n');
    console.log(`Contraseña para todas: ${PASSWORD}\n`);
    console.log('CLIENTE');
    console.log('  cliente@abogago.cl');
    console.log('\nABOGADO SIN VERIFICAR');
    console.log('  abogado.pendiente@abogago.cl');
    console.log('\nABOGADO VERIFICADO');
    console.log('  abogado@abogago.cl');
    console.log('\nPREMIUM');
    console.log('  premium@abogago.cl');
    console.log('\nPREMIUM PRO');
    console.log('  pro@abogago.cl');
    console.log('\nADMIN');
    console.log('  admin@abogago.cl');
    console.log('\nPanel admin: http://127.0.0.1:8080/admin.html\n');
  } catch (err) {
    console.error('❌ No se pudieron crear las cuentas de demostración:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();
