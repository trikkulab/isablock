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
