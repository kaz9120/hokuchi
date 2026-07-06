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
  'statement-stage': ['statement', 'support'],
  'title-stage': ['title', 'subtitle'],
  'diagram-stage': ['headline', 'diagram'],
  'chart-stage': ['headline', 'chart'],
  'list-stage': ['headline', 'list'],
  'quote-stage': ['quote'],
  'profile-stage': ['portrait', 'name', 'affiliation', 'handle', 'bio'],
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

/** Box a lead element into ~85% of the main slot's height (SPEC §8.3 の目安)。
 * chart は内部に軸ラベル分のパディングを抱えるため、やや高め (0.92) を使う。 */
function leadBox(main, ratio = 0.85) {
  return { w: main.w, h: round(main.h * ratio) };
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

/**
 * Arrowhead marker definition. The id is namespaced per slide — in the
 * single-file SPA (ADR-0012) every slide's SVG lives in one document, so a
 * shared id would collide across slides.
 */
function arrowDefFor(ctx, C) {
  return `<defs>
    <marker id="arrow-${ctx.slideKey}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9.5" markerHeight="9.5" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.muted}"/>
    </marker></defs>`;
}

const markerRef = (ctx) => `url(#arrow-${ctx.slideKey})`;

/** Curved arrow from a to b, bulging outward from the diagram centre. */
function curvedEdge(a, b, center, ctx, trim) {
  const { C } = ctx;
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
    fill="none" stroke="${C.muted}" stroke-width="3" marker-end="${markerRef(ctx)}"/>`;
  return { path, ctrl: { x: ctrl.x + ox * 14, y: ctrl.y + oy * 14 } };
}

/**
 * Row of step cards (every non-cycle form). Cards read as an ordered sequence:
 * number badge + label + optional `detail` sub-line; edges become straight
 * arrows between cards. Emphasis gets the highlight border and badge.
 */
function renderStepRow(el, box, ctx, arrowDef) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  const hasDetail = el.nodes.some((nd) => nd.detail);
  const gap = Math.min(64, box.w * 0.05);
  const cardW = Math.min(350, (box.w - gap * (n - 1)) / n);
  const cardH = hasDetail ? 150 : 108;
  const totalW = cardW * n + gap * (n - 1);
  const x0 = (box.w - totalW) / 2;
  const cy = box.h / 2;
  const y = cy - cardH / 2;

  const byId = {};
  el.nodes.forEach((nd, i) => {
    byId[nd.id] = { ...nd, i, x: x0 + i * (cardW + gap), cx: x0 + i * (cardW + gap) + cardW / 2 };
  });

  let edgeSvg = '';
  for (const edge of el.edges || []) {
    const a = byId[edge.from], b = byId[edge.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const [l, r] = a.i < b.i ? [a, b] : [b, a];
    const x1 = l.x + cardW + 5, x2 = r.x - 7;
    if (x2 <= x1) continue;
    edgeSvg += `<line x1="${round(x1)}" y1="${round(cy)}" x2="${round(x2)}" y2="${round(cy)}" stroke="${C.muted}" stroke-width="3" marker-end="${markerRef(ctx)}"/>`;
    if (edge.label) {
      edgeSvg += `<text x="${round((x1 + x2) / 2)}" y="${round(cy - 14)}" text-anchor="middle" fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(edge.label)}</text>`;
    }
  }

  let cardSvg = '';
  el.nodes.forEach((nd, i) => {
    const p = byId[nd.id];
    const hot = emph.has(nd.id);
    const labelY = hasDetail ? y + cardH * 0.52 : y + cardH * 0.60;
    cardSvg += `<g>
      <rect x="${round(p.x)}" y="${round(y)}" width="${round(cardW)}" height="${cardH}" rx="18"
        fill="${C.surface}" stroke="${hot ? C.highlight : C.line}" stroke-width="${hot ? 3 : 2}"/>
      <circle cx="${round(p.x + 30)}" cy="${round(y + 30)}" r="15" fill="${hot ? C.highlight : C.muted}"/>
      <text x="${round(p.x + 30)}" y="${round(y + 36)}" text-anchor="middle" fill="${C.bg}"
        font-size="17" font-weight="700" font-family='${fonts.display}'>${i + 1}</text>
      <text x="${round(p.cx)}" y="${round(labelY)}" text-anchor="middle" fill="${hot ? C.textStrong : C.text}"
        font-size="${hot ? scale.node + 2 : scale.node}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(nd.label)}</text>
      ${nd.detail ? `<text x="${round(p.cx)}" y="${round(labelY + scale.axis * 1.75)}" text-anchor="middle"
        fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(nd.detail)}</text>` : ''}
    </g>`;
  });

  return `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
    ${arrowDef}<g>${edgeSvg}</g><g>${cardSvg}</g></svg>`;
}

function renderDiagram(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const fs = scale.node;
  const emph = new Set(el.emphasis || []);
  const center = { x: box.w / 2, y: box.h / 2 };

  const arrowDef = arrowDefFor(ctx, C);

  // Every non-cycle form reads as an ordered sequence → step cards.
  if (el.form !== 'flow.cycle') return renderStepRow(el, box, ctx, arrowDef);

  // cycle: pills on an ellipse ring, curved edges bulging outward.
  const maxPill = Math.max(...el.nodes.map((n) => pillSize(n.label, fs + 4).w), 140);
  const rx = box.w / 2 - maxPill / 2 - 24;
  const ry = box.h / 2 - fs * 1.4;
  const pos = el.nodes.map((n, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / el.nodes.length;
    return { ...n, x: center.x + rx * Math.cos(ang), y: center.y + ry * Math.sin(ang) };
  });
  const byId = Object.fromEntries(pos.map((n) => [n.id, n]));

  let edgeSvg = '';
  for (const edge of el.edges || []) {
    const a = byId[edge.from], b = byId[edge.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const trim = pillSize(b.label, fs).h * 0.62;
    const { path, ctrl } = curvedEdge(a, b, center, ctx, trim);
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
  const pad = { l: 84, r: 60, t: 26, b: 64 };
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const { min: yMin, max: yMax } = resolveYRange(el, ctx);
  const ticks = 4;
  const isLine = el.intent === 'trend';

  // Lines spread points edge to edge; bars sit in centred bands whose width is
  // capped so few categories stay adjacent and comparable (and inside the plot).
  const xAt = (i) => cats.length === 1
    ? plot.x + plot.w / 2
    : plot.x + (plot.w * i) / (cats.length - 1);
  const bandW = Math.min(plot.w / cats.length, 280);
  const bandX0 = plot.x + (plot.w - bandW * cats.length) / 2;
  const xPos = isLine ? xAt : (i) => bandX0 + bandW * (i + 0.5);
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
    bg += `<text x="${round(xPos(i))}" y="${round(plot.y + plot.h + 36)}" text-anchor="middle" fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(c)}</text>`;
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
      const groupW = bandW * 0.6;
      const barW = groupW / el.data.series.length;
      s.values.forEach((v, i) => {
        const x = xPos(i) - groupW / 2 + barW * si;
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
    const px = xPos(i), py = yAt(s0.values[i]);
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
  const abs = path.resolve(ctx.deckDir, el.src);
  // src declared but file not delivered yet — fall back to the prompt
  // placeholder instead of failing the whole render.
  if (!fs.existsSync(abs)) return renderImagePlaceholder(el, ctx);
  const rel = ctx.useAsset(abs, 'assets');
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
  const support = slide.elements.find((e) => e.slot === 'support');
  const token = (slide.role === 'opener' || slide.role === 'closer') ? 'hero' : 'big';
  const fs = ctx.scale[token];
  return `<div class="pane center" style="${boxStyle(stage)}">
    <div class="statement jp" style="font-size:${fs}px">${inlineText(el.text, el.emphasis)}</div>
    ${support ? `<div class="support jp" style="font-size:${ctx.scale.subtitle}px">${inlineText(support.text, support.emphasis)}</div>` : ''}
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

