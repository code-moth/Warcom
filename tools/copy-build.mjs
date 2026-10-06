// Copies the TypeScript compiler's output (build/) over the compiled JS that
// ships inside the web app (dist/engine, dist/data). Run automatically by
// `npm run build` after `tsc`. dist/index.html and dist/app.js are
// hand-written and are not touched by this script.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/engine', import.meta.url), { recursive: true });
mkdirSync(new URL('../dist/data', import.meta.url), { recursive: true });

cpSync(new URL('../build/engine', import.meta.url), new URL('../dist/engine', import.meta.url), { recursive: true });
cpSync(new URL('../build/data', import.meta.url), new URL('../dist/data', import.meta.url), { recursive: true });

console.log('Copied build/engine and build/data into dist/.');
