/* Creado por LimónStudioss. s.melladoo */
const mongoose = require('mongoose');

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: Math.max(5, Math.min(50, Number(process.env.MONGODB_MAX_POOL_SIZE || 20))),
      minPoolSize: Math.max(0, Math.min(10, Number(process.env.MONGODB_MIN_POOL_SIZE || 2))),
      retryWrites: true,
      w: 'majority'
    });
    console.log('✓ MongoDB conectado');
  } catch (err) {
    console.error('✗ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
