// Scheda di consegna stampabile: le parti pure (nomi, codice di riscontro, ordine), senza DOM né Blockly. Il disegno della
// scheda è in stampa-ui.js.
import { hashText } from '../local-backup.js';
import { slug } from '../verifica-file.js';

// Come è arrivata la consegna, per il docente.
export const ORIGINE_SCHEDA = Object.freeze({
  studente: 'consegnata dallo studente',
  automatica: 'consegnata da sola allo scadere del tempo',
  raccolta: 'raccolta dal docente alla chiusura',
  file: 'caricata dal docente dal file di emergenza',
});

// Codice breve di riscontro: sulla carta e nell'app (finestra «Guarda») è lo stesso, calcolato dal programma. Serve a
// controllare che il foglio stampato corrisponda alla consegna che c'è nell'app («stesso codice, stesso programma»).
// Non è una firma e non protegge da niente: è un aiuto per l'archivio.
export function codiceRiscontro(programma) {
  if (typeof programma !== 'string' || programma === '') return null;
  const h = hashText(programma).toUpperCase().padStart(8, '0');
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

// Il titolo della finestra di stampa diventa il nome del PDF suggerito dal browser: breve e riconoscibile.
// «mario.rossi_verifica-di-novembre_v2». La parte iniziale è quella dell'email prima della chiocciola.
export function nomeDocumento({ email, titolo, versione }) {
  const chi = slug(String(email ?? '').split('@')[0], 40, true) || 'studente';
  return `${chi}_${slug(titolo, 40) || 'verifica'}_v${versione}`;
}

// Per «Stampa tutte»: un solo documento con una pagina per studente.
export function nomeDocumentoTutte({ titolo }) {
  return `${slug(titolo, 40) || 'verifica'}_tutte-le-consegne`;
}

// Le schede in ordine alfabetico (per nome, altrimenti per email), come la tabella.
export function ordinaSchede(schede) {
  const chiave = (s) => String(s.nome || s.email || '').toLowerCase();
  return [...schede].sort((a, b) => chiave(a).localeCompare(chiave(b), 'it') || a.email.localeCompare(b.email, 'it'));
}
