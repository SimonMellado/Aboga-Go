/* Creado por LimónStudioss. s.melladoo */
let currentUser = null;
let causasCliente = [];
let causasAbogado = { disponibles: [], historial: [] };
let precios = {
  creditPacks: {
    credit_1: { id: 'credit_1', name: '1 crédito', credits: 1, price: 1990 },
    credit_5: { id: 'credit_5', name: '5 créditos', credits: 5, price: 4990 },
    credit_100: { id: 'credit_100', name: '100 créditos', credits: 100, price: 69990 }
  },
  plans: {
    premium: { id: 'premium', name: 'Premium', price: 14990, credits: 10 },
    pro: { id: 'pro', name: 'Premium Pro', price: 29990, credits: 30 }
  },
  priorityHours: 24
};
let selectedCreditPack = 'credit_1';
let selectedPlan = 'premium';
let activeProposalCaseId = null;
let activeClientCaseId = null;
let resendTimer = null;

const PUBLIC_CASE_CATALOG = {
  'Casos más frecuentes': ['Pensión alimenticia','Inmigración en Chile','Divorcio','Herencias y posesiones efectivas','Deudas y embargos','Compra y arriendo de propiedades','Accidentes de tránsito','Abuso sexual y violación','Tuición','Juicio o reconocimiento de paternidad','Régimen de visitas','Defensa de derechos laborales','Despido injustificado','Robos y hurtos','Violencia intrafamiliar','Manejo en estado de ebriedad','Injurias y calumnias','Tráfico de drogas','Negligencia médica','Estafas y delitos económicos','Problemas entre vecinos'],
  'Derecho Civil': ['Herencias y posesiones efectivas','Contratos y obligaciones','Cobro de deudas','Responsabilidad civil','Arrendamientos','Problemas entre vecinos'],
  'Derecho Familiar': ['Pensión alimenticia','Divorcio','Tuición','Régimen de visitas','Violencia intrafamiliar','Juicio o reconocimiento de paternidad'],
  'Derecho Laboral': ['Despido injustificado','Defensa de derechos laborales','Autodespido','Acoso laboral','Cobro de prestaciones','Accidentes del trabajo'],
  'Derecho Penal': ['Robos y hurtos','Abuso sexual y violación','Injurias y calumnias','Tráfico de drogas','Manejo en estado de ebriedad','Estafas y delitos económicos'],
  'Derecho Comercial': ['Constitución de sociedades','Incumplimiento de contratos comerciales','Cobranza comercial','Conflictos entre socios','Quiebras e insolvencia empresarial','Protección de marcas'],
  'Derecho Tributario': ['Defensa ante el SII','Liquidaciones y giros','Reclamaciones tributarias','Impuestos y declaraciones','Fiscalizaciones','Planificación tributaria'],
  'Protección al Consumidor': ['Cobros indebidos','Garantías y devoluciones','Cláusulas abusivas','Problemas con retail','Servicios defectuosos','Reclamos contra proveedores'],
  'Derechos Humanos': ['Discriminación','Vulneración de derechos fundamentales','Recursos de protección','Abuso de autoridad','Acceso a prestaciones públicas','Otros derechos fundamentales'],
  'Otros Casos': ['Inmigración en Chile','Negligencia médica','Accidentes de tránsito','Compra y arriendo de propiedades','Deudas, insolvencia y renegociación','Otro tipo de caso']
};
let publicCaseCategory = 'Casos más frecuentes';
let selectedPublicCase = localStorage.getItem('abogago_pending_case') || '';

function renderPublicCaseBrowser() {
  const list = document.getElementById('case-category-list');
  if (!list) return;
  list.innerHTML = Object.keys(PUBLIC_CASE_CATALOG).map((name, i) => `<button class="case-category-btn ${name === publicCaseCategory ? 'active' : ''}" onclick="setPublicCaseCategory('${name.replace(/'/g,"\'")}')"><span>${esc(name)}</span><b>→</b></button>`).join('');
  renderPublicCases();
}
function setPublicCaseCategory(name) { publicCaseCategory = name; document.getElementById('case-selected-category').textContent = name; renderPublicCaseBrowser(); }
function renderPublicCases() {
  const grid = document.getElementById('case-options-grid'); if (!grid) return;
  const q = (document.getElementById('case-public-search')?.value || '').trim().toLowerCase();
  const items = (PUBLIC_CASE_CATALOG[publicCaseCategory] || []).filter(x => !q || x.toLowerCase().includes(q));
  grid.innerHTML = items.length ? items.map(name => `<button class="case-option-card ${selectedPublicCase === name ? 'selected' : ''}" onclick="selectPublicCase('${name.replace(/'/g,"\'")}')"><span>${esc(name)}</span><b>→</b></button>`).join('') : '<div class="empty case-search-empty">No encontramos casos con esa búsqueda.</div>';
  const bar = document.getElementById('case-public-selection');
  if (bar) { bar.classList.toggle('hidden', !selectedPublicCase); document.getElementById('case-public-selection-name').textContent = selectedPublicCase || ''; }
}
function selectPublicCase(name) { selectedPublicCase = name; localStorage.setItem('abogago_pending_case', name); renderPublicCases(); }
function applyPendingPublicCase() {
  const pending = localStorage.getItem('abogago_pending_case') || selectedPublicCase;
  const select = document.getElementById('c-tipo');
  if (!pending || !select) return;
  if (![...select.options].some(o => o.value === pending)) select.add(new Option(pending, pending));
  select.value = pending;
}
function continuarCasoPublico() {
  if (!selectedPublicCase) return toast('Selecciona un tipo de caso');
  localStorage.setItem('abogago_pending_case', selectedPublicCase);
  if (!currentUser) { openLoginModal(); return toast('Tu caso quedó seleccionado. Inicia sesión o crea una cuenta para publicarlo gratis.'); }
  if (currentUser.role === 'sin_definir') return document.getElementById('role-modal')?.classList.remove('hidden');
  if (currentUser.role !== 'cliente') return toast('Para publicar una consulta necesitas una cuenta de cliente');
  switchView('cliente');
  setTimeout(() => { applyPendingPublicCase(); document.getElementById('c-tipo')?.scrollIntoView({behavior:'smooth',block:'center'}); }, 120);
}


