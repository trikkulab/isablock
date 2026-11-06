// Interfaccia del docente per le verifiche di un corso: l'elenco («Verifiche» nel corso), la
// creazione e la scheda di una verifica con le sue tracce (editor Markdown con anteprima).
// Non conosce Firebase: riceve l'oggetto di verifica-docente.js. Niente innerHTML (titoli e testi
// vengono dagli utenti, sempre textContent): l'unica eccezione è l'anteprima del Markdown, che sta
// in editor-markdown.js e usa solo l'output sicuro di markdown.js.
//
// In questa versione: elenco, creazione in bozza, scheda con titolo, fine prevista e tracce.
// L'assegnazione per studente e l'apertura della verifica arrivano nei passi successivi.
import { el, apriFinestra } from './dom.js';
import { creaEditorMarkdown } from './editor-markdown.js';
import { rendiMarkdown } from './markdown.js';
import { verificaConfig } from './verifica-config.js';
import { perCampo, daCampo, finePredefinita, formatoDataOra } from './data-ora.js';
import { creaTabellaLive } from './verifica-tabella-ui.js';
import { apriAnteprima } from './verifica-anteprima-ui.js';
import { testoApertura, testoChiusura, testoRiapertura, testoArchivia, esitoRaccolta } from './testi-verifica.js';

const L = verificaConfig.regole;
const C = verificaConfig.client;
const STATI = { bozza: 'Bozza', aperta: 'Aperta', chiusa: 'Chiusa', archiviata: 'Archiviata' };

// Scelta della fine di una verifica che si apre (o si riapre): «dura N minuti da adesso» oppure «finisce alle...».
// Il calcolo si fa al momento del clic (calcola()), non quando si apre la finestra: «da adesso» deve voler dire adesso.
function scegliFine({ durataMin }) {
  const nome = `fine-${Math.random().toString(36).slice(2)}`;
  const rDurata = el('input', { type: 'radio', name: nome, 'aria-label': 'Durata in minuti' });
  const rOra = el('input', { type: 'radio', name: nome, 'aria-label': 'Ora di fine' });
  rDurata.checked = true;
  const durata = el('input', { type: 'number', min: '5', max: String(C.durataMaxMin), step: '5', class: 'sketch-nome scegli-fine-num', value: String(durataMin),
    'aria-label': 'Minuti dall\'apertura' });
  const ora = el('input', { type: 'datetime-local', class: 'sketch-nome', value: perCampo(finePredefinita(new Date(), 2)), 'aria-label': 'Data e ora di fine' });
  const anteprima = el('p', { class: 'sketch-nota scegli-fine-anteprima', 'aria-live': 'polite' });

  function calcola() {
    if (rDurata.checked) {
      const n = Number(durata.value);
      if (!Number.isInteger(n) || n < 5 || n > C.durataMaxMin) return { errore: `La durata va da 5 a ${C.durataMaxMin} minuti.` };
      return { fine: new Date(Date.now() + n * 60000), durataMin: n };
    }
    const d = daCampo(ora.value);
    if (!d) return { errore: 'Indica data e ora della fine.' };
    if (d.getTime() <= Date.now()) return { errore: 'La fine deve essere nel futuro.' };
    return { fine: d, durataMin: null };
  }
  const aggiorna = () => {
    const r = calcola();
    anteprima.textContent = r.errore ?? `Finirà ${formatoDataOra.format(r.fine)}.`;
  };
  durata.addEventListener('input', () => { rDurata.checked = true; aggiorna(); });
  durata.addEventListener('focus', () => { rDurata.checked = true; aggiorna(); });
  ora.addEventListener('input', () => { rOra.checked = true; aggiorna(); });
  ora.addEventListener('focus', () => { rOra.checked = true; aggiorna(); });
  rDurata.addEventListener('change', aggiorna);
  rOra.addEventListener('change', aggiorna);

  const elemento = el('div', { class: 'scegli-fine' },
    el('label', { class: 'scegli-fine-riga' }, rDurata, ' Dura ', durata, ' minuti da adesso'),
    el('label', { class: 'scegli-fine-riga' }, rOra, ' Finisce alle ', ora),
    anteprima);
  aggiorna();
  // «da adesso» si sposta col tempo: l'anteprima si aggiorna finché la finestra è aperta
  const giro = setInterval(() => { if (!elemento.isConnected) clearInterval(giro); else aggiorna(); }, 20000);
  return { elemento, calcola };
}

