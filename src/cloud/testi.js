// Testi della finestra di accesso, in un posto solo per poterli rivedere (ad
// esempio con il responsabile della protezione dei dati) senza toccare il codice.
// ATTENZIONE: l'elenco dei dati salvati deve restare identico a ciò che il cloud
// salva davvero (vedi docs/CLOUD.md). Periodo di conservazione e luogo dei
// server NON sono dichiarati qui perché non sono ancora stati decisi: da
// aggiungere quando lo saranno.

export const titoloAccesso = 'Accedi con l’account della scuola';

export const introAccesso =
  'Serve solo se vuoi salvare i tuoi sketch nel cloud, iscriverti a un corso o condividere un lavoro con il docente. ' +
  'Puoi usare IsaBlock anche senza accedere: tutto il resto funziona come sempre.';

export const titoloDati = 'Quali dati vengono salvati?';

// Riassunto breve, quello che si legge accedendo: l'essenziale in cinque righe. Il testo completo, voce per voce, è
// `gruppiDati` (nella finestra di accesso si apre con «Leggi tutto», e sta sempre nella Guida, sezione «Privacy e dati»).
export const riassuntoDati = [
  'Salviamo il tuo nome e la tua email della scuola (dal tuo account Google) e i corsi a cui ti iscrivi.',
  'I tuoi sketch li salviamo solo se lo scegli tu. Se li condividi con un corso, il docente li vede e può commentarli.',
  'Se il docente ti assegna una verifica, mentre la svolgi il docente vede il tuo lavoro e può rivederne l’evoluzione. Una volta consegnata, la consegna non si modifica più.',
  'Sul tuo computer restano una copia del lavoro e il tuo nome e ruolo, per non perdere niente se cade la rete.',
  'Gli altri studenti non vedono niente di tuo. Il servizio che conserva i dati è Firebase, di Google.',
];

export const apriTuttoEtichetta = 'Leggi tutto, voce per voce';
export const chiudiTuttoEtichetta = 'Nascondi il testo completo';

// Il testo completo, in tre gruppi. ATTENZIONE: deve restare identico a ciò che il cloud salva davvero (docs/CLOUD.md).
export const gruppiDati = [
  {
    titolo: 'Il tuo account e i corsi',
    voci: [
      'Il tuo nome e la tua email della scuola, che arrivano dal tuo account Google, per riconoscerti.',
      'I corsi a cui ti iscrivi con il codice. Il docente può anche iscriverti lui: in quel caso la tua email scolastica compare nell’elenco degli iscritti del corso (che vede il docente) anche prima del tuo primo accesso.',
      'Sul tuo computer, per riaprire IsaBlock anche quando non c’è rete, il browser ricorda il tuo nome, la tua email e il tuo ruolo (studente o docente). Si cancella quando esci.',
    ],
  },
  {
    titolo: 'Sketch e commenti',
    voci: [
      'Gli sketch che scegli tu di salvare nel cloud (non il lavoro che fai senza salvare).',
      'Se condividi uno sketch con un corso, il docente di quel corso vede il tuo nome, la tua email e quello sketch (l’ultima versione che hai salvato), finché sei iscritto. Puoi smettere di condividere quando vuoi.',
      'Il docente può scrivere dei commenti sullo sketch che hai condiviso, anche su un singolo blocco: li vedi tu e i docenti del corso. Il docente non modifica mai il tuo sketch, e tu non puoi cancellare i commenti (si cancellano insieme allo sketch, se lo elimini).',
      'Gli altri studenti non vedono i tuoi sketch. Puoi eliminare i tuoi sketch quando vuoi, da «I miei sketch».',
    ],
  },
  {
    titolo: 'Le verifiche',
    voci: [
      'Se il docente ti assegna una verifica: mentre la svolgi, il tuo programma viene salvato online di tanto in tanto (solo se è cambiato), insieme al numero di blocchi, a quante volte l’hai eseguito e con quale esito, a quando sei entrato in verifica, all’ultimo segnale di connessione e, ogni qualche minuto, al numero di blocchi in quel momento (serve a vedere come procede il lavoro). Lo vede il docente del corso, anche mentre scrivi: non gli altri studenti.',
      'Durante la verifica, ogni circa 5 minuti (se il programma è cambiato) e quando i blocchi aumentano di colpo, viene salvata anche un’istantanea del tuo programma: il docente può così rivedere come è evoluto il lavoro. Se ne tengono solo le più recenti (circa le ultime 2 ore): le nuove sostituiscono le vecchie.',
      'Nella verifica il docente può darti una traccia e un tempo diversi da quelli degli altri, senza che sia scritto il motivo; sul server resta anche quale versione della traccia hai già visto.',
      'Quando consegni (o scade il tempo, o il docente raccoglie i lavori) viene salvata una copia della consegna che nessuno può più modificare. Se la verifica viene riaperta puoi consegnare di nuovo: le consegne precedenti restano e vale l’ultima. Le consegne non si eliminano da IsaBlock. Dopo la chiusura le rivedi da «Le mie consegne».',
      'Durante una verifica una copia del tuo lavoro e del testo della traccia resta anche nel browser di questo computer, per non perderli se si chiude la pagina o cade la rete. Si cancella quando consegni; se la verifica finisce con modifiche non arrivate al server resta fino a circa una settimana. Se manca la rete puoi salvare un «file di emergenza», che contiene il tuo nome, la tua email e il tuo programma: lo consegni tu al docente, che lo carica come tua consegna.',
      'Il docente può scaricare le tue consegne in PDF (con il tuo nome, la traccia e il tuo programma) per tenerle in archivio.',
    ],
  },
];

// L'elenco in una lista sola (come era prima del riassunto).
export const datiSalvati = gruppiDati.flatMap((g) => g.voci);

export const notaServizio = 'Il servizio che conserva i dati è Firebase, di Google.';
