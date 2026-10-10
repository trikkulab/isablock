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
  'I corsi a cui ti iscrivi con il codice.',
  'Se condividi uno sketch con un corso, il docente di quel corso vede il tuo nome, la tua email e quello sketch (l’ultima versione che hai salvato), finché sei iscritto. Puoi smettere di condividere quando vuoi.',
  'Gli altri studenti non vedono i tuoi sketch. Puoi eliminare i tuoi sketch quando vuoi, da «I miei sketch».',
];

export const notaServizio = 'Il servizio che conserva i dati è Firebase, di Google.';
