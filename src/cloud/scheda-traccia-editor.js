// La scheda «Traccia» del pannello dei codici dell'editor (accanto a Pseudocodice, C e Python), che in verifica usa lo studente.
// Qui la usano il docente con la copia di prova di una consegna e lo studente che apre una sua consegna nell'editor:
// compare con la traccia di quella consegna e sparisce quando il programma viene sostituito. Tocca solo ciò che ha mostrato
// lei (`attiva`): la scheda di una verifica in corso non si disturba.

let attiva = false;
let eraAperta = false;       // la scheda era quella scelta quando è stata tolta: passando alla consegna dopo (◀ ▶) si riapre così

// `nodo`: il pannello (creaPannelloTraccia). `apri`: seleziona la scheda (lo studente sì). `ripristina`: la seleziona solo se lo era quando
// è stata tolta l'ultima volta (il docente preferisce lo pseudocodice, ma se guardava la traccia e passa a un altro studente ci resta).
export function mostraTracciaEditor(nodo, { apri = false, ripristina = false } = {}) {
  const tab = document.getElementById('tabTraccia');
  const box = document.getElementById('tracciaBox');
  if (!tab || !box) return false;
  box.textContent = '';
  box.append(nodo);
  tab.hidden = false;
  attiva = true;
  if (apri || (ripristina && eraAperta)) tab.click();
  return true;
}

export function nascondiTracciaEditor() {
  if (!attiva) return;
  attiva = false;
  const tab = document.getElementById('tabTraccia');
  const box = document.getElementById('tracciaBox');
  if (box) box.textContent = '';
  if (tab) {
    const era = tab.classList.contains('active');
    eraAperta = era;
    tab.hidden = true;
    if (era) document.querySelector('.tab-btn[data-tab="pseudocode"]')?.click();
  }
}
