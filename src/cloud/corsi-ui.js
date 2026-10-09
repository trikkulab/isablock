// Interfaccia dei corsi: pulsante «Corsi» con l'elenco dei propri corsi e il
// campo per iscriversi con il codice. I corsi si creano da console: qui non c'è
// niente per crearli. Non conosce Firebase: riceve l'oggetto `corsi` di corsi.js.
import { el, apriFinestra } from './dom.js';
import { normalizzaCodice } from './corsi.js';

export function montaCorsi({ contenitore, toast }) {
  let corsi = null;   // oggetto di corsi.js, valido solo da loggati
  let ruolo = 'studente';
  let finestra = null;

  const btn = el('button', { type: 'button', title: 'I tuoi corsi: iscriviti con il codice del docente' }, '🎓 Corsi');
  contenitore.hidden = true;
  contenitore.append(btn);

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';
  function chiudiFinestra() { finestra?.chiudi(); finestra = null; }

  btn.addEventListener('click', () => {
    chiudiFinestra();
    finestra = apriFinestra('I miei corsi', () => { finestra = null; });
    costruisci(finestra);
  });

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

    async function aggiorna() {
      let elenco;
      try {
        elenco = await corsi.elenca();
      } catch (err) {
        if (finestra === mia) toast(messaggio(err), 'error');
        return;
      }
      if (finestra !== mia) return; // chiusa nel frattempo
      lista.textContent = '';
      if (elenco.length === 0) {
        lista.append(el('p', { class: 'sketch-nota' }, 'Non sei ancora in nessun corso. Chiedi il codice al tuo docente.'));
        return;
      }
      for (const c of elenco) {
        const docente = c.ruolo === 'docente';
        const dettaglio = docente
          ? `Codice ${c.id} · iscrizioni ${c.iscrizioniAperte ? 'aperte' : 'chiuse'}`
          : (c.docenti.length ? `Docente: ${c.docenti.join(', ')}` : '');
        lista.append(el('div', { class: 'sketch-riga' },
          el('div', { class: 'sketch-info' },
            el('strong', {}, c.nome),
            dettaglio ? el('span', { class: 'sketch-data' }, dettaglio) : ''),
          el('span', { class: 'cloud-badge', 'data-ruolo': docente ? 'docente' : 'studente' }, docente ? 'Docente' : 'Studente')));
      }
    }

    // Un docente non si iscrive ai corsi come studente: niente campo del codice.
    const iscrizione = ruolo === 'docente'
      ? [el('p', { class: 'sketch-nota' }, 'Sei docente: i corsi (e i codici per gli studenti) si gestiscono dalla console.')]
      : [el('p', { class: 'sketch-nota' }, 'Per entrare in un corso scrivi il codice che ti ha dato il docente.'),
         el('div', { class: 'corsi-iscrizione' }, campo, vai)];
    corpo.append(...iscrizione, el('h3', { class: 'corsi-titolo' }, 'I tuoi corsi'), lista);
    lista.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    aggiorna();
    if (ruolo !== 'docente') campo.focus();
  }

  return {
    entra(corsiDiUtente, ruoloUtente = 'studente') { corsi = corsiDiUtente; ruolo = ruoloUtente; contenitore.hidden = false; },
    esci() { corsi = null; ruolo = 'studente'; chiudiFinestra(); contenitore.hidden = true; },
  };
}
