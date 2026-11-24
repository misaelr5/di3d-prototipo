'use strict';

const el = (id) => document.getElementById(id);
const form = el('quote');
const service = el('service');
const guidance = el('guidance');
const fileInput = el('attachment');
const statusFilter = el('status-filter');
const statusInput = el('request-status');
const noteInput = el('internal-note');
const screens = {
  home: el('home'), form: el('edit-view'), confirmation: el('confirmation'),
  inbox: el('inbox'), receipt: el('receipt'), reply: el('clarification-view'),
  login: el('login'), overview: el('overview'), board: el('board'), contacts: el('contacts')
};
const dateFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
const reference = (id) => 'DI3D-' + String(id).padStart(4, '0');

let screen = 'home';
let guidedQuote = false;
let clientScreen = 'home';
let attachment;
let selectedId;
let submitting = false;
let savedReference;
let listRender = 0;
let detailRender = 0;
let visibleEntries = [];
let currentEntry;
let replyTarget;
const scaleQuestion = '¿En qué escala necesitás la maqueta del local?';
const desktop = matchMedia('(min-width: 901px)');
const smallDrawing = matchMedia('(max-width: 550px)');
const sketchPreview = (file) => file + (smallDrawing.matches ? '#movil' : '');
smallDrawing.addEventListener('change', () => {
  for (const image of document.querySelectorAll('img[data-sketch]')) image.src = sketchPreview(image.dataset.sketch);
});

for (const [value, label] of Object.entries(states)) {
  statusFilter.add(new Option(label, value));
  statusInput.add(new Option(label, value));
}

function message(target, text = '') {
  target.textContent = text;
  target.hidden = !text;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let entrance;
function reveal(elements) {
  entrance?.revert();
  entrance = undefined;
  if (!window.gsap || reducedMotion.matches) return;
  entrance = gsap.from(elements, { y: 9, opacity: 0.65, duration: 0.32, stagger: 0.035,
    ease: 'power2.out', clearProps: 'transform,opacity' });
}
reducedMotion.addEventListener('change', () => entrance?.revert());
for (const button of document.querySelectorAll('[data-piece-view]')) {
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    const volume = button.dataset.pieceView === 'volume';
    const preview = el('piece-preview');
    preview.src = volume ? 'maqueta-volumen.svg' : 'maqueta.svg#movil';
    preview.alt = volume ? 'Maqueta de un local comercial en perspectiva.' :
      'Croquis del frente y la planta del local.';
    preview.parentElement.classList.toggle('drawing-mode', !volume);
    for (const other of button.parentElement.children) other.setAttribute('aria-pressed', String(other === button));
    reveal(preview);
  });
}

