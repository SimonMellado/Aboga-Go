/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  numero: { type: Number, unique: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: { type: String, required: true, trim: true },
  comuna: { type: String, required: true, trim: true, maxlength: 80 },
  atencion: { type: String, enum: ['Solo virtual', 'Presencial y virtual'], required: true },
  intencion: { type: String, enum: ['Consulta o asesoría', 'Contratar servicio'], required: true },
  urgencia: { type: String, enum: ['Baja', 'Media', 'Alta'], default: 'Media' },
  descripcion: { type: String, trim: true, maxlength: 1200, default: '' },
  contactName: { type: String, trim: true, maxlength: 100, default: '' },
  contactWhatsapp: { type: String, trim: true, maxlength: 20, default: '' },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
  contactConsent: { type: Boolean, default: false },
  status: { type: String, enum: ['abierta', 'en_proceso', 'cerrada'], default: 'abierta', index: true },
  selectedLawyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  selectedProposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
  acquiredAt: Date,
  acquisitionMode: { type: String, enum: ['premium_credit', 'free_after_priority'] },
  closedAt: Date,
  creditCost: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Case', caseSchema);
