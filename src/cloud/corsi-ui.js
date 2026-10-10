// Interfaccia dei corsi: la finestra «Corsi» (aperta dal menu «Cloud», ui.js) con
// l'elenco dei propri corsi e il campo per iscriversi con il codice. Il docente ha in più «Nuovo corso» e
// «Gestisci» (gestione-ui.js). Non conosce Firebase: riceve l'oggetto `corsi` di corsi.js.
import { el, apriFinestra } from './dom.js';
import { normalizzaCodice } from './corsi.js';
import { montaGestione } from './gestione-ui.js';

const formatoData = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function montaCorsi({ toast, programma, dopoCaricamento }) {
  let corsi = null;   // oggetto di corsi.js, valido solo da loggati
  let condivisi = null; // vista docente (condivisi.js)
  let ruolo = 'studente';
  let finestra = null;
  let ricarica = null;      // ridisegna l'elenco della finestra aperta
  let mostraArchiviati = false;
  const gestioneUi = montaGestione({ toast, dopoCambio: () => ricarica?.() });

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';
  function chiudiFinestra() { finestra?.chiudi(); finestra = null; }

  function apri() {
    chiudiFinestra();
    finestra = apriFinestra('I miei corsi', () => { finestra = null; ricarica = null; });
    costruisci(finestra);
  }

  function costruisci(mia) {
    const { corpo } = mia;
    const campo = el('input', { type: 'text', class: 'sketch-nome codice-corso', maxlength: '24',
      placeholder: 'Codice del corso', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
      'aria-label': 'Codice del corso' });
    const vai = el('button', { type: 'button', class: 'modal-btn' }, 'Unisciti');
    const lista = el('div', { class: 'corsi-lista' });

    async function iscriviti() {
      if (!normalizzaCodice(campo.value)) { toast('Scrivi il codice del corso.', 'error'); return; }
      vai.disabled = true;
      try {
        const c = await corsi.iscriviti(campo.value);
        toast(`Ti sei iscritto a «${c.nome}»`, 'success');
        campo.value = '';
        await aggiorna();
      } catch (err) {
        toast(messaggio(err), 'error');
      } finally {
        vai.disabled = false;
      }
    }
    vai.addEventListener('click', iscriviti);
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') iscriviti(); });

    // Sketch che gli studenti del corso hanno condiviso (solo il docente): solo
    // lettura. Aprirne uno lo mostra nell'editor senza collegarlo al cloud: il
    // «Salva» del docente ne fa una copia sua e l'originale non si tocca mai.
    async function mostraCondivisi(c, sezione) {
      sezione.textContent = '';
      sezione.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
      let r;
      try {
        r = await condivisi.elenca(c.id);
      } catch (err) {
        sezione.textContent = '';
        toast(messaggio(err), 'error');
        return;
      }
      if (finestra !== mia) return;
      sezione.textContent = '';
      sezione.append(el('p', { class: 'sketch-nota' },
        r.sketch.length === 0
          ? `Nessuno sketch condiviso finora (${r.iscritti} iscritti).`
          : `${r.sketch.length} sketch condivisi, ${r.iscritti} iscritti. Si vede l'ultima versione salvata da ciascuno.`));
      for (const s of r.sketch) {
        sezione.append(el('div', { class: 'sketch-riga condiviso-riga' },
          el('div', { class: 'sketch-info' },
            el('strong', {}, `${s.autoreNome} — ${s.nome}`),
            el('span', { class: 'sketch-data' }, s.modificato ? `salvato il ${formatoData.format(s.modificato)}` : '')),
          el('button', { type: 'button', class: 'modal-btn', onclick: () => apri(s) }, 'Apri')));
      }
    }

    function apri(s) {
      if (programma.occupato()) { toast('Interrompi l\'esecuzione prima di aprire uno sketch.', 'error'); return; }
      if (!programma.isVuoto() && !window.confirm(`Aprire lo sketch di ${s.autoreNome}? Il programma corrente andrà perso.`)) return;
      try {
        programma.carica(s.programma);
      } catch (err) {
        toast(err && err.message ? err.message : 'Questo sketch non si riesce ad aprire.', 'error');
        return;
      }
      dopoCaricamento?.();
      chiudiFinestra();
      toast(`Aperto «${s.nome}» di ${s.autoreNome}. È una copia: se lo salvi, lo salvi come tuo sketch.`, 'success');
    }

    async function aggiorna() {
      let elenco;
      try {
        elenco = await corsi.elenca({ archiviati: mostraArchiviati });
      } catch (err) {
        if (finestra === mia) toast(messaggio(err), 'error');
        return;
      }
      if (finestra !== mia) return; // chiusa nel frattempo
      lista.textContent = '';
      if (elenco.length === 0) {
        lista.append(el('p', { class: 'sketch-nota' }, ruolo === 'docente'
          ? 'Non hai ancora corsi. Creane uno con «Nuovo corso».'
          : 'Non sei ancora in nessun corso. Chiedi il codice al tuo docente.'));
        return;
      }
      for (const c of elenco) {
        const docente = c.ruolo === 'docente';
        const dettaglio = docente
          ? `Codice ${c.id} · ${c.attivo ? `iscrizioni ${c.iscrizioniAperte ? 'aperte' : 'chiuse'}` : 'archiviato'}`
          : (c.docenti.length ? `Docente: ${c.docenti.join(', ')}` : '');
        const sezione = el('div', { class: 'condivisi-sezione' });
        const azioni = el('div', { class: 'sketch-azioni' },
          docente && c.attivo ? el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => mostraCondivisi(c, sezione) }, 'Sketch condivisi') : '',
          docente ? el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => gestioneUi.gestisci(c) }, 'Gestisci') : '',
          el('span', { class: 'cloud-badge', 'data-ruolo': docente ? 'docente' : 'studente' }, docente ? 'Docente' : 'Studente'));
        lista.append(el('div', { class: 'corso-blocco' },
          el('div', { class: 'sketch-riga corso-riga' },
            el('div', { class: 'sketch-info' },
              el('strong', {}, c.nome),
              dettaglio ? el('span', { class: 'sketch-data' }, dettaglio) : ''),
            azioni),
          sezione));
      }
    }

    // Un docente non si iscrive ai corsi come studente: niente campo del codice,
    // ma può creare e gestire i propri corsi.
    const archiviati = el('input', { type: 'checkbox' });
    archiviati.checked = mostraArchiviati;
    archiviati.addEventListener('change', () => { mostraArchiviati = archiviati.checked; aggiorna(); });
    const iscrizione = ruolo === 'docente'
      ? [el('div', { class: 'sketch-riga corsi-docente-barra' },
          el('button', { type: 'button', class: 'modal-btn', onclick: () => gestioneUi.nuovoCorso() }, 'Nuovo corso'),
          el('label', { class: 'sketch-data' }, archiviati, ' Mostra anche i corsi archiviati'))]
      : [el('p', { class: 'sketch-nota' }, 'Per entrare in un corso scrivi il codice che ti ha dato il docente.'),
         el('div', { class: 'corsi-iscrizione' }, campo, vai)];
    corpo.append(...iscrizione, el('h3', { class: 'corsi-titolo' }, 'I tuoi corsi'), lista);
    lista.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    ricarica = aggiorna;
    aggiorna();
    if (ruolo !== 'docente') campo.focus();
  }

  return {
    apri,
    entra(corsiDiUtente, ruoloUtente = 'studente', vistaDocente = null, gestione = null) {
      corsi = corsiDiUtente; ruolo = ruoloUtente; condivisi = vistaDocente;
      gestioneUi.entra(gestione);
    },
    esci() {
      corsi = null; condivisi = null; ruolo = 'studente'; mostraArchiviati = false;
      gestioneUi.esci(); chiudiFinestra();
    },
  };
}
