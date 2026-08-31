/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const manualPaymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['credit_pack', 'plan'], required: true },
  productId: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  credits: { type: Number, default: 0 },
  country: { type: String, enum: ['CL'], default: 'CL' },
  reference: { type: String, required: true, unique: true, index: true },
  payerRutNormalized: { type: String, default: '', index: true },
  payerRutDisplay: { type: String, default: '' },
  settlementId: { type: String, default: undefined },
  verificationSource: { type: String, enum: ['manual', 'provider_webhook'], default: undefined },
  autoApprovedAt: Date,
  status: { type: String, enum: ['pending_proof', 'under_review', 'processing', 'approved', 'rejected'], default: 'pending_proof', index: true },
  proof: {
    path: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    uploadedAt: Date
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, trim: true, maxlength: 500, default: '' },
  createdAt: { type: Date, default: Date.now }
});

manualPaymentSchema.index({ settlementId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ManualPayment', manualPaymentSchema);
