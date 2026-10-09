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
export function apriFinestra(titolo, onChiudi) {
  const corpo = el('div');
  const box = el('div', { class: 'modal-box wide sketch-box' },
    el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Chiudi', onclick: () => chiudi() }, '✕'),
    el('h2', {}, titolo),
    corpo);
  const modale = el('div', { class: 'modal', onmousedown: (ev) => { if (ev.target === modale) chiudi(); } }, box);
  const tasti = (ev) => { if (ev.key === 'Escape') chiudi(); };
  function chiudi() {
    document.removeEventListener('keydown', tasti);
    modale.remove();
    onChiudi?.();
  }
  document.addEventListener('keydown', tasti);
  document.body.append(modale);
  return { corpo, chiudi };
}
