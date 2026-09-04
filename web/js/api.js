/* Creado por LimónStudioss. s.melladoo */
const API_BASE = (() => {
  const runtime = String(window.ABOGAGO_API_BASE || '').trim().replace(/\/$/, '');
  if (runtime) return runtime.endsWith('/api') ? runtime : `${runtime}/api`;
  const productionApi = 'https://api.abogago.online/api';
  return productionApi;
})();

async function apiFetch(path, options = {}) {
  try {
    return await fetch(API_BASE + path, { credentials:'include', ...options });
  } catch (error) {
    throw { error: 'No se pudo conectar con ABOGA GO. Revisa que el backend de Render esté activo y que Cloudflare esté usando la URL correcta de la API.' };
  }
}

async function apiGet(path){
  const res = await apiFetch(path);
  if(!res.ok) throw await res.json().catch(()=>({error:'Error de red'}));
  return res.json();
}
async function apiPost(path, body){
  const res = await apiFetch(path, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if(!res.ok) throw await res.json().catch(()=>({error:'Error de red'}));
  return res.json();
}

function postRedirect(url, params){
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  Object.entries(params).forEach(([k,v])=>{
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = k; input.value = v;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

async function getCurrentUser(){
  try{ return (await apiGet('/auth/me')).user; }
  catch(e){ return null; }
}

async function apiPatch(path, body){
  const res = await apiFetch(path, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if(!res.ok) throw await res.json().catch(()=>({error:'Error de red'}));
  return res.json();
}
