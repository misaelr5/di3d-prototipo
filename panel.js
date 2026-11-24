'use strict';

const deskRoutes = { archive:'#equipo/archivo', overview: '#equipo', inbox: '#equipo/solicitudes', board: '#equipo/seguimiento', contacts: '#equipo/contactos' };
const teamHash = (page, id) => page === 'receipt' ? '#equipo/' + id : deskRoutes[page];
const isTeamScreen = page => page === 'receipt' || Object.hasOwn(deskRoutes, page);
const sessionKey = 'di3d.equipo.demo';
let pendingPath = deskRoutes.overview;
let deskVersion = 0;
let contactEntries = [];

function teamSession() {
  if (serverMode) return serverSession;
  try { return sessionStorage.getItem(sessionKey) === 'abierta'; }
  catch { return false; }
}

function requestLogin(path) {
  pendingPath = path;
  el('team-pass').value = 'Taller-Demo';
  message(el('login-error'));
  show('login');
  el('login-form').querySelector('[type=submit]').focus();
}

function navigateTeam(path, focus = true) {
  const id = /^#equipo\/(\d+)$/.exec(path);
  if (id && teamSession()) return requests.get(Number(id[1])).then(entry => entry?.archived ? openReceipt(entry.id,focus) : openInbox(true,focus,Number(id[1])));
  if (id) return requestLogin(path);
  const page = Object.keys(deskRoutes).find(key => deskRoutes[key] === path) || 'overview';
  return page === 'inbox' ? openInbox(true, focus) : openDesk(page, focus);
}

el('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = el('team-pass');
  const submit = event.submitter || el('login-form').querySelector('[type=submit]');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    if (serverMode) {
      serverSession = (await api('ingresar', {method:'POST',data:{password:password.value}})).active;
      password.value = '';
      if (screen === 'login') await navigateTeam(pendingPath);
      return;
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password.value));
    if (screen !== 'login') return;
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== '6af3a8a2628c86b2a3a2b3a8559b09cff94a14ca8cb17a22ab7de81914bc40d6') {
      message(el('login-error'), 'La contraseña es incorrecta. Volvé a ingresarla.');
      password.select(); return;
    }
    sessionStorage.setItem(sessionKey, 'abierta');
    password.value = '';
    await navigateTeam(pendingPath);
  } catch (error) {
    const explanation = error.status === 401 ? 'La contraseña es incorrecta. Volvé a ingresarla.' :
      error.status === 429 ? 'Esperá un minuto antes de volver a intentar.' : 'No se pudo abrir la sesión local.';
    message(el('login-error'), explanation);
    password.select();
  }
  finally { submit.disabled = false; }
});
el('cancel-login').addEventListener('click', () => el('client-view').click());
el('logout').addEventListener('click', async () => {
  if (serverMode) {
    const button = el('logout');
    button.disabled = true;
    try {
      await api('salir', {method:'POST'});
      location.replace(location.pathname + '?salida=' + Date.now() + '#equipo');
    } catch {
      storageError('No se pudo confirmar el cierre de sesión. Volvé a intentar.');
      button.disabled = false;
    }
    return;
  }
  sessionStorage.removeItem(sessionKey);
  ++listRender;
  ++deskVersion;
  currentEntry = undefined;
  visibleEntries = [];
  contactEntries = [];
  requestLogin(deskRoutes.overview);
});

const searchKey = value => value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function phoneMatches(phone, query) {
  return !!query && /^[+()\d\s-]+$/.test(query) && !!query.replace(/\D/g,'') &&
    (phone || '').replace(/\D/g,'').includes(query.replace(/\D/g,''));
}
const shortDay = value => new Intl.DateTimeFormat('es-AR', {day:'numeric',month:'short',year:'numeric'}).format(new Date(value + 'T12:00:00'));
function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function action(label, className, handler) {
  const button = node('button', label, className);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}
