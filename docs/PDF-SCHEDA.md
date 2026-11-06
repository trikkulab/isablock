# Scheda di consegna in PDF (passo 12, seconda versione)

Documento di consegna per chi continua il lavoro (anche una nuova sessione). Leggi anche `docs/CLOUD.md` (sezione
«Stampa (passo 12)») e le note di progetto nella memoria (`isablock_verifica_struttura_approvata`).

## Perché si rifà

Il passo 12 è già committato (`stampa-ui.js`, `scheda-stampa.js`, `creaFoglio` in `src/main.js`, CSS `@media print`,
e2e in `test/e2e/verifiche.mjs`): prepara la scheda in un'area nascosta e chiama `window.print()`. Ivan l'ha provata in
Safari e Chrome (file `~/Downloads/trikkulab_info-02-26-27-3a_v5.pdf` e `..._chrome.pdf`) e ha visto che il risultato
dipende dal browser: Safari aggiunge intestazione/piè di pagina suoi (nome file, data, URL, «Page 1 of 3»), lascia i titoli
di sezione orfani e mezza pagina bianca, ed è lentissimo (minuti); Chrome spezza il riquadro dei blocchi a metà. Decisione
di Ivan: **generare il PDF dall'app con layout fisso, indipendente da browser e stampante**; la carta la gestisce lui
dal PDF. La stampa dal browser va SOSTITUITA (non tenere due percorsi).

## Decisioni di Ivan (tutte confermate)

- Solo **A4**. **Stampa in bianco e nero, solo per archivio**: pagina ordinata e ben raggruppata, ma niente colori
  decorativi (grigi, un filo sottile, riquadri chiari). **I blocchi restano a colori.**
- **Una «scheda» per studente** (può essere di più pagine A4); ogni studente inizia su pagina nuova. In «tutte» un solo
  PDF con le schede una dopo l'altra, in ordine alfabetico per **cognome** poi nome.
- **Contenuto della scheda**: titolo della verifica; corso e classe («Informatica · 3AINF»); **solo la data della
  consegna** (non l'ora; formato «6 novembre 2026», quella di `consegna.creato`); nome dello studente (**niente email**:
  se manca il nome usare la parte dell'email prima della chiocciola); la **traccia completa** (titolo + testo, corpo
  piccolo); blocchi; pseudocodice; C; Python.