function show(next, focus = true) {
  screen = next;
  const team = isTeamScreen(next);
  const working = next === 'inbox' || next === 'receipt';
  if (!working) ++detailRender;
  if (!team && next !== 'login') {
    ++detailRender;
    clientScreen = next;
    selectedId = undefined;
    noteInput.value = '';
    el('note-read').textContent = '';
    message(el('follow-result'));
  }
  let clientHash = '#cliente';
  if (next === 'reply') clientHash += '/' + replyTarget.id + '/' + (replyTarget.index + 1);
  if (next === 'confirmation') clientHash += '/pedido/' + Number(savedReference.slice(5));
  if (serverMode && next === 'reply') clientHash += '~' + replyTarget.token;
  if (serverMode && next === 'confirmation') clientHash += '~' + receiptToken;
  const hash = team ? teamHash(next, selectedId) : next === 'login' ? pendingPath : clientHash;
  history.replaceState(null, '', hash);
  for (const [name, section] of Object.entries(screens)) section.hidden = name !== next;
  document.body.dataset.view = next;
  document.body.toggleAttribute('data-team', team);
  el('team-rail').hidden = !team;
  for (const link of el('team-rail').querySelectorAll('[data-section]')) {
    link.setAttribute('aria-current', link.dataset.section === (working ? 'inbox' : next) ? 'page' : 'false');
  }
  el('workspace').hidden = !working;
  el('inbox-heading').hidden = !working;
  if (working) screens.inbox.hidden = false;
  el('site-label').textContent = team ? 'Equipo DI3D' : next === 'home' ? 'Servicios' : 'Contacto';
  el('client-view').setAttribute('aria-pressed', String(!team && next !== 'login'));
  el('team-view').setAttribute('aria-pressed', String(team || next === 'login'));
  el('load-example').hidden = next !== 'form';
  reveal(Array.from(screens[next].children).filter(child => !child.hidden && child.getClientRects().length));
  if (focus) {
    el(screens[next].getAttribute('aria-labelledby')).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function displayDate(time, date) {
  time.dateTime = date;
  time.textContent = dateFormat.format(new Date(date));
}

function displayBadge(badge, state) {
  badge.dataset.state = state;
  badge.textContent = states[state];
}

function paintAttachment(container, file, download) {
  const image = container.querySelector('img');
  const caption = container.querySelector('figcaption');
  if (container.dataset.url) URL.revokeObjectURL(container.dataset.url);
  delete container.dataset.url;
  const fileUrl = file?.blob ? URL.createObjectURL(file.blob) : '';
  if (fileUrl) container.dataset.url = fileUrl;
  const samplePath = file?.model === 'local' ? 'maqueta.svg' : 'perilla.svg';
  const path = file?.example ? samplePath : fileUrl;
  const previewable = file?.example || imageTypes.includes(file?.blob?.type);
  image.hidden = !previewable;
  image.alt = file?.example
    ? file.name
    : file ? 'Vista previa de ' + file.name : '';
  if (file?.example) image.dataset.sketch = samplePath;
  else delete image.dataset.sketch;
  if (previewable) image.src = file?.example ? sketchPreview(samplePath) : path;
  else image.removeAttribute('src');
  caption.textContent = file?.name ?? 'Sin adjunto';
  if (download) {
    download.hidden = !path;
    if (path) {
      download.href = path;
      download.download = file.name;
    } else {
      download.removeAttribute('href');
    }
  }
}

for (const id of ['form-file', 'receipt-file', 'reply-file']) {
  el(id).querySelector('img').addEventListener('error', (event) => { event.currentTarget.hidden = true; });
}

function setAttachment(file) {
  attachment = file;
  fileInput.value = '';
  paintAttachment(el('form-file'), attachment);
  el('attachment-label').textContent = file ? 'Reemplazá el archivo' : 'Elegí un archivo';
  el('remove-file').hidden = !file;
  message(el('file-error'));
  el('file-status').textContent = file ? 'Adjunto: ' + file.name : 'Se quitó la referencia.';
}

fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    fileInput.value = '';
    message(el('file-error'), 'El archivo supera los 15 MB. Elegí otro para continuar o seguí sin adjuntarlo.');
    return;
  }
  setAttachment({ name: file.name, blob: file });
});

el('remove-file').addEventListener('click', () => {
  setAttachment(null);
  fileInput.focus();
});

function isTechnical(value) {
  return !['Premios y reconocimientos', 'Merchandising', 'Regalos corporativos'].includes(value);
}

function adaptFields() {
  const technical = isTechnical(service.value);
  el('dimensions-field').hidden = !technical;
  el('material-field').hidden = !technical;
}
service.addEventListener('change', adaptFields);

function fieldError(name, text = '') {
  message(el(name + '-error'), text);
  if (text) el(name).setAttribute('aria-invalid', 'true');
  else el(name).removeAttribute('aria-invalid');
}

const validated = ['piece', 'quantity', 'contact', 'email'];
for (const name of validated) el(name).addEventListener('input', () => fieldError(name));

function beginQuote(chosenService, guided = false) {
  if (submitting) return;
  guidedQuote = guided && !serverMode;
  if (serverMode) receiptToken = crypto.randomUUID();
  form.reset();
  el('spec-options').open = false;
  service.value = chosenService;
  adaptFields();
  setAttachment(null);
  for (const name of validated) fieldError(name);
  message(el('quote-error'));
  savedReference = undefined;
  show('form');
}

