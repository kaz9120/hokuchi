// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) theme + example validate against their own schemas
// (2) examples/intent-talk lints with zero errors
// (3) render produces a single-file SPA containing every slide (ADR-0012)
// (4) edge sugar ("a -> b" string) normalizes to { from, to }
// (9) resolveLinkOgp fills missing link fields from OGP, caches under
//     assets/ogp/, skips the network on a cache hit, and never throws on
//     failure (ADR-0017)
// (10) post SPA embed markup: only decks with a `source` post get the
//      widgets.js boot script and .post-embed overlay (ADR-0017)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import '../src/jsx-register.mjs';
import { loadDeck, loadTheme, normalizeEdge } from '../src/load.mjs';
import { lint, hasError } from '../src/lint.mjs';
import { resolveLinkOgp } from '../src/ogp.mjs';
import { iconExists, promoteWeight } from '../src/icons.mjs';

// ローダー登録後に解決する (ADR-0018、cli.mjs と同じ理由)
const { renderDeck } = await import('../src/render.mjs');

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

// (5) icon vocabulary (ADR-0013) — catalog membership, weight promotion,
// and the icon-exists lint error on unknown names.
assert.equal(iconExists('x-logo'), true, 'x-logo is in the Phosphor catalog');
assert.equal(iconExists('no-such-icon-xyz'), false);
assert.equal(promoteWeight('regular'), 'fill');
ok('icon catalog resolves names and promotes weight for emphasis (ADR-0013)');

const badDeck = structuredClone(deck);
badDeck.slides.find((s) => s.id === 'how-it-works').elements
  .find((e) => e.kind === 'diagram').nodes[0].icon = 'no-such-icon-xyz';
const iconFindings = lint(badDeck, theme).filter((f) => f.id === 'icon-exists');
assert.equal(iconFindings.length, 1, 'unknown icon name is an error');
assert.equal(iconFindings[0].severity, 'error');
ok('icon-exists lint flags unknown icon names');

// (6) deck schema 0.3.0 (ADR-0016) — the 8 new element kinds and their
// *-stage layouts. Validated directly against deck.schema.json (mirrors
// load.mjs's own compile) since these fixtures need no theme file on disk.
const deckSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema/deck.schema.json'), 'utf8'));
const ajvTest = new Ajv2020({ strictRequired: false, allowUnionTypes: true, allErrors: true });
const validateDeckSchema = ajvTest.compile(deckSchema);

const baseSlide = (id, layout, elements, role = 'content') =>
  ({ id, role, idea: `${id} の検証`, layout, elements });

const newKindDeck = {
  schema_version: '0.3.0',
  deck: {
    title: 'ADR-0016 スキーマ検証',
    audience: { who: 'テスト', action: 'テスト' },
    theme: './theme.yaml',
  },
  slides: [
    baseSlide('s-code', 'code-stage', [{ kind: 'code', slot: 'code', code: 'console.log(1)', lang: 'javascript' }]),
    baseSlide('s-post', 'post-stage', [{ kind: 'post', slot: 'post', text: 'x', author: 'y' }]),
    baseSlide('s-link', 'link-stage', [{ kind: 'link', slot: 'link', url: 'https://example.com' }]),
    baseSlide('s-stat', 'stat-stage', [{ kind: 'stat', slot: 'stat', value: '42%' }]),
    baseSlide('s-table', 'table-stage', [{ kind: 'table', slot: 'table', columns: ['a', 'b'], rows: [['1', '2']] }]),
    baseSlide('s-versus', 'versus-stage', [{
      kind: 'versus',
      slot: 'versus',
      sides: [{ label: 'A', items: ['a1'] }, { label: 'B', items: ['b1'] }],
    }]),
    baseSlide('s-transition', 'statement-stage', [{ kind: 'statement', slot: 'statement', text: 'agenda 用の transition' }], 'transition'),
    baseSlide('s-agenda', 'agenda-stage', [{ kind: 'agenda', slot: 'agenda' }]),
    baseSlide('s-video', 'video-stage', [{ kind: 'video', slot: 'video', src: 'assets/demo.mp4' }]),
  ],
};
assert.equal(validateDeckSchema(newKindDeck), true, JSON.stringify(validateDeckSchema.errors));
ok('deck schema 0.3.0 accepts the 8 new element kinds and their *-stage layouts');

