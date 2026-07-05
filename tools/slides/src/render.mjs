// render.mjs — derive pixel layout from declared intent and emit static HTML/SVG.
//
// The write side declares intent (idea / text / nodes / message); this module
// derives every pixel. It improves on the spike in five ways the SPEC calls for:
//   (a) slot resolution — elements are found by slot/id, never by array order;
//   (b) type scale      — font sizes come from theme.type.scale tokens;
//   (c) JP line breaking — BudouX phrase wrapping + orphan guard (SPEC §8.5);
//   (d) lead scaling     — hero elements fill ~85% of the stage height;
//   (e) shared scales    — chart axes resolve deck.scales; annotations anchor on x.

import fs from 'node:fs';
import path from 'node:path';
import { loadDefaultJapaneseParser } from 'budoux';

const parser = loadDefaultJapaneseParser();

// ---------------------------------------------------------------------------
// Canvas + geometry constants (SPEC §8.1)
// ---------------------------------------------------------------------------
const CANVAS = { w: 1280, h: 720 };
const MARGIN = { x: 96, y: 64 };
const LETTERBOXED_ROLES = new Set(['content', 'title', 'transition']);

// Type-scale defaults mirror theme.schema.json so a theme that omits a token
// still renders. Present tokens in the theme win.
const DEFAULT_SCALE = {
  hero: 80, title: 74, big: 70, quote: 46, heading: 34,
  bullet: 34, subtitle: 30, attribution: 24, node: 24, axis: 20,
};

// Named-pattern slot maps (SPEC §5.1). Elements enter a slot by `slot:`.
const PATTERN_SLOTS = {
  'statement-stage': ['statement'],
  'title-stage': ['title', 'subtitle'],
  'diagram-stage': ['headline', 'diagram'],
  'chart-stage': ['headline', 'chart'],
  'list-stage': ['headline', 'list'],
  'quote-stage': ['quote'],
};

// ---------------------------------------------------------------------------
// Theme → render context
// ---------------------------------------------------------------------------
function makeContext(deckRoot, themeRoot, opts = {}) {
  const T = themeRoot.theme;
  const P = T.palette;
  const assets = new Map(); // abs source path -> rel path inside outdir

  /** Register a file for copying into the output dir; returns its rel path. */
  function useAsset(absPath, subdir) {
    for (const [abs, rel] of assets) if (abs === absPath) return rel;
    let rel = `${subdir}/${path.basename(absPath)}`;
    // Same basename from a different source: disambiguate with a counter.
    if ([...assets.values()].includes(rel)) {
      const ext = path.extname(rel);
      rel = `${rel.slice(0, -ext.length)}-${assets.size}${ext}`;
    }
    assets.set(absPath, rel);
    return rel;
  }

  return {
    deck: deckRoot.deck,
    slides: deckRoot.slides,
    grid: { rows: T.grid.rows ?? 6, stageMargin: T.grid.stage_margin ?? 1, pattern: T.grid.pattern },
    scale: { ...DEFAULT_SCALE, ...(T.type.scale || {}) },
    scales: deckRoot.deck.scales || {},
    fonts: {
      display: T.type.display.family,
      body: T.type.body.family,
      wDisplay: T.type.display.weight,
      wBody: T.type.body.weight,
    },
    webfonts: T.type.webfonts || [],
    background: P.background,
    brand: T.brand || null,
    deckDir: opts.deckDir || process.cwd(),
    themeDir: opts.themeDir || process.cwd(),
    assets,
    useAsset,
    C: {
      bg: P.neutral.bg,
      surface: P.neutral.surface,
      line: P.neutral.line,
      muted: P.neutral.muted,
      text: P.neutral.text,
      textStrong: P.neutral.text_strong,
      highlight: P.highlight,
      core: P.core,
    },
  };
}

/** Role → brand background group (ADR-0010). */
function roleGroup(role) {
  return role === 'opener' || role === 'closer' ? 'bumper' : role;
}

/** The brand background entry for a slide, or null. */
function brandBackground(ctx, slide) {
  return ctx.brand?.backgrounds?.[roleGroup(slide.role)] || null;
}

/** Stage rectangle for a slide's role (letterbox on/off). */
function stageRect(ctx, role) {
  const rowH = (CANVAS.h - MARGIN.y * 2) / ctx.grid.rows;
  const padY = MARGIN.y + (LETTERBOXED_ROLES.has(role) ? ctx.grid.stageMargin * rowH : 0);
  return { x: MARGIN.x, y: padY, w: CANVAS.w - MARGIN.x * 2, h: CANVAS.h - padY * 2 };
}

