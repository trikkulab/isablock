# Guide per la parte cloud (passo 14)

Documento di consegna per chi scrive le guide (anche una nuova sessione). Leggi prima `docs/CLOUD.md` (descrive tutto ciò che
l'app fa oggi, passo per passo) e la nota di progetto in memoria `isablock_verifica_struttura_approvata`. Questo documento dice
COSA scrivere, per chi, con che struttura e quali spiegazioni (il «perché») non vanno perse.

## Obiettivo

Gli studenti e i docenti devono poter usare le verifiche (e il resto del cloud: corsi, sketch condivisi, commenti) **con una certa
autonomia**, senza che qualcuno spieghi ogni passaggio. Le guide si scrivono PRIMA della prova con persone vere, e la prova
serve anche a vedere se bastano. Dopo la prova si aspettano ritocchi: per questo i testi devono essere facili da cambiare.

## Pubblico e tono

- **Studenti** di terza superiore, nessuna esperienza di programmazione testuale. Frasi corte, parole semplici, niente gergo
  («consegna», «tempo», «se cade la rete»). In verifica sono sotto pressione: le spiegazioni che servono lì devono essere brevissime
  e ovvie. Dare del tu.
- **Docenti**: pratici, vogliono sapere cosa fare e cosa succede. Un percorso passo passo («preparare, aprire, durante, chiudere»), poi
  i casi particolari. Dare del tu.
- Italiano. Onestà: dire anche i limiti (cosa NON si può fare, cosa non è garantito).
- **Niente schermate né immagini** nelle guide (a ogni ritocco dell'interfaccia diventerebbero sbagliate e nessun test se ne
  accorgerebbe). Solo testo.

## Dove vanno (struttura già pronta)

La Guida (`src/guida.js`, markup in `index.html`) ha sezioni; il cloud le registra con `guida.registra(id, titolo, costruisci)`,
vedi `montaCloud` in `src/cloud/ui.js`, dove oggi c'è «Privacy e dati». Con il cloud spento la Guida è quella di sempre e non deve
cambiare. Proposta di sezioni da aggiungere (da rifinire):

1. **«Per lo studente»**: corsi e iscrizione, sketch nel cloud e condivisione, commenti del docente, verifiche (cosa succede, come si
   consegna, cosa fare se cade la rete, «Le mie consegne»).
2. **«Per il docente»**: corsi e iscritti, sketch condivisi e commenti, verifiche passo passo (vedi sotto).
3. «Privacy e dati» c'è già (non toccarla, se non per tenerla coerente: vedi sotto).

Idee per l'apertura: all'accesso, la sezione giusta per il ruolo (le sezioni si vedono entrambe, ma si può aprire la Guida già su
quella del proprio ruolo: `guida.apri(id)`). **Testi in UN solo file** (come `src/cloud/testi.js` e `src/cloud/testi-verifica.js`,
per esempio `src/cloud/testi-guida.js`), da poter rivedere senza toccare il codice; le etichette dei pulsanti prese da costanti
(le stesse usate dall'interfaccia, dove esistono) così se un'etichetta cambia cambia anche nella guida. Dove la costante non
esiste, controllare l'etichetta nel codice (non a memoria) e, se ha senso, farla diventare una costante.

### Micro-spiegazioni «?» (facoltative, discrete)

Una nota di 1-2 frasi accanto ai punti delicati, che si apre con un clic: fine prevista / durata all'apertura, tempo in più,
traccia «per tutti» (la stella), «Raccogli i lavori», «Carica file…», «Assegnazioni individuali», «Riapri…». Per lo studente: il timer,
il pulsante «Consegna», la finestra «Sei offline». Meglio poche e ben scelte, che ovunque. Una schermata breve all'ingresso in
verifica (per lo studente) deve poter essere letta in pochi secondi o proiettata dal docente.

## Contenuti da coprire

### Studente
- **Verifica**: quando il docente apre una verifica, all'accesso compare «Verifica aperta» con le verifiche da svolgere
  («Inizia» / «Riprendi»). Finché non si consegna o non finisce il tempo non si può usare altro. Si svolge UNA verifica alla volta;
  dopo la consegna torna l'elenco con le rimaste.
- In verifica: fascia «VERIFICA» in alto con titolo, **timer** (verde, giallo, rosso) e **«Consegna»** (chiede conferma; dopo non si
  modifica più). L'editor parte **vuoto**; il lavoro di prima resta in una copia automatica e si riprende a verifica finita.
  Sono disattivati Apri, esempi, salvataggi e il menu del cloud. La scheda **«Traccia»** ha il testo (A−/A+ per ingrandirlo) e un
  avviso «Traccia aggiornata alle hh:mm» se il docente la corregge. Il **codice** (pseudocodice, C, Python) resta visibile.
- Il lavoro si salva online da solo ogni tanto; il docente vede come procede. **A fine tempo la consegna parte da sola**.
- **Se cade la rete**: dopo circa 45 secondi compare «Sei offline» con «Salva su file». Si può continuare a lavorare (resta sul
  computer). Offline non si può consegnare: si salva il **file di emergenza** e lo si consegna al docente (che lo carica). Il file
  **non si riapre** nell'editor. Se finisce il tempo offline: «Verifica terminata» con «Salva su file»; chiudere senza averlo
  salvato chiede conferma. Se la pagina si ricarica senza rete, si rientra da soli nella verifica. Se la rete torna, tutto si
  sincronizza. A pagina riaperta compare «Lavoro di verifica non consegnato» se resta un lavoro da salvare.
- **Dopo la verifica**: voce di menu **«Le mie consegne»** (solo verifiche concluse): per ogni versione «Guarda» (sola lettura),
  «Apri nell'editor» (una COPIA: la consegna non cambia), «Salva su file». «Quella che vale» è l'ultima.
- **Più verifiche aperte**: una alla volta; se per una non si è mai entrati e scade, il docente la vede «Non entrato».
- Cosa vede il docente: il lavoro in tempo reale e la sua evoluzione (vedi sotto «Guarda e storia»): dirlo con serenità e onestà.

### Docente
Percorso (verifiche): **Corsi → corso → «Verifiche» → «Nuova verifica»** (titolo e fine prevista provvisoria → «Crea in bozza»).
1. **Preparare (bozza)**: «+ Nuova traccia» (titolo NEUTRO come «Versione A», testo in Markdown con anteprima, barra di formato);
   la stella ★ = traccia «per tutti» (compare solo con più tracce); «Assegnazioni individuali (traccia e tempo)» (sezione chiusa
   di default perché la finestra può essere proiettata): traccia diversa e/o minuti in più per studente, «Applica ai selezionati».
   Una verifica in bozza si può eliminare («Elimina verifica»).
2. **Aprire**: «Apri verifica…» → riepilogo (quanti iscritti la vedranno subito, tracce, chi ha traccia o tempo diversi), scelta
   «dura N minuti da adesso» oppure «finisce alle…». **L'apertura non si annulla** (le regole non possono contare chi è già
   entrato): per fermarla si CHIUDE. Gli studenti, all'accesso, dovranno scegliere la verifica.
3. **Durante**: scheda **«Situazione»** (si apre da sola) con una riga per studente: stato (Non entrato, Scrive, Ha eseguito, Errore,
   Consegnato), blocchi con la variazione degli ultimi minuti e ⚠ se sono saliti di colpo (programma incollato), esecuzioni, connessione
   («offline da N min» dopo 4 minuti senza segnali), tempo rimasto. **«Guarda»**: il programma dello studente in sola lettura, che si
   aggiorna da solo (ritardo massimo ~25 s); «Storia…» con cursore, ◀ ▶, segni ⚠ e «In diretta» per rivedere come è evoluto (circa le
   ultime 2 ore, un'istantanea ogni ~5 minuti più il prima/dopo di un salto: NON è un registro di ogni modifica). Una traccia si
   può correggere anche a verifica aperta («Pubblica modifica»): gli studenti vedono l'avviso. Tempo in più: nessun motivo scritto.
4. **Chiudere e raccogliere**: «Chiudi verifica…» (con «Raccogli i lavori» già spuntato): crea le consegne dal lavoro com'è; chi non
   è mai entrato non ha consegna. «Raccogli i lavori» si può rilanciare. Una verifica aperta o chiusa **non si cancella** (le
   consegne sono immutabili): si **archivia** («Archivia…», solo chiuse; si ritrova con «Mostra anche le verifiche archiviate»).
5. **Chi non ha potuto consegnare (senza rete)**: lo studente porta il file di emergenza; sulla sua riga, a verifica chiusa, **«Carica
   file…»**: controllo dell'impronta (ferma i ritocchi semplici, NON è sicurezza), conferma con il confronto «ultimo salvataggio
   sul server / nel file»; nasce una nuova versione di consegna (origine «file»); il NOME del file non conta, conta il contenuto.
6. **Riaprire** («Riapri…», proposti 30 minuti): vale per TUTTI; chi aveva consegnato torna a poter consegnare di nuovo (le consegne
   precedenti restano, vale l'ultima); le scadenze personali ripartono dalla nuova fine più i minuti in più dati a mano.
   (Lo «sblocco individuale» NON esiste ancora.)
7. **Scarica PDF** (a verifica chiusa, sulla riga e «Scarica PDF di tutti»): una scheda per studente (titolo, corso e classe, nome,
   data di consegna, traccia, blocchi, pseudocodice, C, Python, codice di riscontro, «pagina x/n»), in bianco e nero salvo i
   blocchi; il codice di riscontro è lo stesso che mostra «Guarda» per quella consegna. Nome file
   `cognome-nome_classe_verifica_v2.pdf`. Si stampa poi dal PDF.
- **Corsi** (codice di accesso, iscrizioni aperte/chiuse, iscrivere per email, codocenti, archiviare un corso: non si archivia un
  corso con una verifica aperta), **sketch condivisi e commenti sui blocchi**: leggere il codice (`corsi-ui.js`, `gestione-ui.js`,
  `sketch-ui.js`, `commenti-ui.js`) e `docs/CLOUD.md` per le etichette e le regole.

## Il «perché» (da spiegare con le parole giuste, in breve)

- L'apertura non si annulla; si chiude. Una verifica aperta/chiusa non si cancella: si archivia (le consegne non si modificano né
  si cancellano da IsaBlock).
- Titoli delle tracce neutri e nessun motivo per il tempo in più: lo studente vede il suo titolo, e dalla differenza di tempo o
  traccia si dedurrebbero bisogni particolari. Per questo anche «Assegnazioni individuali» è chiusa di default.
- Il tempo è quello del SERVER (l'orologio del computer dello studente non conta); offline si usa l'ultima stima: limite noto
  (l'orologio offline si può falsare).
- Perché la consegna offline non è possibile e serve il file: senza rete il server non può registrare nulla; il file è la prova
  portata al docente. Per questo il file ha un controllo e non si riapre.
- «Guarda»/storia servono prima di tutto a capire come procede lo studente e se si sta perdendo (anche per aiutarlo); il controllo
  di chi incolla lavoro preparato è secondario (la soglia del ⚠ è tarabile). Un esperto che usa gli strumenti del browser
  può aggirare i blocchi dell'editor: nessun sistema client lo impedisce, contano la presenza in aula e questi segnali.
- La stampa/PDF è per archivio: layout fisso indipendente da browser e stampante.

## Coerenza con la privacy

Se una guida dice cosa si salva o chi lo vede, deve coincidere con `src/cloud/testi.js` (`gruppiDati`): meglio rimandare alla sezione
«Privacy e dati» che ripetere. Se cambia un dato salvato, si aggiorna `testi.js`.

## Vincoli tecnici (già incontrati)

- **Un attributo `hidden` viene annullato da una regola CSS con `display`**: ogni elemento nascosto con `hidden` che ha una classe con
  `display` ha bisogno di `.classe[hidden] { display: none }` (visto 3 volte: voce di menu, barra delle sezioni, ...).
- Le sezioni registrate dal cloud compaiono solo con il cloud acceso: con il cloud spento la Guida non deve cambiare (c'è la prova
  `test/e2e/accesso.mjs`, che gira con cloud acceso e spento: estenderla per le nuove sezioni, controllando che ci siano e che si
  aprano, NON le parole).
- Nessun test deve dipendere dal testo delle guide.
- Modalità verifica dello studente: il menu del cloud è spento (la Guida normale `❓ Guida` resta sempre disponibile): se si vuole
  un aiuto in verifica, passa da lì o da una nota nella fascia, senza aprire finestre che coprano l'editor.

## Ambiente di prova e regole di lavoro

Come per il PDF: vedi la sezione «Ambiente di prova» di `docs/PDF-SCHEDA.md` (porte alternative per gli emulatori, `.regole-test.rules`,
non toccare `firestore.rules`, non committare `src/app-config.js` con `git add` per nome, `E2E_SCHERMATE` per gli screenshot).
Prove: `for f in test/*.mjs; do node $f; done` e, dentro gli emulatori, `node test/e2e/accesso.mjs` (rapida, non scrive nel
database) più, se tocchi altro, `test/e2e/verifiche.mjs` e `test/e2e/studente.mjs`. Italiano; commit in italiano con la riga di
attribuzione richiesta. **Non pubblicare** (sito di prova e push li decide Ivan).

## Alla fine

Aggiornare `docs/CLOUD.md` (sezione «Finestra di accesso, informativa e Guida»), la nota di progetto in memoria
(`isablock_guide_tutorial_cloud` e `isablock_pdf_scheda_decisioni` per lo stato) e fare un riepilogo onesto di cosa è stato
verificato e cosa no. Poi Ivan riprende l'altra sessione per pubblicare sul sito di prova.
