/* Creado por LimónStudioss. s.melladoo */
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${window.location.protocol}//${window.location.hostname}:4000/api`
  : '/api';

async function apiGet(path){
  const res = await fetch(API_BASE + path, { credentials:'include' });
  if(!res.ok) throw await res.json().catch(()=>({error:'Error de red'}));
  return res.json();
}
async function apiPost(path, body){
  const res = await fetch(API_BASE + path, {
    method:'POST', credentials:'include',
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
  const res = await fetch(API_BASE + path, {
    method:'PATCH', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if(!res.ok) throw await res.json().catch(()=>({error:'Error de red'}));
  return res.json();
}
