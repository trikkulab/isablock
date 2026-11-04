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
      salvaDati(async () => { await vd.cambiaFine(vid, d); verifica = await vd.verifiche.leggi(vid); });
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
        await vd.verifiche.modifica(vid, { tracciaDefault: id });
        verifica = await vd.verifiche.leggi(vid);
        disegnaElenco();
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
          await vd.verifiche.eliminaTraccia(vid, esistente.id);
          tracce = await vd.verifiche.tracce(vid);
          if (verifica.tracciaDefault === esistente.id) {            // la traccia di tutti passa alla prima rimasta
            await vd.verifiche.modifica(vid, { tracciaDefault: tracce[0]?.id ?? null });
            verifica = await vd.verifiche.leggi(vid);
          }
          modificata = () => false;
          selezione = null;
          disegnaElenco();
          disegnaEditor();
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
