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

export const datiSalvati = [
  'Il tuo nome e la tua email della scuola, che arrivano dal tuo account Google, per riconoscerti.',
  'Gli sketch che scegli tu di salvare nel cloud (non il lavoro che fai senza salvare).',
  'I corsi a cui ti iscrivi con il codice. Il docente può anche iscriverti lui: in quel caso la tua email scolastica compare nell’elenco degli iscritti del corso (che vede il docente) anche prima del tuo primo accesso.',
  'Se condividi uno sketch con un corso, il docente di quel corso vede il tuo nome, la tua email e quello sketch (l’ultima versione che hai salvato), finché sei iscritto. Puoi smettere di condividere quando vuoi.',
  'Il docente può scrivere dei commenti sullo sketch che hai condiviso, anche su un singolo blocco: li vedi tu e i docenti del corso. Il docente non modifica mai il tuo sketch, e tu non puoi cancellare i commenti (si cancellano insieme allo sketch, se lo elimini).',
  'Se il docente ti assegna una verifica: mentre la svolgi, il tuo programma viene salvato online di tanto in tanto (solo se è cambiato), insieme al numero di blocchi, a quante volte l’hai eseguito e con quale esito, a quando sei entrato in verifica, all’ultimo segnale di connessione e, ogni qualche minuto, al numero di blocchi in quel momento (serve a vedere come procede il lavoro). Lo vede il docente del corso, non gli altri studenti.',
  'Durante la verifica, ogni circa 5 minuti (se il programma è cambiato) e quando i blocchi aumentano di colpo, viene salvata anche un’istantanea del tuo programma: il docente può così rivedere come è evoluto il lavoro. Se ne tengono solo le più recenti (circa le ultime 2 ore): le nuove sostituiscono le vecchie.',
  'Nella verifica il docente può darti una traccia e un tempo diversi da quelli degli altri, senza che sia scritto il motivo; sul server resta anche quale versione della traccia hai già visto.',
  'Quando consegni (o scade il tempo, o il docente raccoglie i lavori) viene salvata una copia della consegna che nessuno può più modificare. Se la verifica viene riaperta puoi consegnare di nuovo: le consegne precedenti restano e vale l’ultima. Le consegne non si eliminano da IsaBlock.',
  'Durante una verifica una copia del tuo lavoro e del testo della traccia resta anche nel browser di questo computer, per non perderli se si chiude la pagina o cade la rete. Si cancella quando consegni; se la verifica finisce con modifiche non arrivate al server resta fino a circa una settimana, così puoi salvarla su file e portarla al docente.',
  'Gli altri studenti non vedono i tuoi sketch. Puoi eliminare i tuoi sketch quando vuoi, da «I miei sketch».',
];

export const notaServizio = 'Il servizio che conserva i dati è Firebase, di Google.';
