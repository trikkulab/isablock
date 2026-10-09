// Pulsante "Accedi" e stato dell'utente nella toolbar. Questo file NON importa
// Firebase: carica il resto del cloud (src/cloud/index.js) solo al clic su
// "Accedi", oppure al ricaricamento se l'utente era già entrato.

import { montaSketch } from './sketch-ui.js';

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

  const btnAccedi = document.createElement('button');
  btnAccedi.type = 'button';
  btnAccedi.textContent = 'Accedi';
  btnAccedi.title = 'Accedi con l\'account della scuola (facoltativo: l\'app funziona anche senza)';

  const info = document.createElement('span');
  info.className = 'cloud-user';
  info.hidden = true;
  const nome = document.createElement('span');
  nome.className = 'cloud-name';
  const badge = document.createElement('span');
  badge.className = 'cloud-badge';
  const btnEsci = document.createElement('button');
  btnEsci.type = 'button';
  btnEsci.textContent = 'Esci';
  info.append(nome, badge, btnEsci);
  const sketchBox = document.createElement('span');
  sketchBox.className = 'cloud-sketch';
  contenitore.append(btnAccedi, info, sketchBox);
  const sketchUi = montaSketch({ contenitore: sketchBox, toast, programma });

  let cloud = null;
  let caricamento = null;

  function mostra({ utente, errore }) {
    btnAccedi.hidden = !!utente;
    info.hidden = !utente;
    btnAccedi.disabled = false;
    btnAccedi.textContent = 'Accedi con Google';
    if (utente) {
      nome.textContent = utente.nome;
      badge.textContent = utente.ruolo === 'docente' ? 'Docente' : 'Studente';
      badge.dataset.ruolo = utente.ruolo;
      memo(true);
      sketchUi.entra(cloud.sketchPer(utente.uid));
    } else {
      memo(false);
      sketchUi.esci();
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

  // Primo accesso in due tempi: il primo clic carica l'SDK (e non apre nulla),
  // il secondo apre il popup di Google SUBITO, dentro il gesto dell'utente.
  // Se il popup si aprisse dopo il caricamento, Safari lo bloccherebbe o
  // perderebbe lo stato dell'accesso ("missing initial state"). Chi era già
  // entrato in passato ha l'SDK caricato in automatico e fa un clic solo.
  btnAccedi.addEventListener('click', async () => {
    if (!cloud) {
      btnAccedi.disabled = true;
      btnAccedi.textContent = 'Carico…';
      try {
        await carica();
        btnAccedi.disabled = false;
        btnAccedi.textContent = 'Accedi con Google';
        toast('Pronto: premi "Accedi con Google" per entrare.', 'info');
      } catch (err) {
        btnAccedi.disabled = false;
        btnAccedi.textContent = 'Accedi';
        toast(err.message || 'Impossibile caricare l\'accesso.', 'error');
      }
      return;
    }
    btnAccedi.disabled = true;
    try {
      await cloud.auth.accedi();
    } catch (err) {
      toast(err.message || 'Accesso non riuscito.', 'error');
    }
    // Se l'accesso è riuscito `mostra` ha già sistemato i pulsanti.
    if (!cloud.auth.utente()) btnAccedi.disabled = false;
  });

  btnEsci.addEventListener('click', () => cloud && cloud.auth.esci());

  // Ripristino della sessione: solo se l'utente era già entrato in passato.
  if (eraEntrato()) carica().catch(() => memo(false));

  return { scollega: () => sketchUi.scollega() };
}
