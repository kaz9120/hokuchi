// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) theme + example validate against their own schemas
// (2) examples/intent-talk lints with zero errors
// (3) render produces 9 slide HTML pages (+ index)
// (4) edge sugar ("a -> b" string) normalizes to { from, to }

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeck, loadTheme, normalizeEdge } from '../src/load.mjs';
import { lint, hasError } from '../src/lint.mjs';
import { renderDeck } from '../src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const deckPath = path.join(root, 'examples/intent-talk/deck.yaml');
const themePath = path.join(root, 'themes/hokuchi.yaml');

let passed = 0;
const ok = (name) => { console.log(`  ok  ${name}`); passed++; };

// (1) schema validation — loadTheme / loadDeck throw on invalid input.
loadTheme(themePath);
ok('themes/hokuchi.yaml passes theme schema');

const { deck, theme } = loadDeck(deckPath);
ok('examples/intent-talk/deck.yaml passes deck schema');

// (4) sugar normalization — verify the standalone helper and the loaded deck.
assert.deepEqual(normalizeEdge('declare -> derive'), { from: 'declare', to: 'derive' });
assert.deepEqual(normalizeEdge({ from: 'a', to: 'b', label: 'x' }), { from: 'a', to: 'b', label: 'x' });
ok('normalizeEdge expands "a -> b" string to { from, to }');

const diagram = deck.slides
  .find((s) => s.id === 'how-it-works').elements
  .find((e) => e.kind === 'diagram');
assert.ok(diagram.edges.every((e) => typeof e === 'object' && 'from' in e && 'to' in e),
  'all loaded edges are structured');
assert.deepEqual(diagram.edges[0], { from: 'declare', to: 'derive' });
ok('loaded deck has string edges normalized to structured form');

// (2) lint — example must have zero errors.
const findings = lint(deck, theme);
const errors = findings.filter((f) => f.severity === 'error');
assert.equal(errors.length, 0, `expected 0 lint errors, got ${JSON.stringify(errors)}`);
assert.equal(hasError(findings), false);
ok(`examples/intent-talk lints with 0 errors (${findings.length} total findings)`);

// (3) render — 9 slide pages + index.
const pages = renderDeck(deck, theme);
const slidePages = Object.keys(pages).filter((n) => /^slide-\d+\.html$/.test(n));
assert.equal(slidePages.length, 9, `expected 9 slide pages, got ${slidePages.length}`);
assert.ok(pages['index.html'], 'index.html produced');
assert.ok(pages['slide-01.html'].includes('<!doctype html>'), 'slide page is a full document');
ok(`render produced ${slidePages.length} slide pages + index.html`);

// Sanity: write to a temp dir so we exercise the real file path once.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hokuchi-test-'));
for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(tmp, name), html);
assert.equal(fs.readdirSync(tmp).filter((f) => f.endsWith('.html')).length, 10);
fs.rmSync(tmp, { recursive: true, force: true });
ok('render output writes to disk cleanly');

console.log(`\n${passed} checks passed.`);
