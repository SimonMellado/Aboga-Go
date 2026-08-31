/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['pack', 'plan_inicial', 'plan_renovacion', 'admin_adjust'], required: true },

  credits: { type: Number, default: 0 },
  clpAmount: { type: Number, default: 0 },
  plan: { type: String, enum: ['premium', 'pro'], default: undefined },
  productId: { type: String, default: undefined },

  buyOrder: { type: String, index: true },
  webpayToken: { type: String, index: true },

  status: { type: String, enum: ['pending', 'processing', 'approved', 'failed'], default: 'pending' },
  provider: { type: String, enum: ['webpay', 'oneclick', 'admin'], default: undefined },
  providerVerification: {
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    providerStatus: { type: String, default: '' },
    responseCode: { type: Number, default: undefined },
    authorizationCode: { type: String, default: '' },
    paymentTypeCode: { type: String, default: '' },
    cardLast4: { type: String, default: '' },
    installmentsNumber: { type: Number, default: undefined },
    transactionDate: Date,
    amount: { type: Number, default: undefined }
  },

  createdAt: { type: Date, default: Date.now },
});

creditTransactionSchema.index({ buyOrder: 1 }, { unique: true, sparse: true });
creditTransactionSchema.index({ webpayToken: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
