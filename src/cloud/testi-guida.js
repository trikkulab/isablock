// I testi della Guida per la parte cloud: una sezione «Per lo studente» e una «Per il docente», divise in capitoli, e le
// note dei «?» (`aiuti`). Stanno in un file solo per poterli rivedere senza toccare il codice (come testi.js e
// testi-verifica.js). Il DOM è in guida-ui.js.
//
// Formato dei blocchi di un capitolo:
//   { p: 'testo' }  paragrafo        { ul: [...] }  elenco puntato     { ol: [...] }  elenco numerato
//   { h: 'testo' }  sottotitolo      { nota: 'testo' }  riquadro per un avviso o un limite
// Dentro i testi, **così** diventa grassetto: lo si usa per i nomi dei pulsanti, che arrivano da etichette.js (e da
// testiStudente in testi-verifica.js), così se un'etichetta cambia cambia anche qui. Per quello che il cloud salva e
// chi lo vede si rimanda a «Privacy e dati» (testi.js), senza ripeterlo.
import { menuCloud as M, sketchEtichette as S, corsiEtichette as C, commentiEtichette as K, verificaDocenteEtichette as E, consegneEtichette as G } from './etichette.js';
import { testiStudente as T } from './testi-verifica.js';

export const idSezioneStudente = 'cloud-studente';
export const idSezioneDocente = 'cloud-docente';

