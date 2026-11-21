// Scheda di consegna in PDF: le parti pure (nome dello studente, nome del file, codice di riscontro, ordine, data), senza
// DOM né Blockly. L'impaginazione è in pdf-scheda.js, la preparazione e il download in pdf-ui.js.
import { hashText } from '../local-backup.js';
import { slug } from '../verifica-file.js';

// Codice breve di riscontro: sulla carta e nell'app (finestra «Guarda») è lo stesso, calcolato dal programma. Serve a
// controllare che il foglio stampato corrisponda alla consegna che c'è nell'app («stesso codice, stesso programma»).
// Non è una firma e non protegge da niente: è un aiuto per l'archivio.
export function codiceRiscontro(programma) {
  if (typeof programma !== 'string' || programma === '') return null;
  const h = hashText(programma).toUpperCase().padStart(8, '0');
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

const parteEmail = (email) => String(email ?? '').split('@')[0];

// Il campo nome può contenere un'email (succede quando lo studente non ha un nome): vale solo la parte prima della chiocciola.
const nomePulito = (nome) => {
  const n = String(nome ?? '').trim().replace(/\s+/g, ' ');
  return /^\S+@\S+$/.test(n) ? parteEmail(n) : n;
};

// «Nome Cognome» come `displayName` di Google: il primo termine è il nome, il resto il cognome («Maria Rosa Bianchi» dà
// cognome «Rosa Bianchi»: limite noto e accettato). Senza nome si usa la parte dell'email prima della chiocciola, come cognome.
export function dividiNome(nome, email) {
  const parti = /^\S+@\S+$/.test(String(nome ?? '').trim()) ? [] : nomePulito(nome).split(/\s+/).filter(Boolean);   // un'email nel campo nome = nessun nome
  if (parti.length === 0) return { nome: '', cognome: parteEmail(email) };
  return { nome: parti[0], cognome: parti.slice(1).join(' ') };
}

// Il nome come si scrive sulla scheda (mai l'email intera).
export function nomeVisualizzato(nome, email) {
  return nomePulito(nome) || parteEmail(email);
}

// File del PDF di una consegna: `rossi-anna_3ainf_verifica-di-novembre_v2.pdf` (cognome-nome, classe, verifica, versione).
export function nomeFilePdf({ nome, email, classe, titolo, versione }) {
  const d = dividiNome(nome, email);
  const chi = d.nome ? `${slug(d.cognome, 30) || 'studente'}-${slug(d.nome, 30)}` : (slug(d.cognome, 40, true) || 'studente');
  return [chi, slug(classe, 20), slug(titolo, 40) || 'verifica', `v${versione}`].filter(Boolean).join('_') + '.pdf';
}

// File con tutte le consegne: `3ainf_verifica-di-novembre_tutte-le-consegne.pdf`.
export function nomeFilePdfTutte({ classe, titolo }) {
  return [slug(classe, 20), slug(titolo, 40) || 'verifica', 'tutte-le-consegne'].filter(Boolean).join('_') + '.pdf';
}

// File dell'esportazione anonima: `3ainf_verifica-di-novembre_consegne.json` e `…_corrispondenze.csv` (quest'ultimo ha i nomi).
export function nomiFileJson({ classe, titolo }) {
  const base = [slug(classe, 20), slug(titolo, 40) || 'verifica'].filter(Boolean).join('_');
  return { json: `${base}_consegne.json`, csv: `${base}_corrispondenze.csv` };
}

// Le schede in ordine alfabetico per cognome e poi per nome (senza badare a maiuscole e accenti), infine per email.
export function ordinaSchede(schede) {
  const chiave = (s) => dividiNome(s.nome, s.email);
  const conf = (a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' });
  return [...schede].sort((a, b) => {
    const x = chiave(a); const y = chiave(b);
    return conf(x.cognome, y.cognome) || conf(x.nome, y.nome) || a.email.localeCompare(b.email, 'it');
  });
}

// «6 novembre 2026»: solo la data (non l'ora) della consegna.
const formatoDataLunga = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
export const dataLunga = (d) => formatoDataLunga.format(d);

// I commenti del docente per il PDF di UNA consegna. `feedback`: tutti i feedback della verifica (feedbackDaDocumento); si tengono solo
// i PUBBLICATI di quello studente e di quella versione (le bozze non finiscono mai in un archivio). `righe`: `testi.righe` di
// renderBlocchi ({ pseudocode, c, python }: per ogni codice { idBlocco: [da, a] }), o null se il programma non si legge.
// Restituisce i commenti già numerati: prima quelli sull'intera consegna (nell'ordine in cui sono stati scritti), poi quelli sui blocchi
// nell'ordine in cui compaiono nel programma (la prima riga dello pseudocodice, in mancanza di C o Python; chi non ha righe in fondo).
export function preparaCommenti({ feedback, email, versione, righe = null }) {
  const miei = (feedback ?? []).filter((f) => f.pubblicato && String(f.studenteEmail).toLowerCase() === String(email).toLowerCase() && f.versione === versione);
  const perScrittura = (a, b) => (a.creato?.getTime() ?? 0) - (b.creato?.getTime() ?? 0);
  const righeDi = (f) => {
    if (!f.bloccoId || !righe) return null;
    const r = {};
    for (const k of ['pseudocode', 'c', 'python']) if (righe[k] && righe[k][f.bloccoId]) r[k] = righe[k][f.bloccoId];
    return Object.keys(r).length ? r : null;
  };
  const posizione = (r) => (r ? (r.pseudocode ?? r.c ?? r.python)[0] : Infinity);
  const generali = miei.filter((f) => !f.bloccoId).sort(perScrittura);
  const sui = miei.filter((f) => f.bloccoId).map((f) => ({ f, r: righeDi(f) }))
    .sort((a, b) => posizione(a.r) - posizione(b.r) || perScrittura(a.f, b.f));
  return [
    ...generali.map((f) => ({ testo: f.testo, generale: true, bloccoTesto: '', righe: null })),
    ...sui.map(({ f, r }) => ({ testo: f.testo, generale: false, bloccoTesto: f.bloccoTesto ?? '', righe: r })),
  ].map((c, i) => ({ ...c, n: i + 1 }));
}
