/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['pack', 'plan_inicial', 'plan_renovacion', 'admin_adjust'], required: true },

  credits: { type: Number, default: 0 },
  clpAmount: { type: Number, default: 0 },
  plan: { type: String, enum: ['premium', 'pro'], default: undefined },

  buyOrder: { type: String, index: true },
  webpayToken: { type: String, index: true },

  status: { type: String, enum: ['pending', 'processing', 'approved', 'failed'], default: 'pending' },

  createdAt: { type: Date, default: Date.now },
});

creditTransactionSchema.index({ buyOrder: 1 }, { unique: true, sparse: true });
creditTransactionSchema.index({ webpayToken: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