const studente = [
  {
    id: 'primi-passi',
    titolo: 'Primi passi',
    blocchi: [
      { p: 'Il cloud è facoltativo: senza accedere IsaBlock funziona come sempre. Accedendo con l\'account della scuola puoi salvare gli sketch online, iscriverti ai corsi e fare le verifiche.' },
      { h: 'Entrare in un corso' },
      { ol: [
        `Dal menu con il tuo nome scegli **${M.corsi}**.`,
        'Scrivi il codice che ti ha dato il docente e premi **' + C.unisciti + '**.',
      ] },
      { p: 'Il docente può anche iscriverti direttamente. Da un corso non esci da solo: se serve, chiedilo al docente.' },
      { p: 'Cosa viene salvato di te, e chi lo vede, è scritto nella sezione «Privacy e dati».' },
    ],
  },
  {
    id: 'sketch',
    titolo: 'I miei sketch',
    blocchi: [
      { p: `Uno sketch è un tuo programma a blocchi salvato online. Dal menu scegli **${M.salva}**: il programma si salva solo quando lo chiedi tu, mai da solo. (La copia automatica che c'è sempre è un'altra cosa: resta sul tuo computer.)` },
      { ul: [
        'Ti viene proposto un nome, che puoi cambiare.',
        'Se stai già lavorando su uno sketch del cloud puoi aggiornarlo oppure salvarne uno nuovo.',
        `Li ritrovi in **${M.sketch}**: lì li apri, li rinomini o li elimini. Ne puoi avere fino a 50.`,
      ] },
      { h: 'Farlo vedere al docente' },
      { p: `In **${M.sketch}** premi **${S.condividi}** e scegli il corso. Il docente di quel corso può leggere lo sketch, ma non modificarlo.` },
      { ul: [
        'Non è una copia: lo sketch resta uno solo, il tuo. Il docente vede l\'ultima versione che hai salvato nel cloud. Se la cambi e non salvi, lui non lo vede.',
        'Ogni sketch si condivide con un solo corso.',
        `Puoi ritirare la condivisione quando vuoi con **${S.smettiDiCondividere}**.`,
      ] },
    ],
  },
  {
    id: 'commenti',
    titolo: 'I commenti del docente',
    blocchi: [
      { p: 'Il docente può scrivere un commento su uno sketch che hai condiviso, anche agganciato a un blocco preciso. Il commento non entra nel tuo programma e non cambia il codice.' },
      { ul: [
        'Non arriva nessuna notifica: i commenti si leggono quando accedi. Sul menu con il tuo nome compare un numero rosso con quelli nuovi.',
        `In **${M.sketch}** lo sketch commentato ha una riga con i commenti.`,
        `Apri lo sketch: sotto il codice c'è il pannello **${K.pannello}**. I blocchi commentati hanno un contorno arancione.`,
      ] },
      { p: 'I commenti si leggono soltanto: non puoi rispondere né cancellarli. Se togli un blocco commentato, il commento resta e ti dice a quale blocco si riferiva.' },
    ],
  },
  {
    id: 'verifica',
    titolo: 'La verifica',
    blocchi: [
      { h: 'Quando il docente la avvia' },
      { p: `Appena accedi vedi la finestra **${T.sceltaTitolo}**. Premi **${T.inizia}** (o **${T.riprendi}**, se eri già entrato). Finché non consegni, o non finisce il tempo, non puoi usare altro in IsaBlock. Se le verifiche sono più d'una, ne fai una alla volta: dopo la consegna torna l'elenco con le altre.` },
      { p: 'Se per una verifica non entri mai e il tempo scade, il docente la vede come «Non entrato».' },
      { h: 'Cosa trovi' },
      { ul: [
        `In alto la fascia **${T.fasciaEtichetta}** con il titolo, il tempo che resta (verde, poi giallo, poi rosso) e il pulsante **${T.consegnaPulsante}**.`,
        'L\'editor parte vuoto. Quello che avevi prima non si perde: resta una copia sul tuo computer, e la riprendi a verifica finita.',
        `La scheda **${T.tracciaTab}** ha il testo della verifica. Con A− e A+ lo ingrandisci o lo rimpicciolisci.`,
        'Pseudocodice, C e Python restano visibili.',
        'Non puoi aprire file, esempi o sketch, né usare il menu del cloud. Il pulsante «Guida» c\'è sempre.',
      ] },
      { p: `Se il docente corregge la traccia mentre lavori, compare un avviso «Traccia aggiornata alle hh:mm»: rileggila, il testo che vedi è quello nuovo. Il tuo lavoro non cambia.` },
      { h: 'Il tempo' },
      { p: 'Il tempo lo conta il server, non l\'orologio del tuo computer: anche se è sbagliato, il timer è giusto. Quando finisce, il tuo lavoro viene consegnato da solo.' },
      { h: 'Consegnare' },
      { p: `Premi **${T.consegnaPulsante}** e conferma con **${T.consegnaConferma}**. Dopo non puoi più modificare. Se vuoi ripensarci, scegli **${T.consegnaAnnulla}**.` },
      { h: 'Il docente vede il tuo lavoro' },
      { p: 'Mentre lavori il tuo programma si salva online da solo ogni tanto, e il docente può guardarlo e vedere come è cambiato negli ultimi minuti (se ti sta guardando, il salvataggio è più frequente). Serve soprattutto a capire come sta andando la classe e ad aiutare chi si blocca. Cosa viene salvato esattamente è scritto in «Privacy e dati».' },
    ],
  },
  {
    id: 'rete',
    titolo: 'Se cade la rete',
    blocchi: [
      { p: `Se la rete manca per circa 45 secondi, compare l'avviso **Sei offline**. Non farti prendere dal panico: puoi continuare a lavorare, il tuo programma resta sul computer.` },
      { ol: [
        'Senza rete non si può consegnare: il server non può registrare niente.',
        `Premi **${T.offlineSalva}**: ottieni un file.`,
        'Dai il file al docente. È la prova che hai lavorato, e lui lo può caricare come tua consegna.',
      ] },
      { ul: [
        'Se la rete torna, il lavoro si sincronizza da solo e non serve il file.',
        'Il file serve solo al docente: non si riapre nell\'editor.',
        `Se il tempo finisce mentre sei offline compare **${T.terminataTitolo}**, con **${T.offlineSalva}**. Se chiudi senza aver salvato il file, ti viene chiesta una conferma.`,
        'Se la pagina si ricarica senza rete, rientri da solo nella verifica.',
        `Se più tardi riapri IsaBlock e c'è un lavoro non arrivato al server, compare **${T.copieTitolo}**: salvalo su file e consegnalo al docente.`,
      ] },
    ],
  },
  {
    id: 'consegne',
    titolo: 'Dopo la verifica',
    blocchi: [
      { p: `A verifica finita, dal menu scegli **${M.consegne}**. Vedi le verifiche concluse e, per ognuna, le tue consegne.` },
      { ul: [
        `**${G.guarda}**: la apri in sola lettura.`,
        `**${G.apriNellEditor}**: ne apre una copia, per lavorarci. La consegna non cambia.`,
        `**${G.salvaSuFile}**: la scarichi.`,
      ] },
      { p: 'Se le consegne sono più d\'una (per esempio perché il docente ha riaperto la verifica), vale l\'ultima: è indicata come «quella che vale».' },
    ],
  },
];

