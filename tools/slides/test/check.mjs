// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) theme + example validate against their own schemas
// (2) examples/intent-talk lints with zero errors
// (3) render produces a single-file SPA containing every slide (ADR-0012)
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

loadTheme(path.join(root, 'themes/mosh.yaml'));
ok('themes/mosh.yaml passes theme schema (brand frame, ADR-0010)');

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

// (3) render — one self-contained SPA document (ADR-0012).
const { pages, assets } = renderDeck(deck, theme, {
  deckDir: path.dirname(deckPath),
  themeDir: path.dirname(themePath),
});
assert.deepEqual(Object.keys(pages), ['index.html'], 'SPA output is index.html only');
const doc = pages['index.html'];
assert.ok(doc.includes('<!doctype html>'), 'SPA is a full document');
assert.ok(doc.includes(`data-slides="${deck.slides.length}"`), 'slide count exposed for shot');
for (let i = 1; i <= deck.slides.length; i++) {
  const id = `id="p${String(i).padStart(2, '0')}"`;
  assert.ok(doc.includes(id), `SPA contains section ${id}`);
}
assert.ok(doc.includes(':target'), 'deck mode selects slides via CSS :target');
assert.ok(assets instanceof Map, 'renderDeck returns an asset map');
ok(`render produced a single-file SPA with ${deck.slides.length} slides (${assets.size} assets)`);

// Sanity: write to a temp dir so we exercise the real file path once.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hokuchi-test-'));
for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(tmp, name), html);
assert.equal(fs.readdirSync(tmp).filter((f) => f.endsWith('.html')).length, 1);
fs.rmSync(tmp, { recursive: true, force: true });
ok('render output writes to disk cleanly');

console.log(`\n${passed} checks passed.`);