el('start-prototype').addEventListener('click', () => beginQuote(prototypeService));
el('start-general').addEventListener('click', () => beginQuote(''));
el('form-back').addEventListener('click', () => show('home'));
el('confirm-back').addEventListener('click', () => show('home'));
el('home-link').addEventListener('click', () => show('home'));
function setConfirmationMode(guided) {
  guidedQuote = guided && !serverMode;
  el('confirm-panel').textContent = guidedQuote ? 'Continuar como equipo DI3D →' : 'Ver este pedido en el panel →';
}
el('confirm-panel').addEventListener('click', () => {
  if (guidedQuote && !serverMode) {
    try { sessionStorage.setItem(sessionKey, 'abierta'); }
    catch { return requestLogin(teamHash('receipt', Number(savedReference.slice(5)))); }
  }
  return openInbox(true, true, Number(savedReference.slice(5)));
});
el('guide-question').addEventListener('click', () => el('question').focus());

function fillExample() {
  for (const key of ['piece', 'service', 'quantity', 'dimensions', 'use', 'material', 'contact', 'email']) {
    el(key).value = exampleRequest[key];
  }
  guidance.checked = exampleRequest.guidance;
  for (const name of validated) fieldError(name);
  setAttachment(exampleAttachment);
  adaptFields();
}
el('load-example').addEventListener('click', () => {
  fillExample();
  el('piece').focus();
});
el('tour').addEventListener('click', () => {
  beginQuote(prototypeService, true);
  fillExample();
});

function readQuote() {
  const fields = Object.fromEntries(new FormData(form));
  const clean = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, value.trim()]));
  if (!isTechnical(clean.service)) {
    clean.dimensions = '';
    clean.material = '';
  }
  return { ...clean, guidance: isTechnical(clean.service) && guidance.checked, attachment };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (screen !== 'form' || submitting || savedReference) return;
  const data = readQuote();
  const errors = {
    piece: data.piece ? '' : 'Describí la pieza o el proyecto.',
    quantity: !data.quantity || (/^\d+$/.test(data.quantity) && Number(data.quantity) > 0) ? '' : 'Ingresá una cantidad entera de 1 o más, o dejá el campo vacío.',
    contact: data.contact ? '' : 'Ingresá un nombre o empresa.',
    email: data.email && el('email').validity.valid ? '' : 'Ingresá un correo electrónico válido.'
  };
  for (const [name, text] of Object.entries(errors)) fieldError(name, text);
  const firstError = validated.find((name) => errors[name]);
  if (firstError) {
    el(firstError).focus();
    return;
  }

  submitting = true;
  el('submit-request').disabled = true;
  message(el('quote-error'));
  try {
    const id = await requests.add({ ...data, guided: guidedQuote });
    setConfirmationMode(guidedQuote);
    savedReference = reference(id);
    el('confirm-reference').textContent = savedReference;
    el('confirm-summary').textContent = data.piece;
    if (clientScreen === 'form') clientScreen = 'confirmation';
    if (screen === 'form') show('confirmation');
    else if (screen === 'inbox') await renderInbox();
  } catch {
    message(el('quote-error'), 'No se pudo guardar la solicitud en este navegador. Revisá el almacenamiento y volvé a intentar.');
  } finally {
    submitting = false;
    el('submit-request').disabled = false;
  }
});

function storageError(text) {
  message(el('storage-error'), text);
}

