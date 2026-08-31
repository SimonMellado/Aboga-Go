/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['case_new', 'proposal_new', 'proposal_selected', 'account', 'system'], default: 'system' },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  linkView: { type: String, enum: ['landing', 'cliente', 'abogado', 'cuenta'], default: 'landing' },
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case' },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Notification', notificationSchema);
