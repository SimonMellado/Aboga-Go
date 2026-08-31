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

module.exports = mongoose.model('ManualPayment', manualPaymentSchema);