const docente = [
  {
    id: 'corsi',
    titolo: 'Corsi e iscritti',
    blocchi: [
      { p: `Dal menu con il tuo nome scegli **${M.corsi}**. Da qui crei e gestisci i corsi.` },
      { h: 'Creare un corso' },
      { p: `**${C.nuovoCorso}**: materia, classe, anno (te lo propone l'app) e un nome, se vuoi. Il codice lo genera l'app e non cambia mai. Chi crea il corso ne è il titolare.` },
      { h: 'Far entrare gli studenti' },
      { ul: [
        `Col codice: lo vedi in **${C.gestisci}**, con il pulsante Copia. Lo studente lo scrive in **${M.corsi}**. Finché le iscrizioni sono aperte entra chiunque abbia il codice; con **${C.chiudiIscrizioni}** non entra più nessuno, e con **${C.apriIscrizioni}** si riparte.`,
        'A mano: incolla le email degli studenti (una per riga, o separate da virgole, al massimo 60 per volta). Funziona anche a iscrizioni chiuse e anche per chi non ha mai fatto l\'accesso.',
        'Per togliere uno studente usa «Togli». Se le iscrizioni sono aperte può rientrare col codice: chiudile prima.',
      ] },
      { h: 'Codocenti e archivio' },
      { ul: [
        'Un codocente si aggiunge per email, uno alla volta, e deve essere già abilitato come docente. Il titolare non si toglie.',
        `**${C.archivia}**: gli studenti non lo vedono più, il codice non funziona e tu non vedi più gli sketch condivisi. **${C.riattiva}** rimette tutto com'era. Un corso con una verifica avviata non si archivia: prima si termina la verifica.`,
      ] },
      { nota: 'Dall\'app non si può: abilitare un nuovo docente, cambiare il titolare di un corso, cancellare un corso. Si archivia soltanto. La pulizia di fine anno non c\'è ancora.' },
    ],
  },
  {
    id: 'sketch-commenti',
    titolo: 'Sketch condivisi e commenti',
    blocchi: [
      { p: `In **${M.corsi}**, sul corso, premi **${C.sketchCondivisi}**: vedi gli sketch che gli studenti hanno condiviso con quel corso (autore, nome, data). **${S.apri}** lo mostra nell'editor.` },
      { ul: [
        'Lo sketch si apre come copia: se poi salvi, ne crei uno tuo e quello dello studente non si tocca mai.',
        'Vedi l\'ultima versione che lo studente ha salvato nel cloud, non quello che sta scrivendo in questo momento.',
        'Se togli lo studente dal corso o archivi il corso, lo sketch sparisce dalla tua vista. Riaggiungendo lo studente torna.',
      ] },
      { h: 'Commentare' },
      { p: `Con lo sketch aperto, sotto il codice c'è il pannello **${K.pannello}**. Clicca un blocco per agganciare il commento a quel blocco, oppure scegli **${K.interoSketch}**. Scrivi (al massimo 500 caratteri) e premi **${K.aggiungi}**.` },
      { ul: [
        'Puoi modificare i tuoi commenti ed eliminare i tuoi o quelli di un altro docente del corso.',
        'Per sketch si arriva a 30 commenti.',
        'Lo studente li legge soltanto: non può rispondere né cancellarli, e non riceve notifiche (li vede quando accede).',
        'Il commento non entra nel programma né nei tre codici.',
      ] },
    ],
  },
  {
    id: 'preparare',
    titolo: 'Verifica: preparare',
    blocchi: [
      { p: `Corsi → il corso → **${C.verifiche}** → **${E.nuova}**. Scegli il titolo e la fine prevista, poi **${E.creaInBozza}**. In bozza gli studenti non la vedono.` },
      { ul: [
        `**${E.nuovaTraccia}**: il testo si scrive in Markdown, con anteprima e barra di formato. Ci vuole almeno una traccia, e una deve essere quella «per tutti» (la stella ${E.stella}, che compare quando le tracce sono più d'una).`,
        'Dai alle tracce titoli neutri, per esempio «Versione A» e «Versione B». Lo studente vede il titolo della propria: un titolo come «Semplificata» direbbe troppo.',
        `**${E.assegnazioni}**: una traccia diversa e/o minuti in più per singoli studenti. Seleziona le righe e premi **${E.applica}**. La sezione è chiusa di default perché la finestra può essere proiettata. Per lo stesso motivo non c'è un campo «motivo»: da un tempo diverso si dedurrebbero bisogni particolari.`,
        `Una verifica in bozza si può eliminare con **${E.elimina}**.`,
      ] },
    ],
  },
  {
    id: 'avviare',
    titolo: 'Verifica: avviare',
    blocchi: [
      { p: `**${E.avvia}** mostra un riepilogo: quanti iscritti la vedranno subito, le tracce, chi ha una traccia o un tempo diverso. Poi scegli se la verifica «dura N minuti da adesso» o «finisce alle…».` },
      { nota: 'L\'avvio non si annulla. La verifica non torna in bozza e non si potrà più eliminare: per fermarla dovrai terminarla, e una verifica terminata si può solo archiviare. Questo perché le regole non possono sapere chi è già entrato.' },
      { ul: [
        'Gli studenti, all\'accesso, dovranno scegliere la verifica. Finché non consegnano o non finisce il tempo non possono usare altro.',
        `Nell'elenco la verifica avviata compare come «Aperta» e, terminata, come «Chiusa».`,
        'Il tempo che conta è quello del server, non l\'orologio dei computer degli studenti.',
      ] },
      { h: 'Correggere una traccia a verifica avviata' },
      { p: `Puoi correggere una traccia anche dopo l'avvio, per esempio per un refuso. Modifica il testo e premi **${E.pubblicaModifica}**: gli studenti la vedono subito, e compare loro l'avviso «Traccia aggiornata alle hh:mm». Non si possono cancellare tracce, e a verifica terminata le tracce si leggono soltanto.` },
    ],
  },
  {
    id: 'durante',
    titolo: 'Verifica: durante',
    blocchi: [
      { p: `La scheda **${E.situazione}** si apre da sola. Ha una riga per studente: stato (Non entrato, Scrive, Ha eseguito, Errore, Consegnato), blocchi con la variazione degli ultimi minuti, esecuzioni, connessione («offline da N min» dopo 4 minuti senza segnali) e tempo rimasto.` },
      { ul: [
        `**${E.guarda}**: il programma dello studente in sola lettura. Si aggiorna da solo, con un ritardo fino a circa 25 secondi. Finché la finestra resta aperta su uno studente al lavoro, lui salva più spesso (circa ogni 5 secondi) e il ritardo si riduce a pochi secondi; chiusa la finestra torna al ritmo normale.`,
        `**${E.storia}**: un cursore per rivedere come è cambiato (circa le ultime 2 ore, un'istantanea ogni ~5 minuti più il prima e il dopo di un salto). Non è un registro di ogni modifica. Nella Storia compaiono anche le consegne, ognuna al suo posto nel tempo. A verifica terminata si parte dall'**Ultima consegna** (la sola che conta): le istantanee prima e dopo sono consultazione, e dicono di non essere una consegna. Se il lavoro sul server è più recente di una consegna da file, un avviso lo segnala.`,
        'Il segno ⚠ compare se i blocchi sono saliti di colpo (30 o più tra due salvataggi). Copiare e incollare dentro l\'editor è lecito, e chi ha un\'idea scrive in fretta: è un indizio debole, non una prova.',
      ] },
      { p: 'Questi strumenti servono prima di tutto a capire come procede la classe e chi si sta perdendo, per poterlo aiutare. Il controllo su chi incolla lavoro preparato è secondario.' },
      { nota: 'Un limite onesto: chi sa usare gli strumenti del browser può aggirare i blocchi dell\'editor, e nessun sistema che gira sul computer dello studente lo può impedire. Contano la presenza in aula e questi segnali.' },
    ],
  },
  {
    id: 'terminare',
    titolo: 'Verifica: terminare',
    blocchi: [
      { p: `**${E.termina}** apre una conferma. Appena confermi, IsaBlock raccoglie subito i lavori: crea le consegne dal lavoro com'è in quel momento. Chi non è mai entrato non ha una consegna. La raccolta è automatica anche perché i file di emergenza vanno caricati dopo, mai prima (vedi «Dopo: casi particolari»).` },
      { ul: [
        `Chi stava ancora lavorando non può più salvare. I lavori già salvati restano.`,
        `**${E.raccogli}** serve per rilanciare la raccolta, per esempio dopo una riapertura. Si può fare anche più volte: crea una nuova versione solo per chi ha lavorato ancora.`,
        `Una verifica avviata o terminata non si cancella, perché le consegne non si modificano né si cancellano da IsaBlock: si archivia con **${E.archivia}** (solo da terminata). La ritrovi con «${E.mostraArchiviate}», e **${E.ripristina}** la rimette in elenco.`,
      ] },
    ],
  },
  {
    id: 'dopo',
    titolo: 'Dopo: casi particolari',
    blocchi: [
      { h: 'Chi non ha potuto consegnare (senza rete)' },
      { p: `Lo studente ti porta il file di emergenza. A verifica terminata, sulla sua riga premi **${E.caricaFile}** e scegli il file. L'app controlla il file con un hash (l'impronta) che lega il programma alla verifica e allo studente: ferma i ritocchi semplici, un file cambiato a mano o preso da un compagno. Non è una firma né una sicurezza, perché il calcolo sta nel codice dell'app e chi lo conosce può rifarlo. Poi ti mostra un confronto tra l'ultimo salvataggio sul server e quello nel file. Se confermi, nasce una nuova versione di consegna. Il nome del file non conta, conta il contenuto.` },
      { p: `**Ordine giusto:** prima la verifica si termina (e i lavori si raccolgono da soli), poi si caricano i file di emergenza. Il file diventa la versione successiva e vale quello.` },
      { p: `**Se, dopo aver caricato un file, rilanci ${E.raccogli} (o termini di nuovo una verifica riaperta)**, per gli studenti con un file come ultima consegna e un lavoro sul server diverso IsaBlock non scrive niente e ti chiede cosa fare: **Tieni il file** (preselezionato) oppure **Raccogli comunque**. Con **Confronta** vedi i due programmi affiancati, in una finestra con due colonne (file a sinistra, server a destra) e un solo selettore (Blocchi, Pseudocodice, C, Python) che cambia entrambe insieme; nei tre codici le righe che ci sono solo da una parte sono evidenziate (≠). Ti suggerisce quale sembra più recente usando solo orari del server; gli orari che arrivano dal file sono dichiarati dal computer dello studente e vanno presi come indicazione. Dopo una riapertura il lavoro del server può essere davvero il più nuovo: la scelta, e la responsabilità della verifica, sono tue.` },
      { h: 'Riaprire' },
      { p: `**${E.riapri}** vale per tutti. Chi aveva già consegnato può consegnare di nuovo: le consegne precedenti restano, vale l'ultima. Le scadenze personali ripartono dalla nuova fine, più i minuti in più che avevi dato. Per dare tempo solo ad alcuni studenti, senza riaprire per tutti, a verifica chiusa spunta la casella della riga di uno studente (o di più righe) e premi «Riapri per i selezionati». Scegli quanti minuti da adesso o l'ora di fine, come nell'apertura. Vale anche per chi non era mai entrato. Gli iscritti al corso dopo l'apertura compaiono sotto la tabella in «Iscritti al corso che non hanno la verifica»: li spunti e scegli la traccia da dargli (devono essersi già iscritti con il codice del corso). Gli altri restano chiusi; chi è riaperto riprende dal suo lavoro (se aveva consegnato può riconsegnare) e, finché lavora, non viene raccolto da «${E.raccogli}». Se poi riapri per tutti, gli sblocchi si annullano e vale la nuova fine.` },
      { h: 'PDF' },
      { p: `A verifica terminata, **${E.scaricaPdf}** (sulla riga) o **${E.scaricaPdfTutti}** danno una scheda per studente: titolo, corso, nome, data di consegna, traccia, blocchi, pseudocodice, C, Python e un codice di riscontro, lo stesso che mostra «${E.guarda}» per quella consegna. Prima del download scegli quali parti vuoi (la traccia c'è sempre): le parti che stanno affiancate senza andare a capo si mettono vicine, le altre una sotto l'altra. I codici hanno i numeri di riga in una colonna a parte (si possono spegnere). La scelta vale per quel solo download. In «${E.guarda}» c'è anche **${E.apriCopiaProva}**: carica nell'editor una copia del programma che stai guardando, così lo esegui passo passo con i tuoi input. La consegna non cambia, la copia non va sul cloud e il salvataggio automatico del browser resta fermo finché la tieni (se la modifichi e vuoi conservarla, usa Salva). Una banda sotto la barra ti ricorda che è una copia: con ◀ ▶ passi allo studente precedente o successivo, con il nome della verifica a destra torni all'elenco degli studenti. **${E.esportaJsonTutti}** dà invece un file JSON con i programmi senza nomi né email (solo un codice per consegna, le tracce una volta sola) e un file CSV con le corrispondenze codice-studente: il CSV contiene i nomi, tienilo per te. È pensata per l'archivio cartaceo.` },
    ],
  },
];

