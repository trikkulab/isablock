// File di emergenza della verifica: il lavoro di uno studente che non è riuscito a consegnare online (rete caduta), da
// portare al docente. Modulo PURO (niente Blockly, niente Firebase, niente DOM): lo produce lo studente (passo 10a) e lo
// controlla il docente prima di caricarlo come consegna (passo 10b).
//
// Cosa NON è: non è un file che si riapre nell'editor (`Apri` lo rifiuta: serve solo per la consegna). E non è sicuro
// contro chi sa programmare: l'impronta ferma i mezzi SEMPLICI (file ritoccato a mano, file di un compagno, file di
// un'altra verifica), non un attacco. Per questo basta un solo campo-impronta, non una catena di firme.
//
// Formato (JSON): { isablockEmergenza: 1, verifica, titolo, studente (email), studenteNome, creatoIl (ISO), offlineDa
// ('hh:mm' o null), nBlocchi, nBlocchiSincronizzati (o null), programma (il JSON del programma, come testo), impronta }.
import { verificaConfig } from './cloud/verifica-config.js';

const L = verificaConfig.regole;
export const VERSIONE_FILE = 1;
const SALE = 'isablock-emergenza-1';       // valore fisso nostro, dentro l'impronta

// Hash di 53 bit (cyrb53), SINCRONO: il file può essere letto anche da una pagina aperta senza https (laboratorio
// offline), dove SubtleCrypto non c'è. Due semi diversi = 106 bit.
function cyrb53(str, seme) {
  let h1 = 0xdeadbeef ^ seme;
  let h2 = 0x41c6ce57 ^ seme;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const esa = (n) => n.toString(16).padStart(14, '0');

// L'impronta lega il programma alla verifica e allo studente: cambiare uno dei tre la rende falsa.
export function calcolaImpronta({ verifica, studente, programma }) {
  const s = `${SALE}|${verifica}|${String(studente).toLowerCase()}|${programma}`;
  return esa(cyrb53(s, 1)) + esa(cyrb53(s, 2));
}

// Il JSON letto è un file di emergenza? (Serve ad `Apri`, per rifiutarlo con un messaggio chiaro.)
export const eFileEmergenza = (stato) => !!stato && typeof stato === 'object' && stato.isablockEmergenza !== undefined;

// Testo adatto a un nome di file: minuscolo, senza accenti, il resto diventa «-». `punto`: il punto resta (mario.rossi).
const slug = (testo, max, punto = false) => String(testo ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(punto ? /[^a-z0-9.]+/g : /[^a-z0-9]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, max);
const due = (n) => String(n).padStart(2, '0');
export const oraBreve = (d) => `${due(d.getHours())}:${due(d.getMinutes())}`;

// Nome automatico e breve: `mario.rossi_verifica-di-novembre_emergenza-1042.isablock` (la parte iniziale è la parte
// dell'email prima della chiocciola; il nome NON fa fede, fa fede il contenuto).
export function nomeFileEmergenza({ studente, titolo, creatoIl }) {
  const chi = slug(String(studente).split('@')[0], 40, true) || 'studente';
  return `${chi}_${slug(titolo, 30) || 'verifica'}_emergenza-${due(creatoIl.getHours())}${due(creatoIl.getMinutes())}.isablock`;
}

// Il nome del file ricorda lo studente giusto? Solo un avviso al docente: se non torna, conta comunque il contenuto.
export function nomeCoerente(nomeFile, studente) {
  const chi = slug(String(studente).split('@')[0], 40, true);
  return !!chi && slug(String(nomeFile ?? ''), 200, true).startsWith(chi);
}

// Costruisce il file. `programma` è il JSON del programma (testo). Restituisce { testo, nomeFile, oggetto }.
export function creaFileEmergenza({ verifica, titolo, studente, studenteNome, programma, nBlocchi, nBlocchiSincronizzati = null, offlineDa = null, creatoIl = new Date() }) {
  const email = String(studente).toLowerCase();
  const oggetto = {
    isablockEmergenza: VERSIONE_FILE,
    verifica,
    titolo: String(titolo ?? '').slice(0, L.maxTitoloVerifica),
    studente: email,
    studenteNome: String(studenteNome || email).slice(0, 80),
    creatoIl: creatoIl.toISOString(),
    offlineDa: offlineDa === null ? null : String(offlineDa).slice(0, 40),
    nBlocchi,
    nBlocchiSincronizzati,
    programma,
    impronta: calcolaImpronta({ verifica, studente: email, programma }),
  };
  return { testo: JSON.stringify(oggetto, null, 1), nomeFile: nomeFileEmergenza({ studente: email, titolo, creatoIl }), oggetto };
}

const nonNegativo = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const rifiuto = (errore, messaggio) => ({ ok: false, errore, messaggio });

// Controlla un file letto dal docente. `atteso` = { verifica, studente }: la riga da cui il docente sta caricando.
// Rifiuta se non è un file di emergenza, se è di una versione più nuova, se i dati non tornano, se l'impronta non torna,
// se è di un'altra verifica o di un altro studente. Restituisce { ok: true, file } con ciò che serve a `caricaFile`.
export function leggiFileEmergenza(testo, atteso) {
  let x;
  try { x = JSON.parse(testo); } catch { return rifiuto('formato', 'Questo non è un file di emergenza di IsaBlock.'); }
  if (!eFileEmergenza(x)) return rifiuto('formato', 'Questo non è un file di emergenza di IsaBlock (un normale file di lavoro non vale come consegna).');
  if (x.isablockEmergenza !== VERSIONE_FILE) return rifiuto('versione', 'Il file è stato creato con una versione diversa di IsaBlock e non posso leggerlo.');
  const campiOk = typeof x.verifica === 'string' && x.verifica && typeof x.studente === 'string' && x.studente
    && typeof x.studenteNome === 'string' && x.studenteNome.length > 0 && x.studenteNome.length <= 80
    && typeof x.programma === 'string' && x.programma.length > 0 && x.programma.length <= L.maxProgramma
    && typeof x.impronta === 'string' && x.impronta.length > 0 && x.impronta.length <= 64
    && (x.offlineDa === null || (typeof x.offlineDa === 'string' && x.offlineDa.length <= 40))
    && nonNegativo(x.nBlocchi, L.maxBlocchi)
    && (x.nBlocchiSincronizzati === null || nonNegativo(x.nBlocchiSincronizzati, L.maxBlocchi))
    && typeof x.creatoIl === 'string' && !Number.isNaN(new Date(x.creatoIl).getTime());
  if (!campiOk) return rifiuto('dati', 'Il file è incompleto o danneggiato.');
  try { const p = JSON.parse(x.programma); if (!p || typeof p !== 'object') throw new Error(); } catch { return rifiuto('dati', 'Il programma contenuto nel file non è leggibile.'); }
  if (x.impronta !== calcolaImpronta({ verifica: x.verifica, studente: x.studente, programma: x.programma })) {
    return rifiuto('impronta', 'Il file è stato modificato o non è valido: l\'impronta non torna.');
  }
  if (atteso && atteso.verifica !== undefined && x.verifica !== atteso.verifica) return rifiuto('verifica', 'Questo file è di un\'altra verifica.');
  if (atteso && atteso.studente !== undefined && x.studente !== String(atteso.studente).toLowerCase()) {
    return rifiuto('studente', `Questo file è di ${x.studenteNome} (${x.studente}), non dello studente di questa riga.`);
  }
  return {
    ok: true,
    file: {
      programma: x.programma, impronta: x.impronta, offlineDa: x.offlineDa, nBlocchiSincronizzati: x.nBlocchiSincronizzati,
      nBlocchi: x.nBlocchi, studenteNome: x.studenteNome, creatoIl: new Date(x.creatoIl), titolo: typeof x.titolo === 'string' ? x.titolo : '',
    },
  };
}
