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
  const schede = await page.$$eval('#guidaSchede .verifica-scheda', (x) => x.map((e) => e.textContent));
  verifica(JSON.stringify(schede) === JSON.stringify(['Editor', 'Privacy e dati']) && await page.isVisible('#guidaSchede'), `con il cloud la Guida ha la barra delle sezioni: ${JSON.stringify(schede)}`);
  verifica(await page.isVisible('#guidaEditor') && /Trascina i blocchi/.test(await page.textContent('#guidaEditor')), 'si apre sull\'Editor, com\'è sempre stata');
  await page.click('#guidaSchede .verifica-scheda:has-text("Privacy e dati")');
  verifica(!(await page.isVisible('#guidaEditor')) && (await page.$$eval('#guidaPagine .informativa-testo li', (x) => x.length)) === attesi, 'la sezione «Privacy e dati» mostra tutta l\'informativa');
  verifica((await page.$$eval('#guidaPagine .informativa-gruppo', (x) => x.length)) === 3, '…divisa in tre gruppi');
  await schermata(page, 'a-3-guida-privacy');
  await page.click('#guidaSchede .verifica-scheda:has-text("Editor")');
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
  riuscito = riepilogo();
} catch (e) {
  console.log('ERRORE', e.message.split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  server.close();
  serverSenzaCloud.close();
}
process.exit(riuscito ? 0 : 1);
