// Interfaccia degli sketch personali: "Salva nel cloud" e "I miei sketch".
// Non conosce Blockly né Firebase: riceve dall'app tre funzioni
// (`programma`) e dal cloud l'oggetto `sketch` di sketch.js.
//
//   programma.corrente()  -> testo JSON del programma (come il file di "Salva")
//   programma.isVuoto()   -> true se non c'è nessuna istruzione
//   programma.occupato()  -> true se è in corso un'esecuzione
//   programma.carica(json)-> sostituisce il programma (lancia se non leggibile)
import { nomeCasuale } from './nomi.js';
import { MAX_SKETCH } from './sketch.js';
import { el, apriFinestra } from './dom.js';

const formatoData = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function montaSketch({ contenitore, toast, programma }) {
  let sketch = null;     // oggetto di sketch.js, valido solo da loggati
  let aperto = null;     // { id, nome } dello sketch cloud attualmente aperto
  let finestra = null;   // finestra aperta (una alla volta)

  const btnSalva = el('button', { type: 'button', title: 'Salva il programma tra i tuoi sketch nel cloud' }, '☁ Salva');
  const btnElenco = el('button', { type: 'button', title: 'Apri uno dei tuoi sketch salvati nel cloud' }, '☁ I miei sketch');
  contenitore.hidden = true;
  contenitore.append(btnSalva, btnElenco);

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

  function chiudiFinestra() { finestra?.chiudi(); finestra = null; }
  function nuovaFinestra(titolo) {
    chiudiFinestra();
    finestra = apriFinestra(titolo, () => { finestra = null; });
    return finestra;
  }

  // --- Salva -------------------------------------------------------------
  btnSalva.addEventListener('click', () => {
    if (programma.isVuoto()) {
      toast('Il programma è vuoto: non c\'è niente da salvare.', 'error');
      return;
    }
    const testo = programma.corrente();
    const { corpo, chiudi } = nuovaFinestra('Salva nel cloud');
    const campo = el('input', { type: 'text', maxlength: '60', class: 'sketch-nome', 'aria-label': 'Nome dello sketch' });
    campo.value = aperto ? aperto.nome : nomeCasuale();
    const nota = el('p', { class: 'sketch-nota' },
      aperto
        ? `Stai lavorando su «${aperto.nome}». Puoi aggiornarlo oppure salvare una copia nuova.`
        : 'Il nome è libero: ti ho proposto un nome a caso, cambialo se vuoi.');
    const bottoni = el('div', { class: 'modal-actions' });
    const tutti = [];

    async function esegui(azione, messaggioOk) {
      tutti.forEach((b) => { b.disabled = true; });
      try {
        await azione();
        toast(messaggioOk, 'success');
        chiudi();
      } catch (err) {
        toast(messaggio(err), 'error');
        tutti.forEach((b) => { b.disabled = false; });
      }
    }
    const aggiungi = (testoBtn, secondario, fn) => {
      const b = el('button', { type: 'button', class: secondario ? 'modal-btn secondary' : 'modal-btn', onclick: fn }, testoBtn);
      tutti.push(b);
      bottoni.append(b);
    };

    if (aperto) {
      const id = aperto.id;
      aggiungi(`Aggiorna «${aperto.nome}»`, false, () => esegui(async () => {
        const nome = campo.value;
        await sketch.aggiorna(id, { nome, programma: testo });
        aperto = { id, nome: nome.trim() };
      }, 'Sketch aggiornato'));
      aggiungi('Salva come nuovo', true, () => esegui(async () => {
        aperto = await sketch.nuovo(campo.value, testo);
      }, 'Sketch salvato nel cloud'));
    } else {
      aggiungi('Salva', false, () => esegui(async () => {
        aperto = await sketch.nuovo(campo.value, testo);
      }, 'Sketch salvato nel cloud'));
    }
    aggiungi('Annulla', true, chiudi);
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tutti[0].click(); });
    corpo.append(nota, campo, bottoni);
    campo.focus();
    campo.select();
  });

  // --- I miei sketch -----------------------------------------------------
  btnElenco.addEventListener('click', () => mostraElenco());

  async function mostraElenco() {
    const { corpo } = nuovaFinestra('I miei sketch');
    const mia = finestra;
    corpo.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    let sketchSalvati;
    try {
      sketchSalvati = await sketch.elenca();
    } catch (err) {
      if (finestra === mia) { chiudiFinestra(); toast(messaggio(err), 'error'); }
      return;
    }
    if (finestra !== mia) return; // chiusa nel frattempo
    corpo.textContent = '';
    corpo.append(el('p', { class: 'sketch-nota' },
      sketchSalvati.length === 0
        ? 'Non hai ancora salvato nessuno sketch nel cloud. Usa «☁ Salva».'
        : `${sketchSalvati.length} di ${MAX_SKETCH} sketch salvati.`));
    for (const s of sketchSalvati) corpo.append(riga(s, mia));
  }

  function riga(s, mia) {
    const quando = s.modificato ? formatoData.format(s.modificato) : '';
    const info = el('div', { class: 'sketch-info' },
      el('strong', {}, s.nome, aperto && aperto.id === s.id ? el('span', { class: 'sketch-aperto' }, ' (aperto)') : ''),
      el('span', { class: 'sketch-data' }, quando ? `modificato il ${quando}` : ''));
    const azioni = el('div', { class: 'sketch-azioni' },
      el('button', { type: 'button', class: 'modal-btn', onclick: () => apri(s) }, 'Apri'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => rinomina(s) }, 'Rinomina'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => elimina(s) }, 'Elimina'));
    return el('div', { class: 'sketch-riga' }, info, azioni);
  }

  function apri(s) {
    if (programma.occupato()) {
      toast('Interrompi l\'esecuzione prima di aprire uno sketch.', 'error');
      return;
    }
    if (!programma.isVuoto() && !window.confirm(`Aprire «${s.nome}»? Il programma corrente andrà perso.`)) return;
    try {
      programma.carica(s.programma);
    } catch (err) {
      toast(err && err.message ? err.message : 'Questo sketch non si riesce ad aprire.', 'error');
      return;
    }
    aperto = { id: s.id, nome: s.nome };
    chiudiFinestra();
    toast(`Aperto «${s.nome}»`, 'success');
  }

  async function rinomina(s) {
    const nuovo = window.prompt('Nuovo nome dello sketch:', s.nome);
    if (nuovo === null) return;
    try {
      await sketch.rinomina(s.id, nuovo);
      if (aperto && aperto.id === s.id) aperto = { id: s.id, nome: nuovo.trim() };
      toast('Sketch rinominato', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      return;
    }
    mostraElenco();
  }

  async function elimina(s) {
    if (!window.confirm(`Eliminare «${s.nome}» dal cloud? Non si può annullare.`)) return;
    try {
      await sketch.elimina(s.id);
      if (aperto && aperto.id === s.id) aperto = null;
      toast('Sketch eliminato', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      return;
    }
    mostraElenco();
  }

  return {
    // Dopo il login: abilita i pulsanti. `sketchDiUtente` è l'oggetto di sketch.js.
    entra(sketchDiUtente) {
      sketch = sketchDiUtente;
      contenitore.hidden = false;
    },
    // Dopo il logout: tutto sparisce e non resta nessun riferimento allo sketch aperto.
    esci() {
      sketch = null;
      aperto = null;
      chiudiFinestra();
      contenitore.hidden = true;
    },
    // Il programma è stato sostituito da altro (Nuovo, file, esempio): lo sketch
    // aperto non è più quello che si vede, "Salva" deve proporne uno nuovo.
    scollega() {
      aperto = null;
    },
  };
}
