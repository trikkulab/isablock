// Le sezioni «Per lo studente» e «Per il docente» della Guida (testi in testi-guida.js). Ogni sezione è una pagina con una
// barra di capitoli e un capitolo alla volta; solo testo, niente immagini. Il DOM si costruisce la prima volta che la
// sezione si apre (lo fa guida.js).
import { el } from './dom.js';
import { sezioni } from './testi-guida.js';

// «**grassetto**» dentro una stringa -> <strong>. Mai innerHTML.
function conGrassetto(testo) {
  return testo.split('**').map((parte, i) => (i % 2 ? el('strong', {}, parte) : parte));
}

function blocco(b) {
  if (b.p !== undefined) return el('p', {}, ...conGrassetto(b.p));
  if (b.h !== undefined) return el('h4', {}, b.h);
  if (b.nota !== undefined) return el('p', { class: 'guida-cloud-nota', role: 'note' }, ...conGrassetto(b.nota));
  const voci = (b.ul || b.ol).map((t) => el('li', {}, ...conGrassetto(t)));
  return el(b.ul ? 'ul' : 'ol', {}, ...voci);
}

export function paginaGuidaCloud(idSezione) {
  const { capitoli } = sezioni[idSezione];
  const barra = el('div', { class: 'verifica-schede guida-cloud-capitoli', role: 'tablist', 'aria-label': 'Capitoli' });
  const pagine = capitoli.map((c) => el('div', { class: 'guida-cloud-pagina', 'data-capitolo': c.id, hidden: '' },
    el('h3', {}, c.titolo), ...c.blocchi.map(blocco)));
  const bottoni = capitoli.map((c, i) => {
    const b = el('button', { type: 'button', class: 'verifica-scheda', role: 'tab', 'data-capitolo': c.id }, c.titolo);
    b.addEventListener('click', () => mostra(i));
    return b;
  });
  function mostra(i) {
    pagine.forEach((p, k) => { p.hidden = k !== i; });
    bottoni.forEach((b, k) => { b.classList.toggle('attiva', k === i); b.setAttribute('aria-selected', String(k === i)); });
  }
  barra.append(...bottoni);
  mostra(0);
  return el('div', { class: 'guida-cloud' }, barra, ...pagine);
}
