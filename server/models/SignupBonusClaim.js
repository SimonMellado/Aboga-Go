/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');
const signupBonusClaimSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  emailHash: { type: String, required: true, index: true },
  ipHash: { type: String, default: '', index: true },
  deviceHash: { type: String, default: '', index: true },
  granted: { type: Boolean, default: false, index: true },
  credits: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});
signupBonusClaimSchema.index({ emailHash: 1 }, { unique: true, partialFilterExpression: { granted: true } });
signupBonusClaimSchema.index({ deviceHash: 1 }, { unique: true, partialFilterExpression: { granted: true } });
module.exports = mongoose.model('SignupBonusClaim', signupBonusClaimSchema);
