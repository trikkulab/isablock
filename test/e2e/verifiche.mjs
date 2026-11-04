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
  const toast = async () => (await page.waitForSelector('.toast.show', { timeout: 5000 })).textContent();
  verifica(!(await page.isVisible('text=anna@isarome.it')), 'le assegnazioni sono chiuse di default: nessuna email sullo schermo');
  verifica(!(await page.isVisible('.assegnazioni-corpo')), '…e il corpo della sezione è nascosto');
  await page.click('.assegnazioni-toggle');
  await page.waitForSelector('.assegnazioni-riga');
  verifica((await page.$$('.assegnazioni-riga')).length === 3, 'aperta: una riga per ognuno dei 3 iscritti');
  await page.locator('.assegnazioni-riga').last().scrollIntoViewIfNeeded();
  await schermata(page, 'v-5b-assegnazioni');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', 't0');            // a mano: Versione A (la traccia di tutti è B)
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  await aspetta();
  verifica(valoreTesto(await lavoro('anna@isarome.it'), 'tracciaId') === 't0', 'traccia scelta a mano per Anna: salvata (t0)');
  await page.fill('[aria-label="Minuti in più per bruno@isarome.it"]', '15');
  await page.keyboard.press('Tab');
  await aspetta(800);
  const bruno = await lavoro('bruno@isarome.it');
  const fineMs = new Date(2027, 2, 4, 11, 15).getTime();
  verifica(bruno.fields.tracciaId?.nullValue === null && new Date(bruno.fields.scadenza.timestampValue).getTime() === fineMs + 15 * 60000,
    'solo minuti in più per Bruno: scadenza fine+15 e traccia «di tutti» (vuota)');
  await page.check('[aria-label="Seleziona carla@isarome.it"]');
  await page.fill('[aria-label="Minuti in più per i selezionati"]', '5');
  await page.click('button:has-text("Applica ai selezionati")');
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  await aspetta(800);
  verifica(new Date((await lavoro('carla@isarome.it')).fields.scadenza.timestampValue).getTime() === fineMs + 5 * 60000, '«Per i selezionati»: Carla ha 5 minuti in più');
  await page.click('button:has-text("Applica ai selezionati")');
  verifica(/almeno uno studente/.test(await toast()), 'senza nessuno selezionato avvisa invece di fare qualcosa');

  // 5c) avviso su «per tutti»: A è assegnata a mano ad Anna
  await page.hover('.traccia-voce:nth-of-type(1)');
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  await aspetta(600);
  verifica(dialoghi.length === 1 && /assegnata a mano a 1 studente/.test(dialoghi[0]) && /anche gli altri 2 studenti/.test(dialoghi[0]), `avviso su «per tutti»: «${dialoghi[0]?.split('\n').slice(0, 2).join(' ')}»`);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', '…rifiutando, la traccia di tutti non cambia');
  rispondi = 'accept';
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  await aspetta(600);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't0', '…accettando, A diventa la traccia di tutti');
  // con B senza assegnazioni a mano non chiede niente
  dialoghi.length = 0;
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');
  await aspetta(600);
  verifica(dialoghi.length === 0 && valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', 'per una traccia senza assegnazioni a mano nessun avviso: B torna di tutti');

  // 5c-bis) l'avviso c'è anche quando nessun altro la riceverebbe (tutti hanno già una traccia a mano)
  await page.check('[aria-label="Seleziona tutti"]');
  await page.selectOption('[aria-label="Traccia per i selezionati"]', 't1');                // tutti e tre: a mano B
  await page.click('button:has-text("Applica ai selezionati")');
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  await aspetta(900);
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');                           // A di tutti (nessuno la ha a mano: nessun avviso)
  await aspetta(600);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't0', 'A (senza assegnazioni a mano) torna di tutti senza domande');
  dialoghi.length = 0; rispondi = 'dismiss';
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');                           // B: assegnata a mano a tutti e 3, nessun altro la riceverebbe
  await aspetta(600);
  verifica(dialoghi.length === 1 && /assegnata a mano a 3 studenti/.test(dialoghi[0]) && /oggi nessuno/.test(dialoghi[0]), `avviso anche se nessun altro la riceverebbe: «${dialoghi[0]?.split('\n').slice(0, 2).join(' ')}»`);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't0', '…e rifiutando la traccia di tutti non cambia');
  rispondi = 'accept';
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');
  await aspetta(600);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', '…accettando, B diventa la traccia di tutti');
  // si rimette tutto com'era: tutti «di tutti», e la traccia di tutti torna A come nei passi seguenti
  await page.check('[aria-label="Seleziona tutti"]');
  await page.selectOption('[aria-label="Traccia per i selezionati"]', '');
  await page.click('button:has-text("Applica ai selezionati")');
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  await aspetta(900);
  await page.hover('.traccia-voce:nth-of-type(1)');
  await page.click('.traccia-voce:nth-of-type(1) .traccia-usa');
  await aspetta(600);
  await page.hover('.traccia-voce:nth-of-type(2)');
  await page.click('.traccia-voce:nth-of-type(2) .traccia-usa');                           // senza assegnazioni a mano: nessun avviso
  await aspetta(600);
  verifica(valoreTesto(await leggi(`verifiche/${vid}`), 'tracciaDefault') === 't1', 'ripristinato: B di tutti, nessuno con una traccia a mano');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', 't0');            // Anna di nuovo a mano su A, come richiede il passo seguente

  // 5d) una traccia assegnata a mano non si elimina
  await page.click('.traccia-nome:has-text("Versione A")');
  await page.click('button:has-text("Elimina")');
  const messaggio = await page.waitForFunction(() => /riassegnalo prima/.test(document.querySelector('.toast.show')?.textContent ?? ''), null, { timeout: 5000 })
    .then(() => 'ok').catch(() => `non è comparso (toast: «${'' }»)`);
  verifica(messaggio === 'ok', 'eliminare la traccia assegnata a Anna è rifiutato: «1 studente ha questa traccia: riassegnalo prima»');
  await aspetta(500);
  verifica(!!(await leggi(`verifiche/${vid}/tracce/t0`)).fields, '…e la traccia c\'è ancora');
  await page.selectOption('[aria-label="Traccia di anna@isarome.it"]', '');               // Anna torna a «per tutti»
  await page.waitForSelector('.verifica-esito:has-text("Salvato")');
  await aspetta();
  verifica((await lavoro('anna@isarome.it')).fields.tracciaId?.nullValue === null, 'Anna torna alla traccia di tutti (vuota in bozza)');
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

  verifica(errori.length === 0, `nessun errore nella pagina${errori.length ? `: ${errori.join(' | ')}` : ''}`);
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
process.exit(riuscito ? 0 : 1);
