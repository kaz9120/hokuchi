// render.mjs — throwaway spike renderer.
// Reads deck.yaml + theme.yaml, derives layout from declared intent, emits static HTML.
// Goal: judge whether "layout derived from intent" is visually coherent. Node 18+.
// Only dependency: js-yaml.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => yaml.load(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const theme = load('theme.yaml');
const deck = load('deck.yaml');

// ---------------------------------------------------------------------------
// Token resolution. Every color/font MUST come from theme tokens — no literals.
// ---------------------------------------------------------------------------
const T = theme.theme;
const P = T.palette;
const C = {
  bg: P.neutral.bg,
  surface: P.neutral.surface,
  line: P.neutral.line,
  muted: P.neutral.muted,
  text: P.neutral.text,
  textStrong: P.neutral.text_strong,
  highlight: P.highlight,
  core: P.core,
};
const FONT_DISPLAY = T.type.display.family;
const FONT_BODY = T.type.body.family;
const W_DISPLAY = T.type.display.weight;
const W_BODY = T.type.body.weight;

// Canvas + grid geometry (spike-fixed; see NOTES.md).
const CANVAS = { w: 1280, h: 720 };
const GRID = { cols: 4, rows: 6, marginX: 96, marginY: 64 };
// stage_margin: 1 → reserve top+bottom rows as a cinematic letterbox.
const rowH = (CANVAS.h - GRID.marginY * 2) / GRID.rows; // ~98.7
const STAGE = { x: GRID.marginX, y: GRID.marginY + rowH };   // letterboxed band
const FULL = { x: GRID.marginX, y: GRID.marginY };           // opener/closer band

// Type scale (px on the 1280x720 canvas).
const SZ = {
  hero: 80, title: 74, big: 70, quote: 46,
  heading: 34, bullet: 34, subtitle: 30, attribution: 24,
  node: 24, axis: 20, badge: 15,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Wrap emphasis words in the highlight color.
function emphasize(text, words = []) {
  let out = esc(text);
  for (const w of words) {
    const e = esc(w);
    out = out.split(e).join(`<span class="hi">${e}</span>`);
  }
  return out;
}

const byKind = (slide, kind) => slide.elements.find((e) => e.kind === kind);
const allKind = (slide, kind) => slide.elements.filter((e) => e.kind === kind);

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

// SVG line chart — 3-layer model (background / data / emphasis).
function renderChart(el) {
  const box = { w: 940, h: 440 };
  const pad = { l: 78, r: 48, t: 46, b: 62 };
  const plot = {
    x: pad.l, y: pad.t,
    w: box.w - pad.l - pad.r,
    h: box.h - pad.t - pad.b,
  };
  const cats = el.data.x;
  const series = el.data.series[0];
  const vals = series.values;
  const yMax = 80, yMin = 0;
  const yTicks = [0, 20, 40, 60, 80];

  const xAt = (i) => plot.x + (plot.w * i) / (cats.length - 1);
  const yAt = (v) => plot.y + plot.h * (1 - (v - yMin) / (yMax - yMin));

  // Background layer: faint gridlines + minimal axes/ticks (neutral.line).
  let bg = '';
  for (const tk of yTicks) {
    const y = yAt(tk);
    bg += `<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="${C.line}" stroke-width="1" opacity="0.35"/>`;
    bg += `<text x="${plot.x - 14}" y="${y + 6}" text-anchor="end" fill="${C.muted}" font-size="${SZ.axis}" font-family='${FONT_BODY}'>${tk}</text>`;
  }
  // baseline axes
  bg += `<line x1="${plot.x}" y1="${plot.y}" x2="${plot.x}" y2="${plot.y + plot.h}" stroke="${C.line}" stroke-width="1.5"/>`;
  bg += `<line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="${C.line}" stroke-width="1.5"/>`;
  cats.forEach((c, i) => {
    bg += `<text x="${xAt(i)}" y="${plot.y + plot.h + 34}" text-anchor="middle" fill="${C.muted}" font-size="${SZ.axis}" font-family='${FONT_BODY}'>${esc(c)}</text>`;
  });

  // Data layer: line in core[0], generous weight, soft point dots.
  const pts = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  let data = `<polyline points="${pts}" fill="none" stroke="${C.core[0]}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  vals.forEach((v, i) => {
    data += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="5" fill="${C.core[0]}"/>`;
  });

  // Emphasis layer: highlight the point named in emphasis.at + annotation.
  let emph = '';
  for (const e of el.emphasis || []) {
    const i = cats.indexOf(e.at);
    if (i < 0) continue;
    const px = xAt(i), py = yAt(vals[i]);
    // pulse ring + solid dot
    emph += `<circle cx="${px}" cy="${py}" r="13" fill="none" stroke="${C.highlight}" stroke-width="2" opacity="0.5"/>`;
    emph += `<circle cx="${px}" cy="${py}" r="7.5" fill="${C.highlight}"/>`;
    // annotation: connector down-right into open space, label boxed subtly
    const ax = px + 18, ay = py + 70;
    emph += `<line x1="${px}" y1="${py + 10}" x2="${ax}" y2="${ay - 22}" stroke="${C.highlight}" stroke-width="1.5" opacity="0.8"/>`;
    emph += `<text x="${ax}" y="${ay}" text-anchor="start" fill="${C.highlight}" font-size="${SZ.node}" font-weight="${W_DISPLAY}" font-family='${FONT_DISPLAY}'>${esc(e.annotate)}</text>`;
  }

  return `<div class="chart-wrap"><svg viewBox="0 0 ${box.w} ${box.h}" width="100%" style="max-width:940px;max-height:100%" role="img">
    <g class="layer-bg">${bg}</g>
    <g class="layer-data">${data}</g>
    <g class="layer-emph">${emph}</g>
  </svg></div>`;
}

