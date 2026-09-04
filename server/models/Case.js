/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');
const { encryptString, decryptString } = require('../utils/encryption');

const caseSchema = new mongoose.Schema({
  numero: { type: Number, unique: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: { type: String, required: true, trim: true },
  comuna: { type: String, required: true, trim: true, maxlength: 80 },
  atencion: { type: String, enum: ['Solo virtual', 'Presencial y virtual'], required: true },
  intencion: { type: String, enum: ['Consulta o asesoría', 'Contratar servicio'], required: true },
  urgencia: { type: String, enum: ['Baja', 'Media', 'Alta'], default: 'Media' },
  descripcion: { type: String, trim: true, maxlength: 2400, default: '', set: encryptString, get: decryptString },
  contactName: { type: String, trim: true, maxlength: 260, default: '', set: encryptString, get: decryptString },
  contactWhatsapp: { type: String, trim: true, maxlength: 220, default: '', set: encryptString, get: decryptString },
  contactEmail: { type: String, trim: true, maxlength: 320, default: '', set: encryptString, get: decryptString },
  contactConsent: { type: Boolean, default: false },
  status: { type: String, enum: ['abierta', 'en_proceso', 'cerrada'], default: 'abierta', index: true },
  selectedLawyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  selectedProposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
  acquiredAt: Date,
  acquisitionMode: { type: String, enum: ['premium_credit', 'free_after_priority'] },
  closedAt: Date,
  creditCost: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
}, { toJSON: { getters: true }, toObject: { getters: true } });

module.exports = mongoose.model('Case', caseSchema);