function icon(name) {
  const img = node('img');
  img.src = 'iconos-tabler/' + name + '.svg';
  img.alt = '';
  return img;
}
function stateBadge(state) {
  const badge = node('span', '', 'badge');
  displayBadge(badge, state);
  return badge;
}
function filteredInbox(state = '', query = '') {
  el('order-search').value = query;
  statusFilter.value = state;
  return openInbox();
}
function visitEntry(entry) { return openInbox(true, true, entry.id); }
function nextTask(entry) {
  if (entry.responseAfterQuote) return 'Revisar respuesta posterior a la cotización';
  if (entry.reviewDate) return 'Revisar el ' + shortDay(entry.reviewDate);
  const latest = entry.clarifications?.at(-1);
  if (latest && !latest.answer) return 'Esperando respuesta de ' + entry.contact;
  if (latest?.answer && entry.state === 'review') return 'Revisar la respuesta del cliente';
  return entry.note || ({new:'Hacer la primera revisión', review:'Continuar la revisión', missing:'Confirmar los datos pendientes', quoted:'Cotización preparada'})[entry.state];
}
function byPriority(a,b) {
  if (a.reviewDate || b.reviewDate) return (a.reviewDate || '9999').localeCompare(b.reviewDate || '9999') || b.id-a.id;
  const ranks = {missing:0, new:1, review:2, quoted:3};
  return ranks[a.state]-ranks[b.state] || b.id-a.id;
}
let volumeMeasure = 'quantity';
let overviewEntries = [];
function renderVolumeChart() {
  const grouped = new Map();
  for (const entry of overviewEntries) {
    const service = entry.service || 'Consulta general';
    const amount = volumeMeasure === 'orders' ? 1 : Number(entry.quantity) || 0;
    grouped.set(service, (grouped.get(service) || 0) + amount);
  }
  const values = [...grouped].sort((a, b) => b[1] - a[1]);
  const maximum = values[0]?.[1] || 1;
  const chart = el('volume-chart');
  chart.replaceChildren();
  for (const [service, amount] of values) {
    const row = node('div', null, 'volume-row');
    const track = node('div', null, 'volume-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = node('div', null, 'volume-fill');
    bar.style.width = (100 * amount / maximum) + '%';
    track.append(bar);
    row.append(node('span',service), node('strong',amount.toLocaleString('es-AR')),track);
    chart.append(row);
  }
  if (!values.length) chart.append(node('p','Sin solicitudes para mostrar.'));
}
for (const button of document.querySelectorAll('[data-volume]')) {
  button.addEventListener('click', () => {
    volumeMeasure = button.dataset.volume;
    for (const choice of button.parentElement.children) choice.setAttribute('aria-pressed', String(choice === button));
    renderVolumeChart();
  });
}

function renderOverview(entries) {
  overviewEntries = entries;
  renderVolumeChart();
  el('today').textContent = new Intl.DateTimeFormat('es-AR', { weekday:'long', day:'numeric', month:'long' }).format(new Date());
  const descriptors = [['new','Nuevas','circle-dashed'],['review','En revisión','eye'],['missing','Falta información','message-question'],['quoted','Cotizadas','circle-check']];
  el('metrics').replaceChildren(...descriptors.map(([state,label,glyph]) => {
    const button = action('', 'metric', () => filteredInbox(state));
    button.dataset.state = state;
    button.append(icon(glyph),node('span',label),node('strong',entries.filter(e=>e.state===state).length));
    return button;
  }));
  const pending = entries.filter(e=>e.state !== 'quoted' || e.responseAfterQuote).sort(byPriority);
  const featured = pending[0];
  const spot = el('spotlight');
  spot.replaceChildren();
  if (featured) {
    const info = node('div',null,'spot-info');
    info.append(node('span','Próximo pedido a revisar','spot-label'),node('h2',featured.piece),
      node('p', reference(featured.id) + ' · ' + (featured.quantity ? featured.quantity + ' u.' : featured.contact)),
      node('p', nextTask(featured), 'spot-pending'),
      action('Abrir ficha →','button primary',()=>visitEntry(featured)));
    spot.append(info);
    const mockup = mockupFor(featured);
    if (mockup) {
      const image = node('img', null, 'spot-art');
      image.src = mockup.image;
      image.alt = mockup.alt;
      spot.append(image);
    }
  } else spot.append(node('h2','Todos los pedidos están al día.'));
  const tasks = pending.slice(0,3).map(entry => {
    const button=action('','task',()=>visitEntry(entry));
    button.append(node('strong',nextTask(entry)),node('span',reference(entry.id)+' · '+ (entry.owner || entry.contact)));
    return button;
  });
  el('task-list').replaceChildren(...(tasks.length ? tasks : [node('p','Sin tareas pendientes.','muted')]));
  const rows = entries.slice(0,6).map(entry=>{
    const button=action('','recent-row',()=>visitEntry(entry));
    const title=node('span',null,'recent-piece');
    const mockup = mockupFor(entry);
    if (mockup) {
      const thumbnail = node('img', null, 'order-thumbnail');
      thumbnail.src = mockup.image;
      thumbnail.alt = '';
      title.append(thumbnail);
    }
    const description = node('span');
    description.append(node('strong',entry.piece),node('small',reference(entry.id)));
    title.append(description);
    button.append(title,stateBadge(entry.state),icon('arrow-up-right'));
    return button;
  });
  el('recent-list').replaceChildren(...rows);
}
function renderBoard(entries) {
  el('board-list').replaceChildren(...Object.entries(states).map(([state,label])=>{
    const items=entries.filter(e=>e.state===state).sort(byPriority);
    const column=node('section',null,'board-column');
    const heading=node('h2',label); heading.append(node('span',items.length));column.append(heading);
    for (const entry of items) {
      const button=action('','work-order',()=>visitEntry(entry));
      button.append(node('span',reference(entry.id),'ref'),node('strong',entry.piece),
        node('span',entry.contact),node('small',nextTask(entry)));
      if (entry.owner) button.append(node('span','Responsable · '+entry.owner,'work-owner'));
      column.append(button);
    }
    if (!items.length) column.append(node('p','Sin solicitudes','board-empty'));
    return column;
  }));
}
function renderContacts() {
  const contacts = new Map();
  for (const entry of contactEntries) {
    const key=(entry.phone?.replace(/[^0-9]/g,'') || entry.email.trim().toLowerCase() || entry.contact);
    if (!contacts.has(key)) contacts.set(key, { name:entry.contact, email:entry.email, phone:entry.phone, entries:[], count:0 });
    contacts.get(key).count++; contacts.get(key).entries.push(entry);
  }
  const query=searchKey(el('contact-search').value);
  const rows=[...contacts.values()].filter(c=>searchKey([c.name,c.email,c.phone].join(' ')).includes(query) || phoneMatches(c.phone,query)).sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=>{
    const button=action('','contact-row',()=>showContactProjects(c));
    const info=node('span');
    info.append(node('strong',c.name),node('small',c.phone || c.email));
    button.append(node('span',c.name.split(/\s+/).slice(0,2).map(w=>w[0]).join(''),'initials'),info,node('span',c.count===1?'1 solicitud':c.count+' solicitudes'),icon('arrow-right'));
    return button;
  });
  el('contact-projects')?.remove();
  el('contact-list').replaceChildren(...(rows.length?rows:[node('p','No hay contactos que coincidan con la búsqueda.','muted')]));
}
async function openDesk(page, focus=true) {
  if (!teamSession()) return requestLogin(teamHash(page));
  const version=++deskVersion;
  show(page,focus);
  try {
    const entries=await requests.list();
    if (screen!==page || version!==deskVersion) return;
    entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt) || b.id-a.id);
    storageError('');
    if (page==='archive') { archiveEntries = entries.filter(e=>e.archived); renderArchive(); }
    if (page==='overview') renderOverview(entries.filter(e=>!e.archived));
    if (page==='board') renderBoard(entries.filter(e=>!e.archived));
    if (page==='contacts') { contactEntries=entries; renderContacts(); }
  } catch { if (screen===page) storageError('No se pudieron cargar las solicitudes. Volvé a abrir esta sección.'); }
}
for (const link of document.querySelectorAll('[data-section],[data-go]')) {
  link.addEventListener('click',()=>navigateTeam(teamHash(link.dataset.section || link.dataset.go)));
}
el('contact-search').addEventListener('input',renderContacts);
el('home-panel').addEventListener('click',()=>openDesk('overview'));

