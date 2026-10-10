// Interfaccia degli sketch personali: «Salva nel cloud» e «I miei sketch», che il
// menu «Cloud» (ui.js) chiama con salva() ed elenco(). Non ha pulsanti propri.
// Non conosce Blockly né Firebase: riceve dall'app le funzioni di `programma`
// e dal cloud l'oggetto `sketch` di sketch.js.
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

export function montaSketch({ toast, programma, commentiUi }) {
  let sketch = null;     // oggetto di sketch.js, valido solo da loggati
  let corsi = null;      // oggetto di corsi.js: per scegliere con quale corso condividere
  let nomiCorsi = new Map(); // codice -> nome del corso, per le etichette «condiviso con…»
  let aperto = null;     // { id, nome, condivisoCon } dello sketch cloud attualmente aperto
  let finestra = null;   // finestra aperta (una alla volta)

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

  function chiudiFinestra() { finestra?.chiudi(); finestra = null; }
  function nuovaFinestra(titolo) {
    chiudiFinestra();
    finestra = apriFinestra(titolo, () => { finestra = null; });
    return finestra;
  }

  // --- Salva -------------------------------------------------------------
  function salva() {
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
    const avvisoCondiviso = aperto && aperto.condivisoCon
      ? el('p', { class: 'sketch-nota sketch-avviso' },
          `Questo sketch è condiviso con ${nomeCorsoDi(aperto.condivisoCon)}: se lo aggiorni, il docente vedrà la nuova versione.`)
      : null;
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
        aperto = { ...aperto, id, nome: nome.trim() };
      }, 'Sketch aggiornato'));
      aggiungi('Salva come nuovo', true, () => esegui(async () => {
        aperto = { ...(await sketch.nuovo(campo.value, testo)), condivisoCon: null };
        commentiUi.nascondi(); // i commenti erano dell'altro sketch
      }, 'Sketch salvato nel cloud'));
    } else {
      aggiungi('Salva', false, () => esegui(async () => {
        aperto = { ...(await sketch.nuovo(campo.value, testo)), condivisoCon: null };
      }, 'Sketch salvato nel cloud'));
    }
    aggiungi('Annulla', true, chiudi);
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tutti[0].click(); });
    corpo.append(nota, ...(avvisoCondiviso ? [avvisoCondiviso] : []), campo, bottoni);
    campo.focus();
    campo.select();
  }

  // --- I miei sketch -----------------------------------------------------
  async function mostraElenco() {
    const { corpo } = nuovaFinestra('I miei sketch');
    const mia = finestra;
    corpo.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    let sketchSalvati;
    try {
      [sketchSalvati] = await Promise.all([sketch.elenca(), caricaNomiCorsi()]);
      await commentiUi.aggiornaDaElenco(sketchSalvati); // rilegge i commenti e toglie gli orfani
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

  // Nomi dei corsi per le etichette; se non si riesce a leggerli non è grave.
  async function caricaNomiCorsi() {
    try {
      nomiCorsi = new Map((await corsi.elenca()).map((c) => [c.id, c.nome]));
    } catch { /* si usa il codice al posto del nome */ }
  }
  const nomeCorsoDi = (codice) => nomiCorsi.get(codice) || `il corso ${codice}`;

  function riga(s, mia) {
    const quando = s.modificato ? formatoData.format(s.modificato) : '';
    const info = el('div', { class: 'sketch-info' },
      el('strong', {}, s.nome, aperto && aperto.id === s.id ? el('span', { class: 'sketch-aperto' }, ' (aperto)') : ''),
      el('span', { class: 'sketch-data' }, quando ? `modificato il ${quando}` : ''),
      s.condivisoCon ? el('span', { class: 'sketch-condiviso' }, `👁 condiviso con ${nomeCorsoDi(s.condivisoCon)}`) : '',
      etichettaCommenti(s));
    const azioni = el('div', { class: 'sketch-azioni' },
      el('button', { type: 'button', class: 'modal-btn', onclick: () => apri(s) }, 'Apri'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => condividi(s) }, 'Condividi…'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => rinomina(s) }, 'Rinomina'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => elimina(s) }, 'Elimina'));
    return el('div', { class: 'sketch-riga' }, info, azioni);
  }

  // «💬 2 commenti del docente (1 nuovo)» sotto lo sketch, se ce ne sono.
  function etichettaCommenti(s) {
    const { totali, nuovi } = commentiUi.info(s.id, s.creatoTs);
    if (totali === 0) return '';
    const testo = `💬 ${totali} ${totali === 1 ? 'commento' : 'commenti'} del docente${nuovi ? ` (${nuovi} ${nuovi === 1 ? 'nuovo' : 'nuovi'})` : ''}`;
    return el('span', { class: nuovi ? 'sketch-condiviso commento-nuovi-etichetta' : 'sketch-condiviso' }, testo);
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
    aperto = { id: s.id, nome: s.nome, condivisoCon: s.condivisoCon };
    chiudiFinestra();
    toast(`Aperto «${s.nome}»`, 'success');
    // se il docente ha commentato, il pannello compare accanto al codice
    commentiUi.mostra({ id: s.id, nome: s.nome, creatoTs: s.creatoTs, modificato: s.modificato });
  }

  // Condivisione con il docente di un corso in cui si è iscritti. Il docente vede
  // l'ultima versione salvata nel cloud; si può ritirare in ogni momento.
  async function condividi(s) {
    let miei;
    try {
      miei = (await corsi.elenca()).filter((c) => c.ruolo === 'studente');
    } catch (err) {
      toast(messaggio(err), 'error');
      return;
    }
    if (miei.length === 0) {
      toast('Non sei iscritto a nessun corso: iscriviti con il codice dal pulsante «🎓 Corsi».', 'error');
      return;
    }
    const mia = nuovaFinestra(`Condividi «${s.nome}»`);
    const { corpo, chiudi } = mia;
    corpo.append(el('p', { class: 'sketch-nota' },
      'Scegli il corso: il docente vedrà l\'ultima versione di questo sketch che hai salvato nel cloud. Non può modificarla, e puoi smettere di condividere quando vuoi.'));
    const tutti = [];
    async function scegli(codice, nomeCorso) {
      tutti.forEach((b) => { b.disabled = true; });
      try {
        await sketch.condividi(s.id, codice);
        if (aperto && aperto.id === s.id) aperto = { ...aperto, condivisoCon: codice };
        toast(codice ? `Sketch condiviso con ${nomeCorso}` : 'Condivisione ritirata', 'success');
        mostraElenco();
      } catch (err) {
        toast(messaggio(err), 'error');
        tutti.forEach((b) => { b.disabled = false; });
      }
    }
    for (const c of miei) {
      nomiCorsi.set(c.id, c.nome);
      const attuale = s.condivisoCon === c.id;
      const b = el('button', { type: 'button', class: 'modal-btn corso-scelta',
        onclick: () => scegli(c.id, c.nome) }, attuale ? `${c.nome} (già condiviso)` : c.nome);
      if (attuale) b.disabled = true; // quello attuale non si sceglie di nuovo
      else tutti.push(b);
      corpo.append(b);
    }
    const azioni = el('div', { class: 'modal-actions' });
    if (s.condivisoCon) {
      const b = el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => scegli(null) }, 'Smetti di condividere');
      tutti.push(b);
      azioni.append(b);
    }
    azioni.append(el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => mostraElenco() }, 'Indietro'));
    corpo.append(azioni);
  }

  async function rinomina(s) {
    const nuovo = window.prompt('Nuovo nome dello sketch:', s.nome);
    if (nuovo === null) return;
    try {
      await sketch.rinomina(s.id, nuovo);
      if (aperto && aperto.id === s.id) aperto = { ...aperto, nome: nuovo.trim() };
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
      commentiUi.dopoEliminazione(s.id); // i commenti di uno sketch che non c'è più non servono
      toast('Sketch eliminato', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      return;
    }
    mostraElenco();
  }

  return {
    salva,
    elenco: () => mostraElenco(),
    // Dopo il login: abilita i pulsanti. `sketchDiUtente` è l'oggetto di sketch.js.
    entra(sketchDiUtente, corsiDiUtente) {
      sketch = sketchDiUtente;
      corsi = corsiDiUtente;
    },
    // Dopo il logout: tutto sparisce e non resta nessun riferimento allo sketch aperto.
    esci() {
      sketch = null;
      corsi = null;
      nomiCorsi = new Map();
      aperto = null;
      chiudiFinestra();
    },
    // Il programma è stato sostituito da altro (Nuovo, file, esempio): lo sketch
    // aperto non è più quello che si vede, "Salva" deve proporne uno nuovo.
    scollega() {
      aperto = null;
    },
  };
}