function leadStage(slide, ctx, slotName, renderFn, ratio) {
  const stage = stageRect(ctx, slide.role);
  const hasHead = !!slide.elements.find((e) => e.slot === 'headline');
  const { headline, main } = splitStage(ctx, stage, hasHead);
  const el = slide.elements.find((e) => e.slot === slotName);
  const box = leadBox(main, ratio);
  const inner = renderFn(el, box, ctx);
  return `${hasHead ? headlineHtml(slide, ctx, headline) : ''}
    <div class="pane center" style="${boxStyle(main)}"><div class="lead-wrap" style="width:${round(box.w)}px;height:${round(box.h)}px">${inner}</div></div>`;
}

function diagramStage(slide, ctx) {
  return leadStage(slide, ctx, 'diagram', renderDiagram);
}

function chartStage(slide, ctx) {
  return leadStage(slide, ctx, 'chart', renderChart, 0.92);
}

function listStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const hasHead = !!slide.elements.find((e) => e.slot === 'headline');
  const { headline, main } = splitStage(ctx, stage, hasHead);
  const b = slide.elements.find((e) => e.slot === 'list');

  // Fit the list inside its pane: estimate wrapped lines at a given size,
  // shrink the font (floor 24px) if needed, then derive a gap that keeps the
  // centred list from bleeding into the headline above.
  const n = b.items.length;
  const estH = (fs) => b.items.reduce((t, it) => {
    const perLine = Math.max(4, Math.floor((main.w - fs * 2.2) / fs));
    return t + Math.max(1, Math.ceil(cpLen(String(it)) / perLine)) * fs * 1.4;
  }, 0);
  let fs = ctx.scale.bullet;
  while (fs > 24 && estH(fs) + (n - 1) * 14 > main.h) fs -= 2;
  const gap = Math.max(14, Math.min(fs * 1.1, (main.h - estH(fs)) / n));

  const items = b.items.map((it) =>
    `<li><span class="dot"></span><span class="jp">${inlineText(it)}</span></li>`).join('');
  return `${hasHead ? headlineHtml(slide, ctx, headline) : ''}
    <div class="pane" style="${boxStyle(main)}">
      <ul class="bullets" style="font-size:${fs}px;gap:${round(gap)}px">${items}</ul>
    </div>`;
}

function quoteStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const q = slide.elements.find((e) => e.slot === 'quote');
  // A short quote is the slide's hero — scale it toward display size instead
  // of leaving it at body-quote size (46px) inside an empty stage.
  const len = cpLen(String(q.text).replace(/\n/g, ''));
  const fs = len <= 12 ? Math.round(ctx.scale.quote * 1.7)
    : len <= 24 ? Math.round(ctx.scale.quote * 1.35)
    : ctx.scale.quote;
  return `<div class="pane center" style="${boxStyle(stage)}">
    <div class="quote-block">
      <div class="quote-mark">&ldquo;</div>
      <div class="quote-text jp" style="font-size:${fs}px">${inlineText(q.text)}</div>
      ${q.attribution ? `<div class="quote-attr" style="font-size:${ctx.scale.attribution}px">— ${esc(q.attribution)}</div>` : ''}
    </div>
  </div>`;
}

// Profile: self-introduction reference slide (SPEC §5.1 profile-stage).
// Header = name + affiliation; left = round portrait + handle; right = bio
// sections whose items may carry a "label ── body" prefix.
function profileStage(slide, ctx) {
  const stage = stageRect(ctx, slide.role);
  const get = (slot) => slide.elements.find((e) => e.slot === slot);
  const portrait = get('portrait');
  const name = get('name');
  const affiliation = get('affiliation');
  const handle = get('handle');
  const bio = get('bio');

  const headH = Math.round(ctx.scale.heading * 1.5 + (affiliation ? ctx.scale.attribution * 1.7 : 0) + 20);
  const gap = 44; // ゆとり: 肩書きと本文ブロックの間 (レビュー指摘 2026-07-06)
  const header = { x: stage.x, y: stage.y, w: stage.w, h: headH };
  const body = { x: stage.x, y: stage.y + headH + gap, w: stage.w, h: stage.h - headH - gap };
  const leftW = Math.round(body.w * 0.42);
  const colGap = 80;
  const left = { x: body.x, y: body.y, w: leftW, h: body.h };
  const right = { x: body.x + leftW + colGap, y: body.y, w: body.w - leftW - colGap, h: body.h };

  const handleH = handle ? ctx.scale.node * 2 : 0;
  const size = Math.round(Math.min(left.w - 24, left.h - handleH - 24, 330));
  let portraitHtml = '';
  if (portrait) {
    const abs = portrait.src ? path.resolve(ctx.deckDir, portrait.src) : null;
    if (abs && fs.existsSync(abs)) {
      const rel = ctx.useAsset(abs, 'assets');
      portraitHtml = `<img class="profile-portrait" src="${esc(rel)}" alt="" style="width:${size}px;height:${size}px">`;
    } else {
      portraitHtml = `<div class="profile-portrait ph jp" style="width:${size}px;height:${size}px">${esc(portrait.prompt || '')}</div>`;
    }
  }

  const bioHtml = (bio?.items || []).map((it) => {
    const parts = String(it).split('──');
    const label = parts.length > 1 ? parts[0].trim() : null;
    const bodyText = parts.length > 1 ? parts.slice(1).join('──').trim() : String(it);
    return `<div class="profile-item">
      ${label ? `<div class="profile-label">${esc(label)}</div>` : ''}
      <div class="profile-body jp">${inlineText(bodyText)}</div></div>`;
  }).join('');

  return `
    <div class="pane" style="${boxStyle(header)}">
      <div class="profile-name jp" style="font-size:${Math.round(ctx.scale.heading * 1.2)}px">${inlineText(name.text, name.emphasis)}</div>
      ${affiliation ? `<div class="profile-affil jp" style="font-size:${ctx.scale.attribution}px">${inlineText(affiliation.text)}</div>` : ''}
    </div>
    <div class="pane profile-left" style="${boxStyle(left)}">
      ${portraitHtml}
      ${handle ? `<div class="profile-handle jp" style="font-size:${ctx.scale.node}px">${inlineText(handle.text)}</div>` : ''}
    </div>
    <div class="pane profile-right" style="${boxStyle(right)}">${bioHtml}</div>`;
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
  'profile-stage': profileStage,
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
  ctx.slideKey = slide.id; // namespaces intra-SVG ids in the single-document SPA
  const bg = brandBackground(ctx, slide);
  const inverted = bg?.foreground === 'light';
  const bgHtml = bg
    ? `<img class="bg" src="${esc(ctx.useAsset(path.resolve(ctx.themeDir, bg.src), 'theme-assets'))}" alt="">`
    : '';
  const chapter = slide.chapter && slide.role !== 'opener' && slide.role !== 'closer'
    ? `<div class="chapter">${esc(slide.chapter)}</div>`
    : '';
  return `<div class="slide${inverted ? ' inv' : ''}">${bgHtml}${chapter}${renderSlideBody(slide, ctx)}${brandFrame(slide, ctx, inverted)}</div>`;
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
.support{color:${C.muted};margin-top:30px;line-height:1.5;letter-spacing:.02em}

.chapter{position:absolute;top:22px;left:20px;z-index:2;font-size:15px;color:${C.muted};
  letter-spacing:.18em;font-family:${fonts.display};font-weight:${fonts.wDisplay};
  background:${C.bg}d9;padding:5px 12px;border-radius:6px}
.inv .chapter{color:rgba(255,255,255,.9);background:rgba(0,0,0,.18)}
.inv .support{color:rgba(255,255,255,.85)}

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

.profile-name{font-family:${fonts.display};font-weight:${fonts.wDisplay};color:${C.textStrong};line-height:1.25}
.profile-affil{color:${C.muted};margin-top:12px;letter-spacing:.03em}
.profile-left{align-items:center;justify-content:center;gap:20px}
.profile-portrait{border-radius:50%;object-fit:cover;box-shadow:0 6px 28px rgba(0,0,0,.16)}
.profile-portrait.ph{background:${C.surface};border:2px dashed ${C.line};display:flex;
  align-items:center;justify-content:center;color:${C.muted};font-size:16px;
  line-height:1.6;padding:28px;text-align:center;box-shadow:none}
.profile-handle{color:${C.text}}
.profile-right{justify-content:center;gap:30px}
.profile-label{color:${C.highlight};font-family:${fonts.display};font-weight:${fonts.wDisplay};
  font-size:22px;letter-spacing:.08em;margin-bottom:7px}
.profile-body{font-size:21px;line-height:1.65;color:${C.text}}

.photo{width:100%;height:100%;object-fit:cover;display:block}
.photo.contain{object-fit:contain}
.photo-framed{width:100%;height:100%;padding:48px;background:${C.surface};display:flex;
  align-items:center;justify-content:center}
.photo-framed .photo{width:100%;height:100%;object-fit:contain}
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
// Document assembly (ADR-0012) — one self-contained SPA per deck
//
// Every slide lives in the single index.html as <section class="page" id="pNN">.
// The load-bearing mechanism is CSS :target — deck mode shows exactly the slide
// named by the URL hash with no JS required, which keeps shot (headless Chrome
// on index.html#pNN) independent of script timing. JS adds only keyboard
// navigation, viewport scaling, and the g-key list-mode toggle.
// ---------------------------------------------------------------------------
const num = (i) => String(i + 1).padStart(2, '0');

function spaCss(ctx) {
  const light = ctx.background === 'light';
  const galleryBg = light ? '#eceef1' : '#050403';
  const frameShadow = light ? '0 6px 28px rgba(17,24,39,.14)' : '0 8px 40px rgba(0,0,0,.6)';
  return `
html,body{height:100%}
body{background:${galleryBg};font-family:${ctx.fonts.body}}
.frame{width:${CANVAS.w}px;height:${CANVAS.h}px;flex:0 0 auto}

/* deck mode — one slide at a time, selected purely by :target */
body.deck{overflow:hidden}
body.deck .page{display:none}
body.deck .page:target{display:flex;position:fixed;inset:0;align-items:center;justify-content:center}
body.deck .page:target .frame{transform:scale(var(--s,1))}
body.deck .cap,body.deck .deck-head{display:none}

/* list mode (g key) — all slides stacked with captions, for review/annotation */
body.list{overflow:auto;padding:56px 0}
body.list .page{display:block;width:${CANVAS.w}px;margin:0 auto 56px}
body.list .cap{color:${ctx.C.muted};font-size:15px;margin-bottom:12px;letter-spacing:.03em;line-height:1.7}
body.list .cap b{color:${ctx.C.text};font-weight:${ctx.fonts.wDisplay}}
body.list .cap .notes{white-space:pre-wrap;margin-top:6px;font-size:14px;opacity:.85}
body.list .frame{box-shadow:${frameShadow};border-radius:6px;overflow:hidden}
body.list .deck-head{width:${CANVAS.w}px;margin:0 auto 44px;color:${ctx.C.text}}
.deck-head h1{font-family:${ctx.fonts.display};font-weight:${ctx.fonts.wDisplay};font-size:40px;color:${ctx.C.textStrong}}
.deck-head p{color:${ctx.C.muted};margin-top:10px;font-size:18px}`;
}

/** Hash navigation (← → Space Home End), fit-to-viewport scale, g = list mode. */
function navScript(total) {
  return `<script>(()=>{const total=${total},pad=n=>String(n).padStart(2,'0');
const cur=()=>{const m=location.hash.match(/^#p(\\d+)$/);return m?Number(m[1]):1};
const go=n=>{if(n>=1&&n<=total)location.hash='#p'+pad(n)};
const fit=()=>document.documentElement.style.setProperty('--s',Math.min(innerWidth/${CANVAS.w},innerHeight/${CANVAS.h}));
if(!location.hash)location.replace('#p01');
fit();addEventListener('resize',fit);
addEventListener('keydown',e=>{if(e.defaultPrevented)return;const t=e.target;
if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
if(e.key==='g'){const b=document.body,list=b.classList.toggle('list');b.classList.toggle('deck',!list);
if(list)document.getElementById('p'+pad(cur()))?.scrollIntoView({block:'start'});return}
if(document.body.classList.contains('list'))return;
if(e.key==='ArrowRight'||e.key===' ')go(cur()+1);
else if(e.key==='ArrowLeft')go(cur()-1);
else if(e.key==='Home')go(1);
else if(e.key==='End')go(total)})})()</script>`;
}

/**
 * Render a loaded deck into a single-file SPA (ADR-0012).
 * @param {object} opts { deckDir, themeDir } — bases for resolving relative asset paths.
 * @returns {{ pages: { 'index.html': string },
 *             assets: Map<string, string> }}  abs source path -> rel path in outdir
 */
export function renderDeck(deckRoot, themeRoot, opts = {}) {
  const ctx = makeContext(deckRoot, themeRoot, opts);
  const total = ctx.slides.length;

  const sections = ctx.slides.map((s, i) => `
  <section class="page" id="p${num(i)}" data-slide-id="${esc(s.id)}">
    <div class="cap"><b>${num(i)} · ${esc(s.id)}</b> &nbsp; ${esc(typeof s.layout === 'object' ? 'grid-direct' : s.layout)} · role:${esc(s.role)}<br>idea: ${esc(s.idea)}${s.notes ? `<div class="notes">${esc(String(s.notes).trim())}</div>` : ''}</div>
    <div class="frame">${renderSlide(s, ctx)}</div>
  </section>`).join('');

  const head = `
  <div class="deck-head">
    <h1>${esc(ctx.deck.title)}</h1>
    <p>${esc(ctx.deck.audience.who)} — 全 ${total} 枚 / ${CANVAS.w}×${CANVAS.h} · ← → でページ送り、g で一覧</p>
  </div>`;

  const fontLinks = ctx.webfonts
    .map((u) => `<link rel="stylesheet" href="${esc(u)}">`)
    .join('\n');

  const doc = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=${CANVAS.w}">
<title>${esc(ctx.deck.title)}</title>
${fontLinks}
<style>${css(ctx)}${spaCss(ctx)}</style>
</head><body class="deck" data-slides="${total}">${head}
<main>${sections}
</main>${navScript(total)}</body></html>`;

  return { pages: { 'index.html': doc }, assets: ctx.assets };
}