let offerUrl = '';
function displayOffer(entry) {
  const offer = entry.offer;
  if (offerUrl) URL.revokeObjectURL(offerUrl);
  offerUrl = offer?.file ? URL.createObjectURL(offer.file) : '';
  const link = el('offer-download');
  link.removeAttribute('href');
  link.hidden = !offerUrl;
  if (offerUrl) {
    link.href = offerUrl;
    link.download = offer.file.name;
    link.textContent = 'Descargar ' + offer.file.name;
  }
  el('offer-info').textContent = offer ? offer.number + ' · ' + shortDay(offer.date) : '';
  el('offer-read').hidden = !offer;
  el('edit-offer').textContent = offer ? 'Editar cotización' : 'Registrar cotización';
  el('offer-form').hidden = true;
  el('edit-offer').hidden = false;
  el('offer-result').textContent = '';
}
el('edit-offer').addEventListener('click', () => {
  const offer = currentEntry.offer;
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  el('offer-number').value = offer?.number || '';
  el('offer-date').value = offer?.date || localDate;
  el('offer-file').value = '';
  el('offer-existing').textContent = offer?.file ? 'PDF guardado: ' + offer.file.name + '. Podés elegir otro para reemplazarlo.' : '';
  el('offer-form').hidden = false;
  el('edit-offer').hidden = true;
  el('offer-number').focus();
});
el('cancel-offer').addEventListener('click', () => {
  displayOffer(currentEntry);
  el('edit-offer').focus();
});
el('offer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = selectedId;
  const number = el('offer-number').value.trim();
  const file = el('offer-file').files[0];
  const save = el('save-offer');
  if (screen !== 'receipt' || !teamSession() || save.disabled) return;
  if (!number) { el('offer-result').textContent = 'Ingresá el número de la cotización.'; el('offer-number').focus(); return; }
  if (file && (!/\.pdf$/i.test(file.name) || file.size > 15*1024*1024)) {
    el('offer-result').textContent = 'Elegí un archivo PDF de hasta 15 MB.';
    el('offer-file').focus(); return;
  }
  save.disabled = true;
  try {
    const entry = await requests.quote(id,number,el('offer-date').value,file);
    if (screen !== 'receipt' || selectedId !== id) return;
    if (!entry) throw new Error();
    renderReceipt(entry);
    if (statusFilter.value && statusFilter.value !== 'quoted') statusFilter.value = '';
    await renderInbox();
    el('offer-result').textContent = 'Cotización guardada en el pedido.';
    el('edit-offer').focus();
  } catch { el('offer-result').textContent = 'No se pudo guardar la cotización. Volvé a intentar.'; }
  finally { save.disabled = false; }
});
const memberSelect = el('active-member');
const savedMember = sessionStorage.getItem('di3d.member');
if ([...memberSelect.options].some(option=>option.value === savedMember)) memberSelect.value = savedMember;
function activeMember() { return memberSelect.value; }
memberSelect.addEventListener('change',()=>sessionStorage.setItem('di3d.member',activeMember()));

