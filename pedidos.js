'use strict';

const prototypeService = 'Prototipado y producción';
const states = Object.freeze({
  new: 'Nueva', review: 'En revisión', missing: 'Falta información', quoted: 'Cotizada'
});
const exampleAttachment = Object.freeze({ name: 'Croquis de la maqueta.svg', example: true, model: 'local' });
const exampleRequest = Object.freeze({
  service: 'Maquetas y modelos',
  piece: 'Maqueta de un local comercial',
  quantity: '1',
  use: 'Presentar el frente y la distribución del local en una reunión de diseño.',
  dimensions: '',
  material: '',
  guidance: true,
  contact: 'Lucía Pérez',
  email: 'lucia.perez@example.com',
  attachment: exampleAttachment
});

const sampleMockups = {
  'Maqueta de un local comercial': { image:'mockups/local.webp', alt:'Maqueta arquitectónica con vidriera y toldo ámbar' },
  'Trofeos para un evento': { image:'mockups/trofeo.webp', alt:'Trofeo geométrico dorado sobre una base oscura' },
  'Regalos empresariales': { image:'mockups/organizador.webp', alt:'Organizador de escritorio con portalápices y bandeja' }
};
function mockupFor(entry) {
  if (entry.attachment?.model === 'local') return sampleMockups[exampleRequest.piece];
  const key = entry.mockup || entry.piece;
  return entry.sample && Object.hasOwn(sampleMockups, key) ? sampleMockups[key] : null;
}

