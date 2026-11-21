// Prova nel browser dei feedback del docente sulle consegne (pannello nella copia di prova): commento su un blocco e
// sull'intera consegna, blocco del modulo se si cambia la struttura della copia (non se si sposta solo un blocco),
// sblocco con Ctrl-Z, pubblicazione. Il corso, la verifica chiusa e la consegna si scrivono direttamente nel database.
// Si lancia dentro gli emulatori Auth e Firestore (vedi docs/PDF-SCHEDA.md per le porte alternative).
import { execFileSync } from 'node:child_process';
import { avviaServer } from './server.mjs';
import { avviaBrowser, accedi, abilitaDocente, leggi, scrivi, verifica, riepilogo, schermata, S, B, T, N, A, MOD } from './aiuti.mjs';

const { server } = await avviaServer();
const browser = await avviaBrowser();
let riuscito = false;
const ANNA = 'anna@isarome.it';
const MIN = 60_000;
const finche = async (page, cond, ms = 8000) => {
  const inizio = Date.now();
  while (Date.now() - inizio < ms) { if (await cond()) return true; await page.waitForTimeout(120); }
  return false;
};
const feedbackNelDb = async () => ((await leggi('feedback')).documents ?? []).map((d) => ({
  id: d.name.split('/').pop(), testo: d.fields.testo?.stringValue, bloccoId: d.fields.bloccoId?.stringValue ?? null, pubblicato: d.fields.pubblicato?.booleanValue,
}));
try {
  await abilitaDocente('docente@isarome.it');
  await scrivi('corsi/FB1DEN', { materia: S('Informatica'), classe: S('3CINF'), annoScolastico: S('2026/27'), docenti: A('docente@isarome.it'), iscrizioniAperte: B(true), attivo: B(true) });
  await scrivi(`iscrizioni/FB1DEN_${ANNA}`, { corsoId: S('FB1DEN'), email: S(ANNA), creato: T(Date.now()) });

  const { page, errori } = await accedi(browser, 'docente@isarome.it', { nome: 'Docente Prova' });
  const esempio = await page.evaluate(async () => { const m = await import('/src/examples.js'); return { ...m.examples[0].workspaceState, formatVersion: 6 }; });
  const prog = JSON.stringify(esempio);
  await scrivi('verifiche/vfeed/tracce/t0', { titolo: S('Versione A'), testoMd: S('## Esercizio\n\nScrivi.'), creato: T(Date.now()) });
  await scrivi(`verifiche/vfeed/lavori/${ANNA}`, { studenteEmail: S(ANNA), studenteNome: S('Anna Rossi'), tracciaId: S('t0'), scadenza: T(Date.now() - 30 * MIN), entrato: T(Date.now() - 60 * MIN),
    ultimoSegnale: T(Date.now() - 31 * MIN), programma: S(prog), programmaHash: S('h1'), nBlocchi: { integerValue: '8' }, consegnato: B(true), ultimaConsegna: { integerValue: '1' } });
  await scrivi(`verifiche/vfeed/consegne/${ANNA}_1`, { studenteEmail: S(ANNA), studenteNome: S('Anna Rossi'), corsoId: S('FB1DEN'), titolo: S('Verifica di prova'), versione: { integerValue: '1' }, origine: S('studente'),
    tracciaId: S('t0'), programma: S(prog), creato: T(Date.now() - 31 * MIN) });
  await scrivi('verifiche/vfeed', { corsoId: S('FB1DEN'), titolo: S('Verifica di prova'), stato: S('chiusa'), fine: T(Date.now() - 30 * MIN), tracciaDefault: S('t0'), creataDa: S('docente@isarome.it'),
    creato: T(Date.now() - 120 * MIN), apertaIl: T(Date.now() - 60 * MIN), chiusaIl: T(Date.now() - 30 * MIN) });

  page.on('dialog', (d) => d.accept());
  await page.click('.cloud-menu-btn');
  await page.click('.cloud-voce:has-text("Corsi")');
  await page.click('.corso-blocco:has-text("3CINF") button:has-text("Verifiche")');       // il corso di questa prova: nello stesso emulatore ce ne possono essere altri
  await page.click('.sketch-riga:has-text("Verifica di prova") button:has-text("Apri")');
  await page.waitForSelector('.tabella-live tbody tr:has-text("Anna Rossi")');
  await page.click('.tabella-live tbody tr:has-text("Anna Rossi") button:has-text("Guarda")');
  await page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  await page.click('.modal-actions button:has-text("Apri una copia per provarla")');
  await page.waitForSelector('.banda-copia');
  await page.waitForSelector('.feedback-pannello');
  verifica(await finche(page, async () => /Feedback a Anna Rossi · v1 \(0\)/.test(await page.textContent('.feedback-pannello .commenti-titolo'))), 'copia di prova a verifica chiusa: compare il pannello «Feedback a Anna Rossi · v1 (0)»');
  verifica(await page.isEnabled('.feedback-pannello textarea') && !(await page.isVisible('.feedback-avviso')), '…con il modulo attivo e senza avviso');
  verifica(await page.isDisabled('.feedback-pubblica button'), '…e «Pubblica feedback» spento (niente bozze)');

  // commento sull'intera consegna
  await page.fill('.feedback-pannello textarea', 'Bel lavoro, ordinato.');
  await page.click('.feedback-pannello .commenti-modulo-riga button:has-text("Aggiungi commento")');
  verifica(await finche(page, async () => (await feedbackNelDb()).length === 1), 'commento sull\'intera consegna scritto nel database');
  verifica(await finche(page, async () => /\(1\)/.test(await page.textContent('.feedback-pannello .commenti-titolo'))), '…e il pannello lo mostra');
  verifica(/bozza/.test(await page.textContent('.feedback-pannello .commento')), '…come bozza');
  verifica(await finche(page, async () => await page.isEnabled('.feedback-pubblica button')), '«Pubblica feedback» ora è attivo');

  // commento su un blocco selezionato
  const idBlocco = await page.evaluate(() => {
    const ws = window.Blockly.Workspace.getAll().find((x) => x.getParentSvg().closest('#blocklyDiv'));
    const b = ws.getAllBlocks(false).find((x) => x.type !== 'program');
    window.Blockly.getFocusManager().focusNode(b);
    return b.id;
  });
  await finche(page, async () => /Sul blocco/.test(await page.textContent('.feedback-pannello .commento-selezione')));
  verifica(/Sul blocco/.test(await page.textContent('.feedback-pannello .commento-selezione')), 'selezionando un blocco il modulo dice «Sul blocco: …»');
  await page.fill('.feedback-pannello textarea', 'Controlla questo passaggio.');
  await page.click('.feedback-pannello .commenti-modulo-riga button:has-text("Aggiungi commento")');
  verifica(await finche(page, async () => (await feedbackNelDb()).some((f) => f.bloccoId === idBlocco)), 'il commento sul blocco ha l\'id del blocco');

  // spostare tutto lo sketch non blocca; cambiare la struttura sì; Ctrl-Z sblocca
  await page.evaluate(() => {
    const ws = window.Blockly.Workspace.getAll().find((x) => x.getParentSvg().closest('#blocklyDiv'));
    for (const b of ws.getTopBlocks(false)) b.moveBy(120, 80);
  });
  await page.waitForTimeout(500);
  verifica(await page.isEnabled('.feedback-pannello textarea'), 'spostare lo sketch sul foglio NON blocca il modulo');
  await page.evaluate(() => {
    const ws = window.Blockly.Workspace.getAll().find((x) => x.getParentSvg().closest('#blocklyDiv'));
    window.Blockly.Events.setGroup(true);
    ws.getAllBlocks(false).filter((x) => x.type !== 'program').slice(-1)[0].dispose(true);
    window.Blockly.Events.setGroup(false);
  });
  verifica(await finche(page, async () => await page.isDisabled('.feedback-pannello textarea') && await page.isVisible('.feedback-avviso')), 'togliere un blocco BLOCCA il modulo e compare l\'avviso');
  verifica(await page.isDisabled('.feedback-pannello .commenti-modulo-riga button:has-text("Aggiungi commento")'), '…anche il pulsante «Aggiungi commento»');
  verifica((await page.$$('.feedback-pannello .commento')).length === 2, '…ma i commenti già scritti restano visibili');
  await page.evaluate(() => window.Blockly.Workspace.getAll().find((x) => x.getParentSvg().closest('#blocklyDiv')).undo(false));
  verifica(await finche(page, async () => await page.isEnabled('.feedback-pannello textarea') && !(await page.isVisible('.feedback-avviso'))), 'Ctrl-Z (annulla) rimette la struttura com\'era: il modulo si SBLOCCA da solo');

  // pubblicazione
  await page.click('.feedback-pubblica button:has-text("Pubblica feedback")');
  verifica(await finche(page, async () => (await feedbackNelDb()).every((f) => f.pubblicato === true)), '«Pubblica feedback» mette tutti i commenti come pubblicati nel database');
  verifica(await finche(page, async () => (await page.$$('.feedback-badge-pubblicato')).length === 2 && await page.isDisabled('.feedback-pubblica button')), '…il pannello li mostra «pubblicato» e «Pubblica» si spegne');
  // un commento nuovo dopo la pubblicazione resta bozza
  await page.fill('.feedback-pannello textarea', 'Un\'ultima cosa.');
  await page.click('.feedback-pannello .commenti-modulo-riga button:has-text("Aggiungi commento")');
  verifica(await finche(page, async () => (await feedbackNelDb()).filter((f) => f.pubblicato === false).length === 1), 'un commento nuovo dopo la pubblicazione resta bozza');

  // modifica di un commento già pubblicato: compare «modificato»
  await page.evaluate(() => { window.__prompt = window.prompt; window.prompt = () => 'Bel lavoro, davvero ordinato.'; });
  await page.click('.feedback-pannello .commento:has-text("Bel lavoro, ordinato.") button:has-text("Modifica")');
  verifica(await finche(page, async () => /pubblicato · modificato/.test(await page.textContent('.feedback-pannello'))), 'un commento pubblicato e poi corretto mostra «pubblicato · modificato»');

  // la tabella del docente: colonna Feedback con i conteggi
  await page.click('.banda-copia .banda-copia-torna');
  await page.waitForSelector('.tabella-live tbody tr:has-text("Anna Rossi")');
  verifica(await finche(page, async () => await page.isVisible('.tabella-live th:has-text("Feedback")')), 'tabella a verifica chiusa: colonna «Feedback»');
  verifica(await finche(page, async () => { const t = await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-feedback'); return /💬 2/.test(t) && /1 bozza/.test(t); }), '…con «💬 2» pubblicati e «1 bozza»');
  // «Guarda»: la scheda Feedback in sola lettura, con le bozze segnate e il pulsante per commentare nell'editor
  await page.click('.tabella-live tbody tr:has-text("Anna Rossi") button:has-text("Guarda")');
  await page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  verifica(await finche(page, async () => await page.isVisible('.verifica-scheda:has-text("Feedback (3)")')), 'Guarda: la scheda si chiama «Feedback (3)»');
  await page.click('.verifica-scheda:has-text("Feedback")');
  verifica((await page.$$('.anteprima-feedback .commento')).length === 3 && await page.isVisible('.anteprima-feedback .feedback-badge-bozza'), 'Guarda: i 3 commenti in sola lettura, la bozza segnata');
  verifica(await page.isVisible('.anteprima-feedback button:has-text("Commenta nell\'editor")'), 'Guarda: c\'è «Commenta nell\'editor»');
  await schermata(page, 'f-guarda-feedback');
  await page.keyboard.press('Escape');
  // PDF di archivio: i commenti PUBBLICATI (mai le bozze), con «[n]» accanto alle righe del blocco e l'elenco in fondo
  await page.click('.tabella-live tbody tr:has-text("Anna Rossi") button:text-is("PDF")');
  await page.waitForSelector('h2:has-text("Cosa vuoi nel PDF?")');
  const [pdfScaricato] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('.modal-box button:has-text("Scarica il PDF")')]);
  const percorsoPdf = await pdfScaricato.path();
  let testoPdf = null;
  try { testoPdf = execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite', '-sOutputFile=-', percorsoPdf], { encoding: 'utf8', maxBuffer: 20_000_000 }); } catch { /* senza Ghostscript non si controlla il testo */ }
  if (testoPdf === null) console.log('        (Ghostscript non disponibile: il testo del PDF non si controlla)');
  else {
    verifica(/Commenti del docente/.test(testoPdf), 'PDF: c\'è l\'elenco «Commenti del docente»');
    verifica(/\[1\] Bel lavoro, davvero ordinato\./.test(testoPdf), 'PDF: il commento generale pubblicato (come corretto) è il [1]');
    verifica(/\[2\] .*rig[ah] .* · .*Controlla questo passaggio\./.test(testoPdf.replace(/\s+/g, ' ')), 'PDF: il commento sul blocco è il [2], con le righe del blocco');
    verifica(!/Un'ultima cosa/.test(testoPdf), 'PDF: la bozza non c\'è');
    verifica((testoPdf.match(/\[2\]/g) || []).length >= 3, 'PDF: «[2]» compare anche accanto alle righe dei codici');
  }
  // una consegna nuova (v2) senza commenti: la tabella lo dice
  await scrivi(`verifiche/vfeed/consegne/${ANNA}_2`, { studenteEmail: S(ANNA), studenteNome: S('Anna Rossi'), corsoId: S('FB1DEN'), titolo: S('Verifica di prova'), versione: { integerValue: '2' }, origine: S('raccolta'),
    tracciaId: S('t0'), programma: S(prog), creato: T(Date.now() - 10 * MIN) });
  verifica(await finche(page, async () => /v2 senza commenti/.test(await page.textContent('.tabella-live tbody tr:has-text("Anna Rossi") .tabella-feedback'))), 'consegna nuova (v2) con commenti solo sulla v1: la tabella dice «v2 senza commenti»');

  // Storia: i commenti seguono la consegna che si guarda (v2: nessuno, con la riga che dice dove sono gli altri; v1: i suoi 3; un'istantanea: nessuno)
  await scrivi(`verifiche/vfeed/lavori/${ANNA}/storia/p0`, { programma: S(prog), nBlocchi: { integerValue: '5' }, t: T(Date.now() - 40 * MIN), tipo: S('periodica') });
  await page.click('.tabella-live tbody tr:has-text("Anna Rossi") button:has-text("Guarda")');
  await page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  await page.click('.verifica-scheda:has-text("Feedback")');
  verifica(await finche(page, async () => (await page.$$('.anteprima-feedback .commento')).length === 0 && /Consegna v2/.test(await page.textContent('.anteprima-feedback')) && /v1 \(3\)/.test(await page.textContent('.feedback-altre'))), 'Guarda sull\'ultima consegna (v2): nessun commento (sono sulla v1) e la riga «anche su altre consegne: v1 (3)»');
  verifica((await page.textContent('.verifica-scheda:has-text("Feedback")')).trim() === 'Feedback', '…e la scheda non ha il numero');
  await page.click('button:has-text("Storia")');
  await page.waitForSelector('.anteprima-storia:not([hidden])');
  await page.click('.anteprima-storia button[aria-label="Istantanea precedente"]');
  verifica(await finche(page, async () => /\(v1/.test(await page.textContent('.anteprima-etichetta')) && (await page.$$('.anteprima-feedback .commento')).length === 3 && /Consegna v1/.test(await page.textContent('.anteprima-feedback'))), 'Storia sulla consegna v1: i 3 commenti della v1');
  verifica(await page.isVisible('.verifica-scheda:has-text("Feedback (3)")'), '…e la scheda dice «Feedback (3)»');
  await page.click('.anteprima-storia button[aria-label="Istantanea precedente"]');
  verifica(await finche(page, async () => (await page.$$('.anteprima-feedback .commento')).length === 0 && /istantanea del lavoro/.test(await page.textContent('.anteprima-feedback'))), 'Storia su un\'istantanea del lavoro: nessun commento, e lo dice');
  await page.click('.anteprima-storia button[aria-label="Istantanea successiva"]');
  await page.click('.anteprima-storia button[aria-label="Istantanea successiva"]');
  verifica(await finche(page, async () => (await page.$$('.anteprima-feedback .commento')).length === 0 && /Consegna v2/.test(await page.textContent('.anteprima-feedback'))), 'tornando all\'ultima consegna: di nuovo quelli della v2 (nessuno)');
  await page.keyboard.press('Escape');

  // lo studente: «Le mie consegne» → Guarda → «Feedback»: solo i pubblicati, di tutte le versioni
  const studente = await accedi(browser, ANNA, { nome: 'Anna Rossi' });
  studente.page.on('dialog', (d) => d.accept());
  await studente.page.click('.cloud-menu-btn');
  await studente.page.click('.cloud-voce:has-text("Le mie consegne")');
  await studente.page.waitForSelector('.consegna-riga');
  await studente.page.click('.consegne-gruppo:has-text("Verifica di prova") .consegna-riga:has-text("v1") button:has-text("Guarda")');
  await studente.page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  verifica(await finche(studente.page, async () => await studente.page.isVisible('.verifica-scheda:has-text("Feedback (2)")')), 'studente: la scheda si chiama «Feedback (2)» (la bozza non c\'è)');
  await studente.page.click('.verifica-scheda:has-text("Feedback")');
  const testoStudente = await studente.page.textContent('.anteprima-feedback');
  verifica((await studente.page.$$('.anteprima-feedback .commento')).length === 2 && !/bozza|Un'ultima cosa/.test(testoStudente), 'studente: vede i 2 pubblicati e non la bozza, senza segni di stato');
  verifica(/modificato/.test(testoStudente) && /davvero ordinato/.test(testoStudente), 'studente: il commento corretto dopo la pubblicazione mostra «modificato» e il testo nuovo');
  verifica(!(await studente.page.isVisible('.anteprima-feedback button:has-text("Commenta")')), 'studente: nessun pulsante per commentare');
  // la v2 di Anna (nessun commento su di lei): lo studente vede solo quelli della v2, con la riga che dice dove sono gli altri
  await studente.page.keyboard.press('Escape');
  await studente.page.click('.consegne-gruppo:has-text("Verifica di prova") .consegna-riga:has-text("v2") button:has-text("Guarda")');
  await studente.page.waitForSelector('.anteprima-blocchi svg.blocklySvg');
  await studente.page.click('.verifica-scheda:has-text("Feedback")');
  verifica(await finche(studente.page, async () => (await studente.page.$$('.anteprima-feedback .commento')).length === 0 && /Consegna v2/.test(await studente.page.textContent('.anteprima-feedback')) && /v1 \(2\)/.test(await studente.page.textContent('.feedback-altre'))), 'studente sulla v2: nessun commento (sono sulla v1), con «anche su altre consegne: v1 (2)»');
  // la v1 aperta nell'editor: il pannello dei commenti in sola lettura, accanto al codice
  await studente.page.keyboard.press('Escape');
  await studente.page.click('.consegne-gruppo:has-text("Verifica di prova") .consegna-riga:has-text("v1") button:has-text("Apri nell")');
  await studente.page.waitForSelector('.feedback-pannello');
  verifica(await finche(studente.page, async () => /Feedback del docente · v1 \(2\)/.test(await studente.page.textContent('.feedback-pannello .commenti-titolo'))), 'studente, v1 nell\'editor: pannello «Feedback del docente · v1 (2)»');
  verifica((await studente.page.$$('.feedback-pannello .commento')).length === 2 && !(await studente.page.isVisible('.feedback-pannello textarea')) && !(await studente.page.isVisible('.feedback-pannello button:has-text("Pubblica")')) && !(await studente.page.isVisible('.feedback-pannello button:has-text("Elimina")')), '…i 2 commenti pubblicati, senza modulo né pulsanti (sola lettura)');
  verifica(!/Un'ultima cosa/.test(await studente.page.textContent('.feedback-pannello')) && /modificato/.test(await studente.page.textContent('.feedback-pannello')), '…la bozza non c\'è e il commento corretto dopo la pubblicazione dice «modificato»');
  await schermata(studente.page, 'f-studente-editor');
  await studente.page.click('#btnNew');
  verifica(await finche(studente.page, async () => !(await studente.page.isVisible('.feedback-pannello'))), '…e il pannello sparisce quando il programma viene sostituito');
  verifica(studente.errori.length === 0, `nessun errore nella pagina dello studente${studente.errori.length ? `: ${studente.errori.join(' | ')}` : ''}`);

  // il pannello sparisce quando la copia viene sostituita
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');                      // le finestre della verifica (la tabella) coprono l'editor
  await page.click('#btnNew');
  verifica(await finche(page, async () => !(await page.isVisible('.feedback-pannello'))), 'sostituendo il programma (Nuovo) il pannello sparisce');

  verifica(errori.length === 0, `nessun errore nella pagina${errori.length ? `: ${errori.join(' | ')}` : ''}`);
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  server.close();
}
process.exit(riuscito ? 0 : 1);
