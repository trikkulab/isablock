// Il pulsante «☁ Accedi» e, dopo il login, il menu «☁ Nome ▾» nella toolbar.
// Questo file NON importa Firebase: carica il resto del cloud (src/cloud/index.js)
// solo quando si apre la finestra di accesso, oppure al ricaricamento se l'utente
// era già entrato.
//
// Prima del login: «☁ Accedi» apre una finestra che spiega cosa serve e quali dati
// si salvano; intanto il cloud si carica, e «Continua con Google» è pronto al clic
// successivo. È il modo di tenere il popup di Google dentro il gesto dell'utente
// (Safari altrimenti lo blocca o perde lo stato dell'accesso) senza che il doppio
// clic sembri uno scatto strano: il secondo clic è una conferma.
// Dopo il login: menu con Salva nel cloud, I miei sketch, Corsi ed Esci.

import { montaSketch } from './sketch-ui.js';
import { montaCorsi } from './corsi-ui.js';
import { el, apriFinestra } from './dom.js';
import { titoloAccesso, introAccesso, titoloDati, datiSalvati, notaServizio } from './testi.js';

const SESSIONE_KEY = 'isablock.cloud.sessione';

function memo(valore) {
  try {
    if (valore) window.localStorage.setItem(SESSIONE_KEY, '1');
    else window.localStorage.removeItem(SESSIONE_KEY);
  } catch { /* storage non disponibile: si perde solo il ripristino automatico */ }
}
function eraEntrato() {
  try { return window.localStorage.getItem(SESSIONE_KEY) === '1'; } catch { return false; }
}

