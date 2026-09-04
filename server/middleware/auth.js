/* Creado por LimónStudioss. s.melladoo */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'abogago-api', audience: 'abogago-web' });
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.active === false) return res.status(403).json({ error: 'Esta cuenta fue desactivada. Contacta al equipo de ABOGA GO.' });
    const currentVersion = Number(user.security?.tokenVersion || 0);
    const tokenVersion = payload.ver == null ? 0 : Number(payload.ver);
    if (tokenVersion !== currentVersion) return res.status(401).json({ error: 'La sesión fue cerrada por seguridad. Inicia sesión nuevamente.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'No autorizado para esta acción' });
    next();
  };
}

function effectiveStaffRole(user) {
  if (!user) return 'none';
  if (user.staffRole && user.staffRole !== 'none') return user.staffRole;
  if (user.role === 'admin') return 'admin';
  return 'none';
}

function hasStaffPermission(user, permission) {
  const staffRole = effectiveStaffRole(user);
  if (staffRole === 'creador' || staffRole === 'admin') return true;
  if (staffRole === 'moderador' && permission === 'verification_manage') return true;
  return Array.isArray(user?.staffPermissions) && user.staffPermissions.includes(permission);
}

function requireStaffPermission(permission) {
  return (req, res, next) => {
    if (!hasStaffPermission(req.user, permission)) return res.status(403).json({ error: 'No tienes el permiso necesario para esta acción' });
    req.staffPermission = permission;
    next();
  };
}

function requireStaff(...roles) {
  return (req, res, next) => {
    const staffRole = effectiveStaffRole(req.user);
    if (!roles.includes(staffRole)) return res.status(403).json({ error: 'No autorizado para esta acción' });
    req.staffRole = staffRole;
    next();
  };
}

module.exports = { requireAuth, requireRole, requireStaff, requireStaffPermission, hasStaffPermission, effectiveStaffRole };
