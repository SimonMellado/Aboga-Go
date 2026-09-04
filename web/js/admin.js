/* Creado por LimónStudioss. s.melladoo */
let currentUser = null;
let currentStaffRole = 'none';
let currentPermissions = [];
let currentEffectivePermissions = [];
const PERMISSION_LABELS = { users_manage:'Gestionar usuarios', users_delete:'Eliminar cuentas', roles_manage:'Gestionar roles', credits_manage:'Gestionar créditos', verification_manage:'Verificación de abogados', payments_manage:'Pagos y transferencias', cases_manage:'Causas activas', security_view:'Ver seguridad' };

function hasPermission(permission){ return currentStaffRole === 'creador' || currentStaffRole === 'admin' || currentEffectivePermissions.includes(permission); }

function canReview(){ return hasPermission('verification_manage'); }
function canAdmin(){ return hasPermission('users_manage') || hasPermission('credits_manage') || hasPermission('payments_manage') || hasPermission('cases_manage') || hasPermission('security_view'); }
function isCreator(){ return currentStaffRole === 'creador'; }

async function initAdmin(){
  currentUser = await getCurrentUser();
  const msg = document.getElementById('admin-gate-msg');
  const link = document.getElementById('admin-gate-link');
  if(!currentUser){ msg.textContent = 'Necesitas iniciar sesión con una cuenta autorizada del equipo.'; link.classList.remove('hidden'); return; }
  try { const staff = await apiGet('/admin/me'); currentStaffRole = staff.staffRole || 'none'; currentPermissions = staff.permissions || []; currentEffectivePermissions = staff.effectivePermissions || []; }
  catch(e){ currentStaffRole = 'none'; }
  if(!canReview()){ msg.textContent = 'Tu cuenta no tiene permisos para entrar al panel interno.'; return; }
  document.getElementById('admin-gate').classList.add('hidden');
  document.getElementById('view-admin').classList.remove('hidden');
  applyPermissions();
  await renderAdmin();
}
initAdmin();

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(window._tt); window._tt=setTimeout(()=>t.classList.remove('show'),2800); }

function applyPermissions(){
  document.querySelectorAll('[data-permission]').forEach(el=>el.classList.toggle('hidden', !hasPermission(el.dataset.permission)));
  const first = hasPermission('users_manage') ? 'usuarios' : canReview() ? 'verificacion' : hasPermission('credits_manage') ? 'creditos' : hasPermission('payments_manage') ? 'transferencias' : hasPermission('cases_manage') ? 'causas' : 'seguridad';
  setAdminTab(first);
}

function setAdminTab(t){
  const permissionByTab = { usuarios:'users_manage', verificacion:'verification_manage', causas:'cases_manage', creditos:'credits_manage', transferencias:'payments_manage', compras:'payments_manage', seguridad:'security_view', roles:'roles_manage' };
  const allowed = hasPermission(permissionByTab[t] || '');
  if(!allowed) return toast('No tienes permisos para esta sección');
  document.querySelectorAll('[data-adm]').forEach(el=>el.classList.toggle('active', el.dataset.adm===t));
  ['usuarios','verificacion','causas','creditos','transferencias','compras','seguridad','roles'].forEach(id=>document.getElementById('admin-'+id)?.classList.toggle('hidden', id!==t));
}

