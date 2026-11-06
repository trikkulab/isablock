// L'informativa sui dati come elementi della pagina: il riassunto (finestra di accesso) e il testo completo (finestra di
// accesso, dopo «Leggi tutto», e Guida, sezione «Privacy e dati»). I testi stanno in testi.js.
import { el } from './dom.js';
import { riassuntoDati, gruppiDati, notaServizio, introAccesso } from './testi.js';

export const riassuntoInformativa = () => el('ul', { class: 'cloud-dati informativa-riassunto' }, ...riassuntoDati.map((t) => el('li', {}, t)));

// Il testo completo, voce per voce, in tre gruppi.
export function testoCompletoInformativa() {
  return el('div', { class: 'informativa-testo' },
    ...gruppiDati.flatMap((g) => [
      el('h4', { class: 'informativa-gruppo' }, g.titolo),
      el('ul', { class: 'cloud-dati' }, ...g.voci.map((t) => el('li', {}, t))),
    ]),
    el('p', { class: 'sketch-nota' }, notaServizio));
}

// La pagina della Guida «Privacy e dati».
export function paginaPrivacy() {
  return el('div', {},
    el('p', {}, introAccesso),
    el('p', {}, 'Qui sotto trovi tutto ciò che viene salvato, voce per voce. Lo stesso testo compare quando accedi.'),
    testoCompletoInformativa());
}
