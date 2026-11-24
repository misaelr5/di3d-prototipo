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

const browserRequests = (() => {
  const storeName = 'solicitudes';
  let connection;
  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('di3d-cotizaciones-demo', 4);
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

  function modify(id, change) {
    return transact('readwrite', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) return;
        const updated = change(request.result);
        if (!updated) return;
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
      const request = store.add({ ...data, createdAt: new Date().toISOString(), state: 'new', note: '' });
      request.onsuccess = () => done(request.result);
    }),
    update: (id, state, note, owner, reviewDate) => modify(id, entry => ({ ...entry, state, note, owner, reviewDate, responseAfterQuote: false })),
    quote: (id, number, date, file) => modify(id, entry => ({
      ...entry, state: 'quoted', responseAfterQuote: false, offer: { number, date, file: file ?? entry.offer?.file ?? null }
    })),
    ask: (id, question) => modify(id, entry => {
      const thread = entry.clarifications ?? [];
      if (!question || thread.some(item => !item.answer)) return;
      return { ...entry, state: entry.state === 'quoted' ? 'quoted' : 'missing', clarifications: [...thread, { question, askedAt: new Date().toISOString() }] };
    }),
    answer: (id, index, answer) => modify(id, entry => {
      const thread = [...(entry.clarifications ?? [])];
      if (!answer || !thread[index] || thread[index].answer) return;
      thread[index] = { ...thread[index], answer, author: entry.contact, answeredAt: new Date().toISOString() };
      const quoted = entry.state === 'quoted';
      return { ...entry, state: quoted ? 'quoted' : 'review', responseAfterQuote: quoted, clarifications: thread };
    })
  };
})();
