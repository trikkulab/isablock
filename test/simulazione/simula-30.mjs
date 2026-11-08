// Simulazione di una verifica con N studenti (default 30) e un docente, con ORARIO SIMULATO condiviso:
// 2 ore di verifica si eseguono in pochi minuti. Usa il motore vero (creaSessione, creaVerificaDocente) contro le
// regole vere nell'emulatore; conta scritture e letture come le conterebbe Firestore (stima lato client).
//
//   REGOLE_FILE=.regole-test.rules FIRESTORE_EMULATOR_HOST=127.0.0.1:8286 node test/simulazione/simula-30.mjs [N] [minuti]
//
// Scrive il rapporto in test/simulazione/rapporto.json (e lo stampa). Non tocca mai il Firebase vero.
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaSessione, creaVerificheStudente } from '../../src/cloud/verifica-studente.js';
import { creaVerificaDocente } from '../../src/cloud/verifica-docente.js';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

sdk.setLogLevel('silent');
const N = Number(process.argv[2] || 30);
const DURATA_MIN = Number(process.argv[3] || 120);
const MIN = 60_000;
// Varianti della prova (variabili d'ambiente):
//   SIM_MODO = base (debounce 25 s per tutti) | osservato (5 s/2 s solo per lo studente osservato dal docente) | tutti (per tutti)
//   SIM_DEB  = debounce «live» in ms (default 5000); SIM_BURST=1 = studenti a raffiche (5-10 azioni in 30-60 s, poi pausa)
const MODO = process.env.SIM_MODO || 'base';
const DEB = Number(process.env.SIM_DEB || 5000);
const BURST = process.env.SIM_BURST === '1';
const ETICHETTA = process.env.SIM_ETICHETTA || 'base';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8286').split(':');
const DOC = 'docente@isarome.it';
const emailDi = (i) => `studente${String(i + 1).padStart(2, '0')}@isarome.it`;

// ── Numeri casuali riproducibili ─────────────────────────────────────────────
let seme = 20261108;
const rnd = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 4294967296; };
const tra = (a, b) => a + rnd() * (b - a);
const traMs = (a, b) => Math.round(tra(a, b));