// SVG cycle diagram — 3 nodes on a ring, arrowed edges, emphasis node elevated.
function renderCycle(el) {
  const box = { w: 620, h: 500 };
  const cx = box.w / 2, cy = box.h / 2 + 6, R = 158;
  const nodes = el.nodes;
  const emph = new Set(el.emphasis || []);
  // angles: top, lower-right, lower-left (clockwise)
  const angles = [-90, 30, 150].map((d) => (d * Math.PI) / 180);
  const pos = nodes.map((n, i) => ({
    ...n,
    x: cx + R * Math.cos(angles[i]),
    y: cy + R * Math.sin(angles[i]),
    ai: angles[i],
    hot: emph.has(n.id),
  }));
  const idx = Object.fromEntries(pos.map((n, i) => [n.id, i]));

  const arrow = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/>
    </marker></defs>`;

  // edges as arcs along the ring, trimmed by a gap near each node
  let edges = '';
  for (const raw of el.edges) {
    const [from, to] = raw.split('->').map((s) => s.trim());
    const a = pos[idx[from]], b = pos[idx[to]];
    const gap = (26 * Math.PI) / 180;
    const a1 = a.ai + gap, a2 = b.ai - gap;
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    edges += `<path d="M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}" fill="none" stroke="${C.line}" stroke-width="2.5" marker-end="url(#arrow)"/>`;
  }

  // nodes as pills; emphasis node larger + highlight stroke (hierarchy)
  let nodeSvg = '';
  for (const n of pos) {
    const w = n.hot ? 186 : 158, h = n.hot ? 78 : 66;
    const rx = h / 2;
    const stroke = n.hot ? C.highlight : C.line;
    const sw = n.hot ? 3 : 2;
    const fill = n.hot ? C.surface : C.surface;
    const tw = n.hot ? W_DISPLAY : W_BODY;
    const fs = n.hot ? SZ.node + 3 : SZ.node;
    const tcol = n.hot ? C.textStrong : C.text;
    nodeSvg += `<g>
      <rect x="${n.x - w / 2}" y="${n.y - h / 2}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${n.x}" y="${n.y + fs * 0.35}" text-anchor="middle" fill="${tcol}" font-size="${fs}" font-weight="${tw}" font-family='${FONT_DISPLAY}'>${esc(n.label)}</text>
    </g>`;
  }

  return `<div class="diagram-wrap"><svg viewBox="0 0 ${box.w} ${box.h}" width="100%" style="max-width:560px;max-height:100%" role="img">
    ${arrow}<g class="layer-edges">${edges}</g><g class="layer-nodes">${nodeSvg}</g>
  </svg></div>`;
}

// Image placeholder — surface panel + prompt (muted) + frame markers + badge.
function renderImagePlaceholder(el, { fill = true } = {}) {
  const glyph = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="${C.muted}" stroke-width="1.4" style="opacity:.85">
    <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/>
    <path d="M3 17l5-4 4 3 4-4 5 4"/></svg>`;
  return `<div class="img-ph${fill ? ' fill' : ''}">
    <div class="img-corner tl"></div><div class="img-corner tr"></div>
    <div class="img-corner bl"></div><div class="img-corner br"></div>
    <div class="img-badge">IMAGE · prompt</div>
    <div class="img-inner">${glyph}<div class="img-prompt">${esc(el.prompt)}</div></div>
  </div>`;
}

