/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Case = require('../models/Case');
const Notification = require('../models/Notification');

router.use(requireAuth, requireRole('admin'));

router.get('/usuarios', async (req, res) => {
  const users = await User.find().select('-__v').sort({ createdAt: -1 });
  res.json(users);
});

router.get('/verificacion-pendiente', async (req, res) => {
  const pendientes = await User.find({ role: 'abogado', verified: false });
  res.json(pendientes);
});

router.post('/verificar/:id', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
  if (user) await Notification.create({ user: user._id, type: 'account', title: 'Cuenta de abogado verificada', message: 'Tu cuenta fue verificada. Ya puedes acceder a oportunidades disponibles según tu plan.', linkView: 'abogado' });
  res.json(user);
});

router.post('/rechazar/:id', async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { role: 'cliente' });
  res.json({ ok: true });
});

router.get('/causas', async (req, res) => {
  const causas = await Case.find().sort({ createdAt: -1 }).lean();
  res.json(causas.map(c => ({ ...c, taken: Boolean(c.selectedLawyer) || c.status === 'en_proceso' })));
});

router.post('/creditos/:userId', async (req, res) => {
  const { delta } = req.body;
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.credits = Math.max(0, user.credits + Number(delta || 0));
  await user.save();
  res.json(user);
});

module.exports = router;