// ---------------------------------------------------------------------------
// Text: escaping, emphasis, BudouX phrase wrapping (SPEC §8.5)
// ---------------------------------------------------------------------------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cpLen = (s) => [...s].length;

/**
 * Merge single-code-point phrases into a neighbour so that no line break can
 * strand a lone character at a line edge. This is the structural orphan guard
 * that a layout-free (build-time) renderer can offer.
 */
function mergeShortPhrases(phrases) {
  const out = [];
  for (const p of phrases) {
    if (out.length && cpLen(p) <= 1) out[out.length - 1] += p;
    else out.push(p);
  }
  if (out.length >= 2 && cpLen(out[0]) <= 1) {
    out[1] = out[0] + out[1];
    out.shift();
  }
  return out;
}

/**
 * Character ranges [start, end) covered by emphasis words in a line.
 * Longest word wins on overlap so nested matches do not double-mark.
 */
function emphasisRanges(line, words) {
  const uniq = [...new Set((words || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  const ranges = [];
  const overlaps = (s, e) => ranges.some((r) => s < r.end && e > r.start);
  for (const w of uniq) {
    const re = new RegExp(escapeRegex(w), 'g');
    let m;
    while ((m = re.exec(line)) !== null) {
      const s = m.index, e = s + w.length;
      if (!overlaps(s, e)) ranges.push({ start: s, end: e });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Render one phrase whose position in the line is [offset, offset+len),
 * wrapping the parts covered by emphasis ranges in .hi spans. Everything
 * emitted here is inside one phrase, so no break opportunity is created.
 */
function phraseHtml(phrase, offset, ranges) {
  const end = offset + phrase.length;
  let html = '';
  let cursor = offset;
  for (const r of ranges) {
    if (r.end <= offset || r.start >= end) continue;
    const s = Math.max(r.start, offset), e = Math.min(r.end, end);
    if (s > cursor) html += esc(phrase.slice(cursor - offset, s - offset));
    html += `<span class="hi">${esc(phrase.slice(s - offset, e - offset))}</span>`;
    cursor = e;
  }
  if (cursor < end) html += esc(phrase.slice(cursor - offset));
  return html;
}

/**
 * Render inline text (SPEC §8.5). Explicit \n → hard <br> (highest priority).
 * Order matters: each line is BudouX phrase-segmented FIRST, and <wbr> break
 * opportunities exist only at phrase boundaries. Emphasis markup is then
 * applied inside phrases from character ranges, so a .hi span boundary never
 * creates a break opportunity (e.g. 「意図で」 stays one unbreakable phrase
 * even when 「意図」 is emphasized).
 */
function inlineText(text, emphasis = []) {
  return String(text).split('\n').map((line) => {
    const ranges = emphasisRanges(line, emphasis);
    const phrases = mergeShortPhrases(parser.parse(line));
    let offset = 0;
    return phrases.map((p) => {
      const html = phraseHtml(p, offset, ranges);
      offset += p.length;
      return html;
    }).join('<wbr>');
  }).join('<br>');
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const boxStyle = (r) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
const round = (n) => Math.round(n * 100) / 100;

/** Split a stage into an optional headline band and the main slot below it. */
function splitStage(ctx, stage, hasHeadline) {
  if (!hasHeadline) return { headline: null, main: stage };
  const headH = Math.round(ctx.scale.heading * 1.4 + 34);
  return {
    headline: { x: stage.x, y: stage.y, w: stage.w, h: headH },
    main: { x: stage.x, y: stage.y + headH, w: stage.w, h: stage.h - headH },
  };
}

/** Box a lead element into 85% of the main slot's height (SPEC §8.3). */
function leadBox(main) {
  return { w: main.w, h: round(main.h * 0.85) };
}

// ---------------------------------------------------------------------------
// Diagram rendering (SPEC §6.4)
// ---------------------------------------------------------------------------

/** Node pill footprint for a label at a given font size. */
function pillSize(label, fs) {
  const w = Math.max(120, cpLen(label) * fs * 1.05 + 44);
  return { w, h: Math.round(fs * 2.1) };
}

function renderNodePill(n, ctx, fs, hot) {
  const { C, fonts } = ctx;
  const scale = hot ? 1.16 : 1;
  const fsN = hot ? fs + 4 : fs;
  const { w, h } = pillSize(n.label, fsN);
  const W = w * scale, H = h * scale;
  const stroke = hot ? C.highlight : C.line;
  const sw = hot ? 3 : 2;
  const tcol = hot ? C.textStrong : C.text;
  const tw = hot ? fonts.wDisplay : fonts.wBody;
  return `<g>
    <rect x="${round(n.x - W / 2)}" y="${round(n.y - H / 2)}" width="${round(W)}" height="${round(H)}" rx="${round(H / 2)}"
      fill="${C.surface}" stroke="${stroke}" stroke-width="${sw}"/>
    <text x="${round(n.x)}" y="${round(n.y + fsN * 0.34)}" text-anchor="middle"
      fill="${tcol}" font-size="${fsN}" font-weight="${tw}" font-family='${fonts.display}'>${esc(n.label)}</text>
  </g>`;
}

/** Curved arrow from a to b, bulging outward from the diagram centre. */
function curvedEdge(a, b, center, C, trim) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  let ox = mx - center.x, oy = my - center.y;
  const olen = Math.hypot(ox, oy) || 1;
  ox /= olen; oy /= olen;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const bulge = dist * 0.16;
  const ctrl = { x: mx + ox * bulge, y: my + oy * bulge };
  // Trim endpoints toward the control point so the arrow meets the pill edge.
  const trimPt = (p) => {
    let dx = ctrl.x - p.x, dy = ctrl.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * trim, y: p.y + (dy / l) * trim };
  };
  const s = trimPt(a), e = trimPt(b);
  const path = `<path d="M ${round(s.x)} ${round(s.y)} Q ${round(ctrl.x)} ${round(ctrl.y)} ${round(e.x)} ${round(e.y)}"
    fill="none" stroke="${C.line}" stroke-width="2.5" marker-end="url(#arrow)"/>`;
  return { path, ctrl: { x: ctrl.x + ox * 14, y: ctrl.y + oy * 14 } };
}

function renderDiagram(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const fs = scale.node;
  const emph = new Set(el.emphasis || []);
  const center = { x: box.w / 2, y: box.h / 2 };

  // Layout: cycle → ellipse ring; everything else → a left-to-right row.
  const maxPill = Math.max(...el.nodes.map((n) => pillSize(n.label, fs + 4).w), 140);
  let pos;
  if (el.form === 'flow.cycle') {
    const rx = box.w / 2 - maxPill / 2 - 24;
    const ry = box.h / 2 - fs * 1.4;
    pos = el.nodes.map((n, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / el.nodes.length;
      return { ...n, x: center.x + rx * Math.cos(ang), y: center.y + ry * Math.sin(ang) };
    });
  } else {
    const n = el.nodes.length;
    const step = box.w / n;
    pos = el.nodes.map((nd, i) => ({ ...nd, x: step * (i + 0.5), y: center.y }));
  }
  const byId = Object.fromEntries(pos.map((n) => [n.id, n]));

  const arrowDef = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/>
    </marker></defs>`;

  let edgeSvg = '';
  for (const edge of el.edges || []) {
    const a = byId[edge.from], b = byId[edge.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const trim = pillSize(b.label, fs).h * 0.62;
    const { path, ctrl } = curvedEdge(a, b, center, C, trim);
    edgeSvg += path;
    if (edge.label) {
      edgeSvg += `<text x="${round(ctrl.x)}" y="${round(ctrl.y)}" text-anchor="middle"
        fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(edge.label)}</text>`;
    }
  }

  let nodeSvg = '';
  for (const n of pos) nodeSvg += renderNodePill(n, ctx, fs, emph.has(n.id));

  return `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
    ${arrowDef}<g>${edgeSvg}</g><g>${nodeSvg}</g></svg>`;
}

// ---------------------------------------------------------------------------
// Chart rendering (SPEC §6.5, §8.4)
// ---------------------------------------------------------------------------
function niceCeil(v) {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

function resolveYRange(el, ctx) {
  if (el.scale && ctx.scales[el.scale] && ctx.scales[el.scale].y) {
    return ctx.scales[el.scale].y;
  }
  const all = el.data.series.flatMap((s) => s.values);
  return { min: Math.min(0, ...all), max: niceCeil(Math.max(...all)) };
}

function renderChart(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const pad = { l: 84, r: 60, t: 40, b: 66 };
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const { min: yMin, max: yMax } = resolveYRange(el, ctx);
  const ticks = 4;
  const isLine = el.intent === 'trend';

  const xAt = (i) => cats.length === 1
    ? plot.x + plot.w / 2
    : plot.x + (plot.w * i) / (cats.length - 1);
  const yAt = (v) => plot.y + plot.h * (1 - (v - yMin) / (yMax - yMin));

  // Background layer: faint gridlines + minimal axis labels (neutral.line).
  let bg = '';
  for (let t = 0; t <= ticks; t++) {
    const val = yMin + ((yMax - yMin) * t) / ticks;
    const y = yAt(val);
    bg += `<line x1="${round(plot.x)}" y1="${round(y)}" x2="${round(plot.x + plot.w)}" y2="${round(y)}" stroke="${C.line}" stroke-width="1" opacity="0.35"/>`;
    bg += `<text x="${round(plot.x - 16)}" y="${round(y + 6)}" text-anchor="end" fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${round(val)}</text>`;
  }
  bg += `<line x1="${round(plot.x)}" y1="${round(plot.y)}" x2="${round(plot.x)}" y2="${round(plot.y + plot.h)}" stroke="${C.line}" stroke-width="1.5"/>`;
  bg += `<line x1="${round(plot.x)}" y1="${round(plot.y + plot.h)}" x2="${round(plot.x + plot.w)}" y2="${round(plot.y + plot.h)}" stroke="${C.line}" stroke-width="1.5"/>`;
  cats.forEach((c, i) => {
    bg += `<text x="${round(xAt(i))}" y="${round(plot.y + plot.h + 32)}" text-anchor="middle" fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(c)}</text>`;
  });

  // Data layer: line (trend) or grouped bars (comparison/distribution).
  let data = '';
  el.data.series.forEach((s, si) => {
    const col = C.core[si % C.core.length];
    if (isLine) {
      const pts = s.values.map((v, i) => `${round(xAt(i))},${round(yAt(v))}`).join(' ');
      data += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => { data += `<circle cx="${round(xAt(i))}" cy="${round(yAt(v))}" r="5" fill="${col}"/>`; });
    } else {
      const groupW = plot.w / cats.length * 0.62;
      const barW = groupW / el.data.series.length;
      s.values.forEach((v, i) => {
        const x = xAt(i) - groupW / 2 + barW * si;
        const y = yAt(v);
        data += `<rect x="${round(x)}" y="${round(y)}" width="${round(barW)}" height="${round(plot.y + plot.h - y)}" fill="${col}"/>`;
      });
    }
  });

  // Emphasis layer: annotations resolved by `at` (exact x match) or at_index.
  let emph = '';
  const s0 = el.data.series[0];
  for (const ann of el.annotations || []) {
    let i = ann.at_index != null ? ann.at_index : cats.indexOf(ann.at);
    if (i < 0 || i >= cats.length) continue; // annotation-anchor lint reports mismatch.
    const px = xAt(i), py = yAt(s0.values[i]);
    emph += `<circle cx="${round(px)}" cy="${round(py)}" r="13" fill="none" stroke="${C.highlight}" stroke-width="2" opacity="0.5"/>`;
    emph += `<circle cx="${round(px)}" cy="${round(py)}" r="7.5" fill="${C.highlight}"/>`;
    const ax = px + 20, ay = py + 74;
    emph += `<line x1="${round(px)}" y1="${round(py + 12)}" x2="${round(ax)}" y2="${round(ay - 22)}" stroke="${C.highlight}" stroke-width="1.5" opacity="0.8"/>`;
    emph += `<text x="${round(ax)}" y="${round(ay)}" text-anchor="start" fill="${C.highlight}" font-size="${scale.node}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(ann.annotate)}</text>`;
  }

  return `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
    <g>${bg}</g><g>${data}</g><g>${emph}</g></svg>`;
}

// ---------------------------------------------------------------------------
// Image placeholder (SPEC §6.3) — surface panel, corner frame, prompt text
// ---------------------------------------------------------------------------
function renderImagePlaceholder(el, ctx) {
  const { C } = ctx;
  const glyph = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="${C.muted}" stroke-width="1.4" style="opacity:.85">
    <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/>
    <path d="M3 17l5-4 4 3 4-4 5 4"/></svg>`;
  return `<div class="img-ph">
    <div class="img-corner tl"></div><div class="img-corner tr"></div>
    <div class="img-corner bl"></div><div class="img-corner br"></div>
    <div class="img-badge">IMAGE · prompt</div>
    <div class="img-inner">${glyph}<div class="img-prompt">${esc(el.prompt || '')}</div></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Image (SPEC §6.3) — real src when present, placeholder from prompt otherwise
// ---------------------------------------------------------------------------
function renderImage(el, ctx) {
  if (!el.src) return renderImagePlaceholder(el, ctx);
  const rel = ctx.useAsset(path.resolve(ctx.deckDir, el.src), 'assets');
  const pos = { 'third-left': '33% 50%', 'third-right': '67% 50%' }[el.subject] || '50% 50%';
  const img = `<img class="photo" src="${esc(rel)}" alt="" style="object-position:${pos}">`;
  if (el.treatment === 'framed') return `<div class="photo-framed">${img}</div>`;
  if (el.treatment === 'cutout') return `<div class="photo-cutout">${img.replace('class="photo"', 'class="photo contain"')}</div>`;
  return img; // full-bleed (default)
}

// ---------------------------------------------------------------------------
// Raw escape hatch (SPEC §6.7) — svg file / inline svg / inline html
// ---------------------------------------------------------------------------
function renderRaw(el, ctx) {
  if (el.html) return `<div class="raw-wrap">${el.html}</div>`;
  const s = String(el.svg || '').trim();
  if (!s) return '';
  const svg = s.startsWith('<svg')
    ? s
    : fs.readFileSync(path.resolve(ctx.deckDir, s), 'utf8');
  return `<div class="raw-wrap">${svg}</div>`;
}

// ---------------------------------------------------------------------------
// Layout patterns (SPEC §5.1) — all resolve elements by slot, not order
// ---------------------------------------------------------------------------
function statementStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const el = slide.elements.find((e) => e.slot === 'statement');
  const token = (slide.role === 'opener' || slide.role === 'closer') ? 'hero' : 'big';
  const fs = ctx.scale[token];
  return `<div class="pane center" style="${boxStyle(stage)}">
    <div class="statement jp" style="font-size:${fs}px">${inlineText(el.text, el.emphasis)}</div>
  </div>`;
}

function titleStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const title = slide.elements.find((e) => e.slot === 'title');
  const sub = slide.elements.find((e) => e.slot === 'subtitle');
  return `<div class="pane title-band" style="${boxStyle(stage)}">
    <div class="title-accent"></div>
    <div class="title-main jp" style="font-size:${ctx.scale.title}px">${inlineText(title.text, title.emphasis)}</div>
    ${sub ? `<div class="title-sub jp" style="font-size:${ctx.scale.subtitle}px">${inlineText(sub.text, sub.emphasis)}</div>` : ''}
  </div>`;
}

function headlineHtml(slide, ctx, box) {
  const head = slide.elements.find((e) => e.slot === 'headline');
  if (!head) return '';
  return `<div class="headline jp" style="${boxStyle(box)};font-size:${ctx.scale.heading}px">${inlineText(head.text, head.emphasis)}</div>`;
}

function leadStage(slide, ctx, slotName, renderFn) {
  const stage = stageRect(ctx, slide.role);
  const hasHead = !!slide.elements.find((e) => e.slot === 'headline');
  const { headline, main } = splitStage(ctx, stage, hasHead);
  const el = slide.elements.find((e) => e.slot === slotName);
  const box = leadBox(main);
  const inner = renderFn(el, box, ctx);
  return `${hasHead ? headlineHtml(slide, ctx, headline) : ''}
    <div class="pane center" style="${boxStyle(main)}"><div class="lead-wrap" style="width:${round(box.w)}px;height:${round(box.h)}px">${inner}</div></div>`;
}

function diagramStage(slide, ctx) {
  return leadStage(slide, ctx, 'diagram', renderDiagram);
}

function chartStage(slide, ctx) {
  return leadStage(slide, ctx, 'chart', renderChart);
}

function listStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const hasHead = !!slide.elements.find((e) => e.slot === 'headline');
  const { headline, main } = splitStage(ctx, stage, hasHead);
  const b = slide.elements.find((e) => e.slot === 'list');
  const items = b.items.map((it) =>
    `<li><span class="dot"></span><span class="jp">${inlineText(it)}</span></li>`).join('');
  return `${hasHead ? headlineHtml(slide, ctx, headline) : ''}
    <div class="pane" style="${boxStyle(main)}">
      <ul class="bullets" style="font-size:${ctx.scale.bullet}px">${items}</ul>
    </div>`;
}

function quoteStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const q = slide.elements.find((e) => e.slot === 'quote');
  return `<div class="pane center" style="${boxStyle(stage)}">
    <div class="quote-block">
      <div class="quote-mark">&ldquo;</div>
      <div class="quote-text jp" style="font-size:${ctx.scale.quote}px">${inlineText(q.text)}</div>
      ${q.attribution ? `<div class="quote-attr" style="font-size:${ctx.scale.attribution}px">— ${esc(q.attribution)}</div>` : ''}
    </div>
  </div>`;
}

// Grid-direct: full-canvas grid, elements resolved by id (SPEC §5.2).
function gridDirect(slide, ctx) {
  const cols = { 'col-3': 3, 'col-4': 4, 'col-5': 5, fibonacci: 4 }[ctx.grid.pattern] || 4;
  const rows = ctx.grid.rows;
  const cells = slide.layout.areas.map((a) => {
    const el = slide.elements.find((e) => e.id === a.element);
    const [colSpec, rowSpec] = a.cell.split('/').map((s) => s.trim());
    const [c1, c2 = c1] = colSpec.split('-').map(Number);
    const [r1, r2 = r1] = rowSpec.split('-').map(Number);
    const g = `grid-column:${c1} / ${c2 + 1};grid-row:${r1} / ${r2 + 1};`;
    let inner = '';
    if (el.kind === 'image') inner = renderImage(el, ctx);
    else if (el.kind === 'statement') inner = `<div class="grid-caption jp">${inlineText(el.text, el.emphasis)}</div>`;
    else if (el.kind === 'quote') inner = `<div class="grid-caption jp">${inlineText(el.text)}</div>`;
    else if (el.kind === 'raw') inner = renderRaw(el, ctx);
    return `<div class="grid-cell" style="${g}">${inner}</div>`;
  }).join('');
  return `<div class="grid-stage" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${cells}</div>`;
}

