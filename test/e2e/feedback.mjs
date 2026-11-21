// Prova nel browser dei feedback del docente sulle consegne (pannello nella copia di prova): commento su un blocco e
// sull'intera consegna, blocco del modulo se si cambia la struttura della copia (non se si sposta solo un blocco),
// sblocco con Ctrl-Z, pubblicazione. Il corso, la verifica chiusa e la consegna si scrivono direttamente nel database.
// Si lancia dentro gli emulatori Auth e Firestore (vedi docs/PDF-SCHEDA.md per le porte alternative).
import { avviaServer } from './server.mjs';
import { avviaBrowser, accedi, abilitaDocente, leggi, scrivi, verifica, riepilogo, S, B, T, N, A, MOD } from './aiuti.mjs';

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
  await scrivi('verifiche/vf/tracce/t0', { titolo: S('Versione A'), testoMd: S('## Esercizio\n\nScrivi.'), creato: T(Date.now()) });
  await scrivi(`verifiche/vf/lavori/${ANNA}`, { studenteEmail: S(ANNA), studenteNome: S('Anna Rossi'), tracciaId: S('t0'), scadenza: T(Date.now() - 30 * MIN), entrato: T(Date.now() - 60 * MIN),
    ultimoSegnale: T(Date.now() - 31 * MIN), programma: S(prog), programmaHash: S('h1'), nBlocchi: { integerValue: '8' }, consegnato: B(true), ultimaConsegna: { integerValue: '1' } });
  await scrivi(`verifiche/vf/consegne/${ANNA}_1`, { studenteEmail: S(ANNA), studenteNome: S('Anna Rossi'), corsoId: S('FB1DEN'), titolo: S('Verifica di prova'), versione: { integerValue: '1' }, origine: S('studente'),
    tracciaId: S('t0'), programma: S(prog), creato: T(Date.now() - 31 * MIN) });
  await scrivi('verifiche/vf', { corsoId: S('FB1DEN'), titolo: S('Verifica di prova'), stato: S('chiusa'), fine: T(Date.now() - 30 * MIN), tracciaDefault: S('t0'), creataDa: S('docente@isarome.it'),
    creato: T(Date.now() - 120 * MIN), apertaIl: T(Date.now() - 60 * MIN), chiusaIl: T(Date.now() - 30 * MIN) });

  page.on('dialog', (d) => d.accept());
  await page.click('.cloud-menu-btn');
  await page.click('.cloud-voce:has-text("Corsi")');
  await page.click('button:has-text("Verifiche")');
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

  // il pannello sparisce quando la copia viene sostituita
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
