/* Creado por LimónStudioss. s.melladoo */
let currentUser = null;

async function initAdmin(){
  currentUser = await getCurrentUser();
  const msg = document.getElementById('admin-gate-msg');
  const link = document.getElementById('admin-gate-link');

  if(!currentUser){
    msg.textContent = 'Necesitas iniciar sesión primero en el sitio público con la cuenta autorizada como administrador.';
    link.classList.remove('hidden');
    return;
  }
  if(currentUser.role !== 'admin'){
    msg.textContent = 'Tu cuenta no tiene permisos de administrador.';
    return;
  }

  document.getElementById('admin-gate').classList.add('hidden');
  document.getElementById('view-admin').classList.remove('hidden');
  renderAdmin();
}
initAdmin();

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2800);
}

function setAdminTab(t){
  document.querySelectorAll('[data-adm]').forEach(el=>el.classList.toggle('active', el.dataset.adm===t));
  ['usuarios','verificacion','causas','creditos'].forEach(id=>{
    document.getElementById('admin-'+id).classList.toggle('hidden', id!==t);
  });
}

async function verificarAbogado(id){
  try{
    await apiPost(`/admin/verificar/${id}`);
    toast('Abogado verificado');
    renderAdmin();
  }catch(err){ toast(err.error || 'No se pudo verificar'); }
}
async function rechazarAbogado(id){
  try{
    await apiPost(`/admin/rechazar/${id}`);
    toast('Solicitud rechazada');
    renderAdmin();
  }catch(err){ toast(err.error || 'No se pudo rechazar'); }
}
async function ajustarCreditos(userId, delta){
  try{
    await apiPost(`/admin/creditos/${userId}`, { delta });
    toast('Saldo ajustado');
    renderAdmin();
  }catch(err){ toast(err.error || 'No se pudo ajustar el saldo'); }
}

async function renderAdmin(){
  let users=[], pendientes=[], causas=[];
  try{
    [users, pendientes, causas] = await Promise.all([
      apiGet('/admin/usuarios'),
      apiGet('/admin/verificacion-pendiente'),
      apiGet('/admin/causas'),
    ]);
  }catch(err){
    toast(err.error || 'Error cargando datos del panel');
  }

  document.getElementById('admin-usuarios').innerHTML = `<table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Créditos</th></tr></thead><tbody>
    ${users.map(u=>{
      const estado = u.role==='abogado' ? (u.verified?'Verificado':'Pendiente') : 'Activo';
      return `<tr>
        <td>${u.name||'—'}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td><span class="pill ${estado==='Verificado'||estado==='Activo'?'pill-forest':'pill-brass'}"><span class="dot"></span>${estado}</span></td>
        <td class="mono">${u.role==='abogado' ? u.credits : '—'}</td>
      </tr>`;
    }).join('')}
  </tbody></table>`;

  document.getElementById('admin-verificacion').innerHTML = pendientes.length ? pendientes.map(l=>`
    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--line);">
      <div>
        <div style="font-weight:700; font-size:14px;">${l.name||l.email}</div>
        <div style="font-size:12.5px; color:var(--ink-soft); margin-top:2px;">RUT ${l.rut||'—'} · <a href="${l.tituloDocUrl||'#'}" target="_blank" class="mono" style="text-decoration:underline;">${l.tituloDocUrl?'ver certificado':'sin documento'}</a></div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-forest btn-sm" onclick="verificarAbogado('${l._id}')">Verificar</button>
        <button class="btn btn-outline btn-sm" style="border-color:var(--terracotta); color:var(--terracotta);" onclick="rechazarAbogado('${l._id}')">Rechazar</button>
      </div>
    </div>`).join('') : '<div class="empty">No hay solicitudes de verificación pendientes.</div>';

  document.getElementById('admin-causas').innerHTML = `<table><thead><tr><th>N°</th><th>Tipo</th><th>Comuna</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>
    ${causas.map(c=>{
      const hs=(Date.now()-new Date(c.createdAt).getTime())/3600000;
      const taken = c.taken || c.status==='en_proceso';
      const estado = c.status==='cerrada' ? 'Cerrada' : taken ? 'Comprada' : hs>=24 ? 'Disponible' : 'Premium';
      const cls = estado==='Disponible' ? 'pill-forest' : estado==='Comprada' ? 'pill-brass' : 'pill-neutral';
      const acceso = taken ? (c.acquisitionMode==='premium_credit' ? '1 crédito' : 'Gratis') : hs>=24 ? 'Gratis' : 'Premium · 1 crédito';
      return `<tr><td class="mono">${c.numero}</td><td>${c.tipo}</td><td>${c.comuna}</td><td><span class="pill ${cls}">${estado}</span></td><td>${acceso}</td></tr>`;
    }).join('')}
  </tbody></table>`;

  const abogados = users.filter(u=>u.role==='abogado');
  document.getElementById('admin-creditos').innerHTML = `<table><thead><tr><th>Abogado</th><th>Saldo</th><th>Ajustar</th></tr></thead><tbody>
    ${abogados.map(a=>`
      <tr>
        <td>${a.name||a.email}</td>
        <td class="mono">${a.credits}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-ink btn-sm" onclick="ajustarCreditos('${a._id}',10)">+10</button>
            <button class="btn btn-outline btn-sm" style="border-color:var(--line);" onclick="ajustarCreditos('${a._id}',-10)">-10</button>
          </div>
        </td>
      </tr>`).join('')}
  </tbody></table>`;
}