const codeMissingBoth = structuredClone(newKindDeck);
codeMissingBoth.slides[0].elements[0] = { kind: 'code', slot: 'code' };
assert.equal(validateDeckSchema(codeMissingBoth), false);
ok('code element with neither code nor src fails schema (oneOf)');

const codeBothPresent = structuredClone(newKindDeck);
codeBothPresent.slides[0].elements[0] = { kind: 'code', slot: 'code', code: 'x', src: './x.js' };
assert.equal(validateDeckSchema(codeBothPresent), false);
ok('code element with both code and src fails schema (oneOf)');

const versusOneSide = structuredClone(newKindDeck);
versusOneSide.slides.find((s) => s.id === 's-versus').elements[0].sides = [{ label: 'A', items: ['a1'] }];
assert.equal(validateDeckSchema(versusOneSide), false);
ok('versus with 1 side fails schema (minItems 2)');

const versusThreeSides = structuredClone(newKindDeck);
versusThreeSides.slides.find((s) => s.id === 's-versus').elements[0].sides = [
  { label: 'A', items: ['a1'] },
  { label: 'B', items: ['b1'] },
  { label: 'C', items: ['c1'] },
];
assert.equal(validateDeckSchema(versusThreeSides), false);
ok('versus with 3 sides fails schema (maxItems 2)');

// load.mjs resolves code.src to code.code by reading the file relative to
// the deck (ADR-0016) — the same convention as diagram edge sugar, applied
// eagerly so code-budget lint has text to measure without a render pass.
const codeSrcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hokuchi-code-src-'));
const snippetContent = 'export const answer = 42;\n';
fs.writeFileSync(path.join(codeSrcDir, 'snippet.js'), snippetContent);
const themeRelPath = path.relative(codeSrcDir, themePath).split(path.sep).join('/');
const codeSrcDeckPath = path.join(codeSrcDir, 'deck.yaml');
fs.writeFileSync(codeSrcDeckPath, [
  'schema_version: "0.3.0"',
  'deck:',
  '  title: "code src 解決の検証"',
  '  audience:',
  '    who: "テスト"',
  '    action: "テスト"',
  `  theme: ${themeRelPath}`,
  'slides:',
  '  - id: s-code-src',
  '    role: content',
  '    idea: "code の src がファイルから読み込まれる"',
  '    layout: code-stage',
  '    elements:',
  '      - kind: code',
  '        slot: code',
  '        src: ./snippet.js',
  '',
].join('\n'));
const { deck: codeSrcDeck } = loadDeck(codeSrcDeckPath);
assert.equal(codeSrcDeck.slides[0].elements[0].code, snippetContent);
fs.rmSync(codeSrcDir, { recursive: true, force: true });
ok('load.mjs resolves code.src to code.code by reading the file relative to the deck');

// (7) lint additions/activations for ADR-0016 (code-budget, table-size,
// agenda-source, pie-rules). Elements are pushed straight into a clone of
// the already-loaded deck — lint reads element fields only, it does not
// re-validate slot/layout conformity (that is the schema's job, above).
const codeBudgetDeck = structuredClone(deck);
codeBudgetDeck.slides[0].elements.push({
  kind: 'code',
  slot: 'code-check',
  code: Array.from({ length: 18 }, (_, i) => `const line${i} = ${i};`).join('\n'),
});
const codeBudgetFindings = lint(codeBudgetDeck, theme).filter((f) => f.id === 'code-budget');
assert.equal(codeBudgetFindings.length, 1);
assert.equal(codeBudgetFindings[0].severity, 'warn');
ok('code-budget lint flags code with 17+ lines');