async function renderInbox() {
  const version = ++listRender;
  try {
    const entries = await requests.list();
    if (version !== listRender) return;
    storageError('');
    const query = searchKey(el('order-search').value);
    const filtered = entries.filter(entry => (!statusFilter.value || entry.state === statusFilter.value)
      && searchKey([entry.piece, entry.contact, entry.email, reference(entry.id), entry.owner].join(' ')).includes(query));
    filtered.sort((a, b) => Number(!!a.sample) - Number(!!b.sample) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    visibleEntries = filtered;
    const rows = filtered.map((entry) => {
      const row = el('request-row').content.firstElementChild.cloneNode(true);
      const button = row.querySelector('button');
      button.dataset.id = entry.id;
      button.setAttribute('aria-current', String(screen === 'receipt' && entry.id === selectedId));
      button.addEventListener('click', () => openReceipt(entry.id));
      row.querySelector('strong').textContent = entry.piece;
      row.querySelector('.row-piece > span').textContent = entry.contact;
      row.querySelector('.reference-code').textContent = reference(entry.id);
      displayDate(row.querySelector('time'), entry.createdAt);
      displayBadge(row.querySelector('.badge'), entry.state);
      return row;
    });
    el('request-list').replaceChildren(...rows);
    el('inbox-count').textContent = filtered.length === 0 ? 'No hay solicitudes con este estado.' :
      filtered.length === 1 ? '1 solicitud' : filtered.length + ' solicitudes';
    return filtered;
  } catch {
    if (screen === 'inbox') storageError('No se pudieron leer las solicitudes de este navegador.');
  }
}
statusFilter.addEventListener('change', () => openInbox(false, false));
el('order-search').addEventListener('input', () => openInbox(false, false));

function renderReceipt(entry) {
  currentEntry = entry;
  el('receipt-reference').textContent = reference(entry.id);
  displayDate(el('receipt-date'), entry.createdAt);
  displayBadge(el('receipt-status'), entry.state);
  el('piece-title').textContent = entry.piece;
  el('quantity-output').textContent = entry.quantity
    ? entry.quantity + (Number(entry.quantity) === 1 ? ' unidad' : ' unidades')
    : 'Por definir';
  el('receipt-material').hidden = !isTechnical(entry.service);
  el('material-output').textContent = entry.material || 'Material por definir';
  el('guidance-output').hidden = !entry.guidance || !isTechnical(entry.service);
  el('service-output').textContent = entry.service || 'Consulta general';
  el('use-output').textContent = entry.use || 'Sin indicar';
  el('receipt-dimensions').hidden = !entry.dimensions;
  el('dimensions-output').textContent = entry.dimensions;
  el('name-output').textContent = entry.contact;
  el('email-output').textContent = entry.email;
  paintAttachment(el('receipt-file'), entry.attachment, el('download-file'));
  renderExchange(entry);
  displayOffer(entry);
  statusInput.value = entry.state;
  noteInput.value = entry.note;
  el('owner').value = entry.owner || '';
  el('next-review').value = entry.reviewDate || '';
  el('plan-read').textContent = [entry.owner && 'Responsable · ' + entry.owner, entry.reviewDate && 'Revisión · ' + shortDay(entry.reviewDate)].filter(Boolean).join('   /   ');
  el('note-read').textContent = entry.note || 'Todavía no hay una nota interna.';
  el('note-read').toggleAttribute('data-empty', !entry.note);
  editing(false);
  message(el('follow-result'));
}

async function openInbox(resetFilter = false, focus = true, preferredId) {
  if (!teamSession()) return requestLogin(preferredId ? teamHash('receipt', preferredId) : teamHash('inbox'));
  const version = ++detailRender;
  if (resetFilter) { statusFilter.value = ''; el('order-search').value = ''; }
  show('inbox', focus);
  const entries = await renderInbox();
  if (version !== detailRender || !entries?.length) return;
  if (desktop.matches || preferredId) {
    const next = entries.find((entry) => entry.id === preferredId) || entries[0];
    await openReceipt(next.id, focus && !!preferredId);
  }
}

async function openReceipt(id, focus = true) {
  if (!teamSession()) return requestLogin(teamHash('receipt', id));
  const version = ++detailRender;
  try {
    const entry = await requests.get(id);
    if (version !== detailRender) return;
    if (!entry) {
      await openInbox(false, focus);
      return;
    }
    storageError('');
    selectedId = id;
    renderReceipt(entry);
    show('receipt', focus);
    for (const button of el('request-list').querySelectorAll('button')) {
      button.setAttribute('aria-current', String(Number(button.dataset.id) === id));
    }
  } catch {
    if (version !== detailRender || !teamSession()) return;
    show('inbox', focus);
    storageError('No se pudo abrir la solicitud de este navegador.');
  }
}

el('team-view').addEventListener('click', () => {
  if (!isTeamScreen(screen) && screen !== 'login') openDesk('overview');
});
el('client-view').addEventListener('click', () => {
  if (!isTeamScreen(screen) && screen !== 'login') return;
  ++detailRender;
  ++listRender;
  storageError('');
  if (clientScreen === 'reply') openReply(replyTarget.id, replyTarget.index);
  else show(clientScreen);
});
el('receipt-back').addEventListener('click', () => openInbox());

function editing(active) {
  el('tracking-read').hidden = active;
  el('follow-up').hidden = !active;
}
el('edit-tracking').addEventListener('click', () => {
  statusInput.value = currentEntry.state;
  noteInput.value = currentEntry.note;
  editing(true);
  statusInput.focus();
});
el('cancel-tracking').addEventListener('click', () => {
  editing(false);
  el('edit-tracking').focus();
});
desktop.addEventListener('change', () => {
  if (desktop.matches && screen === 'inbox' && visibleEntries.length) openReceipt(visibleEntries[0].id, false);
});

el('follow-up').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = selectedId;
  const state = statusInput.value;
  const save = el('save-follow-up');
  if (screen !== 'receipt' || save.disabled || !Object.hasOwn(states, state)) return;
  save.disabled = true;
  try {
    const result = await requests.update(id, state, noteInput.value.trim(), el('owner').value.trim(), el('next-review').value);
    if (screen !== 'receipt' || selectedId !== id) return;
    if (!result) throw new Error('No se encontró la solicitud.');
    renderReceipt(result);
    message(el('follow-result'), 'Seguimiento guardado.');
    el('edit-tracking').focus();
    if (statusFilter.value && statusFilter.value !== result.state) await openInbox(false, true);
    else await renderInbox();
  } catch {
    if (screen === 'receipt' && selectedId === id) message(el('follow-result'), 'No se pudo guardar. Volvé a intentar.');
  } finally {
    save.disabled = false;
  }
});

