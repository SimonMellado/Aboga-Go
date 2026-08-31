/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const authProviderSchema = new mongoose.Schema({
  provider: { type: String, enum: ['google', 'apple', 'email', 'local'], required: true },
  providerId: { type: String, required: true }
}, { _id: false });

const lawyerProfileSchema = new mongoose.Schema({
  headline: { type: String, trim: true, maxlength: 120, default: '' },
  bio: { type: String, trim: true, maxlength: 1200, default: '' },
  region: { type: String, trim: true, maxlength: 100, default: '' },
  comuna: { type: String, trim: true, maxlength: 100, default: '' },
  specialties: { type: [String], default: [] },
  yearsExperience: { type: Number, min: 0, max: 70, default: 0 },
  university: { type: String, trim: true, maxlength: 160, default: '' },
  registryNumber: { type: String, trim: true, maxlength: 100, default: '' },
  titleYear: { type: Number, min: 1900, max: 2100, default: undefined },
  titleNumber: { type: String, trim: true, maxlength: 120, default: '' },
  serviceModes: { type: [String], default: [] },
  professionalUrl: { type: String, trim: true, maxlength: 300, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  profileViews: { type: Number, default: 0 }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  emailNotifications: { type: Boolean, default: true },
  opportunityNotifications: { type: Boolean, default: true },
  proposalNotifications: { type: Boolean, default: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  firstName: { type: String, trim: true, maxlength: 60 },
  lastName: { type: String, trim: true, maxlength: 60 },
  name: { type: String, trim: true, maxlength: 130 },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  avatar: String,
  passwordHash: { type: String, select: false },
  provider: { type: String, enum: ['google', 'apple', 'email', 'local'], required: true },
  providerId: { type: String, required: true },
  authProviders: { type: [authProviderSchema], default: [] },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['sin_definir', 'cliente', 'abogado', 'admin'], default: 'sin_definir' },
  rut: String,
  tituloDocUrl: String,
  titleDocument: {
    url: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    uploadedAt: Date
  },
  verified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['not_submitted', 'pending', 'verified', 'rejected'], default: 'not_submitted' },
  verificationSubmittedAt: Date,
  verificationReviewedAt: Date,
  verificationNotes: { type: String, trim: true, maxlength: 600, default: '' },
  lawyerProfile: { type: lawyerProfileSchema, default: () => ({}) },
  settings: { type: settingsSchema, default: () => ({}) },
  credits: { type: Number, default: 0 },
  premium: {
    active: { type: Boolean, default: false },
    tier: { type: String, enum: ['premium', 'pro'], default: undefined },
    planStart: Date,
    planEnd: Date
  },
  oneclick: {
    inscribed: { type: Boolean, default: false },
    tbkUser: String,
    username: String,
    pendingToken: String,
    pendingPlan: { type: String, enum: ['premium', 'pro'], default: undefined }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ provider: 1, providerId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
