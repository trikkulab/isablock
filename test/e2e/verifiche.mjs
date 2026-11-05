// Prova nel browser della scheda delle verifiche del docente (passo 6c): corso, verifica in bozza, tracce,
// segno «per tutti», titolo e fine, modifiche non salvate, eliminazione, vista stretta.
// Si lancia con `npm run test:e2e` (avvia gli emulatori Auth e Firestore, vuoti, e questo script).
import { avviaServer } from './server.mjs';
import { avviaBrowser, accedi, abilitaDocente, leggi, scrivi, valoreTesto, verifica, riepilogo, schermata, MOD } from './aiuti.mjs';

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
  verifica(/La verifica sarà aperta per 3 studenti iscritti/.test(dialogoApertura), 'conferma di apertura: dice per quanti studenti');
  verifica(/Tracce: 1 \(per tutti: Versione A\)/.test(dialogoApertura), '…quante tracce e quale è per tutti');
  verifica(/L'apertura non si annulla: per fermare la verifica dovrai chiuderla\./.test(dialogoApertura), '…e avverte che l\'apertura non si annulla');
  verifica(/Finirà/.test(dialogoApertura), '…e mostra quando finirà');
  verifica(!/non potrà usare altro/.test(dialogoApertura), 'finché il blocco dello studente non esiste, il testo non lo promette');
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
  verifica(await toastContiene(/Verifica chiusa\. Lavori: raccolti 0, non entrati 3\./), 'chiusura: dice com\'è andata la raccolta (nessuno era entrato)');
  await page.waitForSelector('.verifica-azioni button:has-text("Archivia")');
  verifica(await stato2() === 'chiusa', 'la verifica è chiusa');
  verifica(await page.isVisible('button:has-text("Raccogli i lavori")') && await page.isVisible('button:has-text("Riapri")'), 'chiusa: si può raccogliere, riaprire, archiviare');

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