function renderStatement(el, cls, sizePx) {
  return `<div class="${cls}" style="font-size:${sizePx}px">${emphasize(el.text, el.emphasis)}</div>`;
}

// ---------------------------------------------------------------------------
// Layout patterns
// ---------------------------------------------------------------------------

function statementStage(slide) {
  const st = byKind(slide, 'statement');
  const full = slide.role === 'opener' || slide.role === 'closer';
  const inset = full ? FULL : STAGE;
  const kicker = full
    ? `<div class="kicker">${slide.role === 'opener' ? '' : ''}</div>`
    : '';
  return `<div class="stage center" style="${insetCss(inset)}">
    ${renderStatement(st, 'statement-hero', full ? SZ.hero : SZ.big)}
  </div>`;
}

function titleStage(slide) {
  const [title, sub] = allKind(slide, 'statement');
  return `<div class="stage title-band" style="${insetCss(STAGE)}">
    <div class="title-accent"></div>
    ${renderStatement(title, 'title-main', SZ.title)}
    ${sub ? renderStatement(sub, 'title-sub', SZ.subtitle) : ''}
  </div>`;
}

function diagramStage(slide) {
  const head = byKind(slide, 'statement');
  const dia = byKind(slide, 'diagram');
  return `<div class="stage col" style="${insetCss(STAGE)}">
    ${head ? renderStatement(head, 'section-head', SZ.heading) : ''}
    <div class="stage-main center">${renderCycle(dia)}</div>
  </div>`;
}

function chartStage(slide) {
  const head = byKind(slide, 'statement');
  const ch = byKind(slide, 'chart');
  return `<div class="stage col" style="${insetCss(STAGE)}">
    ${head ? renderStatement(head, 'section-head', SZ.heading) : ''}
    <div class="stage-main center">${renderChart(ch)}</div>
  </div>`;
}

function listStage(slide) {
  const head = byKind(slide, 'statement');
  const b = byKind(slide, 'bullets');
  const items = b.items.map((it) => `<li><span class="dot"></span><span>${esc(it)}</span></li>`).join('');
  return `<div class="stage col" style="${insetCss(STAGE)}">
    ${head ? renderStatement(head, 'section-head', SZ.heading) : ''}
    <ul class="bullets">${items}</ul>
  </div>`;
}

function quoteStage(slide) {
  const q = byKind(slide, 'quote');
  return `<div class="stage center" style="${insetCss(STAGE)}">
    <div class="quote-block">
      <div class="quote-mark">&ldquo;</div>
      <div class="quote-text">${esc(q.text)}</div>
      <div class="quote-attr">— ${esc(q.attribution)}</div>
    </div>
  </div>`;
}

