/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./config/db');
const passport = require('./config/passport');
const { iniciarCronRenovacion } = require('./jobs/renewPremium');

const app = express();
const allowedOrigins = new Set([process.env.FRONTEND_URL, 'http://127.0.0.1:8080', 'http://localhost:8080'].filter(Boolean));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/account', require('./routes/account'));
app.use('/api/notifications', require('./routes/notifications'));
app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'ABOGA GO API', version: '6.7.0' }));

const PORT = process.env.PORT || 4000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`ABOGA GO API escuchando en http://localhost:${PORT}`);
    iniciarCronRenovacion();
  });
});
