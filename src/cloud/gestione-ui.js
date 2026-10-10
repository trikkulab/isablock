// Interfaccia del docente per i corsi: la finestra «Nuovo corso» e la finestra
// «Gestisci» di un corso (codice, iscritti, codocenti, dati, archivia). Si apre da
// «Corsi» (corsi-ui.js). Non conosce Firebase: riceve l'oggetto di gestione-corsi.js.
// Niente innerHTML: nomi ed email vengono dagli utenti, sempre textContent.
import { el, apriFinestra } from './dom.js';
import { analizzaElencoEmail, annoCorrente, MAX_MATERIA, MAX_CLASSE, MAX_NOME_CORSO } from './gestione-corsi.js';

const MAX_INCOLLA = 60; // email per volta: oltre, si divide in due giri

export function montaGestione({ toast, dopoCambio }) {
  let gestione = null;
  let finestre = new Set();

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';
  const apri = (titolo) => {
    const f = apriFinestra(titolo, () => finestre.delete(f));
    finestre.add(f);
    return f;
  };
  const chiudiTutte = () => { for (const f of [...finestre]) f.chiudi(); finestre = new Set(); };

  const campo = (etichetta, attrs) => {
    const input = el('input', { type: 'text', class: 'sketch-nome', autocomplete: 'off', spellcheck: 'false', ...attrs });
    return { input, riga: el('label', { class: 'gestione-campo' }, el('span', { class: 'sketch-data' }, etichetta), input) };
  };
  const sezione = (titolo, ...figli) => el('div', { class: 'gestione-sezione' }, el('h3', { class: 'corsi-titolo' }, titolo), ...figli);

  // --- Nuovo corso -------------------------------------------------------
  function nuovoCorso() {
    const f = apri('Nuovo corso');
    const materia = campo('Materia', { value: 'Informatica', maxlength: String(MAX_MATERIA) });
    const classe = campo('Classe (es. 3AINF)', { maxlength: String(MAX_CLASSE) });
    const anno = campo('Anno scolastico', { value: annoCorrente(), maxlength: '7', placeholder: '2026/27' });
    const nome = campo('Nome (facoltativo)', { maxlength: String(MAX_NOME_CORSO), placeholder: 'se vuoto: materia – classe (anno)' });
    const crea = el('button', { type: 'button', class: 'modal-btn' }, 'Crea corso');
    const invia = async () => {
      crea.disabled = true;
      try {
        const c = await gestione.crea({ materia: materia.input.value, classe: classe.input.value,
          annoScolastico: anno.input.value, nome: nome.input.value });
        f.chiudi();
        toast(`Corso creato. Codice: ${c.id}`, 'success');
        dopoCambio?.();
        gestisci(c);
      } catch (err) {
        toast(messaggio(err), 'error');
        crea.disabled = false;
      }
    };
    crea.addEventListener('click', invia);
    f.corpo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') invia(); });
    f.corpo.append(
      el('p', { class: 'sketch-nota' }, 'Il codice per gli studenti lo genera IsaBlock. Dopo la creazione potrai aggiungere gli iscritti e i codocenti.'),
      materia.riga, classe.riga, anno.riga, nome.riga,
      el('div', { class: 'modal-actions' }, crea, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, 'Annulla')));
    classe.input.focus();
  }

  // --- Gestisci un corso -------------------------------------------------
  async function gestisci(corsoIniziale) {
    let corso = corsoIniziale;
    const f = apri(`Gestisci: ${corso.nome}`);
    const titolo = f.corpo.parentElement.querySelector('h2');
    const aperta = () => finestre.has(f); // la finestra è ancora aperta?

    const boxCodice = el('div');
    const boxIscritti = el('div');
    const boxDocenti = el('div');
    const boxDati = el('div');
    const boxArchivia = el('div');
    f.corpo.append(boxCodice, boxIscritti, boxDocenti, boxDati, boxArchivia);

    async function rileggi() {
      corso = await gestione.leggi(corso.id);
      if (titolo) titolo.textContent = `Gestisci: ${corso.nome}`;
    }
    const esegui = async (fn, ok) => {
      try {
        await fn();
        if (ok) toast(ok, 'success');
        return true;
      } catch (err) {
        toast(messaggio(err), 'error');
        return false;
      }
    };

    // Codice e iscrizioni aperte/chiuse
    function disegnaCodice() {
      boxCodice.textContent = '';
      const copia = el('button', { type: 'button', class: 'modal-btn secondary', onclick: async () => {
        try { await navigator.clipboard.writeText(corso.id); toast('Codice copiato.', 'success'); }
        catch { toast(`Copia a mano il codice: ${corso.id}`, 'error'); }
      } }, 'Copia');
      const commuta = el('button', { type: 'button', class: 'modal-btn secondary', onclick: async () => {
        const ok = await esegui(async () => {
          await gestione.impostaIscrizioniAperte(corso.id, !corso.iscrizioniAperte);
          await rileggi();
        });
        if (ok && aperta()) { disegnaCodice(); dopoCambio?.(); }
      } }, corso.iscrizioniAperte ? 'Chiudi le iscrizioni' : 'Apri le iscrizioni');
      boxCodice.append(sezione('Codice per gli studenti',
        el('div', { class: 'sketch-riga corso-riga' },
          el('strong', { class: 'codice-grande' }, corso.id),
          el('div', { class: 'sketch-azioni' }, copia)),
        el('p', { class: 'sketch-nota' }, corso.iscrizioniAperte
          ? 'Gli studenti entrano da «Corsi» scrivendo questo codice. Le iscrizioni sono aperte.'
          : 'Le iscrizioni sono chiuse: col codice non entra nessuno. Puoi comunque aggiungere gli studenti a mano, qui sotto.'),
        el('div', { class: 'sketch-azioni' }, commuta)));
    }

    // Iscritti
    async function disegnaIscritti() {
      boxIscritti.textContent = '';
      let elenco;
      try { elenco = await gestione.iscritti(corso.id); } catch (err) { toast(messaggio(err), 'error'); return; }
      if (!aperta()) return;
      const area = el('textarea', { class: 'sketch-nome gestione-area', rows: '3', spellcheck: 'false',
        placeholder: 'Incolla qui le email degli studenti (una per riga, o separate da virgole)', 'aria-label': 'Email degli studenti da aggiungere' });
      const esito = el('p', { class: 'sketch-nota', hidden: '' });
      const aggiungi = el('button', { type: 'button', class: 'modal-btn' }, 'Aggiungi');
      aggiungi.addEventListener('click', async () => {
        const { valide, doppie } = analizzaElencoEmail(area.value);
        if (valide.length === 0) { toast('Non trovo nessuna email nel testo.', 'error'); return; }
        if (valide.length > MAX_INCOLLA) { toast(`Al massimo ${MAX_INCOLLA} email per volta: dividi l'elenco.`, 'error'); return; }
        aggiungi.disabled = true;
        try {
          const r = await gestione.aggiungiIscritti(corso.id, valide);
          const parti = [`Aggiunti ${r.aggiunte.length}`];
          if (r.gia.length) parti.push(`già iscritti ${r.gia.length}`);
          if (doppie) parti.push(`doppioni ignorati ${doppie}`);
          if (r.rifiutate.length) parti.push(`non accettati ${r.rifiutate.length}`);
          toast(parti.join(', ') + '.', r.rifiutate.length ? 'error' : 'success');
          if (r.aggiunte.length) { await disegnaIscritti(); }
          if (r.rifiutate.length && aperta()) {
            // l'elenco si ridisegna: l'esito dei non accettati va mostrato dopo
            const nuovo = boxIscritti.querySelector('.gestione-esito');
            if (nuovo) {
              nuovo.hidden = false;
              nuovo.textContent = `Non accettati (email non della scuola, di un docente, o corso archiviato): ${r.rifiutate.join(', ')}`;
            }
          }
          if (!r.aggiunte.length) aggiungi.disabled = false;
        } catch (err) {
          toast(messaggio(err), 'error');
          aggiungi.disabled = false;
        }
      });
      esito.classList.add('gestione-esito');
      const righe = elenco.map((e) => el('div', { class: 'sketch-riga' },
        el('span', { class: 'gestione-email' }, e),
        el('div', { class: 'sketch-azioni' }, el('button', { type: 'button', class: 'modal-btn secondary', onclick: async () => {
          if (!window.confirm(`Togliere ${e} dal corso? Non vedrà più il corso e tu non vedrai più i suoi sketch condivisi.`)) return;
          if (await esegui(() => gestione.togli(corso.id, e), `${e} tolto dal corso.`) && aperta()) { disegnaIscritti(); dopoCambio?.(); }
        } }, 'Togli'))));
      boxIscritti.append(sezione(`Iscritti (${elenco.length})`,
        elenco.length ? el('div', { class: 'gestione-iscritti' }, ...righe) : el('p', { class: 'sketch-nota' }, 'Nessun iscritto per ora.'),
        el('p', { class: 'sketch-nota' }, 'Aggiungere uno studente a mano funziona anche a iscrizioni chiuse. Se le iscrizioni sono aperte, chi hai tolto può rientrare col codice.'),
        area, esito, el('div', { class: 'sketch-azioni' }, aggiungi)));
    }

    // Docenti
    function disegnaDocenti() {
      boxDocenti.textContent = '';
      const nuova = campo('Email del docente da aggiungere', { type: 'email', placeholder: 'nome.cognome@…' });
      const aggiungi = el('button', { type: 'button', class: 'modal-btn' }, 'Aggiungi');
      aggiungi.addEventListener('click', async () => {
        aggiungi.disabled = true;
        const ok = await esegui(async () => {
          await gestione.aggiungiCodocente(corso.id, nuova.input.value);
          await rileggi();
        }, 'Codocente aggiunto.');
        if (aperta()) { if (ok) disegnaDocenti(); else aggiungi.disabled = false; }
      });
      const righe = corso.docenti.map((e, i) => el('div', { class: 'sketch-riga' },
        el('span', { class: 'gestione-email' }, e, i === 0 ? el('span', { class: 'sketch-data' }, ' · titolare') : ''),
        i === 0 ? '' : el('div', { class: 'sketch-azioni' }, el('button', { type: 'button', class: 'modal-btn secondary', onclick: async () => {
          if (!window.confirm(`Togliere ${e} dai docenti del corso?`)) return;
          const ok = await esegui(async () => { await gestione.togliCodocente(corso.id, e); await rileggi(); }, 'Docente tolto.');
          if (ok) { dopoCambio?.(); if (aperta()) disegnaDocenti(); }
        } }, 'Togli'))));
      boxDocenti.append(sezione('Docenti del corso',
        el('div', {}, ...righe),
        el('p', { class: 'sketch-nota' }, 'I codocenti vedono e gestiscono il corso come te e leggono gli sketch condivisi. Si possono aggiungere solo docenti già abilitati. Il titolare non si toglie.'),
        nuova.riga, el('div', { class: 'sketch-azioni' }, aggiungi)));
    }

    // Dati del corso
    function disegnaDati() {
      boxDati.textContent = '';
      const materia = campo('Materia', { value: corso.materia, maxlength: String(MAX_MATERIA) });
      const classe = campo('Classe', { value: corso.classe, maxlength: String(MAX_CLASSE) });
      const anno = campo('Anno scolastico', { value: corso.annoScolastico, maxlength: '7' });
      const nome = campo('Nome (facoltativo)', { value: corso.nomeScritto, maxlength: String(MAX_NOME_CORSO) });
      const salva = el('button', { type: 'button', class: 'modal-btn' }, 'Salva modifiche');
      salva.addEventListener('click', async () => {
        salva.disabled = true;
        const ok = await esegui(async () => {
          await gestione.modifica(corso.id, { materia: materia.input.value, classe: classe.input.value,
            annoScolastico: anno.input.value, nome: nome.input.value });
          await rileggi();
        }, 'Modifiche salvate.');
        if (ok) dopoCambio?.();
        if (aperta()) disegnaDati();
      });
      boxDati.append(sezione('Dati del corso', materia.riga, classe.riga, anno.riga, nome.riga, el('div', { class: 'sketch-azioni' }, salva)));
    }

    // Archivia / riattiva
    function disegnaArchivia() {
      boxArchivia.textContent = '';
      const btn = el('button', { type: 'button', class: 'modal-btn secondary', onclick: async () => {
        if (corso.attivo && !window.confirm('Archiviare il corso? Gli studenti non lo vedranno più e tu non vedrai più i loro sketch condivisi. Si può riattivare in ogni momento.')) return;
        const ok = await esegui(async () => { await gestione.impostaAttivo(corso.id, !corso.attivo); await rileggi(); },
          corso.attivo ? 'Corso attivato di nuovo.' : 'Corso archiviato.');
        if (ok) { dopoCambio?.(); if (aperta()) disegnaArchivia(); }
      } }, corso.attivo ? 'Archivia il corso' : 'Riattiva il corso');
      boxArchivia.append(sezione(corso.attivo ? 'Fine anno' : 'Corso archiviato',
        el('p', { class: 'sketch-nota' }, corso.attivo
          ? 'Un corso non si cancella: si archivia, e sparisce dagli elenchi degli studenti.'
          : 'Il corso è archiviato: gli studenti non lo vedono e le iscrizioni col codice non funzionano.'),
        el('div', { class: 'sketch-azioni' }, btn)));
    }

    disegnaCodice(); disegnaDocenti(); disegnaDati(); disegnaArchivia();
    await disegnaIscritti();
  }

  return {
    nuovoCorso, gestisci,
    entra(gestioneDiUtente) { gestione = gestioneDiUtente; },
    esci() { gestione = null; chiudiTutte(); },
  };
}