// Grid-direct layout: layout.areas with "colS-colE / rowS-rowE" (1-indexed incl.)
function gridDirect(slide) {
  const cells = slide.layout.areas.map((a) => {
    const el = slide.elements.find((e) => e.id === a.element);
    const [colSpec, rowSpec] = a.cell.split('/').map((s) => s.trim());
    const [c1, c2 = c1] = colSpec.split('-').map(Number);
    const [r1, r2 = r1] = rowSpec.split('-').map(Number);
    const gridCss = `grid-column:${c1} / ${c2 + 1};grid-row:${r1} / ${r2 + 1};`;
    let inner = '';
    if (el.kind === 'image') inner = renderImagePlaceholder(el);
    else if (el.kind === 'statement') inner = `<div class="grid-caption">${emphasize(el.text, el.emphasis)}</div>`;
    return `<div class="grid-cell" style="${gridCss}">${inner}</div>`;
  }).join('');
  return `<div class="grid-stage" style="grid-template-columns:repeat(${GRID.cols},1fr);grid-template-rows:repeat(${GRID.rows},1fr)">${cells}</div>`;
}

function insetCss(inset) {
  return `left:${inset.x}px;right:${inset.x}px;top:${inset.y}px;bottom:${inset.y}px;`;
}

const PATTERNS = {
  'statement-stage': statementStage,
  'title-stage': titleStage,
  'diagram-stage': diagramStage,
  'chart-stage': chartStage,
  'list-stage': listStage,
  'quote-stage': quoteStage,
};

function renderSlideBody(slide) {
  if (typeof slide.layout === 'object') return gridDirect(slide);
  const fn = PATTERNS[slide.layout];
  if (!fn) return `<div class="stage center"><div class="err">unknown layout: ${esc(slide.layout)}</div></div>`;
  return fn(slide);
}

function renderSlide(slide) {
  return `<div class="slide">${renderSlideBody(slide)}</div>`;
}

// ---------------------------------------------------------------------------
// CSS (self-contained, one <style> block per page)
// ---------------------------------------------------------------------------
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;
  background:${C.bg};color:${C.text};font-family:${FONT_BODY};font-weight:${W_BODY};
  -webkit-font-smoothing:antialiased;letter-spacing:.01em}
.hi{color:${C.highlight};font-weight:${W_DISPLAY}}
.stage{position:absolute;display:flex;flex-direction:column}
.stage.center{align-items:center;justify-content:center;text-align:center}
.stage.col{gap:0}
.stage-main{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;width:100%}
.center{display:flex;align-items:center;justify-content:center}

/* statement-stage */
.statement-hero{font-family:${FONT_DISPLAY};font-weight:${W_DISPLAY};line-height:1.22;
  color:${C.textStrong};max-width:1000px}

/* title-stage — asymmetric bottom-left */
.title-band{align-items:flex-start;justify-content:flex-end}
.title-accent{width:76px;height:6px;background:${C.highlight};border-radius:3px;margin-bottom:28px}
.title-main{font-family:${FONT_DISPLAY};font-weight:${W_DISPLAY};line-height:1.16;
  color:${C.textStrong};text-align:left}
.title-sub{color:${C.muted};margin-top:22px;text-align:left;letter-spacing:.04em}

/* section heading (diagram/chart/list top) */
.section-head{font-family:${FONT_DISPLAY};font-weight:${W_DISPLAY};color:${C.text};
  text-align:left;line-height:1.3;margin-bottom:24px;flex:0 0 auto}

/* bullets */
.bullets{list-style:none;margin-top:40px;display:flex;flex-direction:column;gap:34px;width:100%}
.bullets li{display:flex;align-items:baseline;gap:24px;font-size:${SZ.bullet}px;
  color:${C.text};line-height:1.4}
.bullets .dot{flex:0 0 auto;width:12px;height:12px;border-radius:50%;
  background:${C.highlight};transform:translateY(-4px)}

/* quote */
.quote-block{max-width:960px;position:relative}
.quote-mark{font-family:${FONT_DISPLAY};font-size:130px;line-height:.7;color:${C.line};
  position:absolute;top:-42px;left:-18px;user-select:none}
.quote-text{font-family:${FONT_DISPLAY};font-weight:${W_DISPLAY};font-size:${SZ.quote}px;
  line-height:1.5;color:${C.textStrong};position:relative}
.quote-attr{margin-top:34px;font-size:${SZ.attribution}px;color:${C.muted};text-align:right}

/* diagram / chart wrappers */
.diagram-wrap,.chart-wrap{width:100%;height:100%;display:flex;justify-content:center;align-items:center}

