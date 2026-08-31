/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 200 },
});

const Counter = mongoose.model('Counter', counterSchema);

async function nextCaseNumber() {
  const counter = await Counter.findByIdAndUpdate(
    'caseNumero',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

module.exports = { nextCaseNumber };
