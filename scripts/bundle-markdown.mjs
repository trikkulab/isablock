// Produce vendor/markdown/markdown-it.js: bundle ESM di markdown-it con i due plugin per
// apice e pedice, da committare (come vendor/firebase). Si rilancia solo per aggiornare le
// versioni: npm run vendor:markdown
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `
export { default as MarkdownIt } from 'markdown-it';
export { default as sub } from 'markdown-it-sub';
export { default as sup } from 'markdown-it-sup';
`;
mkdirSync(`${root}vendor/markdown`, { recursive: true });
const r = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', minify: true, platform: 'browser', write: false,
  legalComments: 'none', logLevel: 'info',
});
const v = (n) => JSON.parse(readFileSync(`${root}node_modules/${n}/package.json`, 'utf8')).version;
writeFileSync(`${root}vendor/markdown/markdown-it.js`,
  `// markdown-it ${v('markdown-it')}, markdown-it-sub ${v('markdown-it-sub')}, markdown-it-sup ${v('markdown-it-sup')} (MIT). Generato da scripts/bundle-markdown.mjs.\n` + r.outputFiles[0].text);
console.log(`vendor/markdown/markdown-it.js (markdown-it ${v('markdown-it')})`);