const editor = el('project-editor');
const dialog = el('project-dialog');
let editingProjectId;
editor.elements.service.replaceChildren(...[...service.options].map(option=>option.cloneNode(true)));
function openProjectEditor(entry) {
  editingProjectId = entry?.id;
  editor.reset();
  editor.querySelector('details').open = false;
  el('project-remove-label').hidden = !entry?.attachment;
  for (const key of ['contact','phone','piece','quantity','service','email','use','material','dimensions']) editor.elements[key].value = entry?.[key] || '';
  editor.elements.phone.required = !entry || entry.source === 'WhatsApp';
  el('wa-example').hidden = !!entry;
  el('project-dialog-title').textContent = entry ? 'Editar proyecto' : 'Cargar consulta de WhatsApp';
  message(el('project-error')); dialog.showModal();
}
el('new-project').onclick = ()=>openProjectEditor();
el('change-project').onclick = ()=>openProjectEditor(currentEntry);
el('close-project').onclick = ()=>dialog.close();
el('wa-example').onclick = ()=>{
  const sample = {contact:'Estudio Sur', phone:'000 555 0142', piece:'Organizadores para recepción',
    quantity:'18', service:'Regalos corporativos', use:'Hola, necesitamos 18 organizadores para recepción. ¿Podrían cotizarlos?'};
  for (const [key,value] of Object.entries(sample)) editor.elements[key].value = value;
};
editor.onsubmit = async event=>{
  event.preventDefault();
  const save = editor.querySelector('[type=submit]');
  if (save.disabled || !teamSession()) return;
  const fields = Object.fromEntries([...new FormData(editor)].map(([k,v])=>[k,v.trim()]));
  if (!fields.piece || !fields.contact || (editor.elements.phone.required && !fields.phone)) {
    message(el('project-error'),'Completá el proyecto, el cliente y los datos de contacto.'); return;
  }
  const file = el('project-file').files[0];
  if (file?.size > 15*1024*1024) { message(el('project-error'),'Elegí un archivo de hasta 15 MB.'); return; }
  if (file) fields.attachment = {name:file.name,blob:file};
  else if (el('project-remove-file').checked) fields.attachment = null;
  save.disabled = true;
  try {
    let id = editingProjectId;
    if (id) await requests.edit(id,fields);
    else id = await requests.add({attachment:null,...fields,source:'WhatsApp'});
    dialog.close();
    if (currentEntry?.archived && editingProjectId) await openReceipt(id);
    else await openInbox(true,true,id);
  } catch { message(el('project-error'),'No se pudo guardar el proyecto en este navegador.'); }
  finally {save.disabled=false;}
};
const eventDate = new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function renderProjectTools(entry) {
  document.body.toggleAttribute('data-archived',!!entry.archived);
  el('receipt-back').textContent = entry.archived ? '← Volver al archivo' : '← Volver a solicitudes';
  el('source-label').textContent = [entry.archived ? 'Proyecto archivado' : '',entry.source || 'Consulta web'].filter(Boolean).join(' · ');
  const history = entry.events || [];
  const rows = history.slice().reverse().map(e=>{
    const row=node('li');row.append(node('strong',e.actor+' · '+eventDate.format(new Date(e.at))),node('p',e.text));return row;
  });
  el('events').replaceChildren(...(rows.length ? rows : [node('li','Los próximos cambios se registrarán aquí.')]));
  el('project-log').querySelector('summary').textContent = history.length ? 'Historial del proyecto · '+history.length : 'Historial del proyecto';
  el('project-log').open = !!history.length;
  el('archive-project').textContent = entry.archived ? 'Reactivar proyecto' : 'Guardar en proyectos pasados';
}
el('archive-project').onclick = async event=>{
  const btn = event.currentTarget;
  if (btn.disabled || !teamSession()) return;
  btn.disabled=true;
  try {
    const updated=await requests.archive(currentEntry.id,!currentEntry.archived);
    if(updated.archived) {el('archive-search').value='';await openDesk('archive');}
    else await openInbox(true,true,updated.id);
  } catch {storageError('No se pudo actualizar el archivo del proyecto.');}
  finally {btn.disabled=false;}
};
let archiveEntries=[];
function projectRow(entry) {
  const button=action('', 'archive-row',()=>entry.archived ? openReceipt(entry.id) : visitEntry(entry));
  button.append(node('strong',entry.piece),node('small',[reference(entry.id),entry.contact,entry.archived?'Archivado':states[entry.state]].join(' · ')));
  return button;
}
function renderArchive() {
  const q=searchKey(el('archive-search').value);
  const matches=archiveEntries.filter(e=>searchKey([e.piece,e.contact,e.phone,e.email,reference(e.id)].join(' ')).includes(q) || phoneMatches(e.phone,q));
  el('archive-list').replaceChildren(...(matches.length ? matches.map(projectRow) : [node('p','Sin proyectos archivados para esta búsqueda.')]));
}
el('archive-search').oninput=renderArchive;
function showContactProjects(contact) {
  el('contact-projects')?.remove();
  const section=node('section');section.id='contact-projects';
  const heading=node('h2','Proyectos de '+contact.name);heading.tabIndex=-1;
  section.append(heading,...contact.entries.map(projectRow));el('contacts').append(section);heading.focus();
}

if (serverMode) {
  document.querySelector('.demo-inner > span').textContent = 'Gestión local · datos de ejemplo';
  document.querySelector('.footer p').textContent = 'Muestra gratuita · Pedidos guardados en esta computadora.';
  document.querySelector('#login-form > p').textContent = 'Usá la clave del equipo configurada en esta computadora.';
  api('sesion').then(result => {
    serverSession = result.active;
    initializeDemo();
  }).catch(() => {
    storageError('No se pudo contactar al servidor local. Abrí Iniciar gestión.cmd y volvé a cargar la página.');
  });
} else {
  initializeDemo();
}
