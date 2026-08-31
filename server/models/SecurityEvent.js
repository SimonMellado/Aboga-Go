/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');
const securityEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  emailHash: { type: String, default: '', index: true },
  ipHash: { type: String, default: '', index: true },
  deviceHash: { type: String, default: '', index: true },
  type: { type: String, required: true, index: true },
  outcome: { type: String, enum: ['info', 'success', 'failed', 'blocked'], default: 'info', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});
module.exports = mongoose.model('SecurityEvent', securityEventSchema);
