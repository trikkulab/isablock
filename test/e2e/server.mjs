// Piccolo server statico per le prove nel browser (test/e2e). Serve la cartella del progetto così
// com'è, tranne due file, modificati al volo (il working tree non viene toccato): src/app-config.js, dove
// accende l'interruttore del cloud (nel repository resta false), src/cloud/env.js, dove mette le porte degli
// emulatori prese dall'ambiente, e src/cloud/verifica-config.js, dove riduce i tempi di salvataggio dello studente.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('../..', import.meta.url));
const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export function avviaServer(porta = 8123) {
  const server = createServer(async (req, res) => {
    try {
      let percorso = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (percorso.endsWith('/')) percorso += 'index.html';
      const file = normalize(join(radice, percorso));
      if (!file.startsWith(radice)) { res.writeHead(403).end(); return; }
      let corpo = await readFile(file);
      if (percorso === '/src/cloud/env.js') {
        // porte degli emulatori: quelle dell'ambiente (emulators:exec le imposta), così la prova può girare
        // accanto a un emulatore dev già acceso su altre porte
        const porta = (nome, predefinita) => Number((process.env[nome] ?? '').split(':').pop()) || predefinita;
        corpo = Buffer.from(corpo.toString('utf8').replace(/Object\.freeze\(\{\s*authPort:\s*\d+,\s*firestorePort:\s*\d+\s*\}\)/,
          `Object.freeze({ authPort: ${porta('FIREBASE_AUTH_EMULATOR_HOST', 9199)}, firestorePort: ${porta('FIRESTORE_EMULATOR_HOST', 8186)} })`));
      }
      if (percorso === '/src/cloud/verifica-config.js') {
        // tempi di salvataggio ridotti: la prova non può aspettare 25 secondi a ogni salvataggio dello studente
        corpo = Buffer.from(corpo.toString('utf8')
          .replace(/debounceSalvataggioMs:\s*\d+/, 'debounceSalvataggioMs: 1500')
          .replace(/battitoMs:\s*\d+/, 'battitoMs: 5000')
          .replace(/campioneOgniMs:\s*\d+/, 'campioneOgniMs: 4000')
          .replace(/riprovaConsegnaMs:\s*\d+/, 'riprovaConsegnaMs: 1000'));
      }
      if (percorso === '/src/app-config.js') {
        corpo = Buffer.from(corpo.toString('utf8').replace(/cloud:\s*Object\.freeze\(\{\s*enabled:\s*(true|false)\s*\}\)/, 'cloud: Object.freeze({ enabled: true })'));
      }
      res.writeHead(200, { 'Content-Type': TIPI[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404).end('non trovato');
    }
  });
  return new Promise((ok) => server.listen(porta, () => ok({ server, url: `http://localhost:${porta}/` })));
}