const wideLineDeck = structuredClone(deck);
wideLineDeck.slides[0].elements.push({ kind: 'code', slot: 'code-check', code: 'x'.repeat(81) });
assert.equal(lint(wideLineDeck, theme).filter((f) => f.id === 'code-budget').length, 1);
ok('code-budget lint flags a single line of 81+ columns');

const tableSizeDeck = structuredClone(deck);
tableSizeDeck.slides[0].elements.push({
  kind: 'table',
  slot: 'table-check',
  columns: ['項目', '値'],
  rows: Array.from({ length: 8 }, (_, i) => [`行${i}`, `${i}`]),
});
const tableSizeFindings = lint(tableSizeDeck, theme).filter((f) => f.id === 'table-size');
assert.equal(tableSizeFindings.length, 1);
assert.equal(tableSizeFindings[0].severity, 'warn');
ok('table-size lint flags 8+ data rows');

// examples/intent-talk has no role: transition slide, so adding an agenda
// element with no transition anywhere in the deck must error.
const agendaNoTransitionDeck = structuredClone(deck);
agendaNoTransitionDeck.slides[0].elements.push({ kind: 'agenda', slot: 'agenda-check' });
const agendaFindings = lint(agendaNoTransitionDeck, theme).filter((f) => f.id === 'agenda-source');
assert.equal(agendaFindings.length, 1);
assert.equal(agendaFindings[0].severity, 'error');
ok('agenda-source lint errors when the deck has no role: transition slide');

const agendaWithTransitionDeck = structuredClone(agendaNoTransitionDeck);
agendaWithTransitionDeck.slides.push(baseSlide(
  's-check-transition',
  'statement-stage',
  [{ kind: 'statement', slot: 'statement', text: '検証用の章題' }],
  'transition'
));
assert.equal(lint(agendaWithTransitionDeck, theme).filter((f) => f.id === 'agenda-source').length, 0);
ok('agenda-source lint is silent once a role: transition slide exists');

const pieTooManyItemsDeck = structuredClone(deck);
pieTooManyItemsDeck.slides[0].elements.push({
  kind: 'chart',
  slot: 'chart-check',
  intent: 'composition',
  message: '検証用',
  data: {
    x: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    series: [{ label: '割合', values: [11, 11, 11, 11, 11, 11, 11, 11, 12] }],
  },
});
const pieItemFindings = lint(pieTooManyItemsDeck, theme).filter((f) => f.id === 'pie-rules');
assert.equal(pieItemFindings.length, 1);
assert.match(pieItemFindings[0].message, /項目/);
ok('pie-rules lint flags 9+ item single-series composition charts');

const pieBadSumDeck = structuredClone(deck);
pieBadSumDeck.slides[0].elements.push({
  kind: 'chart',
  slot: 'chart-check',
  intent: 'composition',
  message: '検証用',
  data: { x: ['a', 'b', 'c'], series: [{ label: '割合', values: [30, 30, 30] }] },
});
const pieSumFindings = lint(pieBadSumDeck, theme).filter((f) => f.id === 'pie-rules');
assert.equal(pieSumFindings.length, 1);
assert.match(pieSumFindings[0].message, /合計/);
ok('pie-rules lint flags single-series composition charts whose total is off by 100±2');

