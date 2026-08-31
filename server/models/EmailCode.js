/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const emailCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['register', 'password_reset'], default: 'register' },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  passwordHash: { type: String },
  attempts: { type: Number, default: 0 },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

module.exports = mongoose.model('EmailCode', emailCodeSchema);
