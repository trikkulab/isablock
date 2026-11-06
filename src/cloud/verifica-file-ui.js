// Il docente carica il file di emergenza di uno studente (a verifica chiusa) come nuova versione della sua consegna.
// Flusso: sceglie il file dalla riga dello studente → controlli (src/verifica-file.js: impronta, verifica, studente) →
// finestra di conferma con il confronto «ultimo salvataggio sul server / file» → la consegna nasce con origine «file».
// Il nome del file NON fa fede (solo un avviso se non ricorda lo studente): conta il contenuto.
import { el } from './dom.js';
import { leggiFileEmergenza, nomeCoerente, oraBreve } from '../verifica-file.js';
import { formatoDataOra } from './data-ora.js';
import { apriAnteprima } from './verifica-anteprima-ui.js';

const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

// `apri`: la finestra del modulo chiamante. `lavoro`: il lavoro com'è adesso (può mancare). `ultimaConsegna`: l'ultima
// versione già presente (o null). `dopo()` viene chiamata a consegna caricata.
export function scegliFileEmergenza({ apri, programma, vd, vid, email, nome, lavoro, ultimaConsegna, toast, dopo = () => {} }) {
  const campo = el('input', { type: 'file', accept: '.isablock,.json,application/json', hidden: '', 'aria-label': `File di emergenza di ${nome || email}` });
  campo.addEventListener('change', async () => {
    const file = campo.files && campo.files[0];
    campo.remove();
    if (!file) return;
    let testo;
    try { testo = await file.text(); } catch { toast('Non riesco a leggere il file.', 'error'); return; }
    const r = leggiFileEmergenza(testo, { verifica: vid, studente: email });
    if (!r.ok) { toast(r.messaggio, 'error'); return; }
    confermaCaricamento({ apri, programma, vd, vid, email, nome, lavoro, ultimaConsegna, toast, dopo, file: r.file, nomeFile: file.name });
  });
  document.body.append(campo);
  campo.click();
}

function confermaCaricamento({ apri, programma, vd, vid, email, nome, lavoro, ultimaConsegna, toast, dopo, file, nomeFile }) {
  const chi = nome || email;
  const n = (ultimaConsegna ? ultimaConsegna.versione : 0) + 1;
  const f = apri('Carica il file di emergenza');
  const sulServer = lavoro && lavoro.nBlocchi !== null && lavoro.nBlocchi !== undefined
    ? `${lavoro.nBlocchi} blocchi${lavoro.ultimoSegnale ? ` (ultimo segnale alle ${oraBreve(lavoro.ultimoSegnale)})` : ''}`
    : 'nessun salvataggio';
  const caricare = el('button', { type: 'button', class: 'modal-btn' }, `Carica come consegna v${n}`);
  caricare.addEventListener('click', async () => {
    caricare.disabled = true;
    try {
      await vd.caricaFile(vid, email, { ...file, nomeFile: String(nomeFile).slice(0, 120) });
      f.chiudi();
      toast(`Consegna v${n} di ${chi} caricata dal file.`, 'success');
      dopo();
    } catch (err) { toast(messaggio(err), 'error'); caricare.disabled = false; }
  });
  const guarda = el('button', { type: 'button', class: 'modal-btn secondary' }, 'Guarda il programma del file');
  guarda.addEventListener('click', () => apriAnteprima({
    apri, programma, email, nome: `${chi} (dal file)`,
    segui: (_e, cb) => { cb({ programma: file.programma, nBlocchi: file.nBlocchi, consegnato: true, ultimoSegnale: null }); return () => {}; },
  }));
  f.corpo.append(
    el('p', {}, `File di emergenza di ${file.studenteNome} (${email}).`),
    nomeCoerente(nomeFile, email) ? '' : el('p', { class: 'verifica-avviso', role: 'note' },
      `Il nome del file («${nomeFile}») non ricorda questo studente. Non è un problema: conta il contenuto, che è proprio di ${file.studenteNome}.`),
    el('p', {}, `Creato il ${formatoDataOra.format(file.creatoIl)}${file.offlineDa ? `; lo studente era offline da ${file.offlineDa}` : ''}.`),
    el('table', { class: 'tabella-live' },
      el('tbody', {},
        el('tr', {}, el('th', { scope: 'row' }, 'Ultimo salvataggio arrivato al server'), el('td', {}, sulServer)),
        el('tr', {}, el('th', { scope: 'row' }, 'Nel file'), el('td', {}, `${file.nBlocchi} blocchi`)))),
    el('p', { class: 'sketch-nota' }, `Diventa la versione v${n} della consegna (origine «file»). Le versioni precedenti restano e vale l'ultima.`),
    el('div', { class: 'modal-actions' }, caricare, guarda, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, 'Annulla')));
}
