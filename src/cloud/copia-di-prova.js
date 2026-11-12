// «Apri una copia per provarla» (docente, dalla finestra «Guarda»): carica nell'editor il programma di uno studente per
// provarlo, senza toccare la consegna: è una copia, non si salva sul cloud, la copia automatica del browser resta ferma finché
// c'è, e non si lega a nessuno sketch. La logica sta qui (senza DOM) per provarla con un finto `programma`; la banda che lo
// ricorda, con il link alla verifica e le frecce tra gli studenti, è in banda-copia.js.

// `programma`: main.js (occupato, isVuoto, carica, copiaDiProva?). `json`: il programma da aprire. `chi`: descrizione per la banda.
// `confermaSostituzione`: (messaggio) => boolean (di solito window.confirm). Restituisce true se la copia è stata aperta.
// La conferma si chiede solo se nell'editor c'è un programma che andrebbe perso: non se c'è già una copia di prova non modificata
// (passando da uno studente all'altro non serve confermare ogni volta).
export function apriCopiaDiProva({ programma, json, chi, toast, confermaSostituzione, dopoCaricamento = null, chiudiFinestre = null, mostraBanda = null }) {
  if (!json) { toast('Non c\'è ancora un programma da aprire.', 'error'); return false; }
  if (programma.occupato()) { toast('Interrompi l\'esecuzione prima di aprire la copia.', 'error'); return false; }
  const copia = programma.copiaDiProva ?? null;
  const copiaIntatta = !!(copia && copia.attiva() && !copia.modificata());
  if (!programma.isVuoto() && !copiaIntatta) {
    const perde = copia && copia.attiva() ? 'La copia di prova che hai modificato andrà persa. Continuare?' : 'Aprire una copia nell\'editor? Il programma corrente andrà perso.';
    if (!confermaSostituzione(perde)) return false;
  }
  try { if (copia) copia.apri(json); else programma.carica(json); } catch { toast('Non riesco ad aprire questo programma.', 'error'); return false; }
  dopoCaricamento?.();                 // lo sketch aperto non è più quello che si vede: «Salva» non deve sovrascriverlo
  chiudiFinestre?.();
  mostraBanda?.(chi);
  toast('Copia aperta nell\'editor: puoi provarla ed eseguirla, la consegna resta com\'è.', 'success');
  return true;
}
