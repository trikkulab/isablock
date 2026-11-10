// Prova nel browser della finestra di accesso (riassunto + testo completo) e della Guida a sezioni, con il cloud acceso e spento.
// Si lancia con `npm run test:e2e` (dentro gli emulatori) oppure da solo: non scrive nel database.
import { avviaServer } from './server.mjs';
import { avviaBrowser, verifica, riepilogo, schermata } from './aiuti.mjs';

const { server } = await avviaServer(8123);
const { server: serverSenzaCloud } = await avviaServer(8124, { cloud: false });
const browser = await avviaBrowser();
let riuscito = false;

async function apri(url, { altezza = 860 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: altezza } });
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  await page.goto(url);
  await page.click('text=Ho capito, iniziamo', { timeout: 5000 }).catch(() => {});
  return { page, errori };
}
// Visibile DAVVERO: dentro lo schermo e dentro la finestra che lo contiene (che ha un suo scorrimento), non solo nella pagina.
const inVista = (page, sel) => page.$eval(sel, (e) => {
  const r = e.getBoundingClientRect();
  const box = e.closest('.modal-box')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  return r.top >= Math.max(0, box.top) - 1 && r.bottom <= Math.min(window.innerHeight, box.bottom) + 1;
});

try {
  // ── Cloud acceso: finestra di accesso ────────────────────────────────────────
  const { page, errori } = await apri('http://localhost:8123/', { altezza: 560 });       // schermo basso: il pulsante non deve andare cercato
  await page.click('.cloud-accedi');
  await page.waitForSelector('.modal-btn:has-text("Continua con Google")', { timeout: 20000 });
  const riassunto = await page.$$eval('.informativa-riassunto li', (x) => x.map((e) => e.textContent));
  verifica(riassunto.length === 5 && riassunto.every((t) => t.length > 20 && t.length < 230), `la finestra di accesso mostra un riassunto di 5 righe brevi (${riassunto.length})`);
  verifica(!(await page.isVisible('.informativa-dettaglio')) && /Leggi tutto/.test(await page.textContent('.informativa-apri')), 'il testo completo è chiuso, con «Leggi tutto, voce per voce»');
  verifica(await inVista(page, '.modal-btn:has-text("Continua con Google")'), '«Continua con Google» si vede senza scorrere, anche su uno schermo basso (560 px)');
  await schermata(page, 'a-1-accesso-riassunto');
  await page.click('.informativa-apri');
  verifica(await page.isVisible('.informativa-dettaglio') && await page.getAttribute('.informativa-apri', 'aria-expanded') === 'true', '«Leggi tutto» apre il testo completo');
  const attesi = await page.evaluate(async () => (await import('/src/cloud/testi.js')).datiSalvati.length);
  const voci = await page.$$eval('.informativa-dettaglio li', (x) => x.length);
  verifica(voci === attesi && attesi >= 12, `il testo completo ha tutte le voci (${voci}), in tre gruppi: ${(await page.$$eval('.informativa-gruppo', (x) => x.map((e) => e.textContent))).join(' | ')}`);
  verifica(await inVista(page, '.modal-btn:has-text("Continua con Google")') && await inVista(page, '.modal-btn:has-text("Annulla")'), 'a testo completo aperto i pulsanti restano in vista (il testo scorre dentro la finestra)');
  verifica(await page.$eval('.informativa-dettaglio', (e) => e.scrollHeight > e.clientHeight), '…perché il testo completo scorre dentro la sua area');
  await schermata(page, 'a-2-accesso-completo');
  await page.click('.informativa-apri');
  verifica(!(await page.isVisible('.informativa-dettaglio')), 'si richiude');
  await page.click('.modal-btn:has-text("Annulla")');

  // ── Cloud acceso: la Guida ha le sezioni ─────────────────────────────────────
  await page.click('#btnHelp');
  await page.waitForSelector('#guidaSchede .verifica-scheda');
  await page.waitForFunction(() => document.querySelectorAll('#guidaSchede .verifica-scheda').length >= 2, null, { timeout: 15000 });
  const ids = await page.$$eval('#guidaSchede .verifica-scheda', (x) => x.map((e) => e.dataset.sezione));
  verifica(JSON.stringify(ids) === JSON.stringify(['editor', 'cloud-studente', 'cloud-docente', 'privacy']) && await page.isVisible('#guidaSchede'), `con il cloud la Guida ha la barra delle sezioni: ${JSON.stringify(ids)}`);
  verifica(await page.isVisible('#guidaEditor') && /Trascina i blocchi/.test(await page.textContent('#guidaEditor')), 'si apre sull\'Editor, com\'è sempre stata');
  await page.click('#guidaSchede [data-sezione="privacy"]');
  verifica(!(await page.isVisible('#guidaEditor')) && (await page.$$eval('#guidaPagine .informativa-testo li', (x) => x.length)) === attesi, 'la sezione «Privacy e dati» mostra tutta l\'informativa');
  verifica((await page.$$eval('#guidaPagine .informativa-gruppo', (x) => x.length)) === 3, '…divisa in tre gruppi');
  await schermata(page, 'a-3-guida-privacy');
  // Le guide per lo studente e per il docente: ci sono, si aprono, ogni capitolo si apre da solo (senza guardare le parole)
  for (const id of ['cloud-studente', 'cloud-docente']) {
    await page.click(`#guidaSchede [data-sezione="${id}"]`);
    const capitoli = await page.$$('#guidaPagine .guida-cloud:visible .guida-cloud-capitoli .verifica-scheda');
    verifica(!(await page.isVisible('#guidaEditor')) && capitoli.length >= 4, `la sezione ${id} si apre e ha ${capitoli.length} capitoli`);
    let apertiBene = true;
    for (let i = 0; i < capitoli.length; i++) {
      await capitoli[i].click();
      const visibili = await page.$$eval('#guidaPagine .guida-pagina:not([hidden]) .guida-cloud-pagina', (x) => x.filter((e) => !e.hidden).map((e) => e.textContent.length));
      if (visibili.length !== 1 || visibili[0] < 80) apertiBene = false;
    }
    verifica(apertiBene, `…ogni capitolo di ${id} si apre da solo e ha del testo`);
    if (id === 'cloud-studente') await schermata(page, 'a-3b-guida-studente');
    else await schermata(page, 'a-3c-guida-docente');
  }
  // Le etichette dei pulsanti vengono da etichette.js: ogni capitolo che nomina un pulsante lo scrive in grassetto, e il testo non ha segnaposto rimasti
  verifica(await page.evaluate(async () => {
    const { sezioni } = await import('/src/cloud/testi-guida.js');
    const tutto = JSON.stringify(sezioni);
    return !/undefined|\$\{|\[object/.test(tutto);
  }), 'i testi delle guide non hanno etichette mancanti (undefined) né segnaposto');
  verifica(await page.evaluate(async () => {
    const { aiuti, aiutiAttivi } = await import('/src/cloud/testi-guida.js');
    return [...aiutiAttivi].every((k) => aiuti[k] && aiuti[k].titolo && aiuti[k].testo) && Object.values(aiuti).every((a) => a.titolo && a.testo);
  }), 'ogni «?» ha titolo e testo, e quelli attivi esistono');
  await page.click('#guidaSchede [data-sezione="editor"]');
  verifica(await page.isVisible('#guidaEditor') && !(await page.isVisible('#guidaPagine .informativa-testo')), 'si torna all\'Editor');
  await page.keyboard.press('Escape');
  await page.click('#btnHelp');
  verifica(await page.isVisible('#guidaEditor'), 'riaperta, la Guida riparte dall\'Editor');
  verifica(errori.length === 0, `nessun errore nella pagina${errori.length ? `: ${errori.join(' | ')}` : ''}`);

  // ── Cloud spento: la Guida è quella di sempre, senza schede ──────────────────
  const senza = await apri('http://localhost:8124/');
  await senza.page.click('#btnHelp');
  await senza.page.waitForSelector('#guidaEditor', { state: 'visible' });
  await senza.page.waitForTimeout(800);
  verifica(!(await senza.page.isVisible('#guidaSchede')) && (await senza.page.$$('#guidaEditor .guide-section')).length === 6, 'con il cloud spento la Guida non ha schede e mostra le sue 6 sezioni sull\'editor');
  verifica(!(await senza.page.textContent('#helpModal')).includes('Privacy e dati') && !(await senza.page.isVisible('.cloud-accedi')), '…e non parla di cloud né di privacy');
  verifica(senza.errori.length === 0, 'nessun errore nella pagina senza cloud');
  // ── Contatore di letture: spento di default, acceso solo con ?contatore=1 ───────────────────────────
  const normale = await apri('http://localhost:8123/');
  await normale.page.click('.cloud-accedi');
  await normale.page.waitForSelector('.modal-btn:has-text("Continua con Google")', { timeout: 20000 });
  verifica((await normale.page.$$('button:has-text("📊")')).length === 0, 'senza ?contatore=1 il pulsante del contatore non c\'è');
  const conteggio = await apri('http://localhost:8123/?contatore=1');
  await conteggio.page.click('.cloud-accedi');
  await conteggio.page.waitForSelector('.modal-btn:has-text("Continua con Google")', { timeout: 20000 });
  verifica((await conteggio.page.$$('button:has-text("📊")')).length === 1, 'con ?contatore=1 compare il pulsante del contatore');
  verifica(conteggio.errori.length === 0, `nessun errore nella pagina con il contatore${conteggio.errori.length ? `: ${conteggio.errori.join(' | ')}` : ''}`);
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  server.close();
  serverSenzaCloud.close();
}
process.exit(riuscito ? 0 : 1);
