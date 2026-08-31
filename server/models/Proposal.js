/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  case: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lawyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, required: true, trim: true, maxlength: 1400 },
  feeAmount: { type: Number, required: true, min: 0 },
  feeType: { type: String, enum: ['Fijo', 'Por hora', 'A convenir'], required: true },
  availability: { type: String, required: true, trim: true, maxlength: 180 },
  serviceMode: { type: String, enum: ['Online', 'Presencial', 'Online y presencial'], required: true },
  status: { type: String, enum: ['enviada', 'seleccionada', 'rechazada'], default: 'enviada', index: true },
  creditsSpent: { type: Number, default: 1 },
  selectedAt: Date,
  createdAt: { type: Date, default: Date.now, index: true }
});

proposalSchema.index({ case: 1, lawyer: 1 }, { unique: true });

module.exports = mongoose.model('Proposal', proposalSchema);
