import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', target: 'es2020', minify: true, outfile: 'dist/game.js', legalComments: 'none' });
const page = readFileSync('web/index.html', 'utf8');
writeFileSync('dist/index.html', page);
writeFileSync('dist/test.html', '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + page + '</body></html>');
console.log('game.js', (statSync('dist/game.js').size / 1e6).toFixed(2), 'MB');