async function verificarAbogado(id){ try{ await apiPost(`/admin/verificar/${id}`); toast('Abogado verificado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo verificar'); } }
async function rechazarAbogado(id){ const note = prompt('Indica qué debe corregir el abogado:','Documento o antecedentes incompletos.'); if(note===null) return; try{ await apiPost(`/admin/rechazar/${id}`, { note }); toast('Cambios solicitados'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo solicitar cambios'); } }
async function ajustarCreditos(userId, delta){ try{ await apiPost(`/admin/creditos/${userId}`, { delta }); toast('Saldo ajustado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo ajustar el saldo'); } }
async function ajustarCreditosPersonalizado(userId){
  const raw=prompt('Indica cuántos créditos agregar o quitar. Ejemplo: 20 o -5','10');
  if(raw===null) return;
  const delta=Number(raw);
  if(!Number.isSafeInteger(delta) || delta===0) return toast('Ingresa un número entero distinto de cero');
  try{ await apiPost(`/admin/creditos/${userId}`, { delta }); toast('Créditos actualizados'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo ajustar el saldo'); }
}
async function cambiarTipoCuenta(userId){
  const select=document.getElementById(`account-type-${userId}`); if(!select) return;
  const role=select.value; const label=role==='abogado'?'abogado':'cliente';
  if(!confirm(`¿Cambiar esta cuenta a ${label}? Se mantendrán sus registros, pero el portal cambiará inmediatamente y la verificación profesional se reiniciará.`)) return;
  try{ await apiPost(`/admin/usuarios/${userId}/cambiar-tipo`, { role }); toast(`Cuenta cambiada a ${label}`); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo cambiar el tipo de cuenta'); }
}
async function asignarTipoCuenta(userId){ return cambiarTipoCuenta(userId); }
async function cambiarPlanUsuario(userId){
  const tier=document.getElementById(`plan-${userId}`)?.value || 'free';
  const days=Number(document.getElementById(`days-${userId}`)?.value || 30);
  if(!confirm(tier==='free'?'¿Quitar el plan Premium/Pro de esta cuenta?':'¿Asignar este plan manualmente? Será por el número de días indicado y sin renovación automática.')) return;
  try{ await apiPost(`/admin/usuarios/${userId}/premium`, { tier, days }); toast('Plan actualizado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo actualizar el plan'); }
}
async function eliminarCuenta(userId){
  const reason=prompt('Motivo de desactivación (queda registrado en auditoría):','Solicitud del administrador');
  if(reason===null) return;
  if(!confirm('La cuenta perderá el acceso inmediatamente. Los registros históricos de casos y pagos se conservarán para auditoría. ¿Continuar?')) return;
  try{ await apiPost(`/admin/usuarios/${userId}/eliminar`, { reason }); toast('Cuenta desactivada'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo desactivar la cuenta'); }
}
async function restaurarCuenta(userId){
  if(!confirm('¿Restaurar el acceso de esta cuenta?')) return;
  try{ await apiPost(`/admin/usuarios/${userId}/restaurar`); toast('Cuenta restaurada'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo restaurar la cuenta'); }
}
async function cambiarRolInterno(userId){
  const select=document.getElementById(`staff-role-${userId}`); if(!select) return;
  const permissions=[...document.querySelectorAll(`[data-perm-user="${userId}"]:checked`)].map(el=>el.value);
  try{ await apiPost(`/admin/roles/${userId}`, { staffRole:select.value, permissions }); toast('Rol y permisos actualizados'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo actualizar el rol'); }
}
function verComprobante(id){ window.open(`${API_BASE}/admin/transferencias/${id}/comprobante`, '_blank', 'noopener'); }
async function revisarTransferencia(id, action){ const label=action==='approve'?'aprobar':'rechazar'; if(!confirm(`¿Seguro que deseas ${label} esta transferencia?`)) return; const note=prompt('Nota interna/opcional:','') ?? ''; try{ await apiPost(`/admin/transferencias/${id}/revisar`, { action, note }); toast(action==='approve'?'Transferencia aprobada':'Transferencia rechazada'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo revisar el pago'); } }


let currentPurchaseJson = null;

function verificationBadge(p){
  if(p.paymentVerified) return '<span class="pill pill-forest">Pago confirmado</span>';
  if(p.verificationLevel === 'manual_bank_check') return '<span class="pill pill-brass">Aprobación manual</span>';
  if(p.verificationLevel === 'historical_without_evidence') return '<span class="pill pill-brass">Histórico · revisar</span>';
  return '<span class="pill pill-neutral">Sin confirmar</span>';
}

async function verCompraJson(source, id){
  try{
    currentPurchaseJson = await apiGet(`/admin/compras/${source}/${id}/json`);
    document.getElementById('purchase-json-content').textContent = JSON.stringify(currentPurchaseJson, null, 2);
    document.getElementById('purchase-json-modal')?.classList.remove('hidden');
    document.body.style.overflow='hidden';
  }catch(err){ toast(err.error || 'No se pudo abrir el detalle de la compra'); }
}

function cerrarCompraJson(){
  document.getElementById('purchase-json-modal')?.classList.add('hidden');
  document.body.style.overflow='';
}

async function copiarCompraJson(){
  if(!currentPurchaseJson) return;
  try{ await navigator.clipboard.writeText(JSON.stringify(currentPurchaseJson, null, 2)); toast('JSON copiado'); }
  catch(_){ toast('No se pudo copiar automáticamente'); }
}

function profileSummary(l){
  const p=l.lawyerProfile||{};
  const specs=(p.specialties||[]).join(', ')||'—';
  return `<div class="admin-lawyer-detail"><strong>${esc(l.name||l.email)}</strong><span>${esc(l.email)}</span><span>RUT: ${esc(l.rut||'—')} · Tel: ${esc(p.phone||'—')}</span><span>${esc(p.region||'—')} / ${esc(p.comuna||'—')}</span><span>Universidad: ${esc(p.university||'—')} · Año: ${esc(p.titleYear||'—')}</span><span>N.º/Folio: ${esc(p.titleNumber||p.registryNumber||'—')}</span><span>Especialidades: ${esc(specs)}</span></div>`;
}

function cerrarVistaPortal(){
  document.getElementById('portal-preview-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function portalStatusCase(c, portal){
  if(c.status === 'cerrada') return ['Cerrada','pill-neutral'];
  if(portal === 'cliente') return (c.selectedLawyer || c.taken || c.status === 'en_proceso') ? ['Tomada por abogado','pill-brass'] : ['Disponible','pill-forest'];
  if(c.owned) return ['COMPRADO','pill-brass'];
  if(c.taken) return ['COMPRADO','pill-brass'];
  if(c.priority) return ['PREMIUM','pill-neutral'];
  return ['DISPONIBLE','pill-forest'];
}

function renderPreviewCase(c, portal){
  const [status, cls] = portalStatusCase(c, portal);
  const lawyer = c.selectedLawyer;
  const lawyerName = lawyer ? (lawyer.name || [lawyer.firstName,lawyer.lastName].filter(Boolean).join(' ') || lawyer.email) : '';
  const contact = portal === 'abogado' && c.contactUnlocked ? `<div class="admin-preview-contact"><strong>Contacto desbloqueado:</strong> ${esc(c.contactName||'—')} · ${esc(c.contactWhatsapp||'—')} · ${esc(c.contactEmail||'—')}</div>` : '';
  const selected = portal === 'cliente' && lawyer ? `<div class="admin-preview-contact"><strong>Abogado que tomó el caso:</strong> ${esc(lawyerName||'—')}${lawyer.verified?' · Verificado':''}</div>` : '';
  return `<div class="admin-preview-case"><div class="admin-preview-case-head"><div><h4>Caso N° ${esc(c.numero||'—')} · ${esc(c.tipo||'Sin tipo')}</h4><div class="muted">${esc(c.comuna||'—')} · ${esc(c.atencion||'—')} · ${esc(c.intencion||'—')}</div></div><span class="pill ${cls}">${status}</span></div><p>${esc(c.descripcion||'Sin descripción')}</p><div class="admin-preview-meta"><span class="pill pill-neutral">Urgencia: ${esc(c.urgencia||'—')}</span>${portal==='abogado'&&c.priority&&!c.taken?`<span class="pill pill-neutral">${Number(c.hoursRemaining||0)} h Premium restantes</span>`:''}${c.acquisitionMode?`<span class="pill pill-neutral">${c.acquisitionMode==='premium_credit'?'1 crédito':'Acceso gratis'}</span>`:''}</div>${selected}${contact}</div>`;
}

async function verPortalUsuario(userId){
  try{
    const data = await apiGet(`/admin/usuarios/${userId}/portal`);
    const u = data.user || {};
    const content = document.getElementById('portal-preview-content');
    const roleLabel = data.portal === 'cliente' ? 'Portal Cliente' : 'Portal Abogado';
    let body = '';
    if(data.portal === 'cliente'){
      const cases = data.cases || [];
      const taken = cases.filter(c=>c.selectedLawyer || c.status==='en_proceso').length;
      const closed = cases.filter(c=>c.status==='cerrada').length;
      body = `<div class="admin-preview-stats"><div class="admin-preview-stat"><span>Consultas</span><strong>${cases.length}</strong></div><div class="admin-preview-stat"><span>Tomadas</span><strong>${taken}</strong></div><div class="admin-preview-stat"><span>Cerradas</span><strong>${closed}</strong></div><div class="admin-preview-stat"><span>Créditos</span><strong>${Number(u.credits||0)}</strong></div></div><div class="admin-preview-section"><h3>Mis consultas</h3>${cases.length?cases.map(c=>renderPreviewCase(c,'cliente')).join(''):'<div class="admin-preview-empty">Este cliente todavía no ha publicado consultas.</div>'}</div>`;
    } else {
      const premiumActive = Boolean(u.premium?.active && u.premium?.planEnd && new Date(u.premium.planEnd).getTime()>Date.now());
      const tier = premiumActive ? (u.premium?.tier==='pro'?'Premium Pro':'Premium') : 'Free';
      const stats=data.stats||{};
      const available=(data.available||[]).filter(c=>!c.taken || c.owned);
      const history=data.history||[];
      body = `<div class="admin-preview-stats"><div class="admin-preview-stat"><span>Créditos</span><strong>${Number(u.credits||0)}</strong></div><div class="admin-preview-stat"><span>Plan</span><strong style="font-size:15px">${esc(tier)}</strong></div><div class="admin-preview-stat"><span>Casos adquiridos</span><strong>${Number(stats.acquired||0)}</strong></div><div class="admin-preview-stat"><span>Verificación</span><strong style="font-size:15px">${u.verified?'Verificado':'Pendiente'}</strong></div></div><div class="admin-preview-section"><h3>Oportunidades visibles</h3>${available.length?available.slice(0,30).map(c=>renderPreviewCase(c,'abogado')).join(''):'<div class="admin-preview-empty">No hay oportunidades visibles actualmente.</div>'}</div><div class="admin-preview-section"><h3>Historial adquirido</h3>${history.length?history.map(c=>renderPreviewCase({...c,owned:true,contactUnlocked:true},'abogado')).join(''):'<div class="admin-preview-empty">Este abogado todavía no ha adquirido oportunidades.</div>'}</div>`;
    }
    content.innerHTML = `<div class="admin-preview-banner">Vista administrativa de solo lectura. No estás iniciando sesión como este usuario y ninguna acción del cliente o abogado está habilitada.</div><div class="admin-preview-head"><div><div class="eyebrow">${roleLabel}</div><h2>${esc(u.name||u.email||'Usuario')}</h2><p>${esc(u.email||'')} · Cuenta creada ${u.createdAt?new Date(u.createdAt).toLocaleDateString('es-CL'):'—'}</p></div><span class="pill ${data.portal==='abogado'?'pill-brass':'pill-forest'}">${data.portal==='abogado'?'ABOGADO':'CLIENTE'}</span></div>${body}`;
    document.getElementById('portal-preview-modal')?.classList.remove('hidden');
    document.body.style.overflow='hidden';
  }catch(err){ toast(err.error || 'No se pudo abrir el portal'); }
}

async function renderAdmin(){
  let users=[], pendientes=[], causas=[], transfers=[], purchases={ totals:{}, purchases:[] }, roles=[], security=null;
  try{
    const jobs=[];
    if(hasPermission('users_manage')) jobs.push(apiGet('/admin/usuarios').then(v=>users=v));
    if(hasPermission('cases_manage')) jobs.push(apiGet('/admin/causas').then(v=>causas=v));
    if(hasPermission('payments_manage')) jobs.push(apiGet('/admin/transferencias').then(v=>transfers=v), apiGet('/admin/compras').then(v=>purchases=v));
    if(hasPermission('security_view')) jobs.push(apiGet('/admin/security/summary').then(v=>security=v));
    if(canReview()) jobs.push(apiGet('/admin/verificacion-pendiente').then(v=>pendientes=v));
    if(isCreator()) jobs.push(apiGet('/admin/roles').then(v=>roles=v));
    await Promise.all(jobs);
  }catch(err){ toast(err.error || 'Error cargando datos del panel'); }

  if(canAdmin()){
    document.getElementById('admin-usuarios').innerHTML = `<div class="admin-section-head"><div><h3>Usuarios y gestión de cuentas</h3><p>Cambia el tipo de portal si alguien se registró mal, ajusta créditos, administra planes y desactiva cuentas. Los registros históricos se conservan.</p></div><span class="pill pill-neutral">${users.length} cuentas</span></div><div class="admin-users-note"><strong>Protecciones:</strong> la cuenta creadora nunca se puede modificar ni eliminar. Las cuentas del equipo interno solo pueden ser modificadas por el creador. El borrado es una desactivación auditada para no romper casos ni pagos históricos.</div><div class="admin-users-table-wrap"><table><thead><tr><th>Usuario</th><th>Tipo / portal</th><th>Estado</th><th>Créditos</th><th>Plan</th><th>Gestión</th></tr></thead><tbody>${users.map(u=>{ const locked=u.staffRole==='creador'; const staffLocked=u.staffRole&&u.staffRole!=='none'&&!isCreator(); const estado=u.active===false?'Desactivada':u.role==='abogado'?(u.verified?'Verificado':'Pendiente'):u.role==='sin_definir'?'Tipo pendiente':'Activo'; const tier=u.premium?.active&&u.premium?.planEnd&&new Date(u.premium.planEnd)>new Date()?u.premium.tier:'free'; const planLabel=tier==='pro'?'Pro':tier==='premium'?'Premium':'Free'; const planEnd=u.premium?.planEnd?new Date(u.premium.planEnd).toLocaleDateString('es-CL'):''; const portalAction=['cliente','abogado'].includes(u.role)?`<button class="btn btn-outline btn-sm" onclick="verPortalUsuario('${u._id}')">Portal ${u.role}</button>`:'<span class="muted">Sin portal</span>'; const roleEditor=locked?'<span class="pill pill-brass">CREADOR</span>':`<select id="account-type-${u._id}" class="admin-role-select" ${staffLocked||u.active===false?'disabled':''}><option value="cliente" ${u.role==='cliente'?'selected':''}>Cliente</option><option value="abogado" ${u.role==='abogado'?'selected':''}>Abogado</option>${u.role==='sin_definir'?'<option value="sin_definir" selected>Tipo pendiente</option>':''}</select><button class="btn btn-ink btn-sm" onclick="cambiarTipoCuenta('${u._id}')" ${staffLocked||u.active===false?'disabled':''}>Cambiar</button>`; const canEdit=!locked&&!staffLocked&&u.active!==false; const planEditor=u.role==='abogado'?`<div class="admin-mini-controls"><select id="plan-${u._id}" class="admin-role-select"><option value="free" ${tier==='free'?'selected':''}>Free</option><option value="premium" ${tier==='premium'?'selected':''}>Premium</option><option value="pro" ${tier==='pro'?'selected':''}>Pro</option></select><input id="days-${u._id}" type="number" min=1 max=365 value="30" class="admin-number-input" aria-label="Días de plan"><button class="btn btn-outline btn-sm" onclick="cambiarPlanUsuario('${u._id}')" ${canEdit?'':'disabled'}>Guardar</button></div><small class="muted">${planLabel}${planEnd?' · hasta '+planEnd:''}</small>`:'<span class="muted">No aplica</span>'; const statusAction=u.active===false?`<button class="btn btn-outline btn-sm" onclick="restaurarCuenta('${u._id}')">Restaurar</button>`:locked?'<span class="muted">Protegida</span>':`<button class="btn btn-outline btn-sm danger" onclick="eliminarCuenta('${u._id}')" ${canEdit?'':'disabled'}>Eliminar cuenta</button>`; return `<tr><td><strong>${esc(u.name||u.email)}</strong><br><span class="muted">${esc(u.email)}</span>${u.staffRole&&u.staffRole!=='none'?`<br><span class="pill pill-neutral">${esc(u.staffRole)}</span>`:''}</td><td><div class="admin-mini-controls">${roleEditor}</div><div style="margin-top:6px">${portalAction}</div></td><td><span class="pill ${estado==='Verificado'||estado==='Activo'?'pill-forest':estado==='Desactivada'?'pill-neutral':'pill-brass'}">${estado}</span></td><td><strong class="mono">${u.role==='abogado'?Number(u.credits||0):'—'}</strong>${u.role==='abogado'?`<div class="admin-mini-controls"><button class="btn btn-outline btn-sm" onclick="ajustarCreditosPersonalizado('${u._id}')" ${canEdit?'':'disabled'}>Ajustar</button></div>`:''}</td><td>${planEditor}</td><td><div class="admin-action-row">${statusAction}</div></td></tr>`; }).join('')}</tbody></table></div>`;

    if(hasPermission('cases_manage')) document.getElementById('admin-causas').innerHTML = `<div class="admin-section-head"><div><h3>Causas activas</h3><p>Estado de las oportunidades publicadas.</p></div></div><table><thead><tr><th>N°</th><th>Tipo</th><th>Comuna</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>${causas.map(c=>{ const hs=(Date.now()-new Date(c.createdAt).getTime())/3600000; const taken=c.taken||c.status==='en_proceso'; const estado=c.status==='cerrada'?'Cerrada':taken?'Comprada':hs>=24?'Disponible':'Premium'; const cls=estado==='Disponible'?'pill-forest':estado==='Comprada'?'pill-brass':'pill-neutral'; const acceso=taken?(c.acquisitionMode==='premium_credit'?'1 crédito':'Gratis'):hs>=24?'Gratis':'Premium · 1 crédito'; return `<tr><td class="mono">${esc(c.numero)}</td><td>${esc(c.tipo)}</td><td>${esc(c.comuna)}</td><td><span class="pill ${cls}">${estado}</span></td><td>${acceso}</td></tr>`; }).join('')}</tbody></table>`;

    const abogados=users.filter(u=>u.role==='abogado');
    if(hasPermission('credits_manage')) document.getElementById('admin-creditos').innerHTML = `<div class="admin-section-head"><div><h3>Créditos</h3><p>Ajustes manuales de saldo para abogados.</p></div></div><table><thead><tr><th>Abogado</th><th>Saldo</th><th>Ajustar</th></tr></thead><tbody>${abogados.map(a=>`<tr><td>${esc(a.name||a.email)}</td><td class="mono">${a.credits}</td><td><div style="display:flex;gap:6px"><button class="btn btn-ink btn-sm" onclick="ajustarCreditos('${a._id}',10)">+10</button><button class="btn btn-outline btn-sm" onclick="ajustarCreditos('${a._id}',-10)">-10</button></div></td></tr>`).join('')}</tbody></table>`;

    if(hasPermission('payments_manage')) document.getElementById('admin-transferencias').innerHTML = `<div class="admin-section-head"><div><h3>Transferencias</h3><p>Aprueba solo después de confirmar el abono en la cuenta bancaria.</p></div><span class="pill pill-neutral">${transfers.length} registros</span></div>${transfers.length?`<table><thead><tr><th>Usuario</th><th>RUT origen</th><th>Referencia</th><th>Producto</th><th>Monto</th><th>Estado</th><th>Validación</th><th>Acciones</th></tr></thead><tbody>${transfers.map(t=>`<tr><td>${esc(t.user?.name||t.user?.email||'—')}</td><td>${esc(t.payerRutDisplay||t.user?.rut||'—')}</td><td class="mono">${esc(t.reference)}</td><td>${t.kind==='plan'?'Plan':'Créditos'} · ${esc(t.productId)}</td><td>${fmtMoney(t.amount)}</td><td><span class="pill ${t.status==='approved'?'pill-forest':t.status==='rejected'?'pill-neutral':'pill-brass'}">${esc(t.status)}</span></td><td>${t.verificationSource==='provider_webhook'?'Automática':t.verificationSource==='manual'?'Manual':'Pendiente'}</td><td><div class="admin-action-row">${t.proof?.path?`<button class="btn btn-outline btn-sm" onclick="verComprobante('${t._id}')">Comprobante</button>`:''}${!['approved','rejected'].includes(t.status)?`<button class="btn btn-forest btn-sm" onclick="revisarTransferencia('${t._id}','approve')">Aprobar</button><button class="btn btn-outline btn-sm" onclick="revisarTransferencia('${t._id}','reject')">Rechazar</button>`:''}</div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No hay transferencias registradas.</div>'}`;

    const purchaseRows = purchases.purchases || [];
    const purchaseTotals = purchases.totals || {};
    if(hasPermission('payments_manage')) document.getElementById('admin-compras').innerHTML = `<div class="admin-section-head"><div><h3>Compras y auditoría JSON</h3><p>Revisa Webpay, Oneclick y transferencias. “Pago confirmado” significa que existe evidencia registrada directamente del proveedor/conciliación.</p></div><span class="pill pill-neutral">${purchaseRows.length} compras</span></div><div class="purchase-audit-stats"><div><span>Total</span><strong>${Number(purchaseTotals.purchases||0)}</strong></div><div><span>Aprobadas</span><strong>${Number(purchaseTotals.approved||0)}</strong></div><div><span>Confirmadas proveedor</span><strong>${Number(purchaseTotals.providerVerified||0)}</strong></div><div><span>Requieren revisión</span><strong>${Number(purchaseTotals.needsReview||0)}</strong></div></div>${purchaseRows.length?`<div class="purchase-audit-table-wrap"><table><thead><tr><th>Fecha</th><th>Abogado</th><th>Método</th><th>Producto</th><th>Monto</th><th>Estado</th><th>Pago</th><th>Detalle</th></tr></thead><tbody>${purchaseRows.map(p=>`<tr><td>${p.createdAt?new Date(p.createdAt).toLocaleString('es-CL'):'—'}</td><td><strong>${esc(p.user?.name||p.user?.email||'—')}</strong><br><span class="muted">${esc(p.user?.rut||'Sin RUT')}</span></td><td>${esc(p.method||p.provider||'—')}</td><td>${esc(p.productId||p.kind||'—')} · ${Number(p.credits||0)} créditos</td><td>${fmtMoney(p.amount)}</td><td><span class="pill ${p.status==='approved'?'pill-forest':p.status==='failed'||p.status==='rejected'?'pill-neutral':'pill-brass'}">${esc(p.status)}</span></td><td>${verificationBadge(p)}</td><td><button class="btn btn-outline btn-sm" onclick="verCompraJson('${p.source}','${p.id}')">Ver JSON</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Todavía no hay compras registradas.</div>'}`;


    const sec = security || {};
    if(hasPermission('security_view')) document.getElementById('admin-seguridad').innerHTML = `<div class="admin-section-head"><div><h3>Seguridad</h3><p>Resumen antifraude y protección de cuentas. Las IP y dispositivos se almacenan solo como hashes.</p></div><span class="pill pill-forest">Protección activa</span></div><div class="security-admin-grid"><div><span>Intentos fallidos · 24 h</span><strong>${Number(sec.failedLogins24h||0)}</strong></div><div><span>Bloqueos · 24 h</span><strong>${Number(sec.blocked24h||0)}</strong></div><div><span>Cuentas bloqueadas ahora</span><strong>${Number(sec.lockedAccounts||0)}</strong></div><div><span>Bonos otorgados · 30 días</span><strong>${Number(sec.bonusesGranted30d||0)}</strong></div><div><span>Bonos evitados · 30 días</span><strong>${Number(sec.bonusesDenied30d||0)}</strong></div></div><div class="security-admin-note">El sistema limita intentos de acceso y registro, evita reutilizar el bono desde el mismo dispositivo/correo y aplica un límite por red configurable.</div>`;
  }

  document.getElementById('admin-verificacion').innerHTML = `<div class="admin-section-head"><div><h3>Revisión de abogados</h3><p>Moderadores, administradores y creador pueden revisar antecedentes profesionales.</p></div><span class="pill pill-neutral">${pendientes.length} pendientes</span></div>${pendientes.length?pendientes.map(l=>`<div class="admin-review-card">${profileSummary(l)}<div class="admin-action-row">${l.titleDocument?.originalName||l.tituloDocUrl?`<a href="${API_BASE}/admin/abogados/${l._id}/documento" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Ver certificado</a>`:'<span class="pill pill-brass">Sin documento</span>'}<button class="btn btn-forest btn-sm" onclick="verificarAbogado('${l._id}')">Verificar</button><button class="btn btn-outline btn-sm" onclick="rechazarAbogado('${l._id}')">Solicitar cambios</button></div></div>`).join(''):'<div class="empty">No hay solicitudes pendientes.</div>'}`;

  if(isCreator()){
    document.getElementById('admin-roles').innerHTML = `<div class="admin-section-head"><div><h3>Roles y permisos internos</h3><p>La cuenta creadora puede nombrar administradores/moderadores y conceder permisos concretos. Los permisos no afectan al portal Cliente/Abogado.</p></div><span class="pill pill-brass">Acceso creador</span></div><div class="admin-users-note"><strong>Recomendación:</strong> usa <strong>moderador</strong> + permisos específicos para limitar lo que puede hacer cada integrante. Administrador tiene todos los permisos por su rol.</div><div class="admin-users-table-wrap"><table><thead><tr><th>Usuario</th><th>Rol interno</th><th>Permisos</th><th>Acción</th></tr></thead><tbody>${roles.map(u=>{ const locked=u.staffRole==='creador'; const current=u.staffPermissions||[]; return `<tr><td><strong>${esc(u.name||'—')}</strong><br><span class="muted">${esc(u.email)}</span></td><td>${locked?'<span class="pill pill-brass">CREADOR</span>':`<select id="staff-role-${u._id}" class="admin-role-select"><option value="none" ${u.staffRole==='none'||!u.staffRole?'selected':''}>Sin rol</option><option value="moderador" ${u.staffRole==='moderador'?'selected':''}>Moderador</option><option value="admin" ${u.staffRole==='admin'?'selected':''}>Administrador</option></select>`}</td><td>${locked?'<span class="muted">Todos los permisos</span>':`<div class="admin-permissions-grid">${Object.entries(PERMISSION_LABELS).map(([key,label])=>`<label><input type="checkbox" data-perm-user="${u._id}" value="${key}" ${current.includes(key)?'checked':''} ${u.staffRole==='admin'?'disabled':''}> ${label}</label>`).join('')}</div>`}</td><td>${locked?'<span class="muted">Protegido</span>':`<button class="btn btn-ink btn-sm" onclick="cambiarRolInterno('${u._id}')">Guardar cambios</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
}

function esc(v=''){ return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }
function fmtMoney(v){ return `$${Number(v||0).toLocaleString('es-CL')}`; }