// intent: composition charts (donut / 100% stacked bar) have no axis, so a
// consecutive pair where either side is composition must not fire axis-lock
// even without a shared scale.
const axisLockCompositionDeck = structuredClone(deck);
axisLockCompositionDeck.slides.push(
  baseSlide('s-axis-composition-a', 'chart-stage', [
    { kind: 'chart', slot: 'chart', intent: 'composition', message: '検証用', data: { x: ['a', 'b'], series: [{ label: '割合', values: [60, 40] }] } },
  ]),
  baseSlide('s-axis-composition-b', 'chart-stage', [
    { kind: 'chart', slot: 'chart', intent: 'trend', message: '検証用', data: { x: ['a', 'b'], series: [{ label: '値', values: [1, 2] }] } },
  ]),
);
const axisLockFindings = lint(axisLockCompositionDeck, theme).filter((f) => f.id === 'axis-lock');
assert.equal(axisLockFindings.length, 0);
ok('axis-lock lint does not fire when either chart in a consecutive pair is intent: composition');

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

// ---------------------------------------------------------------------------
// (9) resolveLinkOgp (ADR-0017) — stubbed fetchImpl, no real network.
// ---------------------------------------------------------------------------

const OGP_URL = 'https://example.com/deck-as-code';
const OGP_IMAGE_URL = 'https://example.com/og-image.png';
const OGP_HTML = `<html><head>
  <meta property="og:title" content="スライドを意図宣言型 YAML で書く">
  <meta property="og:description" content="ピクセルではなく意図を宣言する">
  <meta property="og:image" content="${OGP_IMAGE_URL}">
</head><body></body></html>`;
const OGP_IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]); // PNG シグネチャのみのダミー

function fakeResponse({ ok = true, status = 200, text, bytes, contentType }) {
  return {
    ok, status,
    text: async () => text,
    arrayBuffer: async () => bytes,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
  };
}

function makeCountingFetch() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) === OGP_URL) return fakeResponse({ text: OGP_HTML });
    if (String(url) === OGP_IMAGE_URL) {
      return fakeResponse({ bytes: OGP_IMAGE_BYTES, contentType: 'image/png' });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { fetchImpl, calls };
}

const ogpDeckDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hokuchi-ogp-'));

// (9a) missing title/description/image are all filled from OGP, and cached.
{
  const deckRoot = { slides: [{ elements: [{ kind: 'link', url: OGP_URL }] }] };
  const { fetchImpl, calls } = makeCountingFetch();
  await resolveLinkOgp(deckRoot, ogpDeckDir, { fetchImpl });
  const el = deckRoot.slides[0].elements[0];
  assert.equal(el.title, 'スライドを意図宣言型 YAML で書く');
  assert.equal(el.description, 'ピクセルではなく意図を宣言する');
  assert.match(el.image, /^assets\/ogp\/[0-9a-f]{12}\.png$/);
  assert.equal(calls.length, 2, 'fetched the page once and the image once');

  const cacheDir = path.join(ogpDeckDir, 'assets', 'ogp');
  const hash = el.image.match(/\/([0-9a-f]{12})\.png$/)[1];
  const metaOnDisk = JSON.parse(fs.readFileSync(path.join(cacheDir, `${hash}.json`), 'utf8'));
  assert.equal(metaOnDisk.title, el.title);
  assert.ok(fs.existsSync(path.join(ogpDeckDir, el.image)), 'cached image file exists at the resolved path');
  ok('resolveLinkOgp fills missing title/description/image from OGP and caches them under assets/ogp/');
}

// (9b) cache hit — a second link element pointing at the same URL resolves
// with zero additional network calls.
{
  const deckRoot = { slides: [{ elements: [{ kind: 'link', url: OGP_URL }] }] };
  const { fetchImpl, calls } = makeCountingFetch();
  await resolveLinkOgp(deckRoot, ogpDeckDir, { fetchImpl });
  const el = deckRoot.slides[0].elements[0];
  assert.equal(calls.length, 0, 'cache hit makes no network calls at all');
  assert.equal(el.title, 'スライドを意図宣言型 YAML で書く');
  assert.match(el.image, /^assets\/ogp\/[0-9a-f]{12}\.png$/);
  ok('resolveLinkOgp does not re-fetch once the URL is cached');
}

