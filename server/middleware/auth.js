/* Creado por LimónStudioss. s.melladoo */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const ADMIN_PORTAL_ALLOWED = new Set([
  'GET /api/auth/me',
  'GET /api/payments/precios',
  'GET /api/cases/mias',
  'GET /api/cases/disponibles',
  'GET /api/cases/historial',
  'GET /api/cases/stats/pro',
  'POST /api/cases',
  'POST /api/cases/:id/tomar',
  'PATCH /api/cases/:id',
  'PATCH /api/cases/:id/cerrar',
  'GET /api/notifications',
  'PATCH /api/notifications/read-all',
  'PATCH /api/notifications/:id/read',
  'PATCH /api/account/profile',
  'PATCH /api/account/settings'
]);

function adminPortalRouteAllowed(req) {
  const method = String(req.method || '').toUpperCase();
  const path = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+/g, '/');
  const exact = `${method} ${path}`;
  if (ADMIN_PORTAL_ALLOWED.has(exact)) return true;
  if (method === 'POST' && /^\/api\/cases\/[^/]+\/tomar$/.test(path)) return true;
  if (method === 'PATCH' && /^\/api\/cases\/[^/]+$/.test(path)) return true;
  if (method === 'PATCH' && /^\/api\/cases\/[^/]+\/cerrar$/.test(path)) return true;
  return false;
}

async function requireAuth(req, res, next) {
  const adminPortalToken = String(req.headers['x-admin-portal-token'] || '').trim();
  if (adminPortalToken) {
    try {
      const payload = jwt.verify(adminPortalToken, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'abogago-api', audience: 'abogago-web' });
      if (payload.typ !== 'admin_portal' || !payload.actorId || !payload.targetId || !adminPortalRouteAllowed(req)) return res.status(403).json({ error: 'Acción no disponible en modo administración' });
      const actor = await User.findById(payload.actorId);
      const target = await User.findById(payload.targetId);
      if (!actor || actor.active === false || !hasStaffPermission(actor, 'users_manage')) return res.status(403).json({ error: 'Sesión administrativa no autorizada' });
      if (!target || target.active === false) return res.status(403).json({ error: 'La cuenta administrada no está activa' });
      if (!['cliente', 'abogado'].includes(target.role) || payload.portalRole !== target.role) return res.status(403).json({ error: 'El portal administrado ya no corresponde a esta cuenta' });
      req.user = target;
      req.adminActor = actor;
      req.adminPortal = true;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Sesión administrativa expirada o inválida' });
    }
  }
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