- **NON mostrare**: email, ora di consegna, scadenza personale, origine della consegna (automatica/file/raccolta),
  nome del file, numero di versione (c'è il codice di riscontro).
- **Disposizione**: riga 1 = blocchi (sinistra) + pseudocodice (destra); riga 2 = C (sinistra) + Python (destra).
  **Non rimpicciolire troppo i blocchi** (si devono leggere): scala 1:1 se possibile, minimo circa 0,8. Se il programma
  è troppo largo per la colonna: blocchi a tutta larghezza, poi (pseudocodice | C) e Python sotto. Se è troppo alto per
  una pagina: blocchi a tutta larghezza, tagliati su più pagine (clip), mai ridotti sotto circa 0,6. I codici in
  carattere a larghezza fissa, righe lunghe spezzate in modo ordinato. Un titolo di sezione non resta mai solo in fondo a
  una pagina.
- **Piè di pagina su OGNI pagina** (servono a ricomporre fogli sciolti): a sinistra `verifica · classe · data`; a destra
  `Nome Cognome · riscontro XXXX-XXXX · pagina x/n`, dove **n = pagine di quella scheda** (non dell'intero PDF).
- **Codice di riscontro**: `codiceRiscontro()` in `src/cloud/scheda-stampa.js` (già c'è; compare anche nella finestra
  «Guarda» di una consegna: deve restare uguale).
- **Nome del file**: `cognome-nome_classe_verifica-slug_v2.pdf` (tutto minuscolo, senza accenti; la versione c'è SOLO nel
  nome del file). Per tutte: `classe_verifica-slug_tutte-le-consegne.pdf`. Il nome dello studente è «Nome Cognome»
  (come `displayName` di Google): primo termine = nome, il resto = cognome (limite noto: «Maria Rosa Bianchi» diventa
  cognome «Rosa Bianchi»; va bene).
- **Pulsanti**: «Stampa» → «Scarica PDF» (sulla riga con una consegna) e «Stampa tutte» → «Scarica PDF di tutti» (in
  testa), solo a verifica chiusa (come ora).
- **Il Markdown della traccia lo ricomponi tu** (non c'è HTML nel PDF): titoli, grassetto, corsivo, barrato, apice,
  pedice, codice in riga e a blocco, elenchi puntati e numerati (anche annidati), citazioni, tabelle, riga orizzontale;
  link come «testo (indirizzo)»; immagini come «[immagine: alt]». **Ivan vuole un promemoria**: se in futuro si aggiunge
  una funzionalità al Markdown (`src/cloud/markdown.js`), va aggiunta anche al PDF. Per questo: (1) commento in
  `markdown.js` (già scritto), (2) una prova `test/pdf-markdown.mjs` che fallisca se cambiano plugin/regole abilitate in
  `markdown.js` senza aggiornare il convertitore (per esempio confrontando le righe `.use(` / `enable(` con un'istantanea
  nel test, con un messaggio chiaro «aggiorna anche il PDF»), (3) token sconosciuti → ripiego su testo semplice, mai un
  errore, e la prova di copertura con un documento che contiene OGNI funzionalità attuale.
- Il **greco non serve**: bastano i font standard del PDF (Helvetica, Courier). I caratteri fuori da Latin-1 si
  sostituiscono (virgolette e trattini tipografici → ASCII, il resto → «?»). Il pseudocodice usa solo parole.

## Stato del lavoro (fatto, non ancora committato salvo diversa indicazione in git)

- `npm install --save-dev jspdf@4.2.1` fatto; `scripts/bundle-pdf.mjs` (+ `npm run vendor:pdf`) produce
  `vendor/pdf/jspdf.js` (411 KB, ESM, caricato SOLO alla prima generazione; funziona offline). Funziona anche in Node
  (`import { jsPDF } from './vendor/pdf/jspdf.js'`), quindi l'impaginazione si prova con prove unitarie.
- `src/cloud/markdown.js` espone `tokenizzaMarkdown(testo)` (token di markdown-it). Tipi emessi oggi: heading,
  paragraph, bullet/ordered list, list_item, blockquote, fence, hr, table/thead/tbody/tr/th/td, e nei figli di `inline`:
  text, strong, em, s, sub, sup, code_inline, link, image (e softbreak/hardbreak).
- Già pronte e riusabili: `src/cloud/scheda-stampa.js` (`codiceRiscontro`, `ordinaSchede`, nomi dei documenti: DA
  AGGIORNARE per classe e cognome-nome), `src/cloud/consegne-ui.js` (pattern download), `contaBlocchi()`.

## Da fare

1. **Convertitore Markdown → struttura dati** (`src/cloud/pdf-markdown.js`, puro): nodi `titolo`, `paragrafo` (con
   «run» di testo con stile), `elenco`, `citazione`, `codice`, `tabella`, `linea`; insieme dei token non supportati.
   Prove unitarie `test/pdf-markdown.mjs` (compresa la prova di copertura/promemoria sopra).
2. **Impaginazione con jsPDF** (`src/cloud/pdf-scheda.js`): margini circa 15 mm (basso 20 mm), testo corpo 9 pt,
   righe di testo con stili misti (misura per parola con `getTextWidth`), elenchi, citazioni (barra a sinistra),
   riquadri chiari per il codice, tabelle (celle con bordo sottile), colonne affiancate con altezza uguale, regole di
   salto pagina, piè di pagina disegnato DOPO aver impaginato la scheda (`doc.setPage(i)`) per sapere «pagina x/n».
   Prove unitarie con `new jsPDF({ compress: false })` per leggere il testo nel flusso del PDF (numero di pagine, piè di
   pagina di ogni pagina, ordine, nessun titolo orfano).
3. **Immagine dei blocchi** (in `src/main.js`, sostituisce `creaFoglio`): workspace Blockly di sola lettura in un
   contenitore fuori schermo e con dimensioni; leggere `ws.getBlocksBoundingBox()`; clonare `ws.getCanvas()` (e i
   `<defs>` del `svg` genitore, per filtri/pattern) in un nuovo SVG con `viewBox` sul riquadro, SENZA il `transform`
   del canvas; copiare nello SVG le regole CSS dei fogli di stile `blockly*` (`document.styleSheets`), serializzare con
   `XMLSerializer`, caricare come `Image` da data URL, disegnare su `canvas` a scala 2 con sfondo bianco, `toDataURL`.
   Restituire anche larghezza/altezza in px a scala 1 e i tre testi dei generatori (`extractSourceMap(...).text`).
   Rimettere il workspace principale (`rimettiPrincipale`, vedi `creaAnteprima`): è un difetto già incontrato.
4. **Interfaccia**: nuovo modulo (es. `pdf-ui.js`) che prepara i dati di ogni scheda, genera il PDF e lo scarica
   (`Blob` + `a[download]`, nome del file come sopra). Collegamento nella tabella (`verifica-tabella-ui.js`,
   `verifiche-ui.js`: cambiare etichette e funzioni; hanno già `stampa`/`stampaTutte`). **Rimuovere** `stampa-ui.js`,
   `creaFoglio`, `#areaStampa` e il CSS di stampa in `css/style.css`, e le prove di stampa in `test/e2e/verifiche.mjs`
   (blocco «Stampa delle schede di consegna»), sostituendole con prove del PDF (download vero con Playwright
   `page.waitForEvent('download')`, numero di pagine, presenza di immagini, dimensioni plausibili).
5. **Verifica visiva**: Ghostscript è installato (`gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m -r80 -sOutputFile=p-%d.png
   file.pdf`) per vedere ogni pagina; `gs -sDEVICE=txtwrite` estrae il testo. Fare vedere a Ivan un primo PDF di UNA
   scheda prima di estendere a «tutte». Ivan prova poi in Safari e Chrome (le immagini SVG→canvas possono differire).
6. **Documentazione e memoria**: aggiornare `docs/CLOUD.md` (sezione stampa → PDF) e la nota di progetto in memoria
   (`isablock_verifica_struttura_approvata`), con le lezioni apprese.

## Ambiente di prova (regole del progetto)

- Il ramo è `cloud`. **Non committare `src/app-config.js`** (ha `cloud.enabled: true` solo nell'albero di lavoro): `git add`
  per nome, mai cartelle intere; dopo ogni commit `git show HEAD --stat | grep app-config` deve essere vuoto.
- L'emulatore di Ivan può essere acceso su 8186/9199: **non toccare `firestore.rules`**. Per i test usare porte
  alternative con un file di configurazione fuori dal repository (nello scratchpad):
  `{"firestore":{"rules":"<percorso assoluto>/.regole-test.rules"},"emulators":{"auth":{"port":9299},"firestore":{"port":8286},"hub":{"port":4401},"ui":{"enabled":false},"singleProjectMode":true}}`
  e poi: `node scripts/build-rules.mjs test .regole-test.rules` e
  `REGOLE_FILE=.regole-test.rules firebase emulators:exec --config <file>.json --only auth,firestore --project demo-alt "node test/e2e/verifiche.mjs"`.
  Con `E2E_SCHERMATE=<cartella>` gli e2e salvano screenshot. Prove unitarie: `for f in test/*.mjs; do node $f; done`.
- E2e del docente: `test/e2e/verifiche.mjs` (circa 3 minuti). Quelli dello studente non c'entrano con il PDF.
- Test instabile noto, non c'entra: «due schede che salvano insieme non si sovrascrivono» (sketch.test.mjs).
- Italiano per testi, commenti e messaggi; commit in italiano con la riga di attribuzione richiesta dall'harness.
- Dopo il lavoro: **non pubblicare** (sito di prova e push li decide Ivan).