const PATTERNS = {
  'statement-stage': statementStage,
  'title-stage': titleStage,
  'diagram-stage': diagramStage,
  'chart-stage': chartStage,
  'list-stage': listStage,
  'quote-stage': quoteStage,
};

function renderSlideBody(slide, ctx) {
  if (typeof slide.layout === 'object') return gridDirect(slide, ctx);
  const fn = PATTERNS[slide.layout];
  return fn ? fn(slide, ctx) : `<div class="pane center"><div class="err">unknown layout: ${esc(slide.layout)}</div></div>`;
}

// ---------------------------------------------------------------------------
// Brand frame (ADR-0010) — background art, logo, footer. Lives outside the
// stage; role decides the background group, the theme decides everything else.
// ---------------------------------------------------------------------------
function brandFrame(slide, ctx, inverted) {
  const b = ctx.brand;
  if (!b) return '';
  let html = '';
  const isBumper = slide.role === 'opener' || slide.role === 'closer';
  if (b.logo && (b.logo.placement === 'all' || isBumper)) {
    const src = inverted && b.logo.src_invert ? b.logo.src_invert : b.logo.src;
    const rel = ctx.useAsset(path.resolve(ctx.themeDir, src), 'theme-assets');
    html += `<img class="brand-logo" src="${esc(rel)}" alt="" style="height:${b.logo.height ?? 24}px">`;
  }
  if (b.footer) html += `<div class="brand-footer">${esc(b.footer)}</div>`;
  return html;
}

