// Prova nel browser della scheda delle verifiche del docente (passo 6c): corso, verifica in bozza, tracce,
// segno «per tutti», titolo e fine, modifiche non salvate, eliminazione, vista stretta.
// Si lancia con `npm run test:e2e` (avvia gli emulatori Auth e Firestore, vuoti, e questo script).
import { avviaServer } from './server.mjs';
import { avviaBrowser, accedi, abilitaDocente, leggi, scrivi, aggiorna, S, T, valoreTesto, verifica, riepilogo, schermata, MOD } from './aiuti.mjs';

const { server } = await avviaServer();
const browser = await avviaBrowser();
let riuscito = false;
try {
  await abilitaDocente('docente@isarome.it');
  const { page, errori } = await accedi(browser, 'docente@isarome.it', { nome: 'Docente Prova' });
  let rispondi = 'accept';
  const dialoghi = [];
  page.on('dialog', async (d) => { dialoghi.push(d.message()); if (rispondi === 'dismiss') await d.dismiss(); else await d.accept(); });

  // 1) un corso
  await page.click('.cloud-menu-btn');
  await page.click('.cloud-voce:has-text("Corsi")');
  await page.click('button:has-text("Nuovo corso")');
  await page.fill('input[maxlength="20"]', '3AINF');
  await page.click('button:has-text("Crea corso")');
  await page.waitForSelector('h2:has-text("Gestisci")');
  await page.keyboard.press('Escape');
  await page.waitForSelector('button:has-text("Verifiche")');
  verifica(await page.isVisible('h2:has-text("I miei corsi")') && !(await page.isVisible('h2:has-text("Gestisci")')),
    'Esc chiude solo la finestra in cima (Gestisci): «I miei corsi» resta');

  // tre studenti iscritti al corso (direttamente nel database: l'iscrizione non è l'oggetto di questa prova)
  const corsoId = (await leggi('corsi')).documents[0].name.split('/').pop();
  const ISCRITTI = ['anna@isarome.it', 'bruno@isarome.it', 'carla@isarome.it'];
  for (const e of ISCRITTI) {
    await scrivi(`iscrizioni/${corsoId}_${e}`, { corsoId: { stringValue: corsoId }, email: { stringValue: e }, creato: { timestampValue: new Date().toISOString() } });
  }

  // 2) elenco vuoto e nuova verifica
  await page.click('button:has-text("Verifiche")');
  await page.waitForSelector('text=Nessuna verifica ancora');
  await schermata(page, 'v-1-elenco-vuoto');
  await page.click('button:has-text("Nuova verifica")');
  await page.fill('input[placeholder^="Per esempio: Verifica"]', 'Verifica di novembre');
  await schermata(page, 'v-2-nuova');
  await page.click('button:has-text("Crea in bozza")');
  await page.waitForSelector('h2:has-text("Verifica: Verifica di novembre")');
  await page.waitForSelector('text=non ha ancora tracce');
  verifica(true, 'creata in bozza e scheda aperta, senza tracce');
  await schermata(page, 'v-3-scheda-vuota');

  // 3) prima traccia: diventa quella di tutti, senza segni
  await page.click('button:has-text("+ Nuova traccia")');
  await page.fill('.tracce-editor input[maxlength="40"]', 'Versione A');
  await page.fill('.editor-md-testo', '## Esercizio 1\n\nScrivi un programma che calcola il **fattoriale** di *n*.\n\n- legge un numero\n- stampa il risultato');
  await page.waitForSelector('.editor-md-anteprima h2');
  await page.click('.tracce-editor button:has-text("Salva")');
  await page.waitForSelector('.traccia-nome:has-text("Versione A")');
  verifica((await page.$$('.traccia-predef, .traccia-usa')).length === 0, 'con una sola traccia non compare nessun segno «per tutti»');
  const v = (await leggi('verifiche')).documents?.[0];
  const vid = v?.name.split('/').pop();
  verifica(valoreTesto(v, 'tracciaDefault') === 't0', 'la prima traccia è diventata quella di tutti (t0)');

  // 4) seconda traccia: compare UN solo segno, discreto
  await page.click('button:has-text("+ Nuova traccia")');
  await page.fill('.tracce-editor input[maxlength="40"]', 'Versione B');
  await page.fill('.editor-md-testo', '## Esercizio 1 (B)\n\nScrivi un programma che calcola la **somma** dei numeri da 1 a n.');
  await page.click('.tracce-editor button:has-text("Salva")');
  await page.waitForSelector('.traccia-nome:has-text("Versione B")');
  verifica((await page.$$('.traccia-predef')).length === 1, 'con due tracce c\'è UNA stella piena, sulla traccia di tutti');
  verifica(await page.$eval('.traccia-usa', (e) => getComputedStyle(e).opacity) === '0', 'la stella vuota dell\'altra è invisibile finché non ci si passa sopra');
  await schermata(page, 'v-4-due-tracce');
  await page.hover('.traccia-voce:nth-of-type(2)');
  verifica(await page.$eval('.traccia-usa', (e) => getComputedStyle(e).opacity) === '1', 'passandoci sopra la stella vuota compare');
  await schermata(page, 'v-5-hover');
  await page.click('.traccia-usa');
  await page.waitForSelector('.traccia-voce:nth-of-type(2) .traccia-predef');
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', '«usa per tutti» sposta la traccia di tutti su B (t1)');

  // 5) titolo e fine prevista
  await page.fill('.verifica-testata input[type="text"]', 'Verifica di dicembre');
  await page.keyboard.press('Tab');
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'titolo') === 'Verifica di dicembre', 'il titolo della verifica è salvato');
  verifica((await page.textContent('h2:has-text("Verifica:")')).includes('Verifica di dicembre'), 'il titolo della finestra si aggiorna');
  await page.fill('.verifica-testata input[type="datetime-local"]', '2027-03-04T11:15');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.querySelector('.verifica-esito')?.textContent.includes('Salvato'));
  const fine = (await leggi(`verifiche/${vid}`)).fields.fine?.timestampValue;
  verifica(!!fine && new Date(fine).getTime() === new Date(2027, 2, 4, 11, 15).getTime(), `la fine prevista è salvata (${fine})`);

  // 5b) assegnazioni individuali: chiuse di default, poi traccia, minuti, «per i selezionati»
  const lavoro = async (email) => leggi(`verifiche/${vid}/lavori/${email}`);
  const aspetta = (ms = 500) => page.waitForTimeout(ms);
  // attende (fino a 5 s) che una condizione sul database diventi vera: le pause fisse sotto carico non bastano
  const finche = async (condizione, ms = 5000) => {
    const inizio = Date.now();
    while (Date.now() - inizio < ms) { if (await condizione()) return true; await page.waitForTimeout(150); }
    return false;
  };
  const defaultE = async (id) => valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === id;
  verifica(!(await page.isVisible('text=anna@isarome.it')), 'le assegnazioni sono chiuse di default: nessuna email sullo schermo');
  verifica(!(await page.isVisible('.assegnazioni-corpo')), '…e il corpo della sezione è nascosto');
  await page.click('.assegnazioni-toggle');
  await page.waitForSelector('.assegnazioni-riga');
  verifica((await page.$$('.assegnazioni-riga')).length === 3, 'aperta: una riga per ognuno dei 3 iscritti');
  await page.locator('.assegnazioni-riga').last().scrollIntoViewIfNeeded();
  await schermata(page, 'v-5b-assegnazioni');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', 't0');            // a mano: Versione A (la traccia di tutti è B)
  verifica(await finche(async () => valoreTesto(await lavoro('anna@isarome.it'), 'tracciaId') === 't0'), 'traccia scelta a mano per Anna: salvata (t0)');
  await page.fill('[aria-label="Minuti in più per bruno@isarome.it"]', '15');
  await page.keyboard.press('Tab');
  const fineMs = new Date(2027, 2, 4, 11, 15).getTime();
  const scadeA = async (email, minuti) => { const l = await lavoro(email); return !!l.fields && new Date(l.fields.scadenza.timestampValue).getTime() === fineMs + minuti * 60000; };
  verifica(await finche(async () => (await scadeA('bruno@isarome.it', 15)) && (await lavoro('bruno@isarome.it')).fields.tracciaId?.nullValue === null),
    'solo minuti in più per Bruno: scadenza fine+15 e traccia «di tutti» (vuota)');
  await page.check('[aria-label="Seleziona carla@isarome.it"]');
  await page.fill('[aria-label="Minuti in più per i selezionati"]', '5');
  await page.click('button:has-text("Applica ai selezionati")');
  verifica(await finche(() => scadeA('carla@isarome.it', 5)), '«Per i selezionati»: Carla ha 5 minuti in più');
  // dopo «Applica» la tabella si ridisegna (caselle di nuovo vuote, pulsante di nuovo attivo): si aspetta, prima di cliccare ancora
  await page.waitForFunction(() => !document.querySelector('[aria-label="Seleziona carla@isarome.it"]')?.checked
    && !document.querySelector('.assegnazioni-bulk button')?.disabled);
  await page.click('button:has-text("Applica ai selezionati")');
  verifica(await page.waitForFunction(() => /almeno uno studente/.test(document.querySelector('.toast.show')?.textContent ?? ''), null, { timeout: 5000 }).then(() => true).catch(() => false),
    'senza nessuno selezionato avvisa invece di fare qualcosa');

  // 5c) avviso su «per tutti»: A è assegnata a mano ad Anna
  await page.hover('.traccia-voce:nth-of-type(1)');
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  await finche(async () => dialoghi.length > 0);
  verifica(dialoghi.length === 1 && /assegnata a mano a 1 studente/.test(dialoghi[0]) && /anche gli altri 2 studenti/.test(dialoghi[0]), `avviso su «per tutti»: «${dialoghi[0]?.split('\n').slice(0, 2).join(' ')}»`);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', '…rifiutando, la traccia di tutti non cambia');
  rispondi = 'accept';
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  verifica(await finche(() => defaultE('t0')), '…accettando, A diventa la traccia di tutti');
  // con B senza assegnazioni a mano non chiede niente
  dialoghi.length = 0;
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');
  verifica(await finche(() => defaultE('t1')) && dialoghi.length === 0, 'per una traccia senza assegnazioni a mano nessun avviso: B torna di tutti');

  // 5c-bis) l'avviso c'è anche quando nessun altro la riceverebbe (tutti hanno già una traccia a mano)
  await page.check('[aria-label="Seleziona tutti"]');
  await page.selectOption('[aria-label="Traccia per i selezionati"]', 't1');                // tutti e tre: a mano B
  await page.click('button:has-text("Applica ai selezionati")');
  verifica(await finche(async () => {
    const l = await Promise.all(ISCRITTI.map((e) => lavoro(e)));
    return l.every((x) => valoreTesto(x, 'tracciaId') === 't1');
  }), '«Tutti» con la traccia B a mano: salvato per i tre studenti');
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');                           // A di tutti (nessuno la ha a mano: nessun avviso)
  verifica(await finche(() => defaultE('t0')), 'A (senza assegnazioni a mano) torna di tutti senza domande');
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');                           // B: assegnata a mano a tutti e 3, nessun altro la riceverebbe
  await finche(async () => dialoghi.length > 0);
  verifica(dialoghi.length === 1 && /assegnata a mano a 3 studenti/.test(dialoghi[0]) && /oggi nessuno/.test(dialoghi[0]), `avviso anche se nessun altro la riceverebbe: «${dialoghi[0]?.split('\n').slice(0, 2).join(' ')}»`);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't0', '…e rifiutando la traccia di tutti non cambia');
  rispondi = 'accept';
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');
  verifica(await finche(() => defaultE('t1')), '…accettando, B diventa la traccia di tutti');
  // si rimette tutto com'era: tutti «di tutti», e la traccia di tutti torna A come nei passi seguenti
  await page.check('[aria-label="Seleziona tutti"]');
  await page.selectOption('[aria-label="Traccia per i selezionati"]', '');
  await page.click('button:has-text("Applica ai selezionati")');
  verifica(await finche(async () => (await Promise.all(ISCRITTI.map((e) => lavoro(e)))).every((x) => x.fields?.tracciaId?.nullValue === null)),
    '«Tutti» di nuovo «per tutti»: salvato per i tre studenti');
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  verifica(await finche(() => defaultE('t0')), 'A di nuovo di tutti (nessuno la ha a mano)');
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');                           // senza assegnazioni a mano: nessun avviso
  verifica(await finche(() => defaultE('t1')), 'ripristinato: B di tutti, nessuno con una traccia a mano');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', 't0');            // Anna di nuovo a mano su A, come richiede il passo seguente

  // 5d) una traccia assegnata a mano non si elimina: avviso nella scheda, senza conferma generica
  await page.click('.assegnazioni-toggle');                                               // sezione chiusa: l'avviso non deve mostrare chi
  verifica(!(await page.isVisible('.assegnazioni-riga')), 'assegnazioni richiuse prima di provare a eliminare');
  await page.click('.traccia-nome:has-text("Versione A")');
  dialoghi.length = 0;
  await page.click('button:has-text("Elimina")');
  await page.waitForSelector('.verifica-avviso-errore:not([hidden])');
  const testoAvviso = await page.textContent('.verifica-avviso-errore');
  verifica(/Non si può eliminare «Versione A»: è assegnata a mano a 1 studente\. Riassegnalo prima\./.test(testoAvviso), `avviso nella scheda: «${testoAvviso.trim()}»`);
  verifica(await page.isVisible('.verifica-avviso-errore'), "l'avviso è visibile nella scheda");
  verifica(dialoghi.length === 0, 'nessuna conferma generica prima del rifiuto');
  verifica(!testoAvviso.includes('@'), "l'avviso non mostra email (la finestra può essere proiettata)");
  await aspetta(300);
  verifica(!!(await leggi(`verifiche/${vid}/tracce/t0`)).fields, '…e la traccia c\'è ancora');
  // le notifiche stanno sopra le finestre (prima restavano nascoste dietro l'oscuramento)
  const livelli = await page.evaluate(() => [Number(getComputedStyle(document.getElementById('toast')).zIndex), Number(getComputedStyle(document.querySelector('.modal')).zIndex)]);
  verifica(livelli[0] > livelli[1], `le notifiche stanno sopra le finestre (livello ${livelli[0]} contro ${livelli[1]})`);
  await page.click('.avviso-link');                                                       // «Mostra le assegnazioni»: la sezione era chiusa
  await page.waitForSelector('.assegnazioni-riga');
  verifica(await page.isVisible('.assegnazioni-riga'), 'il pulsante dell\'avviso apre le assegnazioni');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', '');               // Anna torna a «per tutti»
  verifica(await finche(async () => (await lavoro('anna@isarome.it')).fields?.tracciaId?.nullValue === null), 'Anna torna alla traccia di tutti (vuota in bozza)');
  await page.click('.assegnazioni-toggle');                                              // richiude la sezione
  verifica(!(await page.isVisible('text=anna@isarome.it')), 'richiudendo la sezione le email spariscono di nuovo');

  // 6) modifiche non salvate
  await page.click('.traccia-nome:has-text("Versione A")');
  await page.waitForSelector('.editor-md-testo');
  await page.fill('.editor-md-testo', 'testo cambiato ma non salvato');
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.click('.traccia-nome:has-text("Versione B")');
  verifica(dialoghi.length === 1 && /non salvate/.test(dialoghi[0]), 'passando a un\'altra traccia con modifiche non salvate chiede conferma');
  verifica((await page.inputValue('.editor-md-testo')) === 'testo cambiato ma non salvato', '…e rifiutando si resta dov\'era');
  dialoghi.length = 0;
  await page.keyboard.press('Escape');
  verifica(dialoghi.length === 1 && (await page.isVisible('h2:has-text("Verifica:")')), 'chiudere la finestra con modifiche non salvate chiede conferma (rifiutando, resta aperta)');
  rispondi = 'accept';
  await page.focus('.editor-md-testo');
  await page.keyboard.press(`${MOD}+s`);
  await page.waitForTimeout(600);
  const trA = await leggi(`verifiche/${vid}/tracce/t0`);
  verifica(valoreTesto(trA, 'testoMd')?.startsWith('testo cambiato') && trA.fields.rev.integerValue === '1', 'Cmd/Ctrl+S salva la traccia A e rev sale a 1');

  // 7) elimina la traccia di tutti: passa alla prima rimasta
  await page.click('.traccia-nome:has-text("Versione B")');
  await page.click('button:has-text("Elimina")');
  await page.waitForFunction(() => document.querySelectorAll('.tracce-elenco .traccia-nome').length === 1);       // resta solo A
  await page.waitForTimeout(400);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't0', 'eliminando la traccia di tutti, passa alla prima rimasta (t0)');

  // 8) torna all'elenco e riapre
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sketch-riga:has-text("Verifica di dicembre")');
  verifica(await page.isVisible('.stato-corso[data-stato="bozza"]'), 'nell\'elenco: titolo aggiornato e badge «Bozza»');
  await schermata(page, 'v-6-elenco');
  await page.click('.sketch-riga:has-text("Verifica di dicembre") button:has-text("Apri")');
  await page.waitForSelector('.traccia-nome:has-text("Versione A")');
  verifica(true, 'la scheda si riapre con i dati salvati');

  // 8b) elimina la verifica (bozza): conferma con i numeri, e non resta niente nel database
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.click('button:has-text("Elimina verifica")');
  await aspetta(500);
  verifica(dialoghi.length === 1 && /Elimino la verifica «Verifica di dicembre», la sua traccia e le assegnazioni di 3 studenti/.test(dialoghi[0]), `conferma con i numeri: «${dialoghi[0]?.split('\n')[0]}»`);
  verifica(!!(await leggi(`verifiche/${vid}`)).fields, '…rifiutando, la verifica c\'è ancora');
  rispondi = 'accept';
  await page.click('button:has-text("Elimina verifica")');
  await page.waitForSelector('text=Nessuna verifica ancora');
  await aspetta(500);
  const resti = async () => ({ verifica: !!(await leggi(`verifiche/${vid}`)).fields,
    lavori: ((await leggi(`verifiche/${vid}/lavori`)).documents ?? []).length, tracce: ((await leggi(`verifiche/${vid}/tracce`)).documents ?? []).length });
  const dopo = await resti();
  verifica(!dopo.verifica && dopo.lavori === 0 && dopo.tracce === 0, `eliminata del tutto, senza orfani: ${JSON.stringify(dopo)}`);
  // una nuova bozza per provare la vista stretta
  await page.click('button:has-text("Nuova verifica")');
  await page.fill('input[placeholder^="Per esempio: Verifica"]', 'Verifica per la vista stretta');
  await page.click('button:has-text("Crea in bozza")');
  await page.waitForSelector('h2:has-text("Verifica: Verifica per la vista stretta")');

  // 9) vista stretta (serve una traccia aperta nell'editor)
  await page.click('button:has-text("+ Nuova traccia")');
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForTimeout(300);
  verifica(await page.isVisible('.editor-md-scheda'), 'su schermo stretto compaiono le schede «Scrivi / Anteprima»');
  await schermata(page, 'v-7-stretto');
  await page.setViewportSize({ width: 1280, height: 860 });

  // 10) apertura con la durata, chiusura con raccolta, archivia, ripristina, riapertura
  await page.fill('.tracce-editor input[maxlength="40"]', 'Versione A');
  await page.fill('.editor-md-testo', 'Scrivi un programma che stampa i numeri da 1 a 10.');
  await page.click('.tracce-editor button:has-text("Salva")');
  await page.waitForSelector('.traccia-nome:has-text("Versione A")');
  const vid2 = (await leggi('verifiche')).documents[0].name.split('/').pop();
  const stato2 = async () => valoreTesto(await leggi(`verifiche/${vid2}`), 'stato');
  const vicinoA = (iso, minuti) => Math.abs(new Date(iso).getTime() - (Date.now() + minuti * 60000)) < 3 * 60000;   // tolleranza: il test impiega qualche secondo
  const toastContiene = (re) => page.waitForFunction((r) => new RegExp(r).test(document.querySelector('.toast.show')?.textContent ?? ''), re.source, { timeout: 6000 }).then(() => true).catch(() => false);

  await page.click('button:has-text("Apri verifica")');
  await page.waitForSelector('h2:has-text("Aprire la verifica")');
  const dialogoApertura = await page.textContent('.modal:last-of-type .modal-box');
  verifica(/Gli studenti iscritti \(3\) la vedranno subito/.test(dialogoApertura), 'conferma di apertura: dice per quanti studenti e che la vedranno subito');
  verifica(/Tracce: 1 \(per tutti: Versione A\)/.test(dialogoApertura), '…quante tracce e quale è per tutti');
  verifica(/L'apertura non si annulla: per fermare la verifica dovrai chiuderla\./.test(dialogoApertura), '…e avverte che l\'apertura non si annulla');
  verifica(/Finirà/.test(dialogoApertura), '…e mostra quando finirà');
  verifica(/dovrà scegliere questa verifica e non potrà usare altro in IsaBlock finché non consegna o non scade il tempo/.test(dialogoApertura), '…e dice cosa succede allo studente (il blocco ora esiste)');
  await schermata(page, 'v-8-apertura');
  await page.fill('[aria-label="Minuti dall\'apertura"]', '60');
  await page.click('button:has-text("Apri la verifica")');
  await page.waitForSelector('.verifica-azioni button:has-text("Chiudi verifica")');
  verifica(await stato2() === 'aperta', 'la verifica è aperta');
  const fine2 = (await leggi(`verifiche/${vid2}`)).fields.fine.timestampValue;
  verifica(vicinoA(fine2, 60), `finisce tra 60 minuti da adesso (${fine2})`);
  verifica(await finche(async () => ((await leggi(`verifiche/${vid2}/lavori`)).documents ?? []).every((d) => d.fields.tracciaId?.stringValue === 't0') && ((await leggi(`verifiche/${vid2}/lavori`)).documents ?? []).length === 3),
    'i 3 iscritti hanno la loro assegnazione, con la traccia vera (t0)');
  verifica(!(await page.isVisible('button:has-text("Archivia")')) && !(await page.isVisible('button:has-text("Apri verifica")')), 'aperta: non si può archiviare né riaprire');
  await schermata(page, 'v-9-aperta');

  // situazione live: tre studenti non entrati, poi Anna scrive e la riga cambia da sola
  verifica(await page.isVisible('.verifica-scheda.attiva:has-text("Situazione")') && !(await page.isVisible('.tracce-corpo')), 'verifica aperta: la scheda si apre sulla Situazione (le tracce sono nell\'altra scheda)');
  await page.waitForSelector('.tabella-live tbody tr');
  verifica((await page.$$('.tabella-live tbody tr')).length === 3 && (await page.$$('.tabella-stato[data-stato="non-entrato"]')).length === 3, 'tabella: 3 righe, tutti «Non entrato»');
  verifica(/Entrati 0 su 3/.test(await page.textContent('.tabella-sommario')), 'riepilogo: Entrati 0 su 3');
  const lavoroAnna = `verifiche/${vid2}/lavori/anna@isarome.it`;
  const adesso = Date.now();
  await aggiorna(lavoroAnna, { entrato: T(adesso - 2 * 60000), ultimoSegnale: T(adesso), studenteNome: S('Anna Rossi'), nBlocchi: { integerValue: '7' },
    esecuzioni: { mapValue: { fields: { n: { integerValue: '2' }, esito: S('errore'), quando: { integerValue: '1000' } } } } });
  verifica(await finche(async () => (await page.textContent('.tabella-live tbody')).includes('Anna Rossi')), 'tabella: la riga di Anna si aggiorna da sola (nome)');
  const rigaAnna = async () => page.textContent('.tabella-live tbody tr:has-text("Anna Rossi")');
  verifica(/Errore/.test(await rigaAnna()) && /7/.test(await rigaAnna()) && /2 · errore/.test(await rigaAnna()), 'riga di Anna: Errore, 7 blocchi, 2 esecuzioni con esito errore');
  verifica(/^.*\d+:\d\d/.test(await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-timer')) && await page.getAttribute('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-timer', 'data-colore') === 'verde', 'riga di Anna: timer verde con minuti e secondi');
  verifica(/Entrati 1 su 3/.test(await page.textContent('.tabella-sommario')), 'riepilogo: Entrati 1 su 3');
  // il tempo scorre da solo, senza letture
  const t1 = await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-timer');
  await page.waitForTimeout(2200);
  verifica(await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-timer') !== t1, 'il timer scorre ogni secondo');
  // salto di blocchi (incollato) e consegna
  await aggiorna(lavoroAnna, { nBlocchi: { integerValue: '60' }, ultimoSegnale: T(Date.now()), campioni: { arrayValue: { values: [{ mapValue: { fields: { t: { integerValue: String(Date.now() - 3 * 60000) }, n: { integerValue: '10' } } } }] } } });
  verifica(await finche(async () => (await page.$$('.tabella-salto')).length === 1), 'un salto di blocchi (10 → 60) mostra l\'avviso ⚠');
  verifica(/1 con un salto di blocchi/.test(await page.textContent('.tabella-sommario')), '…e lo conta nel riepilogo');
  await schermata(page, 'v-9b-situazione');
  await page.selectOption('.tabella-ordine', 'attenzione');
  verifica(/Anna Rossi/.test(await page.textContent('.tabella-live tbody tr:first-child')), 'ordine «chi richiede attenzione»: Anna (salto) per prima');
  // «Guarda»: il programma di Anna in sola lettura, che si aggiorna da solo
  const esempio = await page.evaluate(async () => { const m = await import('/src/examples.js'); return { ...m.examples[0].workspaceState, formatVersion: 6 }; });
  const json1 = JSON.stringify(esempio);
  await aggiorna(lavoroAnna, { programma: S(json1), programmaHash: S('h1'), nBlocchi: { integerValue: '8' }, ultimoSegnale: T(Date.now()) });
  await page.click('.tabella-live tbody tr:has-text("Anna Rossi") button:has-text("Guarda")');
  await page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  verifica(await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length > 3), 'Guarda: i blocchi di Anna si vedono nella finestra');
  const pseudoAnteprima = async () => page.textContent('.anteprima-codice >> nth=0');
  verifica(/INIZIO/.test(await pseudoAnteprima()) && /FINE/.test(await pseudoAnteprima()), 'Guarda: c\'è lo pseudocodice generato');
  await page.click('.anteprima-lato .verifica-scheda:has-text("Python")');
  verifica((await page.textContent('.anteprima-codice >> nth=2')).length > 5 && await page.isVisible('.anteprima-codice >> nth=2'), 'Guarda: la scheda Python mostra il codice');
  verifica(/Programma di Anna Rossi/.test(await page.textContent('h2:has-text("Programma di")')) && /ultimo segnale alle/.test(await page.textContent('.anteprima-info')), 'Guarda: titolo con il nome e ultimo segnale');
  verifica(await page.$('.anteprima-blocchi .blocklyToolboxDiv') === null && await page.$('.anteprima-blocchi .blocklyFlyout') === null, 'Guarda: nessuna tavolozza (non si può modificare)');
  await schermata(page, 'v-9c-guarda');
  // storia: istantanee seminate dal database (come le scriverebbe lo studente), cursore, salti
  const piccolo = JSON.stringify({ ...esempio, blocks: { ...esempio.blocks, blocks: [{ type: 'program', id: 'p1', x: 40, y: 40 }] } });
  const istantanea = (sid, tipo, ms, n, prog) => scrivi(`${lavoroAnna}/storia/${sid}`, { programma: S(prog), nBlocchi: { integerValue: String(n) }, t: T(ms), tipo: S(tipo) });
  const adesso0 = Date.now();
  await istantanea('p0', 'periodica', adesso0 - 20 * 60000, 2, piccolo);
  await istantanea('a1', 'prima', adesso0 - 10 * 60000, 2, piccolo);
  await istantanea('d1', 'dopo', adesso0 - 10 * 60000 + 1000, 8, json1);
  verifica(await page.isVisible('.anteprima-info ~ button:has-text("Storia")') || await page.isVisible('button:has-text("Storia…")'), 'Guarda: c\'è il pulsante «Storia…»');
  verifica(!(await page.isVisible('.anteprima-cursore')), 'Guarda: il cursore compare solo dopo aver aperto la storia');
  await page.click('button:has-text("Storia…")');
  await page.waitForSelector('.anteprima-cursore');
  verifica((await page.getAttribute('.anteprima-cursore', 'max')) === '3' && /In diretta · 3 istantanee/.test(await page.textContent('.anteprima-etichetta')), 'Storia: 3 istantanee e il cursore è «in diretta»');
  verifica((await page.$$('.anteprima-salti button')).length === 1, 'Storia: un segno di salto (⚠) con la sua ora');
  await page.click('.anteprima-salti button');
  verifica(/prima del salto/.test(await page.textContent('.anteprima-etichetta')) && /non è il programma attuale/.test(await page.textContent('.anteprima-etichetta')), 'Storia: il segno porta al programma di prima del salto, dichiarando che non è l\'attuale');
  verifica(await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length === 1), 'Storia: i blocchi mostrati sono quelli di quel momento (solo INIZIO/FINE)');
  await page.click('button[aria-label="Istantanea successiva"]');
  verifica(/dopo il salto/.test(await page.textContent('.anteprima-etichetta')) && await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length > 3), 'Storia: la freccia ▶ passa al «dopo il salto» (di nuovo molti blocchi)');
  await schermata(page, 'v-9d-storia');
  // mentre guarda il passato la diretta non cambia ciò che vede
  await aggiorna(lavoroAnna, { programma: S(piccolo), programmaHash: S('h9'), nBlocchi: { integerValue: '0' }, ultimoSegnale: T(Date.now()) });
  await page.waitForTimeout(800);
  verifica(/dopo il salto/.test(await page.textContent('.anteprima-etichetta')) && (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length > 3, 'Storia: mentre guarda il passato, la diretta non gli cambia la vista');
  await page.click('button:has-text("In diretta")');
  verifica(await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length === 1) && /In diretta/.test(await page.textContent('.anteprima-etichetta')), 'Storia: «In diretta» torna al programma attuale (nel frattempo cambiato)');
  await aggiorna(lavoroAnna, { programma: S(json1), programmaHash: S('h1'), nBlocchi: { integerValue: '8' }, ultimoSegnale: T(Date.now()) });
  await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length > 3);
  const prima = (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length;
  const mod = JSON.parse(json1);
  mod.blocks.blocks[0].next = undefined;                                              // meno blocchi: si vede l'aggiornamento
  await aggiorna(lavoroAnna, { programma: S(JSON.stringify({ ...mod, blocks: { ...mod.blocks, blocks: [{ type: 'program', id: 'p1', x: 40, y: 40 }] } })), programmaHash: S('h2'), nBlocchi: { integerValue: '0' }, ultimoSegnale: T(Date.now()) });
  verifica(await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length < prima), 'Guarda: la finestra si aggiorna da sola quando lo studente salva');
  await page.keyboard.press('Escape');
  verifica(await page.isVisible('.tabella-live'), 'Guarda: Esc chiude solo la finestra, la tabella resta');
  // l'altra scheda mostra le tracce
  await page.click('.verifica-scheda:has-text("Tracce")');
  verifica(await page.isVisible('.tracce-corpo') && !(await page.isVisible('.tabella-live')), 'scheda «Tracce»: si vedono le tracce e non la tabella');
  await page.click('.verifica-scheda:has-text("Situazione")');

  // un corso con una verifica aperta non si archivia: avviso nella sezione, senza conferma generica
  await page.keyboard.press('Escape');                                                    // la scheda
  await page.keyboard.press('Escape');                                                    // l'elenco delle verifiche
  await page.click('button:has-text("Gestisci")');
  await page.waitForSelector('button:has-text("Archivia il corso")');
  dialoghi.length = 0;
  await page.click('button:has-text("Archivia il corso")');
  await page.waitForSelector('.verifica-avviso-errore:not([hidden])');
  verifica(/Il corso ha una verifica aperta: chiudila prima di archiviarlo\./.test(await page.textContent('.verifica-avviso-errore:not([hidden])')), 'archiviare il corso con una verifica aperta: avviso nella sezione');
  verifica(dialoghi.length === 0, '…senza chiedere prima una conferma generica');
  verifica((await leggi(`corsi/${corsoId}`)).fields.attivo.booleanValue === true, '…e il corso è ancora attivo');
  await page.keyboard.press('Escape');                                                    // Gestisci

  // chiusura con raccolta
  await page.click('button:has-text("Verifiche")');
  await page.click('.sketch-riga:has-text("Verifica per la vista stretta") button:has-text("Apri")');
  await page.click('button:has-text("Chiudi verifica")');
  await page.waitForSelector('h2:has-text("Chiudere la verifica")');
  verifica(await page.isChecked('.modal:last-of-type input[type="checkbox"]'), 'chiusura: «Raccogli subito i lavori» è già spuntato');
  await page.click('button:has-text("Chiudi la verifica")');
  verifica(await toastContiene(/Verifica chiusa\. Lavori: raccolti 1, non entrati 2\./), 'chiusura: dice com\'è andata la raccolta (Anna è entrata, gli altri no)');
  await page.waitForSelector('.verifica-azioni button:has-text("Archivia")');
  verifica(await stato2() === 'chiusa', 'la verifica è chiusa');
  verifica(await page.isVisible('button:has-text("Raccogli i lavori")') && await page.isVisible('button:has-text("Riapri")'), 'chiusa: si può raccogliere, riaprire, archiviare');

  // file di emergenza: il docente lo carica dalla riga dello studente (solo a verifica chiusa)
  verifica((await page.$$('.tabella-live tbody tr button:has-text("Carica file")')).length === 3, 'chiusa: ogni riga ha «Carica file…»');
  const creaFile = (args) => page.evaluate(async (a) => { const m = await import('/src/verifica-file.js'); const r = m.creaFileEmergenza({ ...a, creatoIl: new Date(a.creatoIl) }); return { testo: r.testo, nome: r.nomeFile }; }, args);
  const datiFile = { verifica: vid2, titolo: 'Verifica per la vista stretta', studente: 'anna@isarome.it', studenteNome: 'Anna Rossi', programma: json1, nBlocchi: 37, nBlocchiSincronizzati: 14, offlineDa: '10:42', creatoIl: Date.now() };
  const carica = async (riga, file, nome = file.nome) => {
    const [scelta] = await Promise.all([page.waitForEvent('filechooser'), page.click(`.tabella-live tbody tr:has-text("${riga}") button:has-text("Carica file")`)]);
    await scelta.setFiles({ name: nome, mimeType: 'application/json', buffer: Buffer.from(file.testo ?? file) });
  };
  // 1) file ritoccato → rifiutato con un messaggio, nessuna finestra
  const buono = await creaFile(datiFile);
  const ritoccato = JSON.parse(buono.testo); ritoccato.nBlocchi = 99; ritoccato.programma = ritoccato.programma.replace('program', 'programma');
  await carica('Anna Rossi', JSON.stringify(ritoccato), buono.nome);
  verifica(await toastContiene(/l'impronta non torna/), 'file ritoccato: rifiutato («l\'impronta non torna»)');
  verifica(!(await page.isVisible('h2:has-text("Carica il file di emergenza")')), '…e non si apre nessuna conferma');
  // 2) file genuino ma di un altro studente (Bruno) caricato sulla riga di Anna → rifiutato
  const diBruno = await creaFile({ ...datiFile, studente: 'bruno@isarome.it', studenteNome: 'Bruno Verdi' });
  await carica('Anna Rossi', diBruno);
  verifica(await toastContiene(/Bruno Verdi.*non dello studente di questa riga/), 'file di un altro studente: rifiutato, dicendo di chi è');
  // 3) un normale file di lavoro non vale come consegna
  await carica('Anna Rossi', json1, 'lavoro.isablock');
  verifica(await toastContiene(/non è un file di emergenza/), 'un normale file di lavoro: rifiutato');
  // «Apri» dell'editor rifiuta il file di emergenza (non è un file di lavoro) e non tocca il programma in corso
  const blocchiPrima = await page.evaluate(() => window.Blockly.getMainWorkspace().getAllBlocks(false).length);
  await page.setInputFiles('#fileInput', { name: buono.nome, mimeType: 'application/json', buffer: Buffer.from(buono.testo) });
  verifica(await toastContiene(/file di emergenza della verifica.*non si riapre qui/), '«Apri» rifiuta il file di emergenza con un messaggio chiaro');
  verifica(await page.evaluate(() => window.Blockly.getMainWorkspace().getAllBlocks(false).length) === blocchiPrima, '…senza toccare il programma in corso');
  // 4) file buono, ma con un nome che non ricorda lo studente: avviso, e confronto dei blocchi
  await carica('Anna Rossi', buono, 'compito-finale.isablock');
  await page.waitForSelector('h2:has-text("Carica il file di emergenza")');
  const conferma = await page.textContent('.modal:last-of-type .modal-box');
  verifica(/non ricorda questo studente/.test(conferma) && /conta il contenuto/.test(conferma), 'conferma: avviso sul nome del file, che non fa fede');
  verifica(/Ultimo salvataggio arrivato al server.*0 blocchi/.test(conferma) && /Nel file.*37 blocchi/.test(conferma), 'conferma: confronto «server → file» (0 → 37 blocchi)');
  verifica(/offline da 10:42/.test(conferma) && /versione v2 della consegna/.test(conferma), '…con l\'ora di offline e la versione che nascerà (v2, sopra la raccolta)');
  await schermata(page, 'v-9e-carica-file');
  await page.click('button:has-text("Guarda il programma del file")');
  await page.waitForSelector('h2:has-text("(dal file)")');
  verifica(await finche(async () => (await page.$$('.anteprima-blocchi .blocklyBlockCanvas [data-id]')).length > 3), 'conferma: «Guarda il programma del file» mostra i blocchi del file');
  await page.keyboard.press('Escape');
  await page.click('button:has-text("Carica come consegna v2")');
  verifica(await finche(async () => (await leggi(`verifiche/${vid2}/consegne`)).documents?.some((d) => d.name.endsWith('/anna@isarome.it_2'))), 'la consegna v2 esiste');
  const c2 = (await leggi(`verifiche/${vid2}/consegne/anna@isarome.it_2`));
  verifica(valoreTesto(c2, 'origine') === 'file' && valoreTesto(c2, 'impronta') === JSON.parse(buono.testo).impronta && valoreTesto(c2, 'nomeFile') === 'compito-finale.isablock' && valoreTesto(c2, 'offlineDa') === '10:42' && c2.fields.nBlocchiSincronizzati?.integerValue === '14' && valoreTesto(c2, 'docenteEmail') === 'docente@isarome.it',
    'consegna v2: origine «file», con impronta, nome del file, offline da, blocchi sincronizzati e docente');
  verifica((await leggi(`verifiche/${vid2}/consegne/anna@isarome.it_1`)).fields?.origine?.stringValue === 'raccolta', '…e la v1 (raccolta) è rimasta com\'era');
  verifica(await finche(async () => /Consegnato \(v2\) · da file/.test(await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi")'))), 'la tabella mostra «Consegnato (v2) · da file»');
  // la tabella mostra Bruno e Carla senza consegna come «Non entrato»; il file di Bruno invece si carica sulla riga giusta (anche se mai entrato)
  await carica('bruno@isarome.it', diBruno, 'bruno.verdi_emergenza.isablock');
  await page.waitForSelector('h2:has-text("Carica il file di emergenza")');
  await page.click('button:has-text("Carica come consegna v1")');
  verifica(await finche(async () => (await leggi(`verifiche/${vid2}/consegne/bruno@isarome.it_1`)).fields?.origine?.stringValue === 'file'), 'un file si carica anche per chi non è mai entrato (v1)');

  // archivia: sparisce dall'elenco, si ritrova con la casella, si ripristina
  dialoghi.length = 0;
  await page.click('.verifica-azioni button:has-text("Archivia")');
  await finche(async () => (await leggi(`verifiche/${vid2}`)).fields.archiviata?.booleanValue === true);
  verifica(dialoghi.length === 1 && /Archivio la verifica/.test(dialoghi[0]) && /Mostra anche le archiviate/.test(dialoghi[0]), 'archivia: chiede conferma e spiega dove si ritrova');
  await page.waitForSelector('text=Nessuna verifica da mostrare');
  verifica(true, 'archiviata: sparisce dall\'elenco (che dice quante sono nascoste)');
  await page.check('text=Mostra anche le verifiche archiviate');
  await page.waitForSelector('.verifica-archiviata');
  verifica(await page.isVisible('.verifica-archiviata .stato-corso[data-stato="archiviata"]'), 'con la casella si rivede, con il badge «Archiviata»');
  await schermata(page, 'v-10-archiviate');
  await page.click('.verifica-archiviata button:has-text("Apri")');
  await page.waitForSelector('.verifica-azioni button:has-text("Ripristina")');
  verifica(!(await page.isVisible('button:has-text("Riapri")')) && !(await page.isVisible('button:has-text("Archivia")')), 'archiviata: c\'è solo «Ripristina» (non si riapre)');
  await page.click('.verifica-azioni button:has-text("Ripristina")');
  await page.waitForSelector('.verifica-azioni button:has-text("Riapri")');
  verifica((await leggi(`verifiche/${vid2}`)).fields.archiviata?.booleanValue === false, 'ripristinata');

  // riapertura con la durata proposta (30 minuti)
  await page.click('.verifica-azioni button:has-text("Riapri")');
  await page.waitForSelector('h2:has-text("Riaprire la verifica")');
  verifica(await page.inputValue('[aria-label="Minuti dall\'apertura"]') === '30', 'riapertura: la durata proposta è 30 minuti');
  await page.click('button:has-text("Riapri la verifica")');
  await page.waitForSelector('.verifica-azioni button:has-text("Chiudi verifica")');
  verifica(await stato2() === 'aperta' && vicinoA((await leggi(`verifiche/${vid2}`)).fields.fine.timestampValue, 30), 'riaperta: finisce tra 30 minuti');
  // chiusa di nuovo, il corso ora si può archiviare
  await page.click('.verifica-azioni button:has-text("Chiudi verifica")');
  await page.click('button:has-text("Chiudi la verifica")');
  await page.waitForSelector('.verifica-azioni button:has-text("Archivia")');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.click('button:has-text("Gestisci")');
  await page.click('button:has-text("Archivia il corso")');
  verifica(await finche(async () => (await leggi(`corsi/${corsoId}`)).fields.attivo.booleanValue === false), 'senza verifiche aperte il corso si archivia (con la sua conferma)');

  verifica(errori.length === 0, `nessun errore nella pagina${errori.length ? `: ${errori.join(' | ')}` : ''}`);
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
process.exit(riuscito ? 0 : 1);
