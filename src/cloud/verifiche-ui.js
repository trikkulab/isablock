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

const L = verificaConfig.regole;
const STATI = { bozza: 'Bozza', aperta: 'Aperta', chiusa: 'Chiusa' };

export function montaVerifiche({ toast }) {
  let vd = null;                 // oggetto di verifica-docente.js, valido solo da docenti loggati
  let finestre = new Set();

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
    f.corpo.append(
      el('p', { class: 'sketch-nota' }, 'Qui prepari le verifiche del corso: scrivi le tracce, e quando è il momento apri la verifica.'),
      el('div', { class: 'sketch-riga corsi-docente-barra' },
        el('button', { type: 'button', class: 'modal-btn', onclick: () => nuova(corso, ricarica) }, 'Nuova verifica')),
      el('h3', { class: 'corsi-titolo' }, 'Verifiche'), lista);

    async function ricarica() {
      let verifiche;
      try { verifiche = await vd.verifiche.elenca(corso.id); } catch (err) {
        if (finestre.has(f)) toast(messaggio(err), 'error');
        return;
      }
      if (!finestre.has(f)) return;
      lista.textContent = '';
      if (verifiche.length === 0) {
        lista.append(el('p', { class: 'sketch-nota' }, 'Nessuna verifica ancora. Creane una con «Nuova verifica».'));
        return;
      }
      for (const v of verifiche) {
        lista.append(el('div', { class: 'sketch-riga' },
          el('div', { class: 'sketch-info' },
            el('strong', {}, v.titolo),
            el('span', { class: 'sketch-data' }, badge(v.stato),
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

    const f = apri('Verifica', dopo, {
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
      chiusa: 'Verifica chiusa: le tracce si possono solo leggere.',
    }[stato()];
    f.corpo.append(
      el('div', { class: 'verifica-testata' },
        campo('Titolo', titolo),
        campo(bozza() ? 'Fine prevista (provvisoria)' : 'Fine prevista', fine),
        el('div', { class: 'verifica-stato' }, badge(stato()), esito)),
      avviso ? el('p', { class: 'sketch-nota verifica-avviso' }, avviso) : '');

    // --- Tracce: elenco a sinistra, editor a destra ------------------------
    const colonnaElenco = el('div', { class: 'tracce-elenco' });
    const colonnaEditor = el('div', { class: 'tracce-editor' });
    f.corpo.append(el('div', { class: 'tracce-corpo' }, colonnaElenco, colonnaEditor));

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

      async function elimina() {
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
    if (scrivibile()) f.corpo.append(el('div', { class: 'assegnazioni' }, el('div', { class: 'sketch-riga' }, toggleAss, esitoAss), corpoAss));

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