export function montaCloud({ contenitore, toast, programma }) {
  contenitore.hidden = false;
  contenitore.textContent = '';

  const sketchUi = montaSketch({ toast, programma });
  const corsiUi = montaCorsi({ toast, programma, dopoCaricamento: () => sketchUi.scollega() });

  // --- Elementi nella toolbar ---------------------------------------------
  const btnAccedi = el('button', { type: 'button', class: 'cloud-accedi',
    title: 'Accedi con l\'account della scuola (facoltativo: l\'app funziona anche senza)' }, '☁ Accedi');

  const nomeUtente = el('span', { class: 'cloud-name' });
  const btnMenu = el('button', { type: 'button', class: 'cloud-menu-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    '☁ ', nomeUtente, el('span', { class: 'cloud-caret', 'aria-hidden': 'true' }, ' ▾'));
  const intNome = el('strong', { class: 'cloud-dd-nome' });
  const intEmail = el('span', { class: 'cloud-dd-email' });
  const badge = el('span', { class: 'cloud-badge' });
  const voce = (testo, fn) => el('button', { type: 'button', role: 'menuitem', class: 'cloud-voce',
    onclick: () => { chiudiMenu(); fn(); } }, testo);
  const dropdown = el('div', { class: 'cloud-dropdown', role: 'menu', hidden: '' },
    el('div', { class: 'cloud-dd-testa' }, el('div', {}, intNome, intEmail), badge),
    voce('Salva nel cloud', () => sketchUi.salva()),
    voce('I miei sketch', () => sketchUi.elenco()),
    voce('Corsi', () => corsiUi.apri()),
    el('hr', { class: 'cloud-sep' }),
    voce('Esci', () => cloud && cloud.auth.esci()));
  const menu = el('span', { class: 'cloud-menu', hidden: '' }, btnMenu, dropdown);
  contenitore.append(btnAccedi, menu);

  // --- Menu a discesa -----------------------------------------------------
  const vociMenu = () => [...dropdown.querySelectorAll('.cloud-voce')];
  // Di norma il menu è allineato al bordo destro del pulsante; su schermi stretti,
  // dove il pulsante può stare a sinistra, si sposta per non uscire dallo schermo.
  function posiziona() {
    dropdown.style.left = '';
    dropdown.style.right = '0';
    const r = dropdown.getBoundingClientRect();
    if (r.left < 8) {
      dropdown.style.right = 'auto';
      dropdown.style.left = `${8 - menu.getBoundingClientRect().left}px`;
    }
  }
  function apriMenu() {
    dropdown.hidden = false;
    posiziona();
    btnMenu.setAttribute('aria-expanded', 'true');
    vociMenu()[0]?.focus();
  }
  function chiudiMenu(rimettiFuoco = false) {
    if (dropdown.hidden) return;
    dropdown.hidden = true;
    btnMenu.setAttribute('aria-expanded', 'false');
    if (rimettiFuoco) btnMenu.focus();
  }
  btnMenu.addEventListener('click', () => (dropdown.hidden ? apriMenu() : chiudiMenu()));
  // In fase di cattura: l'area di lavoro di Blockly ferma la propagazione degli
  // eventi del puntatore, e un clic lì non chiuderebbe il menu.
  document.addEventListener('pointerdown', (ev) => { if (!menu.contains(ev.target)) chiudiMenu(); }, true);
  dropdown.addEventListener('keydown', (ev) => {
    const voci = vociMenu();
    const i = voci.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.stopPropagation(); chiudiMenu(true); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); voci[(i + 1) % voci.length].focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); voci[(i - 1 + voci.length) % voci.length].focus(); }
  });
  btnMenu.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (dropdown.hidden) apriMenu(); }
  });

  // --- Stato di accesso ---------------------------------------------------
  let cloud = null;
  let caricamento = null;
  let dialogo = null; // finestra di accesso aperta

  function mostra({ utente, errore }) {
    btnAccedi.hidden = !!utente;
    menu.hidden = !utente;
    chiudiMenu();
    if (utente) {
      nomeUtente.textContent = utente.nome;
      btnMenu.title = utente.email;
      intNome.textContent = utente.nome;
      intEmail.textContent = utente.email;
      badge.textContent = utente.ruolo === 'docente' ? 'Docente' : 'Studente';
      badge.dataset.ruolo = utente.ruolo;
      memo(true);
      dialogo?.chiudi();
      const corsi = cloud.corsiPer(utente.email, utente.ruolo);
      sketchUi.entra(cloud.sketchPer(utente.uid, { email: utente.email, nome: utente.nome }), corsi);
      corsiUi.entra(corsi, utente.ruolo, cloud.condivisi);
    } else {
      memo(false);
      sketchUi.esci();
      corsiUi.esci();
    }
    if (errore) toast(errore.message, 'error');
  }

  function carica() {
    caricamento ??= import('./index.js').then(async (m) => {
      cloud = await m.avviaCloud();
      cloud.auth.ascolta(mostra);
      return cloud;
    }).catch((err) => { caricamento = null; throw err; });
    return caricamento;
  }

  // --- Finestra di accesso ------------------------------------------------
  function apriAccesso() {
    dialogo?.chiudi();
    const mia = apriFinestra(titoloAccesso, () => { if (dialogo === mia) dialogo = null; });
    dialogo = mia;
    const continua = el('button', { type: 'button', class: 'modal-btn', disabled: '' }, 'Carico…');
    continua.disabled = true;
    const annulla = el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => mia.chiudi() }, 'Annulla');
    mia.corpo.append(
      el('p', { class: 'sketch-nota' }, introAccesso),
      el('h3', { class: 'corsi-titolo' }, titoloDati),
      el('ul', { class: 'cloud-dati' }, ...datiSalvati.map((t) => el('li', {}, t))),
      el('p', { class: 'sketch-nota' }, notaServizio),
      el('div', { class: 'modal-actions' }, continua, annulla));

    // Il cloud si carica ora, mentre l'utente legge: al clic su «Continua con
    // Google» è già pronto e il popup si apre subito.
    carica().then(() => {
      if (dialogo !== mia) return;
      continua.disabled = false;
      continua.textContent = 'Continua con Google';
      continua.focus();
    }).catch((err) => {
      if (dialogo !== mia) return;
      continua.textContent = 'Non disponibile';
      toast(err.message || 'Impossibile caricare l\'accesso.', 'error');
    });

    continua.addEventListener('click', async () => {
      continua.disabled = true;
      try {
        await cloud.auth.accedi();
      } catch (err) {
        toast(err.message || 'Accesso non riuscito.', 'error');
      }
      // Se l'accesso è riuscito `mostra` chiude la finestra; altrimenti si può riprovare.
      if (dialogo === mia && cloud && !cloud.auth.utente()) continua.disabled = false;
    });
  }
  btnAccedi.addEventListener('click', apriAccesso);

  // Ripristino della sessione: solo se l'utente era già entrato in passato.
  if (eraEntrato()) carica().catch(() => memo(false));

  return { scollega: () => sketchUi.scollega() };
}
