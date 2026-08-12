import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(await readFile(new URL('../dist/asset-manifest.json', import.meta.url), 'utf8'));
const entry = manifest['index.html'];

if (!entry?.file) {
  throw new Error('Production asset manifest has no index entry.');
}

const gzipBytes = async (relativePath) => gzipSync(
  await readFile(new URL(`../dist/${relativePath}`, import.meta.url)),
).byteLength;

const initialJavaScriptBytes = await gzipBytes(entry.file);
const initialCssBytes = (await Promise.all((entry.css ?? []).map(gzipBytes)))
  .reduce((total, bytes) => total + bytes, 0);

const budgets = {
  initialJavaScriptBytes: 200 * 1024,
  initialCssBytes: 50 * 1024,
};

const measurements = { initialJavaScriptBytes, initialCssBytes };
const exceeded = Object.entries(budgets)
  .filter(([name, budget]) => measurements[name] > budget)
  .map(([name, budget]) => `${name}: ${measurements[name]} > ${budget}`);

console.log(
  `Initial bundle budget: JS ${(initialJavaScriptBytes / 1024).toFixed(2)} KiB gzip; `
  + `CSS ${(initialCssBytes / 1024).toFixed(2)} KiB gzip.`,
);

if (exceeded.length) {
  throw new Error(`Production bundle budget exceeded:\n${exceeded.join('\n')}`);
}
