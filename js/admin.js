/* Creado por LimónStudioss. s.melladoo */
let currentUser = null;
let currentStaffRole = 'none';

function canReview(){ return ['creador','admin','moderador'].includes(currentStaffRole); }
function canAdmin(){ return ['creador','admin'].includes(currentStaffRole); }
function isCreator(){ return currentStaffRole === 'creador'; }

async function initAdmin(){
  currentUser = await getCurrentUser();
  const msg = document.getElementById('admin-gate-msg');
  const link = document.getElementById('admin-gate-link');
  if(!currentUser){ msg.textContent = 'Necesitas iniciar sesión con una cuenta autorizada del equipo.'; link.classList.remove('hidden'); return; }
  try { currentStaffRole = (await apiGet('/admin/me')).staffRole || 'none'; }
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
  document.querySelectorAll('[data-permission="admin"]').forEach(el=>el.classList.toggle('hidden', !canAdmin()));
  document.querySelectorAll('[data-permission="review"]').forEach(el=>el.classList.toggle('hidden', !canReview()));
  document.querySelectorAll('[data-permission="creator"]').forEach(el=>el.classList.toggle('hidden', !isCreator()));
  setAdminTab(currentStaffRole === 'moderador' ? 'verificacion' : 'usuarios');
}

function setAdminTab(t){
  const allowed = t === 'roles' ? isCreator() : t === 'verificacion' ? canReview() : canAdmin();
  if(!allowed) return toast('No tienes permisos para esta sección');
  document.querySelectorAll('[data-adm]').forEach(el=>el.classList.toggle('active', el.dataset.adm===t));
  ['usuarios','verificacion','causas','creditos','transferencias','seguridad','roles'].forEach(id=>document.getElementById('admin-'+id)?.classList.toggle('hidden', id!==t));
}