function esc(v = '') { return String(v).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function fmtMoney(v) { return `$${Number(v || 0).toLocaleString('es-CL')}`; }
function normalizePhoneForWa(v = '') { return String(v).replace(/\D/g, ''); }
function toast(msg) { const el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 3400); }
function hideAllViews() { ['landing', 'casos', 'cliente', 'abogado', 'cuenta'].forEach(v => document.getElementById(`view-${v}`)?.classList.add('hidden')); }

function switchView(view) {
  if (view === 'admin') { window.location.href = 'admin.html'; return; }
  if (view === 'cliente' && (!currentUser || currentUser.role !== 'cliente')) return irACliente();
  if (view === 'abogado' && (!currentUser || currentUser.role !== 'abogado')) return irAAbogado();
  if (view === 'cuenta' && !currentUser) return openLoginModal();
  if (view === 'casos') renderPublicCaseBrowser();
  hideAllViews();
  document.getElementById(`view-${view}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'cliente') { cargarPortalCliente(); setTimeout(applyPendingPublicCase, 50); }
  if (view === 'abogado') cargarPortalAbogado();
  if (view === 'cuenta') cargarCuenta();
}

document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

function goLandingSection(id) {
  hideAllViews();
  document.getElementById('view-landing')?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === 'landing'));
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}


function openLoginModal() { document.getElementById('login-modal')?.classList.remove('hidden'); showLoginMethods(); }
function closeLoginModal() { document.getElementById('login-modal')?.classList.add('hidden'); }
function showLoginMethods() { ['local-auth-step', 'login-code-step', 'password-reset-step'].forEach(id => document.getElementById(id)?.classList.add('hidden')); document.getElementById('login-methods')?.classList.remove('hidden'); }
function showLocalLogin() { document.getElementById('login-methods')?.classList.add('hidden'); document.getElementById('local-auth-step')?.classList.remove('hidden'); document.getElementById('password-reset-step')?.classList.add('hidden'); document.getElementById('local-login-form')?.classList.remove('hidden'); document.getElementById('local-register-form')?.classList.add('hidden'); document.getElementById('auth-tab-login')?.classList.add('active'); document.getElementById('auth-tab-register')?.classList.remove('active'); }
function showLocalRegister() { document.getElementById('login-methods')?.classList.add('hidden'); document.getElementById('local-auth-step')?.classList.remove('hidden'); document.getElementById('local-login-form')?.classList.add('hidden'); document.getElementById('local-register-form')?.classList.remove('hidden'); document.getElementById('auth-tab-login')?.classList.remove('active'); document.getElementById('auth-tab-register')?.classList.add('active'); }
function backToRegisterStep() { document.getElementById('login-code-step')?.classList.add('hidden'); document.getElementById('local-auth-step')?.classList.remove('hidden'); showLocalRegister(); }
function showPasswordReset() { document.getElementById('local-auth-step')?.classList.add('hidden'); document.getElementById('password-reset-step')?.classList.remove('hidden'); }

async function loginLocal() {
  try {
    const data = await apiPost('/auth/local/login', { email: document.getElementById('login-email-local').value.trim(), password: document.getElementById('login-password-local').value });
    currentUser = data.user;
    closeLoginModal();
    afterLogin();
  } catch (e) { toast(e.error || 'No se pudo iniciar sesión'); }
}

async function registerLocal() {
  const firstName = document.getElementById('register-first-name').value.trim();
  const lastName = document.getElementById('register-last-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-password-confirm').value;
  if (password !== confirm) return toast('Las contraseñas no coinciden');
  try {
    await apiPost('/auth/local/register/request-code', { firstName, lastName, email, password });
    document.getElementById('local-auth-step').classList.add('hidden');
    document.getElementById('login-code-step').classList.remove('hidden');
    document.getElementById('code-email-label').textContent = email;
    startResendCountdown();
    toast('Código enviado al correo');
  } catch (e) { toast(e.error || 'No se pudo crear la cuenta'); }
}

async function verifyRegisterCode() {
  try {
    const data = await apiPost('/auth/local/register/verify-code', { email: document.getElementById('register-email').value.trim(), code: document.getElementById('auth-code').value.trim() });
    currentUser = data.user;
    closeLoginModal();
    afterLogin();
  } catch (e) { toast(e.error || 'Código incorrecto'); }
}

function startResendCountdown() {
  clearInterval(resendTimer);
  let left = 60;
  const btn = document.getElementById('resend-email-code');
  const counter = document.getElementById('resend-counter');
  if (!btn || !counter) return;
  btn.disabled = true;
  counter.textContent = `(${left}s)`;
  resendTimer = setInterval(() => { left -= 1; counter.textContent = left > 0 ? `(${left}s)` : ''; if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; } }, 1000);
}

async function pedirResetCode() {
  const email = document.getElementById('reset-email').value.trim();
  try { await apiPost('/auth/local/password/request-code', { email }); document.getElementById('reset-final-fields').classList.remove('hidden'); toast('Si la cuenta existe, recibirás un código'); } catch (e) { toast(e.error || 'No se pudo enviar el código'); }
}

async function restablecerPassword() {
  try {
    await apiPost('/auth/local/password/reset', { email: document.getElementById('reset-email').value.trim(), code: document.getElementById('reset-code').value.trim(), newPassword: document.getElementById('reset-password').value });
    toast('Contraseña actualizada');
    showLocalLogin();
  } catch (e) { toast(e.error || 'No se pudo cambiar la contraseña'); }
}

async function afterLogin() {
  actualizarNavSesion();
  cargarNotificaciones();
  if (currentUser.role === 'admin') { window.location.href = 'admin.html'; return; }
  if (currentUser.role === 'sin_definir') document.getElementById('role-modal')?.classList.remove('hidden');
  else if (currentUser.role === 'cliente' && localStorage.getItem('abogago_pending_case')) switchView('cliente');
  else switchView(currentUser.role === 'cliente' ? 'cliente' : currentUser.role === 'abogado' ? 'abogado' : 'landing');
}

async function logout() { try { await apiPost('/auth/logout'); } catch (e) {} currentUser = null; actualizarNavSesion(); document.getElementById('notifications-panel')?.classList.add('hidden'); switchView('landing'); }

function actualizarNavSesion() {
  const session = document.getElementById('nav-session');
  const actions = document.getElementById('nav-actions');
  if (!session || !actions) return;
  if (!currentUser) { actions.innerHTML = ''; session.innerHTML = '<button class="nav-btn ghost" onclick="openLoginModal()">Ingresar</button>'; return; }
  const tier = currentUser.premium?.active ? `<span class="nav-premium-mini">${currentUser.premium.tier === 'pro' ? 'PRO' : 'PREMIUM'}</span>` : '';
  actions.innerHTML = `<button class="nav-icon-btn" onclick="toggleNotifications()" aria-label="Notificaciones">🔔<span id="notification-count" class="notification-count hidden">0</span></button>`;
  if (currentUser.role === 'admin') {
    session.innerHTML = `<button class="nav-btn admin-nav-btn" onclick="switchView('admin')">Panel admin</button><button class="nav-btn" onclick="logout()">Salir</button>`;
    return;
  }
  session.innerHTML = `<button class="nav-btn ghost" onclick="switchView('cuenta')">${esc(currentUser.firstName || currentUser.name || 'Mi cuenta')} ${tier}</button><button class="nav-btn" onclick="logout()">Salir</button>`;
}

async function initSesion() {
  currentUser = await getCurrentUser();
  try {
    const remotePrices = await apiGet('/payments/precios');
    precios = {
      ...precios,
      ...remotePrices,
      creditPacks: { ...precios.creditPacks, ...(remotePrices.creditPacks || {}) },
      plans: { ...precios.plans, ...(remotePrices.plans || {}) }
    };
  } catch (e) {}
  setCreditPack(selectedCreditPack);
  setPlanSelection(selectedPlan);
  actualizarNavSesion();
  if (currentUser) cargarNotificaciones();
  const params = new URLSearchParams(location.search);
  if (params.get('admin') === '1' && !currentUser) setTimeout(() => openLoginModal(), 0);
  if (params.get('admin') === '1' && currentUser?.role === 'admin') { window.location.href = 'admin.html'; return; }
  if (params.get('login') === 'elegir_rol' && currentUser) document.getElementById('role-modal')?.classList.remove('hidden');
  if (params.get('pago') === 'exitoso') toast('Pago aprobado. Créditos agregados.');
  if (params.get('plan') === 'exitoso') toast('Plan activado correctamente.');
  if (params.get('pago') === 'fallido' || params.get('plan') === 'fallido') toast('El pago no fue aprobado.');
  const requestedView = params.get('view');
  if (requestedView && ['landing','casos','cliente','abogado','cuenta'].includes(requestedView)) setTimeout(() => switchView(requestedView), 0);
  const section = params.get('section');
  if (section) setTimeout(() => goLandingSection(section), 40);
}

function mostrarFormAbogado() { document.getElementById('role-abogado-form')?.classList.remove('hidden'); }
async function elegirRol(role) {
  try {
    const payload = { role };
    if (role === 'abogado') { payload.rut = document.getElementById('role-rut').value.trim(); payload.tituloDocUrl = document.getElementById('role-doc').value.trim(); }
    const data = await apiPost('/auth/elegir-rol', payload);
    currentUser = data.user;
    document.getElementById('role-modal')?.classList.add('hidden');
    actualizarNavSesion();
    switchView(role === 'cliente' ? 'cliente' : 'abogado');
    if (role === 'abogado') setTimeout(() => { switchView('cuenta'); toast('Completa tu perfil profesional mientras verificamos tu cuenta'); }, 350);
  } catch (e) { toast(e.error || 'No se pudo elegir el rol'); }
}

function irACliente() { if (!currentUser) { openLoginModal(); return toast('Inicia sesión para publicar gratis'); } if (currentUser.role === 'sin_definir') return document.getElementById('role-modal')?.classList.remove('hidden'); if (currentUser.role !== 'cliente') return toast('Esta sección es para clientes'); switchView('cliente'); }
function irAAbogado() { if (!currentUser) { openLoginModal(); return toast('Inicia sesión como abogado'); } if (currentUser.role === 'sin_definir') return document.getElementById('role-modal')?.classList.remove('hidden'); if (currentUser.role !== 'abogado') return toast('Esta sección es para abogados'); switchView('abogado'); }

function bindChipGroup(selector) { document.querySelectorAll(`${selector} .radio-chip`).forEach(c => c.addEventListener('click', () => { document.querySelectorAll(`${selector} .radio-chip`).forEach(x => x.classList.remove('sel')); c.classList.add('sel'); })); }
['#c-atencion', '#c-intencion', '#c-urgencia'].forEach(bindChipGroup);

async function publicarCausa() {
  const payload = {
    tipo: document.getElementById('c-tipo').value,
    comuna: document.getElementById('c-comuna').value.trim(),
    contactName: document.getElementById('c-nombre').value.trim(),
    contactWhatsapp: document.getElementById('c-whatsapp').value.trim(),
    contactEmail: document.getElementById('c-email').value.trim(),
    atencion: document.querySelector('#c-atencion .sel')?.dataset.val,
    intencion: document.querySelector('#c-intencion .sel')?.dataset.val,
    urgencia: document.querySelector('#c-urgencia .sel')?.dataset.val,
    descripcion: document.getElementById('c-descripcion').value.trim(),
    contactConsent: document.getElementById('c-consent').checked
  };
  try {
    const causa = await apiPost('/cases', payload);
    ['c-comuna', 'c-nombre', 'c-whatsapp', 'c-email', 'c-descripcion'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('c-consent').checked = false;
    toast(`Causa N° ${causa.numero} publicada gratis`);
    cargarPortalCliente();
  } catch (e) { toast(e.error || 'No se pudo publicar'); }
}

async function cargarPortalCliente() {
  if (!currentUser || currentUser.role !== 'cliente') return;
  document.getElementById('cliente-session-pill').innerHTML = `<span class="dot"></span>${esc(currentUser.name || currentUser.email)}`;
  try { causasCliente = await apiGet('/cases/mias'); } catch (e) { causasCliente = []; toast(e.error || 'No se pudieron cargar tus causas'); }
  renderCliente();
}

function clientStatus(c) {
  if (c.status === 'cerrada') return ['Cerrada', 'pill-neutral'];
  if (c.taken || c.status === 'en_proceso') return ['Tomada por abogado', 'pill-purchased'];
  return ['Disponible', 'pill-available'];
}
function renderCliente() {
  const box = document.getElementById('cliente-causas');
  const taken = causasCliente.filter(c => c.taken || c.status === 'en_proceso').length;
  document.getElementById('stat-causas').textContent = causasCliente.length;
  document.getElementById('stat-contactos').textContent = taken;
  if (!causasCliente.length) { box.innerHTML = '<div class="card empty">Aún no has publicado consultas.</div>'; return; }
  box.innerHTML = causasCliente.map(c => {
    const [label, cls] = clientStatus(c);
    const locked = c.taken || c.status === 'en_proceso';
    return `<div class="ticket ${c.status === 'cerrada' ? 'ticket-closed' : ''} ${locked ? 'ticket-status-taken' : 'ticket-status-available'}"><div class="ticket-tab"><span>N°</span><span class="num">${esc(c.numero)}</span></div><div class="ticket-body"><div class="ticket-top"><h4>${esc(c.tipo)}</h4><span class="pill ${cls}">${label}</span></div><div class="ticket-meta"><span><b>Comuna:</b> ${esc(c.comuna)}</span><span><b>Urgencia:</b> ${esc(c.urgencia)}</span><span><b>Publicada:</b> ${fmtDate(c.createdAt)}</span>${c.acquiredAt ? `<span><b>Tomada:</b> ${fmtDate(c.acquiredAt)}</span>` : ''}</div><p class="case-description">${esc(c.descripcion || '')}</p>${locked ? '<div class="case-taken-note">✓ Un abogado verificado ya accedió a esta consulta y recibió los datos de contacto.</div>' : '<div class="privacy-note compact">🔒 Los datos de contacto siguen protegidos mientras la consulta está disponible.</div>'}<div class="ticket-actions">${c.status === 'abierta' && !locked ? `<button class="btn btn-outline btn-sm btn-dark-outline" onclick="editarCausa('${c._id}')">Editar</button>` : ''}${c.status !== 'cerrada' ? `<button class="btn btn-outline btn-sm btn-dark-outline" onclick="cerrarCausa('${c._id}')">Cerrar consulta</button>` : ''}</div></div></div>`;
  }).join('');
}

async function cerrarCausa(id) { try { await apiPatch(`/cases/${id}/cerrar`, {}); toast('Consulta cerrada'); cargarPortalCliente(); } catch (e) { toast(e.error || 'No se pudo cerrar'); } }
async function editarCausa(id) { const c = causasCliente.find(x => x._id === id); if (!c) return; const descripcion = prompt('Editar descripción de la consulta:', c.descripcion || ''); if (descripcion === null) return; try { await apiPatch(`/cases/${id}`, { descripcion }); toast('Consulta actualizada'); cargarPortalCliente(); } catch (e) { toast(e.error || 'No se pudo editar'); } }

async function cargarPortalAbogado() {
  if (!currentUser || currentUser.role !== 'abogado') return;
  currentUser = await getCurrentUser();
  document.getElementById('abogado-session-badge').textContent = currentUser.verified ? '● Abogado verificado' : '● Verificación pendiente';
  document.getElementById('saldo-creditos').textContent = currentUser.credits ?? 0;
  try { causasAbogado.disponibles = await apiGet('/cases/disponibles'); } catch (e) { causasAbogado.disponibles = []; }
  renderDisponibles();
  renderPremiumCard();
  cargarDashboardPro();
}

function setAbogadoTab(tab) {
  document.querySelectorAll('[data-atab]').forEach(x => x.classList.toggle('active', x.dataset.atab === tab));
  document.getElementById('abogado-filters').classList.toggle('hidden', tab !== 'disponibles');
  document.getElementById('abogado-list-disponibles').classList.toggle('hidden', tab !== 'disponibles');
  document.getElementById('abogado-list-historial').classList.toggle('hidden', tab !== 'historial');
  if (tab === 'historial') renderHistorial();
}

function renderDisponibles() {
  const box = document.getElementById('abogado-list-disponibles');
  if (!box) return;
  const tipo = (document.getElementById('f-tipo')?.value || '').toLowerCase();
  const comuna = (document.getElementById('f-comuna')?.value || '').toLowerCase();
  const urgencia = (document.getElementById('f-urgencia')?.value || '').toLowerCase();
  const items = causasAbogado.disponibles.filter(c => (!tipo || c.tipo.toLowerCase() === tipo) && (!comuna || c.comuna.toLowerCase().includes(comuna)) && (!urgencia || c.urgencia.toLowerCase() === urgencia));
  if (!items.length) { box.innerHTML = '<div class="empty">No hay oportunidades para mostrar en este momento.</div>'; return; }
  box.innerHTML = items.map(c => {
    let stateClass = 'ticket-status-available';
    let badge = '<span class="pill pill-available">● DISPONIBLE</span>';
    let action = `<button class="btn btn-available btn-sm" onclick="tomarCausa('${c._id}', false)">Acceder gratis</button>`;
    let info = '<div class="case-state-note available-note">Disponible para cualquier abogado verificado. No consume créditos.</div>';

    if (c.taken) {
      stateClass = 'ticket-status-taken';
      badge = '<span class="pill pill-purchased">● COMPRADO</span>';
      action = '<button class="btn btn-purchased btn-sm" disabled>No disponible</button>';
      info = '<div class="case-state-note purchased-note">Esta consulta ya fue tomada por otro abogado.</div>';
    } else if (c.priority) {
      stateClass = 'ticket-status-premium';
      badge = `<span class="pill priority-case-pill">⚡ PREMIUM · ${c.hoursRemaining}h</span>`;
      if (c.canTake) {
        action = `<button class="btn btn-ink btn-sm" onclick="tomarCausa('${c._id}', true)">Acceder · 1 crédito</button>`;
        info = `<div class="case-state-note premium-note">Prioridad Premium activa. Quedan aproximadamente ${c.hoursRemaining} h antes de pasar a acceso gratis si nadie la toma.</div>`;
      } else {
        action = '<button class="btn btn-premium-locked btn-sm" disabled>Solo Premium</button>';
        info = `<div class="case-state-note premium-note">Tu cuenta no es Premium. Podrás acceder gratis en aproximadamente ${c.hoursRemaining} h si continúa disponible.</div>`;
      }
    }

    return `<div class="ticket ${stateClass}"><div class="ticket-tab"><span>N°</span><span class="num">${esc(c.numero)}</span></div><div class="ticket-body"><div class="ticket-top"><h4>${esc(c.tipo)}</h4><div class="status-stack">${badge}<span class="pill ${c.urgencia === 'Alta' ? 'pill-terracotta' : 'pill-neutral'}">${esc(c.urgencia)}</span></div></div><div class="ticket-meta"><span><b>Comuna:</b> ${esc(c.comuna)}</span><span><b>Atención:</b> ${esc(c.atencion)}</span><span><b>Intención:</b> ${esc(c.intencion)}</span><span><b>Publicada:</b> ${fmtDate(c.createdAt)}</span></div><p class="case-description">${esc(c.descripcion || '')}</p>${info}<div class="privacy-note compact">🔒 El nombre, WhatsApp y correo solo se muestran al abogado que tome la consulta.</div><div class="ticket-actions">${action}</div></div></div>`;
  }).join('');
}

async function tomarCausa(id, premiumWindow) {
  if (!currentUser?.verified) return toast('Tu cuenta debe estar verificada para acceder a consultas');
  if (premiumWindow && !currentUser.premium?.active) return toast('Esta oportunidad está reservada para Premium');
  if (premiumWindow && Number(currentUser.credits || 0) < 1) {
    toast('Necesitas 1 crédito para tomar una oportunidad Premium');
    return setTimeout(() => irAPagos('creditos'), 700);
  }
  const msg = premiumWindow
    ? '¿Acceder a esta consulta usando 1 crédito? Solo un abogado puede tomarla.'
    : '¿Acceder gratis a esta consulta? Quedará bloqueada para los demás abogados.';
  if (!confirm(msg)) return;
  try {
    const data = await apiPost(`/cases/${id}/tomar`, {});
    currentUser.credits = data.credits;
    toast(premiumWindow ? 'Consulta adquirida. Se descontó 1 crédito.' : 'Consulta adquirida gratis.');
    await cargarPortalAbogado();
    setAbogadoTab('historial');
  } catch (e) { toast(e.error || 'No se pudo acceder a la consulta'); await cargarPortalAbogado(); }
}

async function renderHistorial() {
  const box = document.getElementById('abogado-list-historial');
  try { causasAbogado.historial = await apiGet('/cases/historial'); } catch (e) { causasAbogado.historial = []; }
  if (!causasAbogado.historial.length) { box.innerHTML = '<div class="empty">Aún no has tomado consultas.</div>'; return; }
  box.innerHTML = causasAbogado.historial.map(c => {
    const mode = c.acquisitionMode === 'premium_credit' ? 'Premium · 1 crédito' : 'Acceso gratis';
    const contact = `<div class="contact-card"><div><div class="contact-label">Contacto habilitado</div><strong>${esc(c.contactName || 'Cliente')}</strong><div class="contact-lines"><span>📱 ${esc(c.contactWhatsapp || '')}</span><span>✉️ ${esc(c.contactEmail || '')}</span></div></div><div class="contact-actions"><a class="btn btn-forest btn-sm" target="_blank" rel="noopener" href="https://wa.me/${normalizePhoneForWa(c.contactWhatsapp)}">WhatsApp</a><a class="btn btn-outline btn-sm btn-dark-outline" href="mailto:${encodeURIComponent(c.contactEmail || '')}">Correo</a></div></div>`;
    return `<div class="history-card"><div class="history-head"><div><span class="mono muted">CAUSA ${esc(c.numero)}</span><h4>${esc(c.tipo)}</h4></div><span class="pill pill-purchased">✓ ADQUIRIDA</span></div><div class="ticket-meta"><span><b>Comuna:</b> ${esc(c.comuna)}</span><span><b>Acceso:</b> ${mode}</span><span><b>Tomada:</b> ${fmtDate(c.acquiredAt || c.createdAt)}</span></div><p class="case-description">${esc(c.descripcion || '')}</p>${contact}</div>`;
  }).join('');
}

async function cargarDashboardPro() {
  const box = document.getElementById('pro-dashboard');
  if (!(currentUser.premium?.active && currentUser.premium?.tier === 'pro')) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  try {
    const s = await apiGet('/cases/stats/pro');
    box.classList.remove('hidden');
    box.innerHTML = `<div class="pro-dashboard-head"><div><div class="eyebrow">Premium Pro</div><h3>Rendimiento profesional</h3></div><span class="plan-badge plan-pro">🏆 Dashboard Pro</span></div><div class="pro-stat-grid"><div><span>Casos tomados</span><strong>${s.acquired}</strong></div><div><span>Premium</span><strong>${s.premiumAcquired}</strong></div><div><span>Gratis</span><strong>${s.freeAcquired}</strong></div><div><span>Créditos usados</span><strong>${s.creditsSpent}</strong></div><div><span>Vistas de perfil</span><strong>${s.profileViews}</strong></div></div>`;
  } catch (e) { box.classList.add('hidden'); }
}

function setCreditPack(packId) {
  const pack = precios.creditPacks?.[packId];
  if (!pack) return toast('Ese pack no está disponible');
  selectedCreditPack = packId;
  document.querySelectorAll('.portal-credit-pack').forEach(b => {
    const active = b.dataset.pack === packId;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const total = document.getElementById('credit-total');
  const desc = document.getElementById('credit-selection-desc');
  if (total) total.textContent = fmtMoney(pack.price);
  if (desc) desc.textContent = `${pack.credits} ${pack.credits === 1 ? 'crédito' : 'créditos'} · ${pack.credits} ${pack.credits === 1 ? 'acceso Premium' : 'accesos Premium'}`;
}

function setPlanSelection(tier) {
  const plan = precios.plans?.[tier];
  if (!plan) return;
  selectedPlan = tier;
  document.querySelectorAll('.portal-plan-card').forEach(card => {
    const active = card.dataset.plan === tier;
    card.classList.toggle('active', active);
    card.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const total = document.getElementById('plan-total');
  const desc = document.getElementById('plan-selection-desc');
  if (total) total.textContent = fmtMoney(plan.price);
  if (desc) desc.textContent = `${plan.name} · ${plan.credits} créditos mensuales`;
  const btn = document.getElementById('plan-continue-btn');
  if (btn) btn.textContent = `Continuar con ${plan.name}`;
}

async function comprarCreditosDesdePanel() { try { const { url, token } = await apiPost('/payments/credits/init', { packId: selectedCreditPack }); postRedirect(url, { token_ws: token }); } catch (e) { toast(e.error || 'No se pudo iniciar el pago'); } }
function renderPremiumCard() { const box = document.getElementById('premium-status'); const badge = document.getElementById('account-plan-badge'); if (!box) return; const p = currentUser.premium; if (p?.active) { badge.textContent = p.tier === 'pro' ? '🏆 Premium Pro' : '★ Premium'; badge.className = `plan-badge ${p.tier === 'pro' ? 'plan-pro' : 'plan-premium'}`; box.innerHTML = `<div class="premium-active-box"><strong>Plan activo</strong><p>Prioridad de ${precios.priorityHours || 24} horas. Próxima renovación: ${p.planEnd ? fmtDate(p.planEnd) : '—'}.</p></div>`; } else { badge.textContent = 'Plan gratuito'; badge.className = 'plan-badge plan-standard'; box.innerHTML = '<div class="premium-smallprint">Las oportunidades nuevas permanecen reservadas durante 24 horas. Si nadie las toma, se habilitan gratis para abogados verificados.</div>'; } }
async function contratarPremium(tier = selectedPlan) { const plan = precios.plans?.[tier]; if (!plan) return toast('Plan no válido'); try { if (currentUser.oneclick?.inscribed) { const data = await apiPost('/payments/oneclick/plan/activar', { plan: tier }); currentUser = data.user; toast(`${plan.name} activado`); cargarPortalAbogado(); } else { const { url, token } = await apiPost('/payments/oneclick/inscribir', { plan: tier }); postRedirect(url, { TBK_TOKEN: token }); } } catch (e) { toast(e.error || 'No se pudo activar el plan'); } }
function irAPagos(tipo = 'creditos') {
  if (!currentUser) return openLoginModal();
  if (currentUser.role !== 'abogado') return toast('Disponible para abogados');
  switchView('abogado');
  setTimeout(() => {
    if (tipo === 'premium' || tipo === 'pro') {
      setPlanSelection(tipo);
      document.getElementById('premium-offer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setCreditPack(selectedCreditPack);
      document.querySelector('.payment-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 180);
}

async function cargarCuenta() {
  if (!currentUser) return;
  currentUser = await getCurrentUser();
  document.getElementById('acc-first').value = currentUser.firstName || '';
  document.getElementById('acc-last').value = currentUser.lastName || '';
  document.getElementById('acc-email').value = currentUser.email || '';
  const p = currentUser.lawyerProfile || {};
  const lawyer = currentUser.role === 'abogado';
  document.getElementById('lawyer-profile-fields').classList.toggle('hidden', !lawyer);
  if (lawyer) {
    document.getElementById('acc-headline').value = p.headline || '';
    document.getElementById('acc-bio').value = p.bio || '';
    document.getElementById('acc-region').value = p.region || '';
    document.getElementById('acc-comuna').value = p.comuna || '';
    document.getElementById('acc-specialties').value = (p.specialties || []).join(', ');
    document.getElementById('acc-years').value = p.yearsExperience || 0;
    document.getElementById('acc-university').value = p.university || '';
    document.getElementById('acc-registry').value = p.registryNumber || '';
    document.getElementById('acc-phone').value = p.phone || '';
    document.getElementById('acc-modes').value = (p.serviceModes || []).join(', ');
    document.getElementById('acc-url').value = p.professionalUrl || '';
  }
  const s = currentUser.settings || {};
  document.getElementById('set-email').checked = s.emailNotifications !== false;
  document.getElementById('set-opportunities').checked = s.opportunityNotifications !== false;
  document.getElementById('set-proposals').checked = s.proposalNotifications !== false;
}

async function guardarPerfil() {
  const lawyerProfile = currentUser.role === 'abogado' ? { headline: document.getElementById('acc-headline').value, bio: document.getElementById('acc-bio').value, region: document.getElementById('acc-region').value, comuna: document.getElementById('acc-comuna').value, specialties: document.getElementById('acc-specialties').value.split(',').map(x => x.trim()).filter(Boolean), yearsExperience: Number(document.getElementById('acc-years').value), university: document.getElementById('acc-university').value, registryNumber: document.getElementById('acc-registry').value, phone: document.getElementById('acc-phone').value, serviceModes: document.getElementById('acc-modes').value.split(',').map(x => x.trim()).filter(Boolean), professionalUrl: document.getElementById('acc-url').value } : undefined;
  try { const data = await apiPatch('/account/profile', { firstName: document.getElementById('acc-first').value, lastName: document.getElementById('acc-last').value, lawyerProfile }); currentUser = data.user; actualizarNavSesion(); toast('Perfil guardado'); } catch (e) { toast(e.error || 'No se pudo guardar'); }
}
async function guardarPreferencias() { try { const data = await apiPatch('/account/settings', { emailNotifications: document.getElementById('set-email').checked, opportunityNotifications: document.getElementById('set-opportunities').checked, proposalNotifications: document.getElementById('set-proposals').checked }); currentUser = data.user; toast('Preferencias guardadas'); } catch (e) { toast(e.error || 'No se pudo guardar'); } }
async function cambiarPassword() { try { await apiPatch('/account/password', { currentPassword: document.getElementById('acc-pass-current').value, newPassword: document.getElementById('acc-pass-new').value }); document.getElementById('acc-pass-current').value = ''; document.getElementById('acc-pass-new').value = ''; toast('Contraseña actualizada'); } catch (e) { toast(e.error || 'No se pudo cambiar'); } }

async function cargarNotificaciones() {
  if (!currentUser) return;
  try {
    const data = await apiGet('/notifications');
    const count = document.getElementById('notification-count');
    if (count) { count.textContent = data.unread; count.classList.toggle('hidden', !data.unread); }
    const box = document.getElementById('notifications-list');
    if (box) box.innerHTML = data.items.length ? data.items.map(n => `<button class="notification-item ${n.read ? '' : 'unread'}" onclick="abrirNotificacion('${n._id}','${n.linkView}')"><strong>${esc(n.title)}</strong><span>${esc(n.message)}</span><small>${fmtDate(n.createdAt)}</small></button>`).join('') : '<div class="empty">No tienes notificaciones.</div>';
  } catch (e) {}
}
function toggleNotifications() { const p = document.getElementById('notifications-panel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) cargarNotificaciones(); }
async function abrirNotificacion(id, view) { try { await apiPatch(`/notifications/${id}/read`, {}); } catch (e) {} document.getElementById('notifications-panel').classList.add('hidden'); switchView(view); cargarNotificaciones(); }
async function marcarTodasLeidas() { try { await apiPatch('/notifications/read-all', {}); cargarNotificaciones(); } catch (e) {} }

window.addEventListener('click', e => { const panel = document.getElementById('notifications-panel'); if (!panel?.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('.nav-icon-btn')) panel.classList.add('hidden'); });

document.getElementById('login-email-open')?.addEventListener('click', showLocalLogin);
document.getElementById('local-login-btn')?.addEventListener('click', loginLocal);
document.getElementById('local-register-btn')?.addEventListener('click', registerLocal);
document.getElementById('verify-email-code')?.addEventListener('click', verifyRegisterCode);
document.getElementById('resend-email-code')?.addEventListener('click', registerLocal);
document.getElementById('login-google')?.addEventListener('click', e => { e.preventDefault(); location.href = `${API_BASE}/auth/google`; });

initSesion();
switchView('landing');