export function montaVerifiche({ toast, programma = null }) {
  let vd = null;                 // oggetto di verifica-docente.js, valido solo da docenti loggati
  let finestre = new Set();
  let mostraArchiviate = false;  // casella dell'elenco, come «Mostra anche i corsi archiviati»

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';
  const apri = (titolo, onChiudi, opzioni) => {
    const f = apriFinestra(titolo, () => { finestre.delete(f); onChiudi?.(); }, opzioni);
    finestre.add(f);
    return f;
  };
  const chiudiTutte = () => { for (const f of [...finestre]) f.chiudi(); finestre = new Set(); };
  const badge = (stato) => el('span', { class: 'stato-corso', 'data-stato': stato }, STATI[stato] ?? stato);
  const campo = (etichetta, input, nota) => el('label', { class: 'gestione-campo' },
    el('span', { class: 'sketch-data' }, etichetta), input, nota ? el('span', { class: 'sketch-nota verifica-nota' }, nota) : '');

  // ── Elenco delle verifiche di un corso ────────────────────────────────────
  function elenco(corso) {
    const f = apri(`Verifiche: ${corso.nome}`);
    const lista = el('div', { class: 'corsi-lista' });
    const casellaArchiviate = el('input', { type: 'checkbox' });
    casellaArchiviate.checked = mostraArchiviate;
    casellaArchiviate.addEventListener('change', () => { mostraArchiviate = casellaArchiviate.checked; ricarica(); });
    f.corpo.append(
      el('p', { class: 'sketch-nota' }, 'Qui prepari le verifiche del corso: scrivi le tracce, e quando è il momento apri la verifica.'),
      el('div', { class: 'sketch-riga corsi-docente-barra' },
        el('button', { type: 'button', class: 'modal-btn', onclick: () => nuova(corso, ricarica) }, 'Nuova verifica'),
        el('label', { class: 'sketch-data' }, casellaArchiviate, ' Mostra anche le verifiche archiviate')),
      el('h3', { class: 'corsi-titolo' }, 'Verifiche'), lista);

    async function ricarica() {
      let verifiche;
      try { verifiche = await vd.verifiche.elenca(corso.id); } catch (err) {
        if (finestre.has(f)) toast(messaggio(err), 'error');
        return;
      }
      if (!finestre.has(f)) return;
      lista.textContent = '';
      const nascoste = verifiche.filter((v) => v.archiviata).length;
      if (!mostraArchiviate) verifiche = verifiche.filter((v) => !v.archiviata);
      if (verifiche.length === 0) {
        lista.append(el('p', { class: 'sketch-nota' }, nascoste
          ? `Nessuna verifica da mostrare (${nascoste} archiviat${nascoste === 1 ? 'a' : 'e'}: spunta «Mostra anche le verifiche archiviate»).`
          : 'Nessuna verifica ancora. Creane una con «Nuova verifica».'));
        return;
      }
      for (const v of verifiche) {
        lista.append(el('div', { class: `sketch-riga${v.archiviata ? ' verifica-archiviata' : ''}` },
          el('div', { class: 'sketch-info' },
            el('strong', {}, v.titolo),
            el('span', { class: 'sketch-data' }, badge(v.stato), v.archiviata ? ' ' : '', v.archiviata ? badge('archiviata') : '',
              v.fine ? ` · fine prevista ${formatoDataOra.format(v.fine)}` : '')),
          el('button', { type: 'button', class: 'modal-btn', onclick: () => scheda(corso, v.id, ricarica) }, 'Apri')));
      }
    }
    lista.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    ricarica();
  }

  // ── Nuova verifica ────────────────────────────────────────────────────────
  function nuova(corso, dopo) {
    const f = apri('Nuova verifica');
    const titolo = el('input', { type: 'text', class: 'sketch-nome', maxlength: String(L.maxTitoloVerifica), autocomplete: 'off',
      placeholder: 'Per esempio: Verifica di novembre' });
    const fine = el('input', { type: 'datetime-local', class: 'sketch-nome', value: perCampo(finePredefinita()) });
    const crea = el('button', { type: 'button', class: 'modal-btn' }, 'Crea in bozza');
    const invia = async () => {
      const d = daCampo(fine.value);
      if (!titolo.value.trim()) { toast('Scrivi il titolo della verifica.', 'error'); return; }
      if (!d) { toast('Indica data e ora della fine prevista.', 'error'); return; }
      crea.disabled = true;
      try {
        const v = await vd.crea(corso.id, { titolo: titolo.value, fine: d });
        f.chiudi();
        dopo?.();
        scheda(corso, v.id, dopo);
      } catch (err) {
        toast(messaggio(err), 'error');
        crea.disabled = false;
      }
    };
    crea.addEventListener('click', invia);
    f.corpo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') invia(); });
    f.corpo.append(
      el('p', { class: 'sketch-nota' }, 'La verifica nasce in bozza: gli studenti non la vedono finché non la apri.'),
      campo('Titolo', titolo),
      campo('Fine prevista', fine, 'Provvisoria: all\'apertura potrai scegliere la durata a partire da quel momento.'),
      el('div', { class: 'modal-actions' }, crea, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, 'Annulla')));
    titolo.focus();
  }

  // ── Scheda di una verifica ────────────────────────────────────────────────
  async function scheda(corso, vid, dopo) {
    let verifica;
    let tracce;
    let selezione = null;          // id di una traccia, 'nuova' oppure null
    let modificata = () => false;  // la traccia nell'editor ha modifiche non salvate?
    let editor = null;

    let chiudiTabella = () => {};
    const f = apri('Verifica', () => { chiudiTabella(); dopo?.(); }, {
      larga: true,
      puoChiudere: () => !modificata() || window.confirm('Ci sono modifiche non salvate a una traccia. Chiudere senza salvarle?'),
    });
    const intestazione = f.corpo.parentElement.querySelector('h2');
    f.corpo.append(el('p', { class: 'sketch-nota' }, 'Carico…'));
    try {
      [verifica, tracce] = await Promise.all([vd.verifiche.leggi(vid), vd.verifiche.tracce(vid)]);
    } catch (err) {
      toast(messaggio(err), 'error');
      f.chiudi();
      return;
    }
    if (!finestre.has(f)) return;
    f.corpo.textContent = '';

    const stato = () => verifica.stato;
    const bozza = () => stato() === 'bozza';
    const scrivibile = () => stato() !== 'chiusa';          // tracce e dati modificabili (a verifica aperta: con «Pubblica»)
    const titoloFinestra = () => { intestazione.textContent = `Verifica: ${verifica.titolo} · ${corso.nome}`; };
    titoloFinestra();

    // --- Testata: titolo, fine prevista, stato -----------------------------
    const titolo = el('input', { type: 'text', class: 'sketch-nome', maxlength: String(L.maxTitoloVerifica), autocomplete: 'off' });
    titolo.value = verifica.titolo;
    const fine = el('input', { type: 'datetime-local', class: 'sketch-nome' });
    fine.value = verifica.fine ? perCampo(verifica.fine) : '';
    const esito = el('span', { class: 'sketch-data verifica-esito', 'aria-live': 'polite' });
    titolo.disabled = !scrivibile();
    fine.disabled = !scrivibile();
    let timerEsito = null;
    async function salvaDati(fn) {
      esito.textContent = 'Salvo…';
      try {
        await fn();
        esito.textContent = 'Salvato ✓';
        clearTimeout(timerEsito);
        timerEsito = setTimeout(() => { esito.textContent = ''; }, 2500);
      } catch (err) {
        esito.textContent = '';
        toast(messaggio(err), 'error');
        titolo.value = verifica.titolo;
        fine.value = verifica.fine ? perCampo(verifica.fine) : '';
      }
    }
    titolo.addEventListener('change', () => {
      if (!titolo.value.trim()) { titolo.value = verifica.titolo; toast('Il titolo non può essere vuoto.', 'error'); return; }
      salvaDati(async () => { await vd.verifiche.modifica(vid, { titolo: titolo.value }); verifica = await vd.verifiche.leggi(vid); titoloFinestra(); });
    });
    fine.addEventListener('change', () => {
      const d = daCampo(fine.value);
      if (!d) { fine.value = verifica.fine ? perCampo(verifica.fine) : ''; toast('Indica data e ora della fine prevista.', 'error'); return; }
      salvaDati(async () => { await vd.cambiaFine(vid, d); verifica = await vd.verifiche.leggi(vid); aggiornaAssegnazioni(); });
    });
    const avviso = {
      aperta: 'Verifica aperta: le modifiche alle tracce sono visibili subito agli studenti (che vedranno un avviso di traccia aggiornata).',
      chiusa: verifica.archiviata
        ? 'Verifica chiusa e archiviata: non compare nell\'elenco finché non la ripristini. Le tracce si possono solo leggere.'
        : 'Verifica chiusa: le tracce si possono solo leggere.',
    }[stato()];
    f.corpo.append(
      el('div', { class: 'verifica-testata' },
        campo('Titolo', titolo),
        campo(bozza() ? 'Fine prevista (provvisoria)' : 'Fine prevista', fine),
        el('div', { class: 'verifica-stato' }, badge(stato()), verifica.archiviata ? badge('archiviata') : '', esito)),
      avviso ? el('p', { class: 'sketch-nota verifica-avviso' }, avviso) : '');

    // --- Azioni sullo stato: aprire, chiudere (e raccogliere), riaprire, archiviare ------
    // Ogni cambio di stato passa da una finestra di conferma con il testo che il docente deve leggere (testi-verifica.js).
    // La situazione live (passo 9) sta nella scheda «Situazione», sotto.
    const azioni = el('div', { class: 'verifica-azioni' });
    const bottone = (testo, fn, primario = false) => el('button', { type: 'button', class: `modal-btn${primario ? '' : ' secondary'}`, onclick: fn }, testo);
    if (bozza()) azioni.append(bottone('Apri verifica…', () => dialogoApertura(), true));
    else if (stato() === 'aperta') azioni.append(bottone('Chiudi verifica…', () => dialogoChiusura(), true));
    else if (verifica.archiviata) azioni.append(bottone('Ripristina', () => ripristinaVerifica()));
    else azioni.append(bottone('Raccogli i lavori', () => raccogliLavori()), bottone('Riapri…', () => dialogoRiapertura()), bottone('Archivia…', () => archiviaVerifica()));
    f.corpo.append(azioni);

    // Dopo un cambio di stato la scheda si richiude e si riapre aggiornata.
    function riapriScheda() {
      modificata = () => false;
      f.chiudi();
      scheda(corso, vid, dopo);
    }

    // Finestra di conferma: paragrafi, avvertenza in evidenza, contenuto extra, e [azione] [Annulla].
    function dialogo({ titolo: titoloDialogo, righe = [], avvertenza = null, extra = [], etichetta, impedimento = null, onConferma }) {
      const d = apri(titoloDialogo);
      const conferma = el('button', { type: 'button', class: 'modal-btn' }, etichetta);
      conferma.disabled = !!impedimento;
      conferma.addEventListener('click', async () => {
        conferma.disabled = true;
        try { await onConferma(d); } catch (err) { toast(messaggio(err), 'error'); conferma.disabled = false; }
      });
      d.corpo.append(
        ...righe.map((t) => el('p', {}, t)),
        ...extra,
        avvertenza ? el('p', { class: 'verifica-avviso verifica-avviso-forte', role: 'note' }, avvertenza) : '',
        impedimento ? el('p', { class: 'verifica-avviso verifica-avviso-errore', role: 'alert' }, impedimento) : '',
        el('div', { class: 'modal-actions' }, conferma, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => d.chiudi() }, 'Annulla')));
      return d;
    }

    async function dialogoApertura() {
      if (modificata() && !window.confirm('Ci sono modifiche non salvate a una traccia: l\'apertura userà solo le tracce salvate. Continuare?')) return;
      let r;
      try { r = await vd.riepilogoApertura(vid); } catch (err) { toast(messaggio(err), 'error'); return; }
      const quando = scegliFine({ durataMin: C.durataPredefinitaMin });
      const { righe, avvertenza } = testoApertura(r);
      dialogo({
        titolo: `Aprire la verifica «${verifica.titolo}»?`, righe, avvertenza, extra: [quando.elemento], etichetta: 'Apri la verifica',
        impedimento: r.tracce === 0 || !r.tracciaPredefinita ? 'Prima di aprire serve almeno una traccia, e una traccia di tutti.' : null,
        async onConferma(d) {
          const c = quando.calcola();
          if (c.errore) throw new Error(c.errore);
          await vd.apri(vid, { fine: c.fine });
          d.chiudi();
          toast(`Verifica aperta: finisce ${formatoDataOra.format(c.fine)}.`, 'success');
          riapriScheda();
        },
      });
    }

    function dialogoChiusura() {
      const raccogli = el('input', { type: 'checkbox' });
      raccogli.checked = true;
      dialogo({
        titolo: `Chiudere la verifica «${verifica.titolo}»?`, righe: testoChiusura.righe, etichetta: 'Chiudi la verifica',
        extra: [el('label', { class: 'scegli-fine-riga' }, raccogli, ` ${testoChiusura.raccogli}`)],
        async onConferma(d) {
          const esitoChiusura = await vd.chiudi(vid, { raccogli: raccogli.checked });
          d.chiudi();
          toast(esitoChiusura ? `Verifica chiusa. Lavori: ${esitoRaccolta(esitoChiusura)}.` : 'Verifica chiusa.', 'success');
          riapriScheda();
        },
      });
    }

    function dialogoRiapertura() {
      const quando = scegliFine({ durataMin: C.durataRiaperturaMin });
      dialogo({
        titolo: `Riaprire la verifica «${verifica.titolo}»?`, righe: testoRiapertura.righe, extra: [quando.elemento], etichetta: 'Riapri la verifica',
        async onConferma(d) {
          const c = quando.calcola();
          if (c.errore) throw new Error(c.errore);
          await vd.riapri(vid, { fine: c.fine });
          d.chiudi();
          toast(`Verifica riaperta: finisce ${formatoDataOra.format(c.fine)}.`, 'success');
          riapriScheda();
        },
      });
    }

    async function raccogliLavori() {
      try { toast(`Lavori: ${esitoRaccolta(await vd.raccogli(vid))}.`, 'success'); } catch (err) { toast(messaggio(err), 'error'); }
    }
    async function archiviaVerifica() {
      if (!window.confirm(`Archivio la verifica «${verifica.titolo}»?\n${testoArchivia}`)) return;
      try {
        await vd.archivia(vid);
        toast('Verifica archiviata.', 'success');
        modificata = () => false;
        f.chiudi();
      } catch (err) { toast(messaggio(err), 'error'); }
    }
    async function ripristinaVerifica() {
      try { await vd.archivia(vid, false); toast('Verifica ripristinata.', 'success'); riapriScheda(); } catch (err) { toast(messaggio(err), 'error'); }
    }

    // --- Tracce: elenco a sinistra, editor a destra ------------------------
    const colonnaElenco = el('div', { class: 'tracce-elenco' });
    const colonnaEditor = el('div', { class: 'tracce-editor' });
    const sezioneTracce = el('div', { class: 'tracce-corpo' }, colonnaElenco, colonnaEditor);
    f.corpo.append(sezioneTracce);

    function disegnaElenco() {
      colonnaElenco.textContent = '';
      colonnaElenco.append(el('h3', { class: 'corsi-titolo' }, `Tracce (${tracce.length} su ${L.maxTracce})`));
      const piu = tracce.length >= 2;      // con una sola traccia non serve dire quale vale per tutti
      for (const t of tracce) {
        const predefinita = t.id === verifica.tracciaDefault;
        let segno = '';
        if (piu && predefinita) {
          segno = el('span', { class: 'traccia-predef', title: 'Traccia per tutti', role: 'img', 'aria-label': 'Traccia per tutti' }, '★');
        } else if (piu && bozza()) {
          segno = el('button', { type: 'button', class: 'traccia-usa', title: 'Usa questa traccia per tutti', 'aria-label': `Usa «${t.titolo}» per tutti`,
            onclick: () => usaPerTutti(t.id) }, '☆');
        }
        colonnaElenco.append(el('div', { class: `traccia-voce${selezione === t.id ? ' attiva' : ''}` },
          el('button', { type: 'button', class: 'traccia-nome', onclick: () => seleziona(t.id) }, t.titolo),
          segno));
      }
      if (selezione === 'nuova') {
        colonnaElenco.append(el('div', { class: 'traccia-voce attiva' }, el('span', { class: 'traccia-nome traccia-bozza' }, 'Nuova traccia (non salvata)')));
      }
      const aggiungi = el('button', { type: 'button', class: 'modal-btn secondary traccia-aggiungi', onclick: () => seleziona('nuova') }, '+ Nuova traccia');
      aggiungi.disabled = !scrivibile() || tracce.length >= L.maxTracce;
      colonnaElenco.append(aggiungi);
    }

    async function usaPerTutti(id) {
      try {
        // Se la traccia è già assegnata a mano a qualcuno, probabilmente non è fatta per tutti: si avvisa, SEMPRE
        // in quel caso (anche se oggi nessun altro la riceverebbe: ci sono gli iscritti che arriveranno e chi non ha
        // una traccia scelta). Negli altri casi la stella funziona senza domande.
        const { amano, riceveranno } = await vd.impattoUsaPerTutti(vid, id);
        if (amano > 0) {
          const t = tracce.find((x) => x.id === id);
          const chi = amano === 1 ? '1 studente' : `${amano} studenti`;
          const altri = riceveranno === 0
            ? 'la riceveranno gli studenti che non hanno una traccia scelta (oggi nessuno)'
            : riceveranno === 1 ? 'la riceverà anche 1 altro studente' : `la riceveranno anche gli altri ${riceveranno} studenti`;
          if (!window.confirm(`«${t.titolo}» è assegnata a mano a ${chi}.\nSe diventa la traccia di tutti, ${altri}.\n\nVuoi usarla per tutti?`)) return;
        }
        await vd.impostaTracciaDefault(vid, id);
        verifica = await vd.verifiche.leggi(vid);
        disegnaElenco();
        aggiornaAssegnazioni();
      } catch (err) { toast(messaggio(err), 'error'); }
    }

    function seleziona(id) {
      if (id === selezione) return;
      if (modificata() && !window.confirm('Ci sono modifiche non salvate a questa traccia. Scartarle?')) return;
      selezione = id;
      disegnaElenco();
      disegnaEditor();
    }

    function disegnaEditor() {
      editor?.distruggi();
      editor = null;
      modificata = () => false;
      colonnaEditor.textContent = '';
      if (selezione === null) {
        colonnaEditor.append(el('p', { class: 'sketch-nota' }, tracce.length === 0
          ? (scrivibile() ? 'Questa verifica non ha ancora tracce. Crea la prima con «Nuova traccia».' : 'Questa verifica non ha tracce.')
          : 'Scegli una traccia dall\'elenco.'));
        return;
      }
      const esistente = selezione === 'nuova' ? null : tracce.find((t) => t.id === selezione);
      if (selezione !== 'nuova' && !esistente) { selezione = null; disegnaEditor(); return; }

      if (!scrivibile()) {                                   // chiusa: sola lettura
        const resa = el('div', { class: 'traccia-md' });
        rendiMarkdown(esistente.testoMd).then((html) => { resa.innerHTML = html; });   // output sicuro di markdown.js
        colonnaEditor.append(el('h3', { class: 'corsi-titolo' }, esistente.titolo), resa);
        return;
      }

      const titoloTraccia = el('input', { type: 'text', class: 'sketch-nome', maxlength: String(L.maxTitoloTraccia), autocomplete: 'off',
        placeholder: 'Per esempio: Versione A' });
      titoloTraccia.value = esistente?.titolo ?? `Traccia ${tracce.length + 1}`;
      const salvaBtn = el('button', { type: 'button', class: 'modal-btn' },
        esistente && !bozza() ? 'Pubblica modifica' : 'Salva');
      editor = creaEditorMarkdown({ testo: esistente?.testoMd ?? '', max: L.maxTestoTraccia, onSalva: () => salva() });
      const origineTitolo = esistente?.titolo ?? '';
      const origineTesto = esistente?.testoMd ?? '';
      modificata = () => selezione === 'nuova'
        ? (editor.leggi().trim() !== '' || titoloTraccia.value.trim() !== `Traccia ${tracce.length + 1}`)
        : (titoloTraccia.value !== origineTitolo || editor.leggi() !== origineTesto);

      async function salva() {
        const t = titoloTraccia.value.trim();
        const m = editor.leggi();
        if (!t) { toast('Scrivi il titolo della traccia.', 'error'); return; }
        if (!m.trim()) { toast('Scrivi il testo della traccia.', 'error'); return; }
        if (!editor.valido()) { toast(`Il testo supera i ${L.maxTestoTraccia} caratteri.`, 'error'); return; }
        salvaBtn.disabled = true;
        try {
          let salvata;
          if (esistente) {
            salvata = await vd.verifiche.modificaTraccia(vid, esistente.id, { titolo: t, testoMd: m });
          } else {
            salvata = await vd.verifiche.nuovaTraccia(vid, { titolo: t, testoMd: m });
            // la prima traccia diventa quella di tutti
            if (!verifica.tracciaDefault && bozza()) {
              await vd.verifiche.modifica(vid, { tracciaDefault: salvata.id });
              verifica = await vd.verifiche.leggi(vid);
            }
          }
          tracce = await vd.verifiche.tracce(vid);
          modificata = () => false;
          selezione = salvata.id;
          disegnaElenco();
          disegnaEditor();
          aggiornaAssegnazioni();
          toast(esistente && !bozza() ? 'Modifica pubblicata: gli studenti vedranno l\'avviso di traccia aggiornata.' : 'Traccia salvata.', 'success');
        } catch (err) {
          toast(messaggio(err), 'error');
          salvaBtn.disabled = false;
        }
      }
      salvaBtn.addEventListener('click', salva);

      // Avviso nella scheda (non solo una notifica): resta finché non si cambia traccia.
      const avvisoElimina = el('p', { class: 'sketch-nota verifica-avviso verifica-avviso-errore', role: 'alert' });
      avvisoElimina.hidden = true;

      async function elimina() {
        // Prima si controlla: se la traccia è assegnata a mano non si chiede nemmeno conferma, si spiega perché non si può.
        let usate;
        try { usate = await vd.studentiConTraccia(vid, esistente.id); } catch (err) { toast(messaggio(err), 'error'); return; }
        if (usate.length) {
          const chi = usate.length === 1 ? '1 studente' : `${usate.length} studenti`;
          avvisoElimina.textContent = '';
          avvisoElimina.append(`Non si può eliminare «${esistente.titolo}»: è assegnata a mano a ${chi}. ${usate.length === 1 ? 'Riassegnalo' : 'Riassegnali'} prima.`,
            el('button', { type: 'button', class: 'avviso-link', onclick: () => { if (!assAperta) toggleAss.click(); } }, 'Mostra le assegnazioni'));
          avvisoElimina.hidden = false;
          return;
        }
        avvisoElimina.hidden = true;
        if (!window.confirm(`Eliminare la traccia «${esistente.titolo}»?`)) return;
        try {
          // il modulo rifiuta se la traccia è assegnata a mano a qualcuno e, se era quella di tutti, la sposta
          await vd.eliminaTraccia(vid, esistente.id);
          tracce = await vd.verifiche.tracce(vid);
          verifica = await vd.verifiche.leggi(vid);
          modificata = () => false;
          selezione = null;
          disegnaElenco();
          disegnaEditor();
          aggiornaAssegnazioni();
          toast('Traccia eliminata.', 'success');
        } catch (err) { toast(messaggio(err), 'error'); }
      }

      colonnaEditor.append(
        campo('Titolo della traccia', titoloTraccia, 'Lo vedrà lo studente: usa un nome neutro (per esempio «Versione A»), senza note personali.'),
        editor.elemento,
        avvisoElimina,
        el('div', { class: 'modal-actions' },
          salvaBtn,
          esistente && bozza() ? el('button', { type: 'button', class: 'modal-btn secondary', onclick: elimina }, 'Elimina') : ''));
      (esistente ? editor : { focus: () => titoloTraccia.select() }).focus();
    }

    // --- Assegnazioni individuali: traccia e tempo per chi ne ha bisogno -------------
    // CHIUSA di default: la finestra può essere proiettata alla LIM e le righe con un tempo in più non devono
    // vedersi. Una riga per iscritto, con l'email (il nome non lo conosciamo finché non entra). Nessun campo
    // «motivo»: solo traccia e minuti in più.
    let assAperta = false;
    const esitoAss = el('span', { class: 'sketch-data verifica-esito', 'aria-live': 'polite' });
    const corpoAss = el('div', { class: 'assegnazioni-corpo', hidden: '' });
    const toggleAss = el('button', { type: 'button', class: 'assegnazioni-toggle', 'aria-expanded': 'false' });
    const etichettaToggle = () => `${assAperta ? '▾' : '▸'} Assegnazioni individuali (traccia e tempo)`;
    toggleAss.textContent = etichettaToggle();
    toggleAss.addEventListener('click', () => {
      assAperta = !assAperta;
      corpoAss.hidden = !assAperta;
      toggleAss.setAttribute('aria-expanded', String(assAperta));
      toggleAss.textContent = etichettaToggle();
      // aprendo, la finestra scorre fino alle assegnazioni (altrimenti le righe restano sotto il bordo)
      if (assAperta) aggiornaAssegnazioni().then(() => toggleAss.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    });
    const sezioneAss = scrivibile() ? el('div', { class: 'assegnazioni' }, el('div', { class: 'sketch-riga' }, toggleAss, esitoAss), corpoAss) : null;
    if (sezioneAss) f.corpo.append(sezioneAss);

    // --- Situazione live (verifica aperta o chiusa): l'altra faccia della scheda, accanto a «Tracce» ------------
    // Una verifica aperta si apre sulla situazione; la bozza non ha ancora studenti da seguire.
    if (!bozza()) {
      let tabella;
      const guarda = programma && programma.anteprima
        ? (email, nome) => apriAnteprima({ apri, programma, segui: (e, cb) => tabella.segui(e, cb), caricaStoria: () => vd.lavori.storia(vid, email), email, nome })
        : null;
      tabella = creaTabellaLive({ vd, vid, toast, guarda });
      chiudiTabella = tabella.distruggi;
      const pannelloSituazione = el('div', { class: 'situazione' }, tabella.elemento);
      const schede = [['situazione', 'Situazione'], ['tracce', 'Tracce']];
      const bottoni = new Map();
      const mostra = (cosa) => {
        pannelloSituazione.hidden = cosa !== 'situazione';
        sezioneTracce.hidden = cosa !== 'tracce';
        if (sezioneAss) sezioneAss.hidden = cosa !== 'tracce';
        for (const [k, b] of bottoni) { b.classList.toggle('attiva', k === cosa); b.setAttribute('aria-selected', String(k === cosa)); }
      };
      const barra = el('div', { class: 'verifica-schede', role: 'tablist' });
      for (const [k, testo] of schede) {
        const b = el('button', { type: 'button', role: 'tab', class: 'verifica-scheda', onclick: () => mostra(k) }, testo);
        bottoni.set(k, b);
        barra.append(b);
      }
      f.corpo.insertBefore(barra, sezioneTracce);
      f.corpo.insertBefore(pannelloSituazione, sezioneTracce);
      mostra('situazione');
    }

    async function aggiornaAssegnazioni() {
      if (!assAperta || !scrivibile()) return;
      let dati;
      try { dati = await vd.assegnazioni(vid); } catch (err) { toast(messaggio(err), 'error'); return; }
      if (!finestre.has(f) || !assAperta) return;
      disegnaAssegnazioni(dati);
    }

    function disegnaAssegnazioni({ tracce: elencoTracce, righe, verifica: v }) {
      corpoAss.textContent = '';
      if (righe.length === 0) {
        corpoAss.append(el('p', { class: 'sketch-nota' }, 'Nessuno studente iscritto al corso: aggiungili da «Gestisci».'));
        return;
      }
      const titoloDefault = elencoTracce.find((t) => t.id === v.tracciaDefault)?.titolo;
      const opzioni = (conNessuna) => [
        conNessuna ? el('option', { value: '__nessuna' }, '— non cambiare —') : null,
        el('option', { value: '' }, titoloDefault ? `Per tutti (${titoloDefault})` : 'Per tutti'),
        ...elencoTracce.map((t) => el('option', { value: t.id }, t.titolo)),
      ].filter(Boolean);
      const minutiValidi = (testo) => {
        const t = String(testo).trim();
        if (t === '') return 0;
        const n = Number(t);
        return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
      };
      const mostraEsito = (testo) => {
        esitoAss.textContent = testo;
        clearTimeout(mostraEsito.t);
        if (testo.endsWith('✓')) mostraEsito.t = setTimeout(() => { esitoAss.textContent = ''; }, 2500);
      };

      corpoAss.append(el('p', { class: 'sketch-nota' },
        'Chi non è modificato qui usa la traccia di tutti e la fine prevista. Si registrano solo la traccia e i minuti in più, nessun motivo.'));

      const caselle = [];
      const tabella = el('div', { class: 'assegnazioni-righe' });
      for (const r of righe) {
        const chk = el('input', { type: 'checkbox', 'aria-label': `Seleziona ${r.email}` });
        caselle.push([r, chk]);
        const sel = el('select', { class: 'assegnazioni-traccia', 'aria-label': `Traccia di ${r.email}` }, ...opzioni(false));
        sel.value = r.tracciaId ?? '';
        const min = el('input', { type: 'number', min: '0', max: '1000', step: '1', class: 'assegnazioni-minuti', placeholder: '0',
          'aria-label': `Minuti in più per ${r.email}` });
        min.value = r.extraMinuti > 0 ? String(r.extraMinuti) : '';
        if (r.entrato) { sel.disabled = true; sel.title = 'Ha già iniziato: la traccia non si cambia.'; }
        if (r.consegnato) { sel.disabled = true; min.disabled = true; min.title = 'Ha già consegnato.'; }

        async function salva(campi) {
          mostraEsito('Salvo…');
          try {
            await vd.assegna(vid, r.email, campi);
            r.assegnato = true;
            if (campi.tracciaId !== undefined) r.tracciaId = campi.tracciaId === null && v.stato === 'aperta' ? v.tracciaDefault : campi.tracciaId;
            if (campi.minutiExtra !== undefined) r.extraMinuti = campi.minutiExtra;
            mostraEsito('Salvato ✓');
          } catch (err) {
            mostraEsito('');
            toast(messaggio(err), 'error');
            sel.value = r.tracciaId ?? '';
            min.value = r.extraMinuti > 0 ? String(r.extraMinuti) : '';
          }
        }
        sel.addEventListener('change', () => salva({ tracciaId: sel.value === '' ? null : sel.value }));
        min.addEventListener('change', () => {
          const n = minutiValidi(min.value);
          if (n === null) { toast('I minuti in più sono un numero intero da 0 a 1000.', 'error'); min.value = r.extraMinuti > 0 ? String(r.extraMinuti) : ''; return; }
          if (!r.assegnato && n === 0) return;           // niente da salvare: nessuna assegnazione e nessun tempo in più
          salva({ minutiExtra: n });
        });
        tabella.append(el('div', { class: 'assegnazioni-riga' }, chk, el('span', { class: 'assegnazioni-email', title: r.email }, r.email), sel, min,
          el('span', { class: 'assegnazioni-min-etichetta' }, 'min')));
      }

      // «Per i selezionati»
      const tutti = el('input', { type: 'checkbox', 'aria-label': 'Seleziona tutti' });
      tutti.addEventListener('change', () => { for (const [r, c] of caselle) if (!r.consegnato) c.checked = tutti.checked; });
      const bulkTraccia = el('select', { class: 'assegnazioni-traccia', 'aria-label': 'Traccia per i selezionati' }, ...opzioni(true));
      bulkTraccia.value = '__nessuna';
      const bulkMin = el('input', { type: 'number', min: '0', max: '1000', step: '1', class: 'assegnazioni-minuti', placeholder: '—', 'aria-label': 'Minuti in più per i selezionati' });
      const applica = el('button', { type: 'button', class: 'modal-btn secondary' }, 'Applica ai selezionati');
      applica.addEventListener('click', async () => {
        const scelti = caselle.filter(([, c]) => c.checked).map(([r]) => r);
        if (scelti.length === 0) { toast('Seleziona almeno uno studente.', 'error'); return; }
        const campi = {};
        if (bulkTraccia.value !== '__nessuna') campi.tracciaId = bulkTraccia.value === '' ? null : bulkTraccia.value;
        if (bulkMin.value.trim() !== '') {
          const n = minutiValidi(bulkMin.value);
          if (n === null) { toast('I minuti in più sono un numero intero da 0 a 1000.', 'error'); return; }
          campi.minutiExtra = n;
        }
        if (Object.keys(campi).length === 0) { toast('Scegli una traccia o i minuti da applicare.', 'error'); return; }
        applica.disabled = true;
        mostraEsito('Salvo…');
        let fatti = 0;
        let saltati = 0;
        try {
          for (const r of scelti) {
            const c = { ...campi };
            if (r.entrato && c.tracciaId !== undefined) { delete c.tracciaId; saltati++; }   // chi ha iniziato tiene la sua traccia
            if (Object.keys(c).length === 0) continue;
            await vd.assegna(vid, r.email, c);
            fatti++;
          }
          mostraEsito('Salvato ✓');
          toast(`Applicato a ${fatti} student${fatti === 1 ? 'e' : 'i'}${saltati ? ` (la traccia non è cambiata a ${saltati}: hanno già iniziato)` : ''}.`, 'success');
        } catch (err) {
          mostraEsito('');
          toast(messaggio(err), 'error');
        }
        applica.disabled = false;
        aggiornaAssegnazioni();
      });
      corpoAss.append(
        el('div', { class: 'assegnazioni-bulk' }, el('label', { class: 'sketch-data' }, tutti, ' Tutti'),
          el('span', { class: 'sketch-data' }, 'Per i selezionati:'), bulkTraccia, bulkMin, el('span', { class: 'assegnazioni-min-etichetta' }, 'min in più'), applica),
        tabella);
    }

    // --- Elimina verifica (solo in bozza) -------------------------------------------
    async function eliminaQuestaVerifica() {
      let r;
      try { r = await vd.riepilogoEliminazione(vid); } catch (err) { toast(messaggio(err), 'error'); return; }
      const parti = [];
      if (r.tracce) parti.push(r.tracce === 1 ? 'la sua traccia' : `le sue ${r.tracce} tracce`);
      if (r.assegnazioni) parti.push(r.assegnazioni === 1 ? 'l\'assegnazione di 1 studente' : `le assegnazioni di ${r.assegnazioni} studenti`);
      const insieme = parti.length ? `, ${parti.join(' e ')}` : '';
      if (!window.confirm(`Elimino la verifica «${verifica.titolo}»${insieme}?\nNon si può annullare.`)) return;
      try {
        await vd.eliminaVerifica(vid);
        modificata = () => false;
        toast('Verifica eliminata.', 'success');
        f.chiudi();
      } catch (err) { toast(messaggio(err), 'error'); }
    }
    if (bozza()) {
      f.corpo.append(el('div', { class: 'verifica-piede' },
        el('button', { type: 'button', class: 'modal-btn secondary', onclick: eliminaQuestaVerifica }, 'Elimina verifica')));
    }

    selezione = tracce[0]?.id ?? null;
    disegnaElenco();
    disegnaEditor();
  }

  return {
    elenco,
    entra(verificaDocente) { vd = verificaDocente; },
    esci() { vd = null; chiudiTutte(); },
  };
}
