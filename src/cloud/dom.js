// Piccoli aiuti per costruire l'interfaccia del cloud senza innerHTML (i nomi di
// sketch e corsi vengono dagli utenti: sempre textContent). Usati da sketch-ui.js
// e corsi-ui.js.

export function el(tag, attrs = {}, ...figli) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...figli);
  return e;
}

// Finestra modale semplice, costruita sulle classi .modal già usate dall'app.
// Opzioni: `larga` (finestra grande, per l'editor delle verifiche), `puoChiudere` (funzione che può rifiutare la
// chiusura, per esempio chiedendo conferma se ci sono modifiche non salvate) e `bloccante` (niente ✕, né Esc, né clic
// fuori: si chiude solo da codice, con chiudi(); è la finestra di scelta della verifica) e `piena` (a tutto schermo,
// senza titolo: lo disegna chi la apre, come la Sala del docente).
const pila = [];   // finestre aperte, l'ultima è quella in cima: Esc chiude solo quella
const chiudibili = new Set();   // la funzione chiudi() di ogni finestra non bloccante aperta, per chiuderle tutte insieme

// Chiude tutte le finestre aperte (dalla più in alto), quelle bloccanti no. Una finestra che rifiuta la chiusura (puoChiudere) resta.
// Serve quando un'azione porta all'editor (per esempio «Apri una copia per provarla») e nessuna finestra deve coprirlo.
export function chiudiTutteLeFinestre() {
  for (const chiudi of [...chiudibili].reverse()) chiudi();
}

export function apriFinestra(titolo, onChiudi, { larga = false, puoChiudere = null, bloccante = false, piena = false } = {}) {
  const corpo = el('div');
  const box = el('div', { class: `modal-box wide sketch-box${larga ? ' verifica-box' : ''}${piena ? ' sala-box' : ''}` },
    bloccante ? '' : el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Chiudi', onclick: () => chiudi() }, '✕'),
    piena ? '' : el('h2', {}, titolo),
    corpo);
  const modale = el('div', { class: `modal${piena ? ' modal-sala' : ''}`, onmousedown: (ev) => { if (!bloccante && ev.target === modale) chiudi(); } }, box);
  const tasti = (ev) => { if (!bloccante && ev.key === 'Escape' && pila[pila.length - 1] === box) chiudi(); };
  function chiudi() {
    if (puoChiudere && !puoChiudere()) return;
    const k = pila.indexOf(box);
    if (k !== -1) pila.splice(k, 1);
    chiudibili.delete(chiudi);
    document.removeEventListener('keydown', tasti);
    modale.remove();
    onChiudi?.();
  }
  document.addEventListener('keydown', tasti);
  pila.push(box);
  if (!bloccante) chiudibili.add(chiudi);
  document.body.append(modale);
  return { corpo, chiudi };
}