// (9c) hand-written fields always win — only the missing ones are filled.
{
  const deckRoot = {
    slides: [{
      elements: [{
        kind: 'link', url: OGP_URL,
        title: '手書きのタイトル',
        image: './assets/handwritten.png',
      }],
    }],
  };
  const { fetchImpl, calls } = makeCountingFetch();
  await resolveLinkOgp(deckRoot, ogpDeckDir, { fetchImpl });
  const el = deckRoot.slides[0].elements[0];
  assert.equal(el.title, '手書きのタイトル', 'hand-written title is untouched');
  assert.equal(el.image, './assets/handwritten.png', 'hand-written image is untouched');
  assert.equal(el.description, 'ピクセルではなく意図を宣言する', 'missing description is still filled');
  assert.equal(calls.length, 0, 'metadata was already cached from (9a), so still no network call');
  ok('resolveLinkOgp only fills fields the deck author left blank');
}

// (9d) network failure does not throw and leaves the element unresolved —
// render must be able to fall back to a text-only card (SPEC §6.9).
{
  const deckRoot = { slides: [{ elements: [{ kind: 'link', url: 'https://example.com/unreachable' }] }] };
  const failingFetch = async () => { throw new Error('ECONNREFUSED (simulated)'); };
  await assert.doesNotReject(resolveLinkOgp(deckRoot, ogpDeckDir, { fetchImpl: failingFetch }));
  const el = deckRoot.slides[0].elements[0];
  assert.equal(el.title, undefined);
  assert.equal(el.description, undefined);
  assert.equal(el.image, undefined);
  ok('resolveLinkOgp swallows fetch failures and leaves the link element unresolved');
}

fs.rmSync(ogpDeckDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// (10) post SPA embed (ADR-0017) — widgets.js boot script and .post-embed
// overlay appear only for decks that actually have a `source` post.
// ---------------------------------------------------------------------------
const postEmbedDeck = {
  schema_version: '0.3.0',
  deck: { title: 'post embed 検証', audience: { who: 'テスト', action: 'テスト' }, theme: './theme.yaml' },
  slides: [
    { id: 's-post-source', role: 'content', idea: 'source 付き post', layout: 'post-stage', elements: [
      { kind: 'post', slot: 'post', text: 'x', author: 'y', source: 'https://x.com/example/status/1' },
    ] },
  ],
};
const { pages: embedPages } = renderDeck(postEmbedDeck, theme, {
  deckDir: path.dirname(deckPath), themeDir: path.dirname(themePath),
});
assert.ok(embedPages['index.html'].includes('platform.twitter.com/widgets.js'),
  'deck with a source post gets the widgets.js boot script');
assert.ok(embedPages['index.html'].includes('class="post-embed"'),
  'deck with a source post gets the .post-embed overlay markup');
assert.ok(embedPages['index.html'].includes('twitter-tweet'),
  'the embed overlay contains a blockquote.twitter-tweet for widgets.js to expand');
ok('renderDeck emits the widgets.js boot script and post-embed overlay for a source post');

const noSourceDeck = structuredClone(postEmbedDeck);
delete noSourceDeck.slides[0].elements[0].source;
const { pages: noEmbedPages } = renderDeck(noSourceDeck, theme, {
  deckDir: path.dirname(deckPath), themeDir: path.dirname(themePath),
});
assert.ok(!noEmbedPages['index.html'].includes('platform.twitter.com/widgets.js'),
  'deck with no source post gets no widgets.js boot script at all');
assert.ok(!noEmbedPages['index.html'].includes('class="post-embed"'),
  'deck with no source post gets no .post-embed overlay markup at all');
assert.ok(!noEmbedPages['index.html'].includes('twitter-tweet'),
  'deck with no source post gets no blockquote.twitter-tweet at all');
ok('renderDeck adds no embed-related output when the deck has no source post (ADR-0017 決定 4)');

console.log(`\n${passed} checks passed.`);