async function verificarAbogado(id){ try{ await apiPost(`/admin/verificar/${id}`); toast('Abogado verificado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo verificar'); } }
async function rechazarAbogado(id){ const note = prompt('Indica qué debe corregir el abogado:','Documento o antecedentes incompletos.'); if(note===null) return; try{ await apiPost(`/admin/rechazar/${id}`, { note }); toast('Cambios solicitados'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo solicitar cambios'); } }
async function ajustarCreditos(userId, delta){ try{ await apiPost(`/admin/creditos/${userId}`, { delta }); toast('Saldo ajustado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo ajustar el saldo'); } }
async function cambiarRolInterno(userId){ const select=document.getElementById(`staff-role-${userId}`); if(!select) return; try{ await apiPost(`/admin/roles/${userId}`, { staffRole:select.value }); toast('Rol interno actualizado'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo cambiar el rol'); } }
function verComprobante(id){ window.open(`${API_BASE}/admin/transferencias/${id}/comprobante`, '_blank', 'noopener'); }
async function revisarTransferencia(id, action){ const label=action==='approve'?'aprobar':'rechazar'; if(!confirm(`¿Seguro que deseas ${label} esta transferencia?`)) return; const note=prompt('Nota interna/opcional:','') ?? ''; try{ await apiPost(`/admin/transferencias/${id}/revisar`, { action, note }); toast(action==='approve'?'Transferencia aprobada':'Transferencia rechazada'); renderAdmin(); }catch(err){ toast(err.error || 'No se pudo revisar el pago'); } }

function profileSummary(l){
  const p=l.lawyerProfile||{};
  const specs=(p.specialties||[]).join(', ')||'—';
  return `<div class="admin-lawyer-detail"><strong>${esc(l.name||l.email)}</strong><span>${esc(l.email)}</span><span>RUT: ${esc(l.rut||'—')} · Tel: ${esc(p.phone||'—')}</span><span>${esc(p.region||'—')} / ${esc(p.comuna||'—')}</span><span>Universidad: ${esc(p.university||'—')} · Año: ${esc(p.titleYear||'—')}</span><span>N.º/Folio: ${esc(p.titleNumber||p.registryNumber||'—')}</span><span>Especialidades: ${esc(specs)}</span></div>`;
}

async function renderAdmin(){
  let users=[], pendientes=[], causas=[], transfers=[], roles=[], security=null;
  try{
    const jobs=[];
    if(canAdmin()) jobs.push(apiGet('/admin/usuarios').then(v=>users=v), apiGet('/admin/causas').then(v=>causas=v), apiGet('/admin/transferencias').then(v=>transfers=v), apiGet('/admin/security/summary').then(v=>security=v));
    if(canReview()) jobs.push(apiGet('/admin/verificacion-pendiente').then(v=>pendientes=v));
    if(isCreator()) jobs.push(apiGet('/admin/roles').then(v=>roles=v));
    await Promise.all(jobs);
  }catch(err){ toast(err.error || 'Error cargando datos del panel'); }

  if(canAdmin()){
    document.getElementById('admin-usuarios').innerHTML = `<div class="admin-section-head"><div><h3>Usuarios</h3><p>Usuarios registrados y permisos internos.</p></div><span class="pill pill-neutral">${users.length} cuentas</span></div><table><thead><tr><th>Nombre</th><th>Correo</th><th>Tipo</th><th>Rol interno</th><th>Estado</th><th>Créditos</th></tr></thead><tbody>${users.map(u=>{ const estado=u.role==='abogado'?(u.verified?'Verificado':'Pendiente'):'Activo'; return `<tr><td>${esc(u.name||'—')}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td><span class="pill pill-neutral">${esc(u.staffRole||'none')}</span></td><td><span class="pill ${estado==='Verificado'||estado==='Activo'?'pill-forest':'pill-brass'}">${estado}</span></td><td class="mono">${u.role==='abogado'?u.credits:'—'}</td></tr>`; }).join('')}</tbody></table>`;

    document.getElementById('admin-causas').innerHTML = `<div class="admin-section-head"><div><h3>Causas activas</h3><p>Estado de las oportunidades publicadas.</p></div></div><table><thead><tr><th>N°</th><th>Tipo</th><th>Comuna</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>${causas.map(c=>{ const hs=(Date.now()-new Date(c.createdAt).getTime())/3600000; const taken=c.taken||c.status==='en_proceso'; const estado=c.status==='cerrada'?'Cerrada':taken?'Comprada':hs>=24?'Disponible':'Premium'; const cls=estado==='Disponible'?'pill-forest':estado==='Comprada'?'pill-brass':'pill-neutral'; const acceso=taken?(c.acquisitionMode==='premium_credit'?'1 crédito':'Gratis'):hs>=24?'Gratis':'Premium · 1 crédito'; return `<tr><td class="mono">${esc(c.numero)}</td><td>${esc(c.tipo)}</td><td>${esc(c.comuna)}</td><td><span class="pill ${cls}">${estado}</span></td><td>${acceso}</td></tr>`; }).join('')}</tbody></table>`;

    const abogados=users.filter(u=>u.role==='abogado');
    document.getElementById('admin-creditos').innerHTML = `<div class="admin-section-head"><div><h3>Créditos</h3><p>Ajustes manuales de saldo para abogados.</p></div></div><table><thead><tr><th>Abogado</th><th>Saldo</th><th>Ajustar</th></tr></thead><tbody>${abogados.map(a=>`<tr><td>${esc(a.name||a.email)}</td><td class="mono">${a.credits}</td><td><div style="display:flex;gap:6px"><button class="btn btn-ink btn-sm" onclick="ajustarCreditos('${a._id}',10)">+10</button><button class="btn btn-outline btn-sm" onclick="ajustarCreditos('${a._id}',-10)">-10</button></div></td></tr>`).join('')}</tbody></table>`;

    document.getElementById('admin-transferencias').innerHTML = `<div class="admin-section-head"><div><h3>Transferencias</h3><p>Aprueba solo después de confirmar el abono en la cuenta bancaria.</p></div><span class="pill pill-neutral">${transfers.length} registros</span></div>${transfers.length?`<table><thead><tr><th>Usuario</th><th>Referencia</th><th>Producto</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${transfers.map(t=>`<tr><td>${esc(t.user?.name||t.user?.email||'—')}</td><td class="mono">${esc(t.reference)}</td><td>${t.kind==='plan'?'Plan':'Créditos'} · ${esc(t.productId)}</td><td>${fmtMoney(t.amount)}</td><td><span class="pill ${t.status==='approved'?'pill-forest':t.status==='rejected'?'pill-neutral':'pill-brass'}">${esc(t.status)}</span></td><td><div class="admin-action-row">${t.proof?.path?`<button class="btn btn-outline btn-sm" onclick="verComprobante('${t._id}')">Comprobante</button>`:''}${!['approved','rejected'].includes(t.status)?`<button class="btn btn-forest btn-sm" onclick="revisarTransferencia('${t._id}','approve')">Aprobar</button><button class="btn btn-outline btn-sm" onclick="revisarTransferencia('${t._id}','reject')">Rechazar</button>`:''}</div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No hay transferencias registradas.</div>'}`;

    const sec = security || {};
    document.getElementById('admin-seguridad').innerHTML = `<div class="admin-section-head"><div><h3>Seguridad</h3><p>Resumen antifraude y protección de cuentas. Las IP y dispositivos se almacenan solo como hashes.</p></div><span class="pill pill-forest">Protección activa</span></div><div class="security-admin-grid"><div><span>Intentos fallidos · 24 h</span><strong>${Number(sec.failedLogins24h||0)}</strong></div><div><span>Bloqueos · 24 h</span><strong>${Number(sec.blocked24h||0)}</strong></div><div><span>Cuentas bloqueadas ahora</span><strong>${Number(sec.lockedAccounts||0)}</strong></div><div><span>Bonos otorgados · 30 días</span><strong>${Number(sec.bonusesGranted30d||0)}</strong></div><div><span>Bonos evitados · 30 días</span><strong>${Number(sec.bonusesDenied30d||0)}</strong></div></div><div class="security-admin-note">El sistema limita intentos de acceso y registro, evita reutilizar el bono desde el mismo dispositivo/correo y aplica un límite por red configurable.</div>`;
  }

  document.getElementById('admin-verificacion').innerHTML = `<div class="admin-section-head"><div><h3>Revisión de abogados</h3><p>Moderadores, administradores y creador pueden revisar antecedentes profesionales.</p></div><span class="pill pill-neutral">${pendientes.length} pendientes</span></div>${pendientes.length?pendientes.map(l=>`<div class="admin-review-card">${profileSummary(l)}<div class="admin-action-row">${l.titleDocument?.originalName||l.tituloDocUrl?`<a href="${API_BASE}/admin/abogados/${l._id}/documento" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Ver certificado</a>`:'<span class="pill pill-brass">Sin documento</span>'}<button class="btn btn-forest btn-sm" onclick="verificarAbogado('${l._id}')">Verificar</button><button class="btn btn-outline btn-sm" onclick="rechazarAbogado('${l._id}')">Solicitar cambios</button></div></div>`).join(''):'<div class="empty">No hay solicitudes pendientes.</div>'}`;

  if(isCreator()){
    document.getElementById('admin-roles').innerHTML = `<div class="admin-section-head"><div><h3>Agregar roles</h3><p>Solo la cuenta creadora puede nombrar moderadores o administradores. El rol interno no cambia si la persona es cliente o abogado.</p></div><span class="pill pill-brass">Acceso creador</span></div><table><thead><tr><th>Usuario</th><th>Correo</th><th>Tipo de cuenta</th><th>Rol interno</th><th>Acción</th></tr></thead><tbody>${roles.map(u=>{ const locked=u.staffRole==='creador'; return `<tr><td>${esc(u.name||'—')}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${locked?'<span class="pill pill-brass">CREADOR</span>':`<select id="staff-role-${u._id}" class="admin-role-select"><option value="none" ${u.staffRole==='none'||!u.staffRole?'selected':''}>Sin rol</option><option value="moderador" ${u.staffRole==='moderador'?'selected':''}>Moderador</option><option value="admin" ${u.staffRole==='admin'?'selected':''}>Administrador</option></select>`}</td><td>${locked?'<span class="muted">Protegido</span>':`<button class="btn btn-ink btn-sm" onclick="cambiarRolInterno('${u._id}')">Guardar rol</button>`}</td></tr>`; }).join('')}</tbody></table>`;
  }
}

function esc(v=''){ return String(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }
function fmtMoney(v){ return `$${Number(v||0).toLocaleString('es-CL')}`; }