function renderSlide(slide, ctx) {
  const bg = brandBackground(ctx, slide);
  const inverted = bg?.foreground === 'light';
  const bgHtml = bg
    ? `<img class="bg" src="${esc(ctx.useAsset(path.resolve(ctx.themeDir, bg.src), 'theme-assets'))}" alt="">`
    : '';
  return `<div class="slide${inverted ? ' inv' : ''}">${bgHtml}${renderSlideBody(slide, ctx)}${brandFrame(slide, ctx, inverted)}</div>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
function css(ctx) {
  const { C, fonts } = ctx;
  return `
*{margin:0;padding:0;box-sizing:border-box}
.slide{width:${CANVAS.w}px;height:${CANVAS.h}px;position:relative;overflow:hidden;
  background:${C.bg};color:${C.text};font-family:${fonts.body};font-weight:${fonts.wBody};
  -webkit-font-smoothing:antialiased;letter-spacing:.01em}
.jp{word-break:keep-all;overflow-wrap:normal;line-break:strict}
.hi{color:${C.highlight};font-weight:${fonts.wDisplay}}
.pane{position:absolute;display:flex;flex-direction:column}
.pane.center{align-items:center;justify-content:center;text-align:center}
.lead-wrap{display:flex;align-items:center;justify-content:center}
svg.lead{display:block;max-width:100%;max-height:100%}

.statement{font-family:${fonts.display};font-weight:${fonts.wDisplay};line-height:1.25;
  color:${C.textStrong};max-width:100%}

.title-band{align-items:flex-start;justify-content:flex-end}
.title-accent{width:76px;height:6px;background:${C.highlight};border-radius:3px;margin-bottom:28px}
.title-main{font-family:${fonts.display};font-weight:${fonts.wDisplay};line-height:1.18;
  color:${C.textStrong};text-align:left}
.title-sub{color:${C.muted};margin-top:22px;text-align:left;letter-spacing:.04em}

.headline{position:absolute;display:flex;align-items:flex-end;font-family:${fonts.display};
  font-weight:${fonts.wDisplay};color:${C.text};text-align:left;line-height:1.3}

.bullets{list-style:none;width:100%;display:flex;flex-direction:column;
  justify-content:center;height:100%;gap:1.1em}
.bullets li{display:flex;align-items:baseline;gap:24px;color:${C.text};line-height:1.4}
.bullets .dot{flex:0 0 auto;width:13px;height:13px;border-radius:50%;
  background:${C.highlight};transform:translateY(-4px)}

.quote-block{max-width:1000px;position:relative}
.quote-mark{font-family:${fonts.display};font-size:130px;line-height:.7;color:${C.line};
  position:absolute;top:-42px;left:-18px;user-select:none}
.quote-text{font-family:${fonts.display};font-weight:${fonts.wDisplay};line-height:1.5;
  color:${C.textStrong};position:relative;text-align:left}
.quote-attr{margin-top:34px;color:${C.muted};text-align:right}

.grid-stage{position:absolute;inset:0;display:grid;gap:0}
.grid-cell{position:relative;overflow:hidden;display:flex}
.grid-caption{align-self:flex-end;padding:34px;font-family:${fonts.display};
  font-weight:${fonts.wDisplay};font-size:38px;line-height:1.32;color:${C.textStrong}}

.img-ph{position:relative;width:100%;height:100%;background:${C.surface};
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.img-inner{display:flex;flex-direction:column;align-items:center;gap:22px;
  padding:36px;max-width:88%;text-align:center}
.img-prompt{color:${C.muted};font-size:20px;line-height:1.6}
.img-badge{position:absolute;top:16px;left:16px;font-size:15px;letter-spacing:.14em;
  color:${C.muted};text-transform:uppercase;border:1px solid ${C.line};padding:4px 10px;border-radius:4px}
.img-corner{position:absolute;width:22px;height:22px;border:2px solid ${C.line};opacity:.9}
.img-corner.tl{top:14px;left:14px;border-right:0;border-bottom:0}
.img-corner.tr{top:14px;right:14px;border-left:0;border-bottom:0}
.img-corner.bl{bottom:14px;left:14px;border-right:0;border-top:0}
.img-corner.br{bottom:14px;right:14px;border-left:0;border-top:0}

.photo{width:100%;height:100%;object-fit:cover;display:block}
.photo.contain{object-fit:contain}
.photo-framed{width:100%;height:100%;padding:40px;background:${C.surface};display:flex}
.photo-framed .photo{box-shadow:0 6px 28px rgba(0,0,0,.18)}
.photo-cutout{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.raw-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
.raw-wrap svg{max-width:100%;max-height:100%}

.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.slide>.pane,.slide>.grid-stage,.slide>.headline{z-index:1}
.brand-logo{position:absolute;top:25px;right:20px;z-index:2}
.brand-footer{position:absolute;bottom:20px;right:20px;z-index:2;font-size:13px;
  color:${C.muted};letter-spacing:.03em;font-family:${fonts.body}}

.inv{color:rgba(255,255,255,.94)}
.inv .statement,.inv .title-main,.inv .quote-text,.inv .grid-caption,.inv .headline{color:#ffffff}
.inv .hi{color:#ffffff}
.inv .title-sub,.inv .quote-attr,.inv .brand-footer,.inv .img-prompt{color:rgba(255,255,255,.85)}
.inv .quote-mark{color:rgba(255,255,255,.38)}
.inv .bullets li{color:rgba(255,255,255,.94)}
.inv .bullets .dot,.inv .title-accent{background:#ffffff}

.err{color:${C.highlight};font-size:28px}`;
}

// ---------------------------------------------------------------------------
// Page assembly
// ---------------------------------------------------------------------------
function page(bodyClass, styleExtra, inner, ctx, scriptExtra = '') {
  const fontLinks = ctx.webfonts
    .map((u) => `<link rel="stylesheet" href="${esc(u)}">`)
    .join('\n');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=${CANVAS.w}">
<title>${esc(ctx.deck.title)}</title>
${fontLinks}
<style>${css(ctx)}${styleExtra}</style>
</head><body class="${bodyClass}">${inner}${scriptExtra}</body></html>`;
}

const num = (i) => String(i + 1).padStart(2, '0');

/** Keyboard navigation between slide pages (← → Space Home End). */
function navScript(i, total) {
  return `<script>(()=>{const go=n=>{if(n>=1&&n<=${total})location.href='slide-'+String(n).padStart(2,'0')+'.html'};
addEventListener('keydown',e=>{if(e.defaultPrevented)return;const t=e.target;
if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
if(e.key==='ArrowRight'||e.key===' ')go(${i + 2});
else if(e.key==='ArrowLeft')go(${i});else if(e.key==='Home')go(1);else if(e.key==='End')go(${total})})})()</script>`;
}

/**
 * Render a loaded deck.
 * @param {object} opts { deckDir, themeDir } — bases for resolving relative asset paths.
 * @returns {{ pages: { 'index.html': string, [slidePage]: string },
 *             assets: Map<string, string> }}  abs source path -> rel path in outdir
 */
export function renderDeck(deckRoot, themeRoot, opts = {}) {
  const ctx = makeContext(deckRoot, themeRoot, opts);
  const pages = {};
  const total = ctx.slides.length;

  const singleStyle = `\nbody.single{background:${ctx.C.bg}}`;
  ctx.slides.forEach((s, i) => {
    pages[`slide-${num(i)}.html`] = page('single', singleStyle, renderSlide(s, ctx), ctx, navScript(i, total));
  });

  // Index page adapts to the theme's background mode (dark gallery vs light).
  const light = ctx.background === 'light';
  const idxBg = light ? '#eceef1' : '#050403';
  const idxShadow = light ? '0 6px 28px rgba(17,24,39,.14)' : '0 8px 40px rgba(0,0,0,.6)';
  const indexStyle = `
body.index{background:${idxBg};padding:56px 0;font-family:${ctx.fonts.body}}
.deck-head{width:${CANVAS.w}px;margin:0 auto 44px;color:${ctx.C.text}}
.deck-head h1{font-family:${ctx.fonts.display};font-weight:${ctx.fonts.wDisplay};font-size:40px;color:${ctx.C.textStrong}}
.deck-head p{color:${ctx.C.muted};margin-top:10px;font-size:18px}
.slide-item{width:${CANVAS.w}px;margin:0 auto 56px}
.slide-cap{color:${ctx.C.muted};font-size:15px;margin-bottom:12px;letter-spacing:.03em}
.slide-cap b{color:${ctx.C.text};font-weight:${ctx.fonts.wDisplay}}
.slide-frame{box-shadow:${idxShadow};border-radius:6px;overflow:hidden}`;

  const items = ctx.slides.map((s, i) => `
  <div class="slide-item" id="s${num(i)}">
    <div class="slide-cap"><b>${num(i)} · ${esc(s.id)}</b> &nbsp; ${esc(typeof s.layout === 'object' ? 'grid-direct' : s.layout)} · role:${esc(s.role)}<br>idea: ${esc(s.idea)}</div>
    <div class="slide-frame">${renderSlide(s, ctx)}</div>
  </div>`).join('');

  const indexInner = `
  <div class="deck-head">
    <h1>${esc(ctx.deck.title)}</h1>
    <p>${esc(ctx.deck.audience.who)} — 全 ${ctx.slides.length} 枚 / ${CANVAS.w}×${CANVAS.h}</p>
  </div>${items}`;

  pages['index.html'] = page('index', indexStyle, indexInner, ctx);
  return { pages, assets: ctx.assets };
}