const currency = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:2});
const money = cents => currency.format(cents / 100);
const validCents = cents => Number.isSafeInteger(cents) && cents > 0 && cents <= 999999999999;
function localDay(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function paidCents(entry) {
  return (entry.payments || []).reduce((sum,p)=>sum + (p.voided ? 0 : p.cents),0);
}
function outstanding(entry) {
  return entry.offer?.approved ? entry.offer.cents - paidCents(entry) : 0;
}

const browserRequests = (() => {
  const storeName = 'solicitudes';
  let connection;
  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('di3d-cotizaciones-demo', 6);
        request.onupgradeneeded = (event) => {
          const initialTracking = { state: 'missing', note: 'Confirmar la escala de la maqueta antes de cotizar' };
          const store = event.oldVersion === 0
            ? request.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true })
            : request.transaction.objectStore(storeName);
          if (event.oldVersion === 0) {
            store.add({ ...exampleRequest, ...initialTracking, sample: true, createdAt: '2026-11-23T12:00:00-03:00' });
          } else if (event.oldVersion < 3) {
            const existing = store.get(1);
            existing.onsuccess = () => {
              const first = existing.result;
              if (!first?.attachment?.example || first.piece !== 'Perillas para un equipo de ensayo' ||
                  !(first.sample || event.oldVersion === 1)) return;
              const updated = { ...first, sample: true, piece: exampleRequest.piece, attachment: exampleAttachment };
              if (first.quantity === '12') updated.quantity = exampleRequest.quantity;
              if (first.service === prototypeService) updated.service = exampleRequest.service;
              if (first.use === 'Probar primero el encastre de una unidad antes de fabricar las demás.') updated.use = exampleRequest.use;
              if (first.note === 'Confirmar la medida del eje antes de cotizar') updated.note = initialTracking.note;
              store.put(updated);
            };
          }
          const common = { dimensions: '', guidance: false, material: '', attachment: null, sample: true };
          if (event.oldVersion < 2) {
            store.add({ ...common, service: 'Premios y reconocimientos', piece: 'Trofeos para un evento',
              quantity: '8', use: 'Entrega de premios al cierre de una jornada.', contact: 'Martín Díaz',
              email: 'martin@example.com', createdAt: '2026-11-22T12:00:00-03:00', state: 'new', note: '' });
            store.add({ ...common, service: 'Regalos corporativos', piece: 'Regalos empresariales',
              quantity: '30', use: 'Organizadores de escritorio para un encuentro de empresas.', contact: 'Ana Silva',
              email: 'ana@example.com', createdAt: '2026-11-21T12:00:00-03:00', state: 'quoted', note: 'Se preparó la cotización por 30 organizadores.' });
          }
          if (event.oldVersion < 4) {
            store.add({ ...common, state: 'review', service: 'Premios y reconocimientos',
              piece: 'Trofeos para el torneo de clubes', mockup: 'Trofeos para un evento', quantity: '16',
              use: 'Premiar a los equipos finalistas.', contact: 'Paula Ríos', email: 'paula@example.com',
              owner: 'Diseño', note: 'Revisar la legibilidad de los nombres en la base antes de cotizar.',
              createdAt: '2026-11-23T10:00:00-03:00' });
            store.add({ ...common, state: 'review', service: 'Regalos corporativos',
              piece: 'Organizadores para un kit de bienvenida', mockup: 'Regalos empresariales', quantity: '20',
              use: 'Armar kits de escritorio para nuevas incorporaciones.', contact: 'Diego Vera', email: 'diego@example.com',
              owner: 'Producción', note: 'Revisar el tiempo de impresión del lote de 20 unidades.',
              createdAt: '2026-11-22T10:00:00-03:00' });
          }
          if (event.oldVersion < 5) {
            const createdAt = '2026-11-20T12:10:00Z';
            const events = [{ at: createdAt, actor: 'Sofía', text: 'Cargó la consulta de WhatsApp.' },
              { at: '2026-11-20T13:35:00Z', actor: 'Nicolás', text: 'Estado: Nueva → En revisión. Responsable: Producción.' }];
            const kit = { ...common, source: 'WhatsApp', piece: 'Organizadores para recepción', quantity:'18',
              service:'Regalos corporativos', mockup:'Regalos empresariales', contact:'Estudio Sur', email:'', phone:'000 555 0142',
              use:'Hola, necesitamos 18 organizadores para recepción. ¿Podrían cotizarlos?', owner:'Producción',
              createdAt, state:'review', note:'Verificar el acabado antes de cotizar.', events };
            store.add(kit);
            store.add({ ...kit, piece:'Organizadores para oficinas', quantity:'10', use:'Pedido anterior de 10 organizadores.',
              state:'quoted', archived:true, note:'Trabajo finalizado.', offer:{ number:'COT-018', date:'2026-11-21' },
              events:[...events,{ at:'2026-11-21T15:00:00Z',actor:'Nicolás',text:'Registró la cotización COT-018.' },
              { at:'2026-11-23T17:40:00Z',actor:'Sofía',text:'Archivó el proyecto.' }] });
          }
          const now = new Date();
          const date = localDay(now);
          const base = {...common, source:'WhatsApp', service:'Regalos corporativos', mockup:'Regalos empresariales',
            contact:'Estudio Sur', phone:'000 555 0142', email:'', owner:'Ventas', state:'quoted',
            use:'Nueva tanda para el equipo.', note:'', createdAt:now.toISOString()};
          store.add({...base, piece:'Organizadores · nueva tanda', quantity:'24',
            offer:{number:'COT-024',date,cents:24000000,approved:true},
            payments:[{id:'demo-deposit',cents:8000000,date,actor:'Sofía',at:now.toISOString()}],
            events:[{actor:'Sofía',at:now.toISOString(),text:'Presupuesto aprobado por $240.000. Registró una seña de $80.000.'}]});
          store.add({...base,piece:'Organizadores · propuesta inicial',quantity:'12',
            offer:{number:'COT-012',date,cents:12000000,approved:false}});

        };
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); connection = undefined; };
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('El almacenamiento está ocupado.'));
      }).catch((error) => {
        connection = undefined;
        throw error;
      });
    }
    return connection;
  }

  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('No se completó el guardado.'));
      operation(transaction.objectStore(storeName), (value) => { result = value; });
    });
  }

  function modify(id, change, action, asClient = false) {
    const member = activeMember();
    return transact('readwrite', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) return;
        const updated = change(request.result);
        if (!updated) return;
        const before = request.result;
        const details = [];
        const fields = {piece:'Proyecto',contact:'Cliente',quantity:'Cantidad',phone:'Teléfono',email:'Correo',
          material:'Material',dimensions:'Medidas',service:'Servicio',use:'Descripción',state:'Estado',owner:'Responsable',note:'Nota',reviewDate:'Próxima revisión'};
        for (const [key,label] of Object.entries(fields)) {
          const previous = before[key] || '';
          const next = updated[key] || '';
          if (previous !== next) details.push(label + ': ' + (key === 'state' ? states[previous] : previous || '—') + ' → ' + (key === 'state' ? states[next] : next || '—'));
        }
        if (before.attachment !== updated.attachment) details.push('Archivo: ' + (before.attachment?.name || '—') + ' → ' + (updated.attachment?.name || '—'));
        if (action || details.length) {
          const text = [action, ...details].filter(Boolean).join(' · ');
          updated.events = [...(before.events || []), { at:new Date().toISOString(), actor:asClient ? before.contact : member, text }];
        }
        store.put(updated);
        done(updated);
      };
    });
  }

  return {
    list: () => transact('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result.reverse());
    }),
    get: (id) => transact('readonly', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => done(request.result);
    }),
    add: (data) => transact('readwrite', (store, done) => {
      const createdAt = new Date().toISOString();
      const internal = data.source === 'WhatsApp';
      const events = [{at:createdAt, actor:internal ? activeMember() : data.contact, text:internal ? 'Cargó la consulta de WhatsApp.' : 'Registró la solicitud.'}];
      const request = store.add({ ...data, createdAt, events, state: 'new', note: '' });
      request.onsuccess = () => done(request.result);
    }),
    edit: (id, fields) => modify(id, entry => ({ ...entry, ...fields })),
    archive: (id, archived) => modify(id, entry => ({ ...entry, archived }), archived ? 'Archivó el proyecto.' : 'Reactivó el proyecto.'),
    update: (id, state, note, owner, reviewDate) => modify(id, entry => ({ ...entry, state, note, owner, reviewDate, responseAfterQuote: false })),
    quote: (id, number, date, file, cents, approved) => modify(id, entry => {
      const paid = paidCents(entry);
      if (!validCents(cents) || cents < paid || (paid > 0 && !approved)) return;
      return {...entry,state:'quoted',responseAfterQuote:false,
        offer:{number,date,cents,approved,file:file ?? entry.offer?.file ?? null}};
    }, 'Actualizó la cotización ' + number + ' · ' + money(cents) + (approved ? ' · Aprobada' : ' · Pendiente de aprobación')),
    collect: (id, cents, date) => {
      const actor = activeMember();
      return modify(id, entry => {
        if (!entry.offer?.approved || !validCents(cents) || cents > outstanding(entry) || !date || date > localDay()) return;
        const movement = {id:crypto.randomUUID(),cents,date,actor,at:new Date().toISOString()};
        return {...entry,payments:[...(entry.payments || []),movement]};
      }, 'Registró un cobro de ' + money(cents) + ' con fecha ' + date);
    },
    voidPayment: (id, paymentId, reason) => {
      const actor = activeMember();
      return modify(id, entry => {
        const payment = entry.payments?.find(p=>p.id === paymentId);
        if (!payment || payment.voided || !reason.trim()) return;
        return {...entry,payments:entry.payments.map(p=>p.id === paymentId ?
          {...p,voided:{actor,at:new Date().toISOString(),reason:reason.trim()}} : p)};
      }, 'Anuló un cobro. Motivo: ' + reason.trim());
    },
    ask: (id, question) => modify(id, entry => {
      const thread = entry.clarifications ?? [];
      if (!question || thread.some(item => !item.answer)) return;
      return { ...entry, state: entry.state === 'quoted' ? 'quoted' : 'missing', clarifications: [...thread, { question, askedAt: new Date().toISOString() }] };
    }, 'Pidió aclaración: ' + question),
    answer: (id, index, answer) => modify(id, entry => {
      const thread = [...(entry.clarifications ?? [])];
      if (!answer || !thread[index] || thread[index].answer) return;
      thread[index] = { ...thread[index], answer, author: entry.contact, answeredAt: new Date().toISOString() };
      const quoted = entry.state === 'quoted';
      return { ...entry, state: quoted ? 'quoted' : 'review', responseAfterQuote: quoted, clarifications: thread };
    }, 'Respondió: ' + answer, true)
  };
})();