export const sezioni = Object.freeze({
  [idSezioneStudente]: { titolo: 'Per lo studente', capitoli: studente },
  [idSezioneDocente]: { titolo: 'Per il docente', capitoli: docente },
});

// Le note dei «?». Una-due frasi, per i punti delicati. La chiave è quella che si passa a puntoDomanda(); `titolo` è il nome
// del pulsante o del punto a cui la nota si riferisce (la nota lo mostra in grassetto, così non c'è dubbio su cosa spiega).
export const aiuti = Object.freeze({
  fine: { titolo: 'Fine prevista', testo: 'È il momento in cui la verifica dovrebbe finire. In bozza è provvisoria: quando la avvii scegli la durata a partire da quel momento (oppure un\'ora di fine).' },
  extra: { titolo: 'Assegnazioni individuali', testo: 'Minuti in più per uno studente, oltre alla fine per tutti. Non si scrive un motivo: lo studente non lo vede e dal tempo diverso nessuno deve poter dedurre un bisogno particolare.' },
  stella: { titolo: `Traccia «per tutti» ${E.stella}`, testo: `La stella segna la traccia che ricevono gli studenti a cui non ne hai assegnata un'altra. Con la ☆ scegli un'altra traccia come quella per tutti (solo in bozza).` },
  raccogli: { titolo: E.raccogli, testo: 'Crea le consegne dal lavoro com\'è adesso. Alla chiusura avviene da sola; questo pulsante serve a rilanciarla. Le consegne non si modificano più. Se per uno studente hai caricato un file di emergenza e il lavoro sul server è diverso, ti chiede cosa fare prima di scrivere.' },
  caricaFile: { titolo: E.caricaFile, testo: 'Per chi ha consegnato il file di emergenza perché non c\'era rete. Compare solo a verifica terminata e crea una nuova versione di consegna dal file.' },
  riapri: { titolo: E.riapri, testo: 'Vale per tutti: chi aveva consegnato può consegnare di nuovo (vale l\'ultima). Per un solo studente usa «Riapri» sulla sua riga della tabella.' },
  fascia: { titolo: `Timer e «${T.consegnaPulsante}»`, testo: `Il tempo è calcolato dal server, non dal tuo computer. Quando arriva a zero il lavoro si consegna da solo. Se premi «${T.consegnaPulsante}», consegni subito: ti viene chiesta una conferma e poi non puoi più modificare. Altre spiegazioni: pulsante «Guida».` },
  offline: { titolo: 'Sei offline', testo: 'Senza rete il lavoro resta sul tuo computer e non si può consegnare. Salva il file e dallo al docente. Se la rete torna, tutto si sincronizza da solo.' },
});

// Quali «?» si vedono. Gli altri restano scritti qui (e nella Guida) ma non compaiono: per riaccenderne uno basta aggiungerlo.
// Spenti di proposito (7 nov 2026): quelli del docente accanto a pulsanti e campi (fine prevista, assegnazioni, «Raccogli»,
// «Carica file…», «Riapri…»): erano ambigui tra un pulsante e l'altro, e la guida e le finestre di conferma già li spiegano.
export const aiutiAttivi = new Set(['stella', 'fascia', 'offline']);
