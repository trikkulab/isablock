// Piccolo server statico per le prove nel browser (test/e2e). Serve la cartella del progetto così
// com'è, tranne src/app-config.js: lì accende al volo l'interruttore del cloud (nel repository
// resta false, e il tuo working tree non viene toccato).
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
