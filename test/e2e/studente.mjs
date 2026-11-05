// Prova nel browser della modalità verifica DELLO STUDENTE (passo 7b). Il docente è simulato scrivendo nel database
// (la sua interfaccia ha la sua prova in verifiche.mjs); lo studente è un utente vero nel browser.
// Si lancia con `npm run test:e2e` (insieme alla prova del docente) oppure da solo dentro gli emulatori.
import { avviaServer } from './server.mjs';
import { avviaBrowser, accedi, leggi, scrivi, abilitaDocente, valoreTesto, verifica, riepilogo, schermata, S, B, T, N, A } from './aiuti.mjs';

const { server } = await avviaServer();
const browser = await avviaBrowser();
let riuscito = false;
let paginaStudente = null;                                      // per lo screenshot dell'errore
const ANNA = 'anna@isarome.it';
const CARLA = 'carla@isarome.it';
const MIN = 60_000;
const ora = () => Date.now();
const finche = async (page, cond, ms = 8000) => {
  const inizio = Date.now();
  while (Date.now() - inizio < ms) { if (await cond()) return true; await page.waitForTimeout(120); }
  return false;
};

// ── Dati: un corso con due iscritte, e verifiche aperte (create dal «docente» direttamente nel database) ──
async function preparaCorso() {
  await abilitaDocente('docente@isarome.it');
  await scrivi('corsi/ST1DEN', { materia: S('Informatica'), classe: S('3BINF'), annoScolastico: S('2026/27'), docenti: A('docente@isarome.it'), iscrizioniAperte: B(true), attivo: B(true) });
  for (const e of [ANNA, CARLA]) await scrivi(`iscrizioni/ST1DEN_${e}`, { corsoId: S('ST1DEN'), email: S(e), creato: T(ora()) });
}
async function apriVerifica(id, { titolo, scadenzaMin = 30, apertaMinFa = 10, assegnaAnna = true } = {}) {
  // Come fa il docente: traccia e assegnazioni esistono già quando la verifica si apre (la verifica si scrive per ultima)
  await scrivi(`verifiche/${id}/tracce/t0`, { titolo: S('Versione A'), testoMd: S(`## Esercizio di ${titolo}\n\nScrivi un programma che **stampa** i numeri da 1 a 3.\n\n- primo passo\n- secondo passo`), rev: { integerValue: '0' }, modificato: T(ora()) });
  if (assegnaAnna) await scrivi(`verifiche/${id}/lavori/${ANNA}`, { studenteEmail: S(ANNA), tracciaId: S('t0'), scadenza: T(ora() + scadenzaMin * MIN), entrato: N(), consegnato: B(false) });
  await scrivi(`verifiche/${id}`, { corsoId: S('ST1DEN'), titolo: S(titolo), stato: S('aperta'), fine: T(ora() + scadenzaMin * MIN), tracciaDefault: S('t0'),
    creataDa: S('docente@isarome.it'), creato: T(ora() - 60 * MIN), apertaIl: T(ora() - apertaMinFa * MIN), chiusaIl: N() });
}
const lavoro = async (id) => leggi(`verifiche/${id}/lavori/${ANNA}`);
const consegne = async (id) => ((await leggi(`verifiche/${id}/consegne`)).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), origine: valoreTesto(d, 'origine'), programma: valoreTesto(d, 'programma') }));

// Aiuti sulla pagina dello studente
const pseudo = (page) => page.$eval('#outputPseudocode', (e) => e.textContent.trim());
const modaleAperto = (page, titolo) => page.isVisible(`.modal:not([hidden]) h2:has-text("${titolo}")`);
const caricaEsempio = (page) => page.evaluate(async () => {            // come se lo studente avesse costruito dei blocchi
  const { examples } = await import('/src/examples.js');
  window.Blockly.serialization.workspaces.load(examples[0].workspaceState, window.Blockly.getMainWorkspace());
});

