'use strict';

const serverMode = false;
let serverSession = false;
let receiptToken = '';

async function api(path, { method = 'GET', data, token, binary = false } = {}) {
  const headers = { 'X-DI3D': 'local' };
  if (token) headers['X-Consulta'] = token;
  let body = data;
  if (data && !(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  const response = await fetch('/api/' + path, { method, headers, body, cache:'no-store', credentials:'same-origin' });
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('equipo/')) {
      serverSession = false;
      requestLogin(location.hash.startsWith('#equipo') ? location.hash : '#equipo');
    }
    throw Object.assign(new Error('La operación no se completó.'), { status: response.status });
  }
  return binary ? response.blob() : response.json();
}

async function restoredFile(meta, path, token) {
  const blob = await api(path, { binary: true, token });
  return new File([blob], meta.name, {type:meta.type || 'application/octet-stream'});
}

async function restoreTeam(entry) {
  const base = 'equipo/' + entry.id + '/archivo/';
  if (entry.attachment?.stored) entry.attachment.blob = await restoredFile(entry.attachment, base+'reference');
  if (entry.offer?.file) entry.offer.file = await restoredFile(entry.offer.file, base+'quote');
  return entry;
}

async function changeOrder(id, action, data) {
  return restoreTeam(await api('equipo/' + id + '/' + action, {method:'POST', data}));
}
const questionPath = (id, index) => 'cliente/' + id + '/consulta/' + index;
const serverRequests = {
  list: () => api('equipo/pedidos'),
  get: async id => restoreTeam(await api('equipo/'+id)),
  add: async data => {
    const form = new FormData();
    for (const [key,value] of Object.entries(data)) {
      if (key !== 'attachment') form.append(key, value);
    }
    form.set('receipt', receiptToken);
    if (data.attachment?.example) form.set('example', 'true');
    if (data.attachment?.blob) form.set('file', data.attachment.blob, data.attachment.name);
    return (await api('pedidos', { method:'POST', data:form })).id;
  },
  update: (id,state,note,owner,reviewDate) => changeOrder(id,'seguimiento',{state,note,owner,reviewDate}),
  quote: (id,number,date,file) => {
    const form = new FormData();
    form.set('number',number);
    form.set('date',date);
    if (file) form.set('file',file,file.name);
    return changeOrder(id,'cotizacion',form);
  },
  ask: (id,question) => changeOrder(id,'pregunta',{question}),
  answer: (id,index,answer) => api(questionPath(id,index), {method:'POST',data:{answer},token:replyTarget.token}),
  reply: async (id,index,token) => {
    const path = questionPath(id,index);
    const entry = await api(path,{token});
    if (entry.attachment?.stored) entry.attachment.blob = await restoredFile(entry.attachment,path+'/archivo',token);
    return entry;
  },
  confirmation: id => api('cliente/'+id+'/recibo',{token:receiptToken})
};
const requests = serverMode ? serverRequests : browserRequests;