function renderExchange(entry) {
  const thread = entry.clarifications ?? [];
  const latest = thread.at(-1);
  el('guide-question').hidden = !entry.guided || !!latest || entry.state === 'quoted';
  el('guide-question').textContent = entry.attachment?.model === 'local' ? 'Siguiente paso: confirmar la escala →' : 'Siguiente paso: pedir una aclaración →';
  el('late-answer').hidden = !entry.responseAfterQuote;
  const history = el('exchange-history');
  history.replaceChildren();
  for (const item of [...thread].reverse()) {
    const block = document.createElement('div');
    block.className = 'exchange-item';
    const question = document.createElement('p');
    question.textContent = item.question;
    const attribution = document.createElement('strong');
    attribution.textContent = item.answer ? 'Respuesta de ' + item.author : 'Esperando respuesta del cliente';
    block.append(question, attribution);
    if (item.answer) {
      const answer = document.createElement('p');
      answer.className = 'received-answer';
      answer.textContent = item.answer;
      block.append(answer);
    }
    history.append(block);
  }
  el('question').value = !latest && entry.attachment?.model === 'local' ? scaleQuestion : '';
  el('ask-form').hidden = !!latest;
  el('ask-again').hidden = !latest?.answer;
  el('open-reply').hidden = !latest || !!latest.answer;
  el('copy-reply').hidden = !serverMode || !latest?.access || !!latest.answer;
  el('copy-result').textContent = '';
  message(el('ask-error'));
}

el('ask-again').addEventListener('click', () => {
  el('ask-again').hidden = true;
  el('ask-form').hidden = false;
  el('question').focus();
});
el('ask-form').addEventListener('submit', async event => {
  event.preventDefault();
  const question = el('question').value.trim();
  const id = selectedId;
  if (!question) { el('question').focus(); message(el('ask-error'), 'Escribí la pregunta para el cliente.'); return; }
  if (el('ask').disabled) return;
  el('ask').disabled = true;
  try {
    const entry = await requests.ask(id, question);
    if (screen !== 'receipt' || selectedId !== id) return;
    if (!entry) throw new Error();
    renderReceipt(entry);
    if (statusFilter.value && statusFilter.value !== entry.state) statusFilter.value = '';
    await renderInbox();
    el('open-reply').focus();
  } catch {
    message(el('ask-error'), 'No se guardó la pregunta. Volvé a abrir el pedido para comprobar su estado.');
  } finally { el('ask').disabled = false; }
});

