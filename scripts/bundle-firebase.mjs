// Produce vendor/firebase/cloud.js: bundle ESM con solo Auth e Firestore del
// SDK modulare, da committare (come vendor/blockly). Si rilancia solo per
// aggiornare la versione di firebase: npm run vendor:firebase
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `
export { initializeApp } from 'firebase/app';
export { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup,
         signOut, onAuthStateChanged, getRedirectResult } from 'firebase/auth';
export { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc,
         collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
`;
mkdirSync(`${root}vendor/firebase`, { recursive: true });
const r = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', minify: true, platform: 'browser', write: false,
  legalComments: 'none', logLevel: 'info',
});
const version = JSON.parse((await import('node:fs')).readFileSync(`${root}node_modules/firebase/package.json`, 'utf8')).version;
writeFileSync(`${root}vendor/firebase/cloud.js`,
  `// Firebase JS SDK ${version} (Apache-2.0), solo app+auth+firestore. Generato da scripts/bundle-firebase.mjs.\n` + r.outputFiles[0].text);
console.log(`vendor/firebase/cloud.js (Firebase ${version})`);