/* grid-direct */
.grid-stage{position:absolute;inset:0;display:grid;gap:0}
.grid-cell{position:relative;overflow:hidden;display:flex}
.grid-caption{align-self:flex-end;padding:34px;font-family:${FONT_DISPLAY};
  font-weight:${W_DISPLAY};font-size:38px;line-height:1.3;color:${C.textStrong}}

/* image placeholder */
.img-ph{position:relative;width:100%;height:100%;background:${C.surface};
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.img-inner{display:flex;flex-direction:column;align-items:center;gap:22px;
  padding:36px;max-width:88%;text-align:center}
.img-prompt{color:${C.muted};font-size:20px;line-height:1.6}
.img-badge{position:absolute;top:16px;left:16px;font-size:${SZ.badge}px;letter-spacing:.14em;
  color:${C.muted};text-transform:uppercase;border:1px solid ${C.line};
  padding:4px 10px;border-radius:4px}
.img-corner{position:absolute;width:22px;height:22px;border:2px solid ${C.line};opacity:.9}
.img-corner.tl{top:14px;left:14px;border-right:0;border-bottom:0}
.img-corner.tr{top:14px;right:14px;border-left:0;border-bottom:0}
.img-corner.bl{bottom:14px;left:14px;border-right:0;border-top:0}
.img-corner.br{bottom:14px;right:14px;border-left:0;border-top:0}

.err{color:${C.highlight};font-size:28px}
`;

// ---------------------------------------------------------------------------
// Page assembly + output
// ---------------------------------------------------------------------------
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const pageShell = (bodyClass, inner) =>
  `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=1280">
<title>hokuchi slide spike</title>
<style>${CSS}${bodyClass === 'single' ? '\nbody.single{margin:0;background:' + C.bg + '}' : ''}${bodyClass === 'index' ? INDEX_CSS : ''}</style>
</head><body class="${bodyClass}">${inner}</body></html>`;

const INDEX_CSS = `
body.index{background:#050403;padding:56px 0;font-family:${FONT_BODY}}
.deck-head{width:1280px;margin:0 auto 44px;color:${C.text}}
.deck-head h1{font-family:${FONT_DISPLAY};font-weight:${W_DISPLAY};font-size:40px;color:${C.textStrong}}
.deck-head p{color:${C.muted};margin-top:10px;font-size:18px}
.slide-item{width:1280px;margin:0 auto 56px}
.slide-cap{color:${C.muted};font-size:15px;margin-bottom:12px;font-family:${FONT_BODY};letter-spacing:.03em}
.slide-cap b{color:${C.text};font-weight:${W_DISPLAY}}
.slide-cap .idea{color:${C.text}}
.slide-frame{box-shadow:0 8px 40px rgba(0,0,0,.6);border-radius:6px;overflow:hidden}
`;

const slides = deck.slides;
const num = (i) => String(i + 1).padStart(2, '0');

// Per-slide standalone pages (for screenshots).
slides.forEach((s, i) => {
  const html = pageShell('single', renderSlide(s));
  fs.writeFileSync(path.join(outDir, `slide-${num(i)}.html`), html);
});

// Combined index.
const items = slides.map((s, i) => `
  <div class="slide-item">
    <div class="slide-cap"><b>${num(i)} · ${esc(s.id)}</b> &nbsp; ${esc(typeof s.layout === 'object' ? 'grid-direct' : s.layout)} · role:${esc(s.role)}<br><span class="idea">idea: ${esc(s.idea)}</span></div>
    <div class="slide-frame">${renderSlide(s)}</div>
  </div>`).join('');

const indexInner = `
  <div class="deck-head">
    <h1>${esc(deck.deck.title)}</h1>
    <p>${esc(deck.deck.audience.who)} — 全 ${slides.length} 枚 / 1280×720</p>
  </div>${items}`;

fs.writeFileSync(path.join(outDir, 'index.html'), pageShell('index', indexInner));

console.log(`rendered ${slides.length} slides -> ${path.relative(process.cwd(), outDir)}/`);
console.log('  index.html + slide-01..' + num(slides.length - 1) + '.html');
