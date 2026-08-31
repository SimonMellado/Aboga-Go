/* Creado por LimónStudioss. s.melladoo */
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const Notification = require('../models/Notification');

router.get('/', requireAuth, async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ items, unread });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
  res.json({ ok: true });
});

module.exports = router;
