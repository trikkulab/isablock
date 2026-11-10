// Contatore di letture (e riattacchi degli ascolti) per capire da dove arrivano le letture del database durante una
// verifica. SPENTO di default: si accende aprendo l'indirizzo con ?contatore=1 (resta acceso in quel browser fino a
// ?contatore=0). Non scrive mai niente sul database: i conteggi stanno nel browser (copia in sessionStorage), si guardano
// in console (window.contatoreLetture.tabella()) e si scaricano in CSV dal pulsante in basso a sinistra.
// Conta ciò che il client RICEVE: documenti degli ascolti (non quelli della cache né le scritture locali in attesa), getDoc
// e getDocs. Non vede le letture fatte dentro le regole di sicurezza: sono la differenza con la console Firebase.
const CHIAVE_ATTIVO = 'isablock.contatore';
const CHIAVE_DATI = 'isablock.contatore.dati';

const leggi = (storage, chiave) => { try { return storage.getItem(chiave); } catch { return null; } };
const scrivi = (storage, chiave, valore) => { try { if (valore === null) storage.removeItem(chiave); else storage.setItem(chiave, valore); } catch { /* storage non disponibile */ } };

// Si accende con ?contatore=1 e si spegne con ?contatore=0; senza parametro resta com'era.
export function contatoreAttivo({ ricerca = typeof location !== 'undefined' ? location.search : '', storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
  const p = new URLSearchParams(ricerca).get('contatore');
  if (storage && p === '1') scrivi(storage, CHIAVE_ATTIVO, '1');
  if (storage && p === '0') { scrivi(storage, CHIAVE_ATTIVO, null); return false; }
  return p === '1' || (!!storage && leggi(storage, CHIAVE_ATTIVO) === '1');
}

// «verifiche/ABC/lavori/anna@x.it» -> «verifiche/*/lavori/*»: i nomi delle collezioni restano, gli id no.
export function etichettaPercorso(rif) {
  const grezzo = rif && (rif.path ?? rif._query?.path?.canonicalString?.() ?? rif._path?.canonicalString?.());
  if (typeof grezzo !== 'string' || !grezzo) return '?';
  const pezzi = grezzo.split('/');
  return pezzi.map((s, i) => (i % 2 === 0 ? s : '*')).join('/');
}

export function creaContatore({ ora = () => Date.now(), storage = null } = {}) {
  const secchi = new Map();            // «HH:MM|sorgente|tipo» -> n
  const minuto = () => { const d = new Date(ora()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const conta = (sorgente, tipo, n = 1) => { if (n <= 0) return; const k = `${minuto()}|${sorgente}|${tipo}`; secchi.set(k, (secchi.get(k) ?? 0) + n); };
  if (storage) {
    try { for (const [k, v] of JSON.parse(leggi(storage, CHIAVE_DATI) || '[]')) secchi.set(k, v); } catch { /* copia rovinata: si riparte */ }
  }
  const salva = () => { if (storage) scrivi(storage, CHIAVE_DATI, JSON.stringify([...secchi])); };
  const righe = () => [...secchi].map(([k, n]) => { const [m, sorgente, tipo] = k.split('|'); return { minuto: m, sorgente, tipo, n }; })
    .sort((a, b) => a.minuto.localeCompare(b.minuto) || a.sorgente.localeCompare(b.sorgente) || a.tipo.localeCompare(b.tipo));
  const totali = () => {
    const t = {};
    for (const r of righe()) { const k = `${r.sorgente} · ${r.tipo}`; t[k] = (t[k] ?? 0) + r.n; }
    return t;
  };
  const documenti = () => righe().filter((r) => r.tipo === 'documenti').reduce((s, r) => s + r.n, 0);
  const csv = () => ['minuto,sorgente,tipo,n', ...righe().map((r) => `${r.minuto},${r.sorgente},${r.tipo},${r.n}`)].join('\n') + '\n';
  const azzera = () => { secchi.clear(); salva(); };
  return { conta, righe, totali, documenti, csv, azzera, salva };
}

// Restituisce un oggetto sdk uguale all'originale ma che conta onSnapshot, getDoc e getDocs.
export function avvolgi(sdk, contatore) {
  const onSnapshot = (rif, ...resto) => {
    const sorgente = `${rif?.type === 'document' ? 'doc' : 'raccolta'}:${etichettaPercorso(rif)}`;
    contatore.conta(sorgente, 'ascolti_aperti');
    const conta = (snap) => {
      if (!snap || !snap.metadata || snap.metadata.fromCache) return;
      if (typeof snap.docChanges === 'function') {
        contatore.conta(sorgente, 'eventi');
        contatore.conta(sorgente, 'documenti', snap.docChanges().length);
      } else if (typeof snap.exists === 'function' && !snap.metadata.hasPendingWrites) {
        contatore.conta(sorgente, 'eventi');
        contatore.conta(sorgente, 'documenti', 1);
      }
    };
    const i = resto.findIndex((x) => typeof x === 'function');
    if (i >= 0) {
      const originale = resto[i];
      resto[i] = (snap) => { conta(snap); return originale(snap); };
    } else if (resto[0] && typeof resto[0].next === 'function') {
      const o = resto[0];
      resto[0] = { ...o, next: (snap) => { conta(snap); return o.next(snap); } };
    }
    return sdk.onSnapshot(rif, ...resto);
  };
  const getDoc = async (rif) => {
    const r = await sdk.getDoc(rif);
    contatore.conta(`doc:${etichettaPercorso(rif)}`, 'get');
    return r;
  };
  const getDocs = async (q) => {
    const r = await sdk.getDocs(q);
    contatore.conta(`raccolta:${etichettaPercorso(q)}`, 'get', Math.max(1, r.size ?? 0));
    return r;
  };
  return { ...sdk, onSnapshot, getDoc, getDocs };
}

// Pulsante nel piè di pagina, in linea con gli altri comandi (mai fisso sopra la pagina: coprirebbe pulsanti e finestre):
// totale dei documenti letti dal client e scarico del CSV. Solo quando il contatore è acceso.
export function montaPulsanteContatore(contatore, { documento = document } = {}) {
  const b = documento.createElement('button');
  b.type = 'button';
  b.className = 'footer-link';
  b.title = 'Contatore di letture (spegni con ?contatore=0). Clic: scarica il CSV. Maiusc+clic: azzera.';
  const aggiorna = () => { b.textContent = `📊 ${contatore.documenti()} letture`; contatore.salva(); };
  b.addEventListener('click', (e) => {
    if (e.shiftKey) { contatore.azzera(); aggiorna(); return; }
    const url = URL.createObjectURL(new Blob([contatore.csv()], { type: 'text/csv' }));
    const a = documento.createElement('a');
    const d = new Date();
    a.href = url; a.download = `contatore-letture-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.csv`;
    documento.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  aggiorna();
  setInterval(aggiorna, 5000);
  (documento.querySelector('.app-footer') ?? documento.body).append(b);
  window.contatoreLetture = { tabella: () => console.table(contatore.righe()), totali: () => console.table(contatore.totali()), csv: () => contatore.csv() };
  return b;
}