// ── Conteggio come Firestore ─────────────────────────────────────────────────
const conti = { scritture: {}, letture: {}, byteLetti: {}, byteScritti: {}, errori: [] };
const somma = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const categoria = (path) => {
  if (/\/storia\//.test(path)) return 'storia';
  if (/\/lavori\//.test(path)) return 'lavori';
  if (/\/consegne\//.test(path)) return 'consegne';
  if (/\/tracce\//.test(path)) return 'tracce';
  if (/^verifiche\/[^/]+$/.test(path)) return 'verifica';
  return 'altro';
};
const peso = (d) => { try { return JSON.stringify(d, (k, v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v)).length; } catch { return 0; } };
const minutoDi = { corrente: () => 0 };
const lettureAlMinuto = new Map();      // chi -> Map(minuto -> n)
function leggi(chi, cat, n, byte) {
  if (!n) return;
  somma(conti.letture, `${chi}.${cat}`, n); somma(conti.byteLetti, `${chi}.${cat}`, byte || 0);
  const m = minutoDi.corrente();
  if (!lettureAlMinuto.has(chi)) lettureAlMinuto.set(chi, new Map());
  const mm = lettureAlMinuto.get(chi); mm.set(m, (mm.get(m) || 0) + n);
}

// Un sdk che conta. `chi` = 'studente' | 'docente'.
function sdkContato(chi) {
  const scrivi = (rif, dati, n = 1) => { const c = categoria(rif.path); somma(conti.scritture, `${chi}.${c}`, n); somma(conti.byteScritti, `${chi}.${c}`, peso(dati)); };
  const base = { ...sdk };
  const nota = (rif, dati) => (e) => { conti.errori.push(`min ${minutoDi.corrente()} ${chi} ${rif.path} ${e.code || e.message} campi=${Object.keys(dati || {}).join(',')}`); throw e; };
  base.setDoc = (rif, dati, ...r) => { scrivi(rif, dati); return sdk.setDoc(rif, dati, ...r).catch(nota(rif, dati)); };
  base.updateDoc = (rif, dati, ...r) => { scrivi(rif, dati); return sdk.updateDoc(rif, dati, ...r).catch(nota(rif, dati)); };
  base.deleteDoc = (rif) => { scrivi(rif, {}); return sdk.deleteDoc(rif); };
  base.writeBatch = (db) => {
    const b = sdk.writeBatch(db);
    const reg = [];
    const ric = (nome) => (rif, dati, ...r) => { reg.push([rif, dati]); b[nome](rif, dati, ...r); return prox; };
    const prox = { set: ric('set'), update: ric('update'), delete: (rif) => { reg.push([rif, {}]); b.delete(rif); return prox; },
      commit: () => { reg.forEach(([rif, dati]) => scrivi(rif, dati)); return b.commit().catch(nota(reg[0][0], reg[0][1])); } };
    return prox;
  };
  base.getDoc = async (rif) => { const s = await sdk.getDoc(rif); leggi(chi, categoria(rif.path), 1, s.exists() ? peso(s.data()) : 0); return s; };
  base.getDocs = async (q) => {
    const s = await sdk.getDocs(q);
    const cat = s.docs[0] ? categoria(s.docs[0].ref.path) : 'altro';
    leggi(chi, cat, Math.max(1, s.size), s.docs.reduce((a, d) => a + peso(d.data()), 0));
    return s;
  };
  base.onSnapshot = (rif, ...args) => {
    const iPrimoFn = args.findIndex((a) => typeof a === 'function');
    const cb = args[iPrimoFn];
    let primo = true; let eraInSospeso = false;
    args[iPrimoFn] = (snap) => {
      try {
        if (snap.docChanges) {                                      // query
          if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
            const cambi = primo ? snap.docs.map((d) => d) : snap.docChanges().map((c) => c.doc);
            if (cambi.length) leggi(chi, categoria(cambi[0].ref.path), cambi.length, cambi.reduce((a, d) => a + peso(d.data()), 0));
            if (!cambi.length && primo) leggi(chi, 'query-vuota', 1, 0);
          }
        } else {                                                     // singolo documento
          const server = !snap.metadata.fromCache;
          const ackMio = eraInSospeso && !snap.metadata.hasPendingWrites;
          if (server && !snap.metadata.hasPendingWrites && (primo || !ackMio) && snap.exists()) leggi(chi, categoria(snap.ref.path), 1, peso(snap.data()));
          eraInSospeso = snap.metadata.hasPendingWrites;
        }
      } catch (e) { conti.errori.push('conteggio: ' + e.message); }
      primo = false;
      return cb(snap);
    };
    return sdk.onSnapshot(rif, ...args);
  };
  return base;
}

// ── Orologio simulato condiviso ──────────────────────────────────────────────
function creaOrologio() {
  let t = Date.now();
  const inizio = t;
  let prossimo = 1;
  const timer = new Map();
  const per = (proprietario) => ({
    adesso: () => t,
    timeout(fn, ms) { const id = prossimo++; timer.set(id, { fn, scade: t + ms, proprietario }); return id; },
    annulla(id) { timer.delete(id); },
  });
  return {
    inizio, adesso: () => t, per,
    async avanzaFinoA(fine, quandoMinuto) {
      let giri = 0;
      for (;;) {
        const dovuti = [...timer.entries()].filter(([, v]) => v.scade <= fine).sort((a, b) => a[1].scade - b[1].scade || a[0] - b[0]);
        if (!dovuti.length) break;
        if (++giri > 2_000_000) throw new Error('troppi timer');
        const [id, v] = dovuti[0];
        timer.delete(id);
        t = Math.max(t, v.scade);
        quandoMinuto?.(Math.floor((t - inizio) / MIN));
        try { await v.fn(); } catch (e) { conti.errori.push("timer: " + e.message); }
        try { await v.proprietario?.fermo?.(); } catch (e) { conti.errori.push('fermo: ' + e.message); }
      }
      t = fine;
    },
  };
}

// ── Programmi che crescono come quelli degli studenti ────────────────────────
let idBlocco = 0;
function blocco(tipo) {
  const id = `b${++idBlocco}`;
  const v = { id: 'var_' + Math.floor(rnd() * 6) };
  switch (tipo) {
    case 0: return { type: 'assign', id, fields: { VAR: v }, inputs: { VALUE: { block: { type: 'arith_op', id: id + 'x', fields: { OP: 'ADD' }, inputs: { A: { block: { type: 'variable_get', id: id + 'a', fields: { VAR: v } } }, B: { block: { type: 'number_literal', id: id + 'n', fields: { VALUE: Math.floor(rnd() * 100) } } } } } } } };
    case 1: return { type: 'write', id, inputs: { VALUE: { block: { type: 'variable_get', id: id + 'a', fields: { VAR: v } } } } };
    case 2: return { type: 'read', id, fields: { VAR: v } };
    case 3: return { type: 'comment_line', id, fields: { TEXT: 'Controllo il valore letto e scelgo cosa fare' } };
    default: return { type: 'controls_if', id, inputs: { COND: { block: { type: 'compare_op', id: id + 'c', fields: { OP: 'LT' }, inputs: { A: { block: { type: 'variable_get', id: id + 'a', fields: { VAR: v } } }, B: { block: { type: 'number_literal', id: id + 'n', fields: { VALUE: Math.floor(rnd() * 100) } } } } } }, BODY: { block: { type: 'write', id: id + 'w', inputs: { VALUE: { block: { type: 'number_literal', id: id + 'q', fields: { VALUE: 1 } } } } } } } };
  }
}
// Il programma è una lista di blocchi (statement) concatenati; ogni "if" vale 4 blocchi, gli altri 1-3.
const nBlocchiDi = (lista) => lista.reduce((a, b) => a + (b.type === 'controls_if' ? 5 : b.type === 'assign' ? 4 : b.type === 'comment_line' ? 1 : 2), 0);
function serializza(lista, pos = 0) {
  let catena = null;
  for (let i = lista.length - 1; i >= 0; i--) catena = { ...lista[i], ...(catena ? { next: { block: catena } } : {}) };
  return JSON.stringify({ formatVersion: 6, blocks: { languageVersion: 0, blocks: [{ type: 'program', id: 'program', x: pos * 7, y: pos * 3, inputs: catena ? { BODY: { block: catena } } : {} }] } });
}

// ── Profili degli studenti ───────────────────────────────────────────────────
// ogni profilo: ritmo (secondi tra un'azione e l'altra), obiettivo di istruzioni, quando consegna a mano (minuto) o mai.
function profilo(i) {
  const r = rnd();
  const base = r < 0.55 ? { tipo: 'regolare', ritmo: [20, 90], obiettivo: [8, 22] }
    : r < 0.8 ? { tipo: 'lento', ritmo: [60, 180], obiettivo: [4, 12] }
    : r < 0.92 ? { tipo: 'veloce', ritmo: [8, 35], obiettivo: [18, 40] }
    : { tipo: 'fermo', ritmo: [180, 420], obiettivo: [2, 6] };
  return { ...base, ingresso: tra(0, 4), consegnaA: i < N - Math.max(2, Math.round(N / 6)) ? tra(DURATA_MIN * 0.55, DURATA_MIN * 0.95) : null,
    incolla: i === 3 || i === 11, offline: i === 5 || i === 17, esegue: rnd() < 0.8 };
}

// ── Prova ────────────────────────────────────────────────────────────────────
const t0Reale = Date.now();
const env = await initializeTestEnvironment({
  projectId: 'demo-simulazione',
  firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || '.regole-test.rules', 'utf8') },
});
let ok = false;
const orologio = creaOrologio();
const sessioni = [];
const ascolti = [];
try {
  for (let i = 0; ; i++) { try { await env.clearFirestore(); break; } catch (e) { if (i > 4) throw e; await new Promise((r) => setTimeout(r, 500)); } }
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await sdk.setDoc(sdk.doc(db, `docenti/${DOC}`), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: [DOC], iscrizioniAperte: true, attivo: true });
    for (let i = 0; i < N; i++) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${emailDi(i)}`), { corsoId: 'AB12CD', email: emailDi(i) });
  });
  const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();

  // Docente: crea, tracce, apre (fine = tra DURATA_MIN minuti, orologio simulato = orologio vero all'inizio)
  const sdkD = sdkContato('docente');
  const dbDoc = dbDi(DOC);
  const d = creaVerificaDocente({ sdk: sdkD, db: dbDoc }, DOC);
  const fine = new Date(orologio.inizio + DURATA_MIN * MIN);
  const v = await d.crea('AB12CD', { titolo: 'Simulazione', fine });
  await d.verifiche.nuovaTraccia(v.id, { titolo: 'Versione A', testoMd: '# Traccia A\n\n' + 'Scrivi un programma. '.repeat(40) });
  await d.verifiche.nuovaTraccia(v.id, { titolo: 'Versione B', testoMd: '# Traccia B\n\n' + 'Scrivi un altro programma. '.repeat(40) });
  await d.apri(v.id, { tracciaDefault: 't0', fine });
  const vid = v.id;
  Object.keys(conti.scritture).forEach((k) => delete conti.scritture[k]);       // la preparazione non conta: è prima dell'inizio
  Object.keys(conti.byteScritti).forEach((k) => delete conti.byteScritti[k]);
  Object.keys(conti.letture).forEach((k) => delete conti.letture[k]);
  Object.keys(conti.byteLetti).forEach((k) => delete conti.byteLetti[k]);

  // Docente: tabella live per tutta la verifica
  const orDoc = orologio.per(null);
  let ultimaTabella = null;
  ascolti.push(d.ascoltaSituazione(vid, (s) => { ultimaTabella = s; }, (e) => conti.errori.push('tabella: ' + (e.code || e.message))));

  // Studenti
  const stati = new Array(N).fill('?');
  const origine = new Array(N).fill(null);
  const statoFinale = [];
  for (let i = 0; i < N; i++) {
    const email = emailDi(i);
    const dbS = dbDi(email);
    const sdkS = sdkContato('studente');
    const p = profilo(i);
    const sess = { fermo: async () => {} };
    const info = { deb: MODO === 'tutti' ? DEB : verificaConfig.client.debounceSalvataggioMs };
    const config = Object.create(verificaConfig.client, { debounceSalvataggioMs: { get: () => info.deb } });
    const s = creaSessione({ sdk: sdkS, db: dbS }, email, 'Studente ' + (i + 1), vid, {
      tempo: orologio.per({ fermo: () => sess.fermo() }), calibra: false, config,
      onCambio: (c) => { stati[i] = c.stato; origine[i] = c.origine; },
    });
    sess.fermo = () => s.fermo();
    // le verifiche aperte (ascolto leggero della schermata di scelta, come in main)
    const vs = creaVerificheStudente({ sdk: sdkS, db: dbS }, email, 'Studente ' + (i + 1));
    ascolti.push(vs.ascoltaAperte(['AB12CD'], () => {}));
    sessioni.push({ s, p, email, lista: [], esecuzioni: 0, dbS, info, pos: 0 });
  }
  const gestore = { fermo: async () => { for (const x of sessioni) await x.s.fermo(); } };
  const tempoRegia = orologio.per(gestore);

  const azione = (i, quando, fn) => tempoRegia.timeout(async () => { try { await fn(); } catch (e) { conti.errori.push(`azione studente ${i + 1}: ${e.message}`); } }, quando);
  const inviaProgramma = (x) => x.s.aggiorna({ programma: serializza(x.lista, x.pos), nBlocchi: nBlocchiDi(x.lista), ...(x.esecuzioni ? { esecuzioni: { n: x.esecuzioni, esito: 'ok', quando: Math.round(orologio.adesso()) } } : {}) });

  sessioni.forEach((x, i) => {
    const { p } = x;
    const obiettivo = Math.round(tra(...p.obiettivo));
    let raffica = 0;
    const prossimo = () => {                                          // ms fino alla prossima azione
      if (!BURST) return tra(...p.ritmo) * 1000;
      if (raffica > 0) { raffica--; return tra(3, 8) * 1000; }
      raffica = Math.round(tra(5, 10));
      return tra(...(p.tipo === 'fermo' ? [120, 300] : p.tipo === 'lento' ? [60, 200] : [30, 120])) * 1000;   // pausa: pensa, pesa, esegue
    };
    const passo = () => {
      if (x.s.stato() !== 'in-corso') return;
      const r = rnd();
      if (BURST && r < 0.25) x.pos++;                                                                    // sposta un pezzo
      else if (r < 0.1 && x.lista.length > 3) x.lista.splice(Math.floor(rnd() * x.lista.length), 1);      // cancella qualcosa
      else if (x.lista.length < obiettivo || r < 0.15) x.lista.push(blocco(Math.floor(rnd() * 5)));
      else if (p.esegue && r < 0.35) x.esecuzioni++;                                                  // prova a eseguire
      else x.pos++;
      inviaProgramma(x);
      azione(i, prossimo(), passo);
    };
    azione(i, p.ingresso * MIN, async () => {
      const st = await x.s.avvia();
      stati[i] = st;
      if (st !== 'in-corso') return;
      azione(i, prossimo(), passo);
      if (p.incolla) azione(i, tra(DURATA_MIN * 0.3, DURATA_MIN * 0.5) * MIN, () => { for (let k = 0; k < 8; k++) x.lista.push(blocco(Math.floor(rnd() * 5))); inviaProgramma(x); });
      if (p.consegnaA) azione(i, p.consegnaA * MIN, async () => { if (x.s.stato() === 'in-corso') { await x.s.consegna(); } });
      if (p.offline) {
        const quando = tra(DURATA_MIN * 0.3, DURATA_MIN * 0.6) * MIN;
        azione(i, quando, async () => { await sdk.disableNetwork(x.dbS); });
        azione(i, quando + 100 * 1000, async () => { await sdk.enableNetwork(x.dbS); });
      }
    });
  });

  // Il docente osserva uno studente alla volta (primo piano), cambiando ogni 2-3 minuti: solo lui scrive ogni DEB ms.
  // Costo del meccanismo: una scrittura del docente (flag) e una lettura dello studente (suo lavoro) per ogni cambio.
  if (MODO === 'osservato') {
    let corrente = -1;
    const cambia = () => {
      if (orologio.adesso() > orologio.inizio + (DURATA_MIN + 1) * MIN) return;
      if (corrente >= 0) { sessioni[corrente].info.deb = verificaConfig.client.debounceSalvataggioMs; somma(conti.scritture, 'docente.flag'); somma(conti.letture, 'studente.flag'); }
      const attivi = sessioni.map((x, k) => k).filter((k) => sessioni[k].s.stato() === 'in-corso');
      corrente = attivi.length ? attivi[Math.floor(rnd() * attivi.length)] : -1;
      if (corrente >= 0) { sessioni[corrente].info.deb = DEB; somma(conti.scritture, 'docente.flag'); somma(conti.letture, 'studente.flag'); }
      azione(-1, tra(2, 3) * MIN, cambia);
    };
    azione(-1, 6 * MIN, cambia);
  }

  // Il docente: tempo in più a uno studente (minuto 30), traccia corretta (minuto 60)
  azione(-1, 30 * MIN, () => d.tempoAggiuntivo(vid, emailDi(2), 10));
  azione(-1, 60 * MIN, () => d.verifiche.modificaTraccia(vid, 't0', { titolo: 'Versione A', testoMd: '# Traccia A (corretta)\n\n' + 'Scrivi un programma. '.repeat(40) }));

  // Si va avanti con l'orologio, minuto per minuto, riportando l'avanzamento
  const fineSim = orologio.inizio + (DURATA_MIN + 5) * MIN;
  let ultimoMin = -1;
  await orologio.avanzaFinoA(fineSim, (m) => {
    minutoDi.corrente = () => m;
    if (m !== ultimoMin && m % 10 === 0) { ultimoMin = m; console.log(`[sim] minuto ${m}/${DURATA_MIN}  (reale ${Math.round((Date.now() - t0Reale) / 1000)} s)`); }
  });
  await gestore.fermo();

  // Chiusura del docente con raccolta
  const rac = await d.chiudi(vid);
  const consegneFinali = await d.consegne.elenca ? await d.consegne.elenca(vid) : null;

  // Verifica dello stato finale dal database (come lo vedrebbe il docente)
  let lavoriFinali = [];
  const storiaTot = { periodiche: 0, salti: 0, chiSalta: [] };
  await env.withSecurityRulesDisabled(async (ctx) => {
    lavoriFinali = (await sdk.getDocs(sdk.collection(ctx.firestore(), `verifiche/${vid}/lavori`))).docs.map((x) => x.data());
    for (let i = 0; i < N; i++) {
      const st = (await sdk.getDocs(sdk.collection(ctx.firestore(), `verifiche/${vid}/lavori/${emailDi(i)}/storia`))).docs.map((x) => x.data());
      const salti = st.filter((x) => x.tipo === 'prima').length;
      storiaTot.periodiche += st.filter((x) => x.tipo === 'periodica').length; storiaTot.salti += salti;
      if (salti) storiaTot.chiSalta.push(`studente${String(i + 1).padStart(2, '0')}:${salti}${sessioni[i].p.incolla ? '(incolla)' : ''}`);
    }
  });
  const finali = { consegnatoDaStudente: 0, automatica: 0, terminata: 0, inCorso: 0, altro: 0 };
  sessioni.forEach((x, i) => {
    const s = x.s.stato();
    if (s === 'consegnato') finali[x.s.origine() === 'automatica' ? 'automatica' : 'consegnatoDaStudente']++;
    else if (s === 'terminata') finali.terminata++;
    else if (s === 'in-corso') finali.inCorso++; else finali.altro++;
  });

  // ── Rapporto ───────────────────────────────────────────────────────────────
  const totS = (o, pref) => Object.entries(o).filter(([k]) => k.startsWith(pref)).reduce((a, [, v]) => a + v, 0);
  const picco = (chi) => { const m = lettureAlMinuto.get(chi); if (!m) return null; let best = [0, 0]; for (const [k, v] of m) if (v > best[1]) best = [k, v]; return { minuto: best[0], letture: best[1] }; };
  const cfg = verificaConfig.client;
  const rapporto = {
    quando: new Date().toISOString(),
    parametri: { etichetta: ETICHETTA, modo: MODO, debLiveMs: DEB, raffiche: BURST, studenti: N, durataMin: DURATA_MIN, debounceMs: cfg.debounceSalvataggioMs, battitoMs: cfg.battitoMs, istantaneaOgniMs: cfg.istantaneaOgniMs, saltoBlocchi: cfg.saltoBlocchi },
    tempoRealeSec: Math.round((Date.now() - t0Reale) / 1000),
    esiti: finali,
    raccolta: rac && { raccolte: rac.raccolte?.length ?? rac.raccolte ?? null, conflitti: rac.conflitti?.length ?? null },
    scritture: { ...conti.scritture, totale: Object.values(conti.scritture).reduce((a, b) => a + b, 0), perStudente: Math.round(totS(conti.scritture, 'studente.') / N) },
    letture: { ...conti.letture, totale: Object.values(conti.letture).reduce((a, b) => a + b, 0), docenteTabella: totS(conti.letture, 'docente.') },
    kbLettiDalDocente: Math.round(totS(conti.byteLetti, 'docente.') / 1024),
    kbScrittiDagliStudenti: Math.round(totS(conti.byteScritti, 'studente.') / 1024),
    piccoLettureDocenteAlMinuto: picco('docente'),
    dimensioneMediaProgrammaKb: Math.round(lavoriFinali.reduce((a, l) => a + (l.programma?.length || 0), 0) / Math.max(1, lavoriFinali.length) / 1024 * 10) / 10,
    nBlocchiMedi: Math.round(lavoriFinali.reduce((a, l) => a + (l.nBlocchi || 0), 0) / Math.max(1, lavoriFinali.length)),
    storia: storiaTot,
    errori: conti.errori.slice(0, 30),
    nErrori: conti.errori.length,
  };
  writeFileSync(new URL(`./rapporto-${ETICHETTA}.json`, import.meta.url), JSON.stringify(rapporto, null, 2));
  console.log(JSON.stringify(rapporto, null, 2));
  ok = true;
} catch (e) {
  console.error('SIMULAZIONE FALLITA:', e);
  writeFileSync(new URL('./rapporto-errore.txt', import.meta.url), String(e.stack || e) + '\n' + JSON.stringify(conti, null, 2));
} finally {
  ascolti.forEach((f) => { try { f(); } catch {} });
  sessioni.forEach((x) => { try { x.s.termina(); } catch {} });
  try { await env.cleanup(); } catch {}
  setTimeout(() => process.exit(ok ? 0 : 1), 500).unref();
}
