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
// Opzioni: `larga` (finestra grande, per l'editor delle verifiche) e `puoChiudere` (funzione che può
// rifiutare la chiusura, per esempio chiedendo conferma se ci sono modifiche non salvate).
const pila = [];   // finestre aperte, l'ultima è quella in cima: Esc chiude solo quella

export function apriFinestra(titolo, onChiudi, { larga = false, puoChiudere = null } = {}) {
  const corpo = el('div');
  const box = el('div', { class: `modal-box wide sketch-box${larga ? ' verifica-box' : ''}` },
    el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Chiudi', onclick: () => chiudi() }, '✕'),
    el('h2', {}, titolo),
    corpo);
  const modale = el('div', { class: 'modal', onmousedown: (ev) => { if (ev.target === modale) chiudi(); } }, box);
  const tasti = (ev) => { if (ev.key === 'Escape' && pila[pila.length - 1] === box) chiudi(); };
  function chiudi() {
    if (puoChiudere && !puoChiudere()) return;
    const k = pila.indexOf(box);
    if (k !== -1) pila.splice(k, 1);
    document.removeEventListener('keydown', tasti);
    modale.remove();
    onChiudi?.();
  }
  document.addEventListener('keydown', tasti);
  pila.push(box);
  document.body.append(modale);
  return { corpo, chiudi };
}