el('open-reply').addEventListener('click', () => openReply(selectedId, currentEntry.clarifications.length - 1, currentEntry.clarifications.at(-1).access));
el('copy-reply').addEventListener('click', async () => {
  const thread = currentEntry.clarifications;
  const url = new URL('index.html', location.href);
  url.hash = '#cliente/' + currentEntry.id + '/' + thread.length + '~' + thread.at(-1).access;
  try {
    await navigator.clipboard.writeText(url.href);
    el('copy-result').textContent = 'Enlace copiado. Podés probarlo en otro navegador de esta computadora.';
  } catch {
    el('copy-result').textContent = url.href;
  }
});
async function openReply(id, index, token = replyTarget?.token) {
  const version = ++detailRender;
  try {
    const entry = serverMode ? await requests.reply(id, index, token) : await requests.get(id);
    if (version !== detailRender) return;
    const item = serverMode ? entry.item : entry?.clarifications?.[index];
    if (!item) throw new Error();
    replyTarget = { id, index, token };
    el('reply-reference').textContent = 'Pedido ' + reference(id);
    el('reply-piece').textContent = [entry.piece, entry.quantity ? entry.quantity + ' u.' : ''].filter(Boolean).join(' · ');
    el('reply-question').textContent = item.question;
    paintAttachment(el('reply-file'), entry.attachment);
    el('client-answer').value = '';
    el('sample-answer').hidden = item.question !== scaleQuestion || !entry.attachment?.example;
    el('reply-form').hidden = !!item.answer;
    el('reply-done').hidden = !item.answer;
    el('reply-copy').textContent = item.answer || '';
    message(el('reply-error'));
    storageError('');
    show('reply');
  } catch {
    if (version !== detailRender) return;
    show('home');
    storageError('No se pudo abrir esta aclaración en este navegador.');
  }
}
el('sample-answer').addEventListener('click', () => {
  el('client-answer').value = 'Necesitamos la maqueta en escala 1:50.';
  el('client-answer').focus();
});
el('reply-panel').addEventListener('click', () => openInbox(true, true, replyTarget.id));
el('reply-form').addEventListener('submit', async event => {
  event.preventDefault();
  const answer = el('client-answer').value.trim();
  if (!answer) { el('client-answer').focus(); message(el('reply-error'), 'Escribí tu respuesta.'); return; }
  const target = replyTarget;
  if (el('save-answer').disabled) return;
  el('save-answer').disabled = true;
  try {
    const entry = await requests.answer(target.id, target.index, answer);
    if (screen !== 'reply' || replyTarget !== target) return;
    if (!entry) throw new Error();
    await openReply(target.id, target.index);
    el('reply-panel').focus();
  } catch {
    message(el('reply-error'), 'No se guardó la respuesta. Recargá la consulta para comprobar su estado.');
  } finally { el('save-answer').disabled = false; }
});

function initializeDemo() {
const replyLink = /^#cliente\/(\d+)\/(\d+)(?:~([\w-]+))?$/.exec(location.hash);
const confirmationLink = /^#cliente\/pedido\/(\d+)(?:~([\w-]+))?$/.exec(location.hash);
if (!location.hash || location.hash.startsWith('#equipo')) navigateTeam(location.hash || '#equipo', false);
else if (replyLink) openReply(Number(replyLink[1]), Number(replyLink[2]) - 1, replyLink[3]);
else if (confirmationLink) {
  receiptToken = confirmationLink[2] || '';
  const id = Number(confirmationLink[1]);
  (serverMode ? requests.confirmation(id) : requests.get(id)).then(entry => {
    if (!entry) throw new Error();
    setConfirmationMode(!!entry.guided);
    savedReference = reference(entry.id);
    el('confirm-reference').textContent = savedReference;
    el('confirm-summary').textContent = entry.piece;
    show('confirmation', false);
  }).catch(() => {
    show('home', false);
    storageError('No se encontró la confirmación en este navegador.');
  });
}
else show('home', false);
}