try {
  await preparaCorso();
  await apriVerifica('va', { titolo: 'Verifica di prova' });

  // 1) chi non ha un'assegnazione non vede niente
  {
    const { page: pCarla } = await accedi(browser, CARLA, { nome: 'Carla Neri' });
    await pCarla.waitForTimeout(2500);
    verifica(!(await pCarla.isVisible('.modal:not([hidden])')), 'chi è iscritta ma non ha l\'assegnazione non vede nessuna finestra di scelta');
    verifica(!(await pCarla.isVisible('.banda-verifica')), '…e l\'app resta quella di sempre');
    await pCarla.context().close();
  }

  // 2) Anna ha del lavoro nell'editor (un esempio), poi accede: compare la scelta, che non si può chiudere
  const { page, errori } = await accedi(browser, ANNA, {
    nome: 'Anna Rossi',
    prima: async (p) => {
      p.once('dialog', (d) => d.accept());                                                 // «Caricare l'esempio...?»
      await p.selectOption('#exampleSelect', { index: 1 });
      await p.waitForFunction(() => document.querySelector('#outputPseudocode').textContent.trim() !== 'INIZIO\nFINE');
    },
  });
  paginaStudente = page;
  const pseudoPrima = await pseudo(page);
  verifica(pseudoPrima !== 'INIZIO\nFINE', 'prima della verifica l\'editor ha un esempio');
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")');
  verifica(true, 'all\'accesso compare la finestra «Verifica aperta»');
  verifica((await page.locator('.modal:not([hidden]) .modal-close').count()) === 0, 'la finestra di scelta non ha il ✕');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);                                                            // clic fuori dalla finestra
  await page.waitForTimeout(300);
  verifica(await modaleAperto(page, 'Verifica aperta'), 'né Esc né il clic fuori la chiudono');
  const bloccato = await page.click('#btnNew', { timeout: 1200 }).then(() => false).catch(() => true);
  verifica(bloccato, 'l\'app sotto non è utilizzabile (un clic su «Nuovo» non arriva)');
  const testoScelta = await page.textContent('.modal:not([hidden]) .modal-box');
  verifica(/Verifica di prova/.test(testoScelta) && /Informatica|3BINF/.test(testoScelta) && /finisce/.test(testoScelta), `la scelta mostra titolo, corso e fine: «${testoScelta.replace(/\s+/g, ' ').slice(0, 120)}»`);
  verifica(/non puoi usare altro/.test(testoScelta), 'e dice che finché non consegna non può usare altro');
  await schermata(page, 's-1-scelta');

  // 3) iniziare: avviso sul lavoro non salvato (si può annullare), poi si entra
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.waitForSelector('h2:has-text("Il tuo lavoro attuale non è vuoto")');
  const avviso = await page.locator('.modal:not([hidden]) .modal-box').last().textContent();
  verifica(/l'editor parte vuoto/.test(avviso) && /copia automatica su questo computer/.test(avviso) && /riprenderlo/.test(avviso), 'avviso sul lavoro non salvato: dice che l\'editor parte vuoto e che il lavoro resta in una copia automatica');
  await schermata(page, 's-2-avviso');
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.waitForTimeout(300);
  verifica(await modaleAperto(page, 'Verifica aperta') && (await pseudo(page)) === pseudoPrima, 'annullando si resta alla scelta e il lavoro non è stato toccato');
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.click('button:has-text("Entra in verifica")');
  await page.waitForSelector('.banda-verifica');
  verifica(true, 'entrata in verifica: compare la fascia in alto');
  verifica((await pseudo(page)) === 'INIZIO\nFINE', 'l\'editor è vuoto');
  const testoBanda = await page.textContent('.banda-verifica');
  verifica(/VERIFICA/.test(testoBanda) && /Verifica di prova/.test(testoBanda) && /Consegna/.test(testoBanda), `la fascia ha etichetta, titolo e «Consegna»: «${testoBanda.replace(/\s+/g, ' ').trim()}»`);
  const timer = await page.textContent('.banda-verifica-timer');
  verifica(/^(\d{2}:\d{2}|\d:\d{2}:\d{2})$/.test(timer) && /^(29|28):/.test(timer), `il timer mostra il tempo rimasto: ${timer}`);
  verifica((await page.getAttribute('.banda-verifica-timer', 'data-colore')) === 'verde', 'con molto tempo il timer è verde');
  await schermata(page, 's-3-verifica');

  // 4) cosa è spento e cosa c'è
  verifica(await page.isDisabled('#btnLoad') && await page.isDisabled('#btnSave') && await page.isDisabled('#exampleSelect'), 'Apri, Salva ed esempi sono spenti');
  verifica(await page.isDisabled('.cloud-menu-btn'), 'il menu del cloud (sketch, corsi, esci) è spento');
  verifica(!(await page.isVisible('.autosave-info')), 'le copie automatiche non si vedono');
  await finche(page, async () => (await page.textContent('#tracciaBox')).includes('Esercizio'));      // la traccia si carica in modo asincrono
  verifica(await page.isVisible('#tabTraccia') && (await page.getAttribute('#tabTraccia', 'class')).includes('active'), 'la scheda «Traccia» c\'è ed è aperta');
  const traccia = await page.textContent('#tracciaBox');
  verifica(/Esercizio di Verifica di prova/.test(traccia) && /stampa/.test(traccia) && /primo passo/.test(traccia), 'la traccia assegnata si legge, in Markdown reso');
  verifica((await page.$$('#tracciaBox .traccia-md strong, #tracciaBox .traccia-md li')).length >= 3, '…con grassetto ed elenco');
  verifica(await page.isEnabled('.tab-btn[data-tab="c"]') && await page.isEnabled('.tab-btn[data-tab="python"]'), 'le schede del codice (C, Python) restano disponibili');
  await page.click('#btnNew', { trial: true, timeout: 1500 }).catch(() => {});
  verifica(await page.isEnabled('#btnRun'), 'si può eseguire il programma a blocchi');
  await schermata(page, 's-4-traccia');

  // 5) il lavoro si salva da solo, solo se cambia; il battito arriva
  await finche(page, async () => (await lavoro('va')).fields?.entrato?.timestampValue);
  const l0 = await lavoro('va');
  verifica(!!l0.fields.entrato?.timestampValue && valoreTesto(l0, 'studenteNome') === 'Anna Rossi', 'l\'ingresso è registrato (entrato, nome)');
  await caricaEsempio(page);                                                                // lo studente costruisce dei blocchi
  verifica(await finche(page, async () => { const l = await lavoro('va'); return !!valoreTesto(l, 'programma') && Number(l.fields.nBlocchi?.integerValue) > 0; }, 10000), 'dopo la pausa di salvataggio il programma è nel database, con il numero di blocchi');
  const l1 = await lavoro('va');
  const segnale1 = l1.fields.ultimoSegnale.timestampValue;
  verifica(await finche(page, async () => (await lavoro('va')).fields.ultimoSegnale.timestampValue !== segnale1, 9000), 'senza altre modifiche arriva il battito (ultimo segnale che avanza)');

  // 6) consegna: conferma, poi consegnato, si torna al lavoro di prima
  await page.click('.banda-verifica button:has-text("Consegna")');
  await page.waitForSelector('h2:has-text("Consegni il lavoro?")');
  const confermaConsegna = await page.locator('.modal:not([hidden]) .modal-box').last().textContent();
  verifica(/Dopo la consegna non potrai più modificarlo/.test(confermaConsegna) && /Tempo rimasto: \d/.test(confermaConsegna), 'la conferma dice che dopo non si modifica e quanto tempo resta');
  await page.getByRole('button', { name: 'Continua a lavorare', exact: true }).click();
  await page.waitForTimeout(300);
  verifica(!(await modaleAperto(page, 'Consegni il lavoro?')) && await page.isVisible('.banda-verifica'), '«Continua a lavorare» chiude la conferma e si resta in verifica');
  const programmaConsegnato = await page.evaluate(() => document.querySelector('#outputPseudocode').textContent.trim());
  await page.click('.banda-verifica button:has-text("Consegna")');
  await page.click('.modal:not([hidden]) .modal-actions button:has-text("Consegna")');
  await page.waitForSelector('h2:has-text("Lavoro consegnato")');
  verifica(true, 'dopo la consegna compare «Lavoro consegnato»');
  const c = await consegne('va');
  verifica(c.length === 1 && c[0].id === `${ANNA}_1` && c[0].origine === 'studente' && !!c[0].programma, `la consegna esiste (v1, origine studente): ${JSON.stringify(c.map((x) => [x.id, x.origine]))}`);
  verifica(valoreTesto(await lavoro('va'), 'consegnato') === undefined && (await lavoro('va')).fields.consegnato.booleanValue === true, 'il lavoro risulta consegnato');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await page.waitForSelector('.banda-verifica', { state: 'detached' });
  verifica(!(await page.isVisible('.banda-verifica')) && !(await page.isVisible('#tabTraccia')), 'finita la verifica spariscono fascia e scheda Traccia');
  verifica(await page.isEnabled('#btnLoad') && await page.isEnabled('#btnSave') && await page.isEnabled('#exampleSelect') && await page.isEnabled('.cloud-menu-btn'), 'Apri, Salva, esempi e menu del cloud tornano disponibili');
  verifica((await pseudo(page)) === pseudoPrima, 'e l\'editor torna al lavoro che c\'era prima della verifica');
  await page.waitForTimeout(800);
  verifica(!(await page.isVisible('.modal:not([hidden])')), 'non c\'è altro da fare: nessuna scelta');
  await schermata(page, 's-5-finita');

  // 7) una seconda verifica si apre mentre lo studente è dentro: compare la scelta; poi si ricarica la pagina a metà
  await apriVerifica('vb', { titolo: 'Seconda verifica' });
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 10000 });
  verifica(true, 'una verifica che si apre mentre lo studente è dentro fa comparire la scelta');
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.click('button:has-text("Entra in verifica")');                                // l'editor non era vuoto: avviso
  await page.waitForSelector('.banda-verifica');
  await caricaEsempio(page);
  await finche(page, async () => !!valoreTesto(await lavoro('vb'), 'programma'), 10000);
  const programmaPrimaDelRicarico = await pseudo(page);
  await page.reload();
  await page.click('text=Ho capito, iniziamo', { timeout: 1500 }).catch(() => {});
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 15000 });
  verifica(true, 'dopo il ricaricamento la scelta ricompare');
  verifica(!(await page.isVisible('#restoreModal:not([hidden])')), 'e non si propone di riprendere vecchie copie nel mezzo della verifica');
  verifica((await page.textContent('.modal:not([hidden]) .modal-box')).includes('Riprendi'), 'il pulsante dice «Riprendi»');
  await page.getByRole('button', { name: 'Riprendi', exact: true }).click();
  await page.waitForSelector('.banda-verifica');
  verifica((await pseudo(page)) === programmaPrimaDelRicarico, 'si riprende il lavoro già salvato');
  verifica(!(await modaleAperto(page, 'Il tuo lavoro attuale non è vuoto')), 'ricaricata la pagina l\'editor era vuoto: nessun avviso');
  await page.click('.banda-verifica button:has-text("Consegna")');
  await page.click('.modal:not([hidden]) .modal-actions button:has-text("Consegna")');
  await page.waitForSelector('h2:has-text("Lavoro consegnato")');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  // a verifica finita, la proposta di riprendere i lavori salvati (compreso quello di prima) parte come sempre
  await page.waitForSelector('#restoreModal:not([hidden])', { timeout: 8000 });
  verifica(true, 'finita la verifica compare la proposta di riprendere il lavoro salvato (quello di prima della verifica)');
  await schermata(page, 's-6-ripristino');
  await page.click('#restoreCloseBtn');

  // 7b) copia locale e traccia aggiornata. La rete verso il database si blocca: il lavoro resta solo nella copia locale,
  // si ricarica la pagina e lo studente lo ritrova (il motore lo scrive); poi il docente corregge la traccia.
  await apriVerifica('ve', { titolo: 'Verifica con copia locale' });
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.click('button:has-text("Entra in verifica")', { timeout: 2500 }).catch(() => {});
  await page.waitForSelector('.banda-verifica');
  await finche(page, async () => !!valoreTesto(await lavoro('ve'), 'programmaHash'), 10000);
  const hashIngresso = valoreTesto(await lavoro('ve'), 'programmaHash');
  const verso = new RegExp(`:${(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':')[1]}/`);
  await page.context().route(verso, (r) => r.abort());                              // niente più rete verso il database
  await caricaEsempio(page);
  await page.waitForTimeout(2800);                                                         // la copia locale si scrive dopo ~1,5 s
  const programmaSoloLocale = await pseudo(page);
  verifica(valoreTesto(await lavoro('ve'), 'programmaHash') === hashIngresso, 'a rete bloccata il database non ha il nuovo programma');
  await page.context().unroute(verso);
  errori.splice(0, errori.length, ...errori.filter((e) => !e.includes('ERR_FAILED')));          // gli errori di rete provocati apposta
  await page.reload();
  await page.click('text=Ho capito, iniziamo', { timeout: 1500 }).catch(() => {});
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 15000 });
  await page.getByRole('button', { name: 'Riprendi', exact: true }).click();
  await page.waitForSelector('.banda-verifica');
  verifica((await pseudo(page)) === programmaSoloLocale, 'ricaricata la pagina si ritrova il lavoro che era solo nella copia locale');
  verifica(await finche(page, async () => valoreTesto(await lavoro('ve'), 'programmaHash') !== hashIngresso, 10000), 'e il motore lo scrive sul database');
  verifica((await page.textContent('body')).includes('Ho ripreso il tuo lavoro dalla copia su questo computer'), 'con un messaggio che lo dice');
  verifica(!(await page.isVisible('.traccia-aggiornata')), 'la traccia non risulta «aggiornata» se non è cambiata');
  await scrivi('verifiche/ve/tracce/t0', { titolo: S('Versione A'), testoMd: S('## Esercizio corretto\n\nTesto **nuovo** della traccia.'), rev: { integerValue: '1' }, modificato: T(ora()) });
  await page.waitForSelector('.traccia-aggiornata', { timeout: 10000 });
  verifica(/Traccia aggiornata alle \d\d:\d\d/.test(await page.textContent('.traccia-aggiornata')), 'se il docente corregge la traccia compare «Traccia aggiornata alle hh:mm»');
  verifica((await page.textContent('#tracciaBox')).includes('Testo nuovo della traccia'), 'e il testo mostrato è quello nuovo');
  {
    const misure = () => page.evaluate(() => {
      const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      return { testo: px('#tracciaBox .traccia-md'), titoletto: px('#tracciaBox .traccia-md h2'), avviso: px('.traccia-aggiornata'), titolo: px('.traccia-pannello-titolo'), pulsante: px('.traccia-zoom button') };
    });
    const prima = await misure();
    await page.click('.traccia-zoom button[aria-label="Testo più grande"]');
    await page.click('.traccia-zoom button[aria-label="Testo più grande"]');
    const dopo = await misure();
    verifica(dopo.testo > prima.testo && dopo.titoletto > prima.titoletto, `A+ ingrandisce il testo della traccia, titoli compresi (${prima.testo} → ${dopo.testo} px)`);
    verifica(dopo.avviso === prima.avviso && dopo.titolo === prima.titolo && dopo.pulsante === prima.pulsante, 'e non l\'avviso, il titolo né i pulsanti');
    await page.click('.traccia-zoom button[aria-label="Testo più piccolo"]');
    await page.click('.traccia-zoom button[aria-label="Testo più piccolo"]');
    await page.click('.traccia-zoom button[aria-label="Testo più piccolo"]');
    verifica((await misure()).testo < prima.testo, 'A− lo rimpicciolisce');
    await page.click('.traccia-zoom button[aria-label="Testo più grande"]');
  }
  verifica(await finche(page, async () => (await lavoro('ve')).fields?.tracciaRevVista?.integerValue === '1', 8000), 'la revisione vista è scritta nel lavoro (per il docente)');
  await schermata(page, 's-6b-traccia-aggiornata');
  await page.click('.banda-verifica button:has-text("Consegna")');
  await page.click('.modal:not([hidden]) .modal-actions button:has-text("Consegna")');
  await page.waitForSelector('h2:has-text("Lavoro consegnato")');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  verifica(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('isablock.verifica.backup.'))), 'consegnata la verifica, la copia locale non c\'è più');
  await page.waitForSelector('#restoreModal:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.click('#restoreCloseBtn', { timeout: 1500 }).catch(() => {});

  // 8) il docente chiude la verifica mentre lo studente lavora: giallo, poi «terminata»
  await apriVerifica('vc', { titolo: 'Verifica da chiudere', scadenzaMin: 8, apertaMinFa: 50 });
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.waitForSelector('.banda-verifica');
  verifica((await page.getAttribute('.banda-verifica-timer', 'data-colore')) === 'giallo', 'con poco tempo (meno del 25% del totale) il timer è giallo');
  await scrivi('verifiche/vc', { corsoId: S('ST1DEN'), titolo: S('Verifica da chiudere'), stato: S('chiusa'), fine: T(ora() + 8 * MIN), tracciaDefault: S('t0'), creataDa: S('docente@isarome.it'), creato: T(ora() - 60 * MIN), apertaIl: T(ora() - 50 * MIN), chiusaIl: T(ora()) });
  await page.waitForSelector('h2:has-text("Verifica terminata")', { timeout: 10000 });
  verifica(true, 'se il docente chiude la verifica, lo studente lo vede: «Verifica terminata»');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await page.waitForSelector('.banda-verifica', { state: 'detached' });
  verifica(await page.isEnabled('#btnLoad'), 'e l\'app si sblocca');

  // 9) la fine del tempo: consegna da sola
  await apriVerifica('vd', { titolo: 'Verifica a tempo', scadenzaMin: 0.2 });              // 12 secondi
  await page.waitForSelector('.modal:not([hidden]) h2:has-text("Verifica aperta")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.waitForSelector('.banda-verifica');
  verifica((await page.getAttribute('.banda-verifica-timer', 'data-colore')) === 'rosso', 'con meno di 5 minuti il timer è rosso');
  await caricaEsempio(page);
  await page.waitForSelector('h2:has-text("Tempo scaduto")', { timeout: 30000 });
  verifica(true, 'scaduto il tempo compare «Tempo scaduto»');
  const cd = await consegne('vd');
  verifica(cd.length === 1 && cd[0].origine === 'automatica', `e il lavoro è stato consegnato da solo: ${JSON.stringify(cd.map((x) => [x.id, x.origine]))}`);
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await page.waitForSelector('.banda-verifica', { state: 'detached' });

  verifica(errori.length === 0, `nessun errore nella pagina${errori.length ? `: ${errori.join(' | ')}` : ''}`);
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 4).join(' | '));
  if (paginaStudente) await schermata(paginaStudente, 'errore').catch(() => {});
} finally {
  await browser.close();
  server.close();
}
process.exit(riuscito ? 0 : 1);
