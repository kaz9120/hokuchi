// render.mjs — derive pixel layout from declared intent and emit static HTML/SVG.
//
// The write side declares intent (idea / text / nodes / message); this module
// derives every pixel. Layout is a measure/compose two-pass (ADR-0014):
//   measure — each lead element reports the box it wants (ideal aspect or
//             content-hugging height) given the available constraints;
//   compose — the stage stacks headline + lead, hands the leftover height to
//             whitespace at the optical centre, and never letterboxes.
// Composition knowledge (ratios, optical centre, whitespace split) lives HERE
// as implementation detail — never in the schema, the theme, or the SPEC.
// Other renderer duties: slot resolution, type-scale tokens, BudouX phrase
// wrapping (SPEC §8.6), shared chart scales.

import fs from 'node:fs';
import path from 'node:path';
import { loadDefaultJapaneseParser } from 'budoux';
import hljs from 'highlight.js';
import { iconExists, iconInner, promoteWeight } from './icons.mjs';

const parser = loadDefaultJapaneseParser();

// ---------------------------------------------------------------------------
// Canvas + composition constants (ADR-0014 — renderer-internal, not spec)
// ---------------------------------------------------------------------------
const CANVAS = { w: 1280, h: 720 };
const MARGIN = { x: 96, y: 64 }; // 外周のみ。レターボックスという概念は持たない

const OPTICAL = 0.45;      // 使い残した高さの上:下 配分 (光学中心 — 幾何中心よりわずかに上)
const HEAD_GAP = 40;       // headline 帯と主役の間
const RING_ASPECT = 1.1;   // flow.cycle の箱の理想 w/h — カードが横長なぶん、わずかに横広が釣り合う
const RING_ECC_MAX = 1.15; // 環の離心率上限。これ以内ならノードは正多角形の頂点に見える
const PLOT_ASPECT = { trend: 2.0, comparison: 1.6, distribution: 1.6 }; // プロット領域の理想 w/h
const CHART_PAD = { l: 84, r: 60, t: 26, b: 64 }; // 軸ラベルがプロットの外側に要する余白

// Type-scale defaults mirror theme.schema.json so a theme that omits a token
// still renders. Present tokens in the theme win.
const DEFAULT_SCALE = {
  hero: 80, title: 74, big: 70, quote: 46, heading: 34,
  bullet: 34, subtitle: 30, attribution: 24, node: 24, axis: 20,
  code: 22,
};

// theme.type.mono is a material typeface, not a voice slot (ADR-0016, SPEC
// §2.3) — an unset theme falls back to this renderer-owned mono stack.
const DEFAULT_MONO_STACK = '"SF Mono", "Consolas", "DejaVu Sans Mono", monospace';

// Named-pattern slot maps (SPEC §5.1). Elements enter a slot by `slot:`.
const PATTERN_SLOTS = {
  'statement-stage': ['statement', 'support'],
  'title-stage': ['title', 'subtitle'],
  'diagram-stage': ['headline', 'diagram'],
  'chart-stage': ['headline', 'chart'],
  'list-stage': ['headline', 'list'],
  'quote-stage': ['quote'],
  'profile-stage': ['portrait', 'name', 'affiliation', 'handle', 'bio'],
  'image-stage': ['headline', 'image'],
  'code-stage': ['headline', 'code'],
  'post-stage': ['headline', 'post'],
  'link-stage': ['headline', 'link'],
  'stat-stage': ['headline', 'stat'],
  'table-stage': ['headline', 'table'],
  'versus-stage': ['headline', 'versus'],
  'agenda-stage': ['headline', 'agenda'],
  'video-stage': ['headline', 'video'],
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
    grid: { rows: T.grid.rows ?? 6, pattern: T.grid.pattern },
    scale: { ...DEFAULT_SCALE, ...(T.type.scale || {}) },
    scales: deckRoot.deck.scales || {},
    fonts: {
      display: T.type.display.family,
      body: T.type.body.family,
      wDisplay: T.type.display.weight,
      wBody: T.type.body.weight,
      mono: T.type.mono?.family || DEFAULT_MONO_STACK,
      wMono: T.type.mono?.weight || 400,
    },
    webfonts: T.type.webfonts || [],
    background: P.background,
    brand: T.brand || null,
    iconWeight: T.icon_weight || 'regular',
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

/** Stage rectangle: the canvas inset by the outer margin. How the inside is
 * divided (headline band, lead box, whitespace) is decided by compose per
 * pattern — letterboxing is not a concept any more (ADR-0014). */
function stageRect() {
  return { x: MARGIN.x, y: MARGIN.y, w: CANVAS.w - MARGIN.x * 2, h: CANVAS.h - MARGIN.y * 2 };
}

// ---------------------------------------------------------------------------
// Text: escaping, emphasis, BudouX phrase wrapping (SPEC §8.5)
// ---------------------------------------------------------------------------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cpLen = (s) => [...s].length;
/** Rough text width in px: CJK ≈ 1.04em, ASCII/half-width ≈ 0.56em. */
const estW = (s, fs) => [...String(s)].reduce((t, ch) => t + (ch.codePointAt(0) < 0x2000 ? 0.56 : 1.04), 0) * fs;

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
// Composition helpers (ADR-0014 — measure/compose)
// ---------------------------------------------------------------------------
const boxStyle = (r) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
const round = (n) => Math.round(n * 100) / 100;

/** maxW×maxH に収まり、アスペクト (w/h) が ideal になる最大の矩形。
 * 中身の申告 (measure) だけが箱の形を決める。 */
function fitAspect(ideal, maxW, maxH) {
  let w = maxW, h = w / ideal;
  if (h > maxH) { h = maxH; w = h * ideal; }
  return { w: round(w), h: round(h) };
}

// ---------------------------------------------------------------------------
// Diagram rendering (SPEC §6.4)
// ---------------------------------------------------------------------------

/**
 * One node card: rounded rect + optional number badge + a vertically centred
 * stack of [icon] label [detail]. Shared by the step row (linear forms) and
 * the cycle ring. (x, y) is the card's top-left corner. Icon weight derives
 * from the theme; emphasis promotes it one step heavier (ADR-0013).
 */
function nodeCard(ctx, { x, y, w, h, hot, label, detail, icon, badge }) {
  const { C, fonts, scale } = ctx;
  // Shrink text that would touch the card borders (keeps inner whitespace).
  const fitFs = (base, text, avail) => {
    const tw = estW(text, base);
    return tw > avail ? Math.max(15, Math.floor(base * avail / tw)) : base;
  };
  const fsL = fitFs(hot ? scale.node + 2 : scale.node, label, w - 30);
  const fsD = detail ? fitFs(scale.axis, detail, w - 26) : scale.axis;
  const cx = x + w / 2;
  const iconSize = 34, iconGap = 14;
  const detailGap = scale.axis * 1.75;
  const drawIcon = icon && iconExists(icon); // unknown names: icon-exists lint reports, render skips
  const blockH = (drawIcon ? iconSize + iconGap : 0) + fsL + (detail ? detailGap + scale.axis * 0.3 : 0);
  let cursor = y + (h - blockH) / 2;

  let iconSvg = '';
  if (drawIcon) {
    const weight = hot ? promoteWeight(ctx.iconWeight) : ctx.iconWeight;
    iconSvg = `<svg x="${round(cx - iconSize / 2)}" y="${round(cursor)}" width="${iconSize}" height="${iconSize}"
      viewBox="0 0 256 256" fill="${hot ? C.highlight : C.text}">${iconInner(icon, weight)}</svg>`;
    cursor += iconSize + iconGap;
  }
  const labelY = cursor + fsL * 0.82;
  return `<g>
    <rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="18"
      fill="${C.surface}" stroke="${hot ? C.highlight : C.line}" stroke-width="${hot ? 3 : 2}"/>
    ${badge != null ? `<circle cx="${round(x + 30)}" cy="${round(y + 30)}" r="15" fill="${hot ? C.highlight : C.muted}"/>
    <text x="${round(x + 30)}" y="${round(y + 36)}" text-anchor="middle" fill="${C.bg}"
      font-size="17" font-weight="700" font-family='${fonts.display}'>${badge}</text>` : ''}
    ${iconSvg}
    <text x="${round(cx)}" y="${round(labelY)}" text-anchor="middle" fill="${hot ? C.textStrong : C.text}"
      font-size="${fsL}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(label)}</text>
    ${detail ? `<text x="${round(cx)}" y="${round(labelY + detailGap)}" text-anchor="middle"
      fill="${C.muted}" font-size="${fsD}" font-family='${fonts.body}'>${esc(detail)}</text>` : ''}
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

/**
 * Cycle edge as an arc of the ring ellipse itself (not a bulged curve):
 * the arrow travels along the ring from where it leaves card `a` to where it
 * reaches card `b`, so connections are tangent to the ring and the arrowhead
 * never digs into a card. Entry/exit angles are found by walking the ellipse
 * numerically until the point clears the card rectangle (+padding).
 */
function ringArcEdge(a, b, ring, rects, ctx) {
  const { C } = ctx;
  const TAU = 2 * Math.PI;
  const ptAt = (t) => ({ x: ring.cx + ring.rx * Math.cos(t), y: ring.cy + ring.ry * Math.sin(t) });
  const inRect = (p, r, pad) =>
    p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

  const step = Math.PI / 180;
  let t0 = a.ang, guard = 0;
  while (inRect(ptAt(t0), rects[a.id], 10) && guard++ < 360) t0 += step;
  let t1 = a.ang + ((b.ang - a.ang + 2 * TAU) % TAU), guardB = 0;
  while (inRect(ptAt(t1), rects[b.id], 16) && guardB++ < 360) t1 -= step; // extra room for the arrowhead
  if (t1 - t0 < step * 4) return null; // cards (nearly) touch — no drawable arc

  const s = ptAt(t0), e = ptAt(t1);
  const large = t1 - t0 > Math.PI ? 1 : 0;
  const path = `<path d="M ${round(s.x)} ${round(s.y)} A ${round(ring.rx)} ${round(ring.ry)} 0 ${large} 1 ${round(e.x)} ${round(e.y)}"
    fill="none" stroke="${C.muted}" stroke-width="3" marker-end="${markerRef(ctx)}"/>`;

  // Label at mid-arc, pushed outward along the ring normal; the anchor makes
  // the text extend away from the ring so it clears neighbouring cards.
  const pm = ptAt((t0 + t1) / 2);
  let nx = pm.x - ring.cx, ny = pm.y - ring.cy;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl; ny /= nl;
  const label = {
    x: pm.x + nx * 24,
    y: pm.y + ny * 24 + (ny > 0.3 ? 16 : ny < -0.3 ? -4 : 6),
    anchor: nx < -0.35 ? 'end' : nx > 0.35 ? 'start' : 'middle',
  };
  return { path, label };
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
  const hasIcon = el.nodes.some((nd) => nd.icon);
  const usable = box.w * 0.94; // side margins keep the row off the stage edges
  const gap = Math.min(56, usable * 0.05);
  const cardW = Math.min(350, (usable - gap * (n - 1)) / n);
  const cardH = (hasDetail ? 150 : 108) + (hasIcon ? 44 : 0);
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
    cardSvg += nodeCard(ctx, {
      x: p.x, y, w: cardW, h: cardH,
      hot: emph.has(nd.id), label: nd.label, detail: nd.detail, icon: nd.icon, badge: i + 1,
    });
  });

  return `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
    ${arrowDef}<g>${edgeSvg}</g><g>${cardSvg}</g></svg>`;
}

/** Uniform card metrics for a node set (matrix / dag / radial / cycle). */
function cardMetrics(el, ctx, { minW = 180, maxW = 330 } = {}) {
  const { scale } = ctx;
  const hasDetail = el.nodes.some((nd) => nd.detail);
  const hasIcon = el.nodes.some((nd) => nd.icon);
  const w = Math.min(maxW, Math.max(minW, ...el.nodes.map((nd) => Math.max(
    estW(nd.label, scale.node + 2),
    nd.detail ? estW(nd.detail, scale.axis) : 0
  ) + 56)));
  const h = (hasDetail ? 130 : 96) + (hasIcon ? 44 : 0);
  return { w, h };
}

/** Point where the segment from rect-centre p toward q exits p's padded rect. */
function exitRect(p, q, rect, pad) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const tx = dx > 0 ? (rect.x + rect.w + pad - p.x) / dx : dx < 0 ? (rect.x - pad - p.x) / dx : Infinity;
  const ty = dy > 0 ? (rect.y + rect.h + pad - p.y) / dy : dy < 0 ? (rect.y - pad - p.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: p.x + dx * t, y: p.y + dy * t };
}

/**
 * Diagram measure (ADR-0014): report the box the form wants.
 *   flow.cycle                          → near-square ring (RING_ASPECT)
 *   radial.core                         → near-square, hub + spokes
 *   structure.layer                     → stacked bands hugging their height
 *   structure.matrix                    → 2-column card grid
 *   structure.tree / flow.branch / flow.converge → depth-columned DAG
 *   everything else                     → ordered step row spanning the stage
 */
function measureDiagram(el, ctx, avail) {
  switch (el.form) {
    case 'flow.cycle': {
      const box = fitAspect(RING_ASPECT, avail.w, avail.h);
      return { ...box, render: (b) => renderCycle(el, b, ctx) };
    }
    case 'radial.core': {
      // ハブの左右に周辺カードが並ぶぶん、箱の幅はカード寸法から導出する
      // (中心 + 左右 1 枚ずつ = 3 カード幅 + 間隔)。高さは使い切って環を稼ぐ。
      const card = cardMetrics(el, ctx);
      const w = Math.min(avail.w, card.w * 3 + 120);
      return { w, h: avail.h, render: (b) => renderRadial(el, b, ctx, card) };
    }
    case 'structure.layer': return measureLayer(el, ctx, avail);
    case 'structure.matrix': return measureMatrix(el, ctx, avail);
    case 'structure.tree':
    case 'flow.branch':
    case 'flow.converge': return measureDag(el, ctx, avail);
    case 'cluster.overlap': return measureOverlap(el, ctx, avail);
    case 'cluster.enclosed': return measureEnclosed(el, ctx, avail);
    case 'cluster.closure':
    case 'cluster.linked': {
      // 環の正多角形頂点に置く。closure は境界も線も描かず、配置だけで
      // 群を知覚させる (ゲシュタルトの閉合)。linked は宣言された edges を
      // 矢印なしの線で結ぶ。
      const box = fitAspect(RING_ASPECT, avail.w, avail.h);
      return { ...box, render: (b) => renderRingCluster(el, b, ctx) };
    }
    default: {
      const hasDetail = el.nodes.some((nd) => nd.detail);
      const hasIcon = el.nodes.some((nd) => nd.icon);
      const cardH = (hasDetail ? 150 : 108) + (hasIcon ? 44 : 0);
      const h = Math.min(avail.h, cardH + 32);
      return { w: avail.w, h, render: (b) => renderStepRow(el, b, ctx, arrowDefFor(ctx, ctx.C)) };
    }
  }
}

const svgLead = (box, inner) =>
  `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">${inner}</svg>`;

/**
 * structure.layer — full-width bands stacked in declaration order (top→down).
 * A layer diagram reads by adjacency, not by arrows, so edges are not drawn.
 */
function measureLayer(el, ctx, avail) {
  const { scale } = ctx;
  const hasDetail = el.nodes.some((nd) => nd.detail);
  const hasIcon = el.nodes.some((nd) => nd.icon);
  const bandH = (hasDetail ? 108 : 76) + (hasIcon ? 44 : 0);
  const bandW = Math.min(820, Math.max(460, ...el.nodes.map((nd) => Math.max(
    estW(nd.label, scale.node + 2),
    nd.detail ? estW(nd.detail, scale.axis) : 0
  ) + 140)));
  const gap = 16;
  const n = el.nodes.length;
  const h = Math.min(avail.h, n * bandH + (n - 1) * gap);
  return {
    w: bandW, h,
    render: (box) => {
      const emph = new Set(el.emphasis || []);
      // measure が高さで切り詰めた場合は帯を等率で縮める
      const bh = Math.min(bandH, (box.h - (n - 1) * gap) / n);
      let svg = '';
      el.nodes.forEach((nd, i) => {
        svg += nodeCard(ctx, {
          x: 0, y: i * (bh + gap), w: box.w, h: bh,
          hot: emph.has(nd.id), label: nd.label, detail: nd.detail, icon: nd.icon, badge: null,
        });
      });
      return svgLead(box, svg);
    },
  };
}

/** structure.matrix — cards in a 2-column grid (2×2 for the canonical four). */
function measureMatrix(el, ctx, avail) {
  const card = cardMetrics(el, ctx, { minW: 240, maxW: 360 });
  const rows = Math.ceil(el.nodes.length / 2);
  const { cardH, gap } = fitRows(rows, card.h, 22, avail.h);
  const w = card.w * 2 + gap;
  const h = Math.min(avail.h, rows * cardH + (rows - 1) * gap);
  return {
    w, h,
    render: (box) => {
      const emph = new Set(el.emphasis || []);
      let svg = '';
      el.nodes.forEach((nd, i) => {
        svg += nodeCard(ctx, {
          x: (i % 2) * (card.w + gap), y: Math.floor(i / 2) * (cardH + gap),
          w: card.w, h: cardH,
          hot: emph.has(nd.id), label: nd.label, detail: nd.detail, icon: nd.icon, badge: null,
        });
      });
      return svgLead(box, svg);
    },
  };
}

/**
 * Depth columns for tree / branch / converge: a node's column is the longest
 * edge path from a root. Declaration order is preserved inside a column.
 */
function dagColumns(el) {
  const memo = new Map();
  const incoming = new Map(el.nodes.map((n) => [n.id, []]));
  for (const e of el.edges || []) {
    if (incoming.has(e.to) && incoming.has(e.from)) incoming.get(e.to).push(e.from);
  }
  const depth = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0; // サイクルは深さ 0 に落として描画は続ける (form の誤用)
    seen.add(id);
    const ins = incoming.get(id);
    const d = ins.length ? Math.max(...ins.map((f) => depth(f, seen))) + 1 : 0;
    memo.set(id, d);
    return d;
  };
  const cols = [];
  for (const n of el.nodes) (cols[depth(n.id, new Set())] ??= []).push(n);
  return cols.filter(Boolean);
}

/** 縦に rows 枚積んだとき avail.h に収まる (cardH, gap)。gap → cardH の順に縮める。 */
function fitRows(rows, cardH, gap, availH, { minGap = 16, minCardH = 88 } = {}) {
  if (rows * cardH + (rows - 1) * gap <= availH) return { cardH, gap };
  if (rows > 1) gap = Math.max(minGap, (availH - rows * cardH) / (rows - 1));
  if (rows * cardH + (rows - 1) * gap > availH) {
    cardH = Math.max(minCardH, (availH - (rows - 1) * gap) / rows);
  }
  return { cardH, gap };
}

function measureDag(el, ctx, avail) {
  const cols = dagColumns(el);
  const card = cardMetrics(el, ctx, { minW: 190, maxW: 300 });
  let cardW = card.w;
  const nCols = cols.length;
  // カラム間はステージ幅へ向けて広げる (上限 240 — S 字カーブの見せ場と
  // 呼吸の余白。2026-07-08 レビュー指摘)。入り切らなければ詰め、次にカード幅を縮める。
  let colGap = 90;
  if (nCols > 1) {
    colGap = Math.max(48, Math.min(240, (avail.w - nCols * cardW) / (nCols - 1)));
    if (nCols * cardW + (nCols - 1) * colGap > avail.w) {
      cardW = (avail.w - (nCols - 1) * colGap) / nCols;
    }
  }
  const maxRows = Math.max(...cols.map((c) => c.length));
  const { cardH, gap: rowGap } = fitRows(maxRows, card.h, 26, avail.h);
  const w = Math.min(avail.w, nCols * cardW + (nCols - 1) * colGap);
  const h = Math.min(avail.h, maxRows * cardH + (maxRows - 1) * rowGap);
  return {
    w, h,
    render: (box) => renderDag(el, box, ctx, { cols, cardW, cardH, colGap, rowGap }),
  };
}

function renderDag(el, box, ctx, { cols, cardW, cardH, colGap, rowGap }) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  const pos = {};
  cols.forEach((col, ci) => {
    const colH = col.length * cardH + (col.length - 1) * rowGap;
    const y0 = (box.h - colH) / 2;
    col.forEach((nd, ri) => {
      pos[nd.id] = { ...nd, x: ci * (cardW + colGap), y: y0 + ri * (cardH + rowGap) };
    });
  });

  // 同じノードへ流入する複数エッジは、手前の合流点で 1 本に束ねる。
  // 各カードの矢尻が 1 つになり (複数の矢尻は団子に見える。レビュー指摘
  // 2026-07-08)、到達点も左辺の中央 1 点に揃う。
  const inCount = {};
  for (const e of el.edges || []) {
    if (pos[e.from] && pos[e.to]) inCount[e.to] = (inCount[e.to] || 0) + 1;
  }
  let edgeSvg = '';
  const junctionDrawn = new Set();
  for (const e of el.edges || []) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const x1 = a.x + cardW + 5, y1 = a.y + cardH / 2;
    const xEnd = b.x - 7, yEnd = b.y + cardH / 2;
    if (xEnd <= x1) continue; // 同列・逆行は描かない (form の誤用)
    const merged = inCount[e.to] >= 2;
    // 合流点: カード左辺の少し手前。ここまでは矢尻なしの曲線で集め、
    // 合流点からカードへの短い直線 1 本だけが矢尻を持つ
    const x2 = merged ? xEnd - 30 : xEnd;
    // 高さが変わるエッジは S 字カーブ: 水平に出て水平に入る (制御点は中間 x)。
    // 矢印はカードへ水平に刺さり、斜めの直線より視線の流れが柔らかい。
    const mx = round((x1 + x2) / 2);
    edgeSvg += `<path d="M ${round(x1)} ${round(y1)} C ${mx} ${round(y1)}, ${mx} ${round(yEnd)}, ${round(x2)} ${round(yEnd)}"
      fill="none" stroke="${C.muted}" stroke-width="3"${merged ? '' : ` marker-end="${markerRef(ctx)}"`}/>`;
    if (merged && !junctionDrawn.has(e.to)) {
      junctionDrawn.add(e.to);
      edgeSvg += `<line x1="${round(x2)}" y1="${round(yEnd)}" x2="${round(xEnd)}" y2="${round(yEnd)}"
        stroke="${C.muted}" stroke-width="3" marker-end="${markerRef(ctx)}"/>`;
    }
    if (e.label) {
      edgeSvg += `<text x="${mx}" y="${round((y1 + yEnd) / 2 - 10)}" text-anchor="middle" fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(e.label)}</text>`;
    }
  }

  let cardSvg = '';
  for (const id of Object.keys(pos)) {
    const p = pos[id];
    cardSvg += nodeCard(ctx, {
      x: p.x, y: p.y, w: cardW, h: cardH,
      hot: emph.has(id), label: p.label, detail: p.detail, icon: p.icon, badge: null,
    });
  }
  return svgLead(box, `${arrowDefFor(ctx, C)}<g>${edgeSvg}</g><g>${cardSvg}</g>`);
}

/**
 * cluster.overlap — translucent circles sharing an overlap (Venn)。
 * 3 nodes take the classic triangle arrangement; any other count reads as a
 * horizontal chain where each circle overlaps its neighbour.
 */
function measureOverlap(el, ctx, avail) {
  const { scale } = ctx;
  const n = el.nodes.length;
  const DIST = 1.35; // 中心間距離 / 半径 — 重なり ~30%
  let r, w, h;
  if (n === 3) {
    const side = (rr) => rr * DIST;
    r = Math.min(210, (avail.h) / (2 + DIST * 0.866), (avail.w) / (2 + DIST));
    w = 2 * r + side(r);
    h = 2 * r + side(r) * 0.866;
  } else {
    r = Math.min(210, avail.h / 2, avail.w / (2 + (n - 1) * DIST));
    w = 2 * r + (n - 1) * DIST * r;
    h = 2 * r;
  }
  return {
    w: round(w), h: round(h),
    render: (box) => renderOverlap(el, box, ctx, { r, DIST }),
  };
}

function renderOverlap(el, box, ctx, { r, DIST }) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  const s = DIST * r;

  let centers;
  if (n === 3) {
    const cx = box.w / 2;
    centers = [
      { x: cx, y: r },
      { x: cx - s / 2, y: r + s * 0.866 },
      { x: cx + s / 2, y: r + s * 0.866 },
    ];
  } else {
    centers = el.nodes.map((_, i) => ({ x: r + i * s, y: box.h / 2 }));
  }
  // ラベルは重心から外向きに逃がすと、重なり領域と喧嘩しない
  const gx = centers.reduce((t, c) => t + c.x, 0) / n;
  const gy = centers.reduce((t, c) => t + c.y, 0) / n;

  // 交差領域 (ADR-0015): shared 宣言があれば、全円の共通部分を clipPath の
  // 入れ子で塗り、ラベルを領域の中心に置く。ベン図の主役はしばしばここ。
  let sharedSvg = '';
  if (el.shared) {
    // 円の重心 = 共通部分のほぼ中心 (2 円は中点、3 円は重心)。ベースライン
    // 描画なので、視覚中心に合わせてわずかに下げる
    const sx = gx, sy = gy + 8;
    if (el.shared.emphasis) {
      let inner = `<circle cx="${round(centers[n - 1].x)}" cy="${round(centers[n - 1].y)}" r="${round(r)}"
        fill="${C.highlight}" fill-opacity="0.16"/>`;
      let defs = '';
      for (let i = 0; i < n - 1; i++) {
        const id = `ov-${ctx.slideKey}-${i}`;
        defs += `<clipPath id="${id}"><circle cx="${round(centers[i].x)}" cy="${round(centers[i].y)}" r="${round(r)}"/></clipPath>`;
        inner = `<g clip-path="url(#${id})">${inner}</g>`;
      }
      sharedSvg += `<defs>${defs}</defs>${inner}`;
    }
    if (el.shared.label) {
      sharedSvg += `<text x="${round(sx)}" y="${round(sy + 7)}" text-anchor="middle"
        fill="${el.shared.emphasis ? C.highlight : C.muted}" font-size="${scale.axis}"
        font-weight="${el.shared.emphasis ? fonts.wDisplay : 'inherit'}" font-family='${fonts.display}'>${esc(el.shared.label)}</text>`;
    }
  }

  let circleSvg = '', labelSvg = '';
  el.nodes.forEach((nd, i) => {
    const c = centers[i];
    const hot = emph.has(nd.id);
    circleSvg += `<circle cx="${round(c.x)}" cy="${round(c.y)}" r="${round(r)}"
      fill="${C.surface}" fill-opacity="0.55" stroke="${hot ? C.highlight : C.line}" stroke-width="${hot ? 3 : 2.5}"/>`;
    let dx = c.x - gx, dy = c.y - gy;
    const dl = Math.hypot(dx, dy) || 1;
    const lx = c.x + (dx / dl) * r * 0.32;
    const ly = c.y + (dy / dl) * r * 0.32;
    const fitFs = (base, text) => {
      const tw = estW(text, base);
      const availW = r * 1.3;
      return tw > availW ? Math.max(15, Math.floor(base * availW / tw)) : base;
    };
    const fsL = fitFs(hot ? scale.node + 2 : scale.node, nd.label);
    labelSvg += `<text x="${round(lx)}" y="${round(ly)}" text-anchor="middle" fill="${hot ? C.textStrong : C.text}"
      font-size="${fsL}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(nd.label)}</text>`;
    if (nd.detail) {
      labelSvg += `<text x="${round(lx)}" y="${round(ly + scale.axis * 1.6)}" text-anchor="middle" fill="${C.muted}"
        font-size="${fitFs(scale.axis, nd.detail)}" font-family='${fonts.body}'>${esc(nd.detail)}</text>`;
    }
  });
  // 描画順: 円 → 交差の塗り (円の上) → ラベル (最前面)
  return svgLead(box, `<g>${circleSvg}</g><g>${sharedSvg}</g><g>${labelSvg}</g>`);
}

/**
 * cluster.enclosed — nodes[0] is the boundary (a labelled container), the
 * rest sit inside as a row of member cards.
 */
function measureEnclosed(el, ctx, avail) {
  const [group, ...members] = el.nodes;
  const card = cardMetrics({ nodes: members }, ctx, { minW: 170, maxW: 280 });
  const gap = 24, padX = 36, padB = 32;
  const headH = group.detail ? 96 : 66;
  const k = members.length;
  let cardW = card.w;
  let w = k * cardW + (k - 1) * gap + padX * 2;
  if (w > avail.w) {
    cardW = (avail.w - padX * 2 - (k - 1) * gap) / k;
    w = avail.w;
  }
  const h = Math.min(avail.h, headH + card.h + padB);
  return {
    w: round(w), h: round(h),
    render: (box) => renderEnclosed(el, box, ctx, { members, cardW, cardH: card.h, gap, padX, headH }),
  };
}

function renderEnclosed(el, box, ctx, { members, cardW, cardH, gap, padX, headH }) {
  const { C, fonts, scale } = ctx;
  const [group] = el.nodes;
  const emph = new Set(el.emphasis || []);
  const hotGroup = emph.has(group.id);
  const cx = box.w / 2;
  let svg = `<rect x="0" y="0" width="${round(box.w)}" height="${round(box.h)}" rx="22"
    fill="${C.surface}" fill-opacity="0.45" stroke="${hotGroup ? C.highlight : C.line}" stroke-width="${hotGroup ? 3 : 2}"/>`;
  svg += `<text x="${round(cx)}" y="${round(headH - (group.detail ? scale.axis * 1.9 : 0) - 24)}" text-anchor="middle"
    fill="${hotGroup ? C.textStrong : C.text}" font-size="${scale.node + 2}" font-weight="${fonts.wDisplay}"
    font-family='${fonts.display}'>${esc(group.label)}</text>`;
  if (group.detail) {
    svg += `<text x="${round(cx)}" y="${round(headH - 26)}" text-anchor="middle" fill="${C.muted}"
      font-size="${scale.axis}" font-family='${fonts.body}'>${esc(group.detail)}</text>`;
  }
  const rowW = members.length * cardW + (members.length - 1) * gap;
  const x0 = (box.w - rowW) / 2;
  members.forEach((nd, i) => {
    svg += nodeCard(ctx, {
      x: x0 + i * (cardW + gap), y: headH, w: cardW, h: cardH,
      hot: emph.has(nd.id), label: nd.label, detail: nd.detail, icon: nd.icon, badge: null,
    });
  });
  return svgLead(box, svg);
}

/** cluster.closure / linked — ring placement; linked draws undirected lines. */
function renderRingCluster(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const card = cardMetrics(el, ctx);
  const emph = new Set(el.emphasis || []);
  const { pos } = ringPositions(el, box, card.w, card.h);
  const byId = Object.fromEntries(pos.map((n) => [n.id, n]));
  const rectFor = (p) => ({ x: p.x - card.w / 2, y: p.y - card.h / 2, w: card.w, h: card.h });

  let lineSvg = '';
  for (const e of el.edges || []) {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const p1 = exitRect(a, b, rectFor(a), 6);
    const p2 = exitRect(b, a, rectFor(b), 6);
    lineSvg += `<line x1="${round(p1.x)}" y1="${round(p1.y)}" x2="${round(p2.x)}" y2="${round(p2.y)}"
      stroke="${C.muted}" stroke-width="2.5" opacity="0.7"/>`;
    if (e.label) {
      // ラベルは線上ではなく、線の法線方向・環の外側へ逃がす (レビュー指摘 2026-07-08)
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dl = Math.hypot(dx, dy) || 1;
      let nx = -dy / dl, ny = dx / dl;
      if (nx * (mx - box.w / 2) + ny * (my - box.h / 2) < 0) { nx = -nx; ny = -ny; }
      lineSvg += `<text x="${round(mx + nx * 18)}" y="${round(my + ny * 18 + 6)}" text-anchor="middle"
        fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(e.label)}</text>`;
    }
  }

  let cardSvg = '';
  for (const n of pos) {
    const rc = rectFor(n);
    cardSvg += nodeCard(ctx, {
      x: rc.x, y: rc.y, w: rc.w, h: rc.h,
      hot: emph.has(n.id), label: n.label, detail: n.detail, icon: n.icon, badge: null,
    });
  }
  return svgLead(box, `<g>${lineSvg}</g><g>${cardSvg}</g>`);
}

/**
 * radial.core — nodes[0] is the hub, the rest sit at regular-polygon vertices
 * on the ring. Unlike cycle, the ring's eccentricity is not capped: the hub
 * occupies the middle, so satellites need the full horizontal reach to clear
 * it. Declared edges are drawn as arrows; with no edges the geometry itself
 * supplies plain spokes.
 */
function renderRadial(el, box, ctx, card) {
  const { C } = ctx;
  const [core, ...sats] = el.nodes;
  const emph = new Set(el.emphasis || []);
  const cx = box.w / 2, cy = box.h / 2;
  const ring = {
    rx: box.w / 2 - card.w / 2 - 4,
    ry: Math.max(40, box.h / 2 - card.h / 2 - 4),
  };

  const rectFor = (p) => ({ x: p.x - card.w / 2, y: p.y - card.h / 2, w: card.w, h: card.h });
  const pts = { [core.id]: { ...core, x: cx, y: cy } };
  sats.forEach((n, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / sats.length;
    pts[n.id] = { ...n, x: cx + ring.rx * Math.cos(ang), y: cy + ring.ry * Math.sin(ang) };
  });

  let lineSvg = '';
  if ((el.edges || []).length > 0) {
    for (const e of el.edges) {
      const a = pts[e.from], b = pts[e.to];
      if (!a || !b) continue;
      const p1 = exitRect(a, b, rectFor(a), 8);
      const p2 = exitRect(b, a, rectFor(b), 14);
      lineSvg += `<line x1="${round(p1.x)}" y1="${round(p1.y)}" x2="${round(p2.x)}" y2="${round(p2.y)}" stroke="${C.muted}" stroke-width="3" marker-end="${markerRef(ctx)}"/>`;
    }
  } else {
    for (const n of sats) {
      const p = pts[n.id];
      const p1 = exitRect(pts[core.id], p, rectFor(pts[core.id]), 8);
      const p2 = exitRect(p, pts[core.id], rectFor(p), 8);
      lineSvg += `<line x1="${round(p1.x)}" y1="${round(p1.y)}" x2="${round(p2.x)}" y2="${round(p2.y)}" stroke="${C.muted}" stroke-width="2" opacity="0.6"/>`;
    }
  }

  let cardSvg = '';
  for (const n of el.nodes) {
    const p = pts[n.id];
    const rc = rectFor(p);
    cardSvg += nodeCard(ctx, {
      x: rc.x, y: rc.y, w: rc.w, h: rc.h,
      hot: emph.has(n.id), label: n.label, detail: n.detail, icon: n.icon, badge: null,
    });
  }
  return svgLead(box, `${arrowDefFor(ctx, C)}<g>${lineSvg}</g><g>${cardSvg}</g>`);
}

/**
 * Cards at regular-polygon vertices on a near-circular ring (eccentricity
 * capped by RING_ECC_MAX). Shared by cycle / closure / linked.
 */
function ringPositions(el, box, cardW, cardH) {
  const rx0 = box.w / 2 - cardW / 2 - 4;
  const ry0 = Math.max(40, box.h / 2 - cardH / 2 - 4);
  const r = Math.min(rx0, ry0);
  const ring = {
    cx: box.w / 2, cy: box.h / 2,
    rx: Math.min(rx0, r * RING_ECC_MAX), ry: Math.min(ry0, r * RING_ECC_MAX),
  };
  const pos = el.nodes.map((n, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / el.nodes.length;
    return { ...n, ang, x: ring.cx + ring.rx * Math.cos(ang), y: ring.cy + ring.ry * Math.sin(ang) };
  });
  return { ring, pos };
}

function renderCycle(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);

  const arrowDef = arrowDefFor(ctx, C);

  // cycle: cards on a near-circular ring, edges as arcs of the ring itself.
  // Cards get no number badge — a loop has no first step; sequence reads from
  // arrows. Nodes sit at regular-polygon vertices so a 3-node cycle reads as
  // an equilateral triangle, not a flattened one.
  const { w: cardW, h: cardH } = cardMetrics(el, ctx);
  const { ring, pos } = ringPositions(el, box, cardW, cardH);
  const byId = Object.fromEntries(pos.map((n) => [n.id, n]));
  const rects = Object.fromEntries(pos.map((n) => [
    n.id, { x: n.x - cardW / 2, y: n.y - cardH / 2, w: cardW, h: cardH },
  ]));

  let edgeSvg = '';
  let labelSvg = ''; // labels sit on the top layer so cards never cover them
  for (const edge of el.edges || []) {
    const a = byId[edge.from], b = byId[edge.to];
    if (!a || !b) continue; // edge-ref lint reports this; render skips silently.
    const arc = ringArcEdge(a, b, ring, rects, ctx);
    if (!arc) continue;
    edgeSvg += arc.path;
    if (edge.label) {
      labelSvg += `<text x="${round(arc.label.x)}" y="${round(arc.label.y)}" text-anchor="${arc.label.anchor}"
        fill="${C.muted}" font-size="${scale.axis}" font-family='${fonts.body}'>${esc(edge.label)}</text>`;
    }
  }

  let nodeSvg = '';
  for (const n of pos) {
    nodeSvg += nodeCard(ctx, {
      x: n.x - cardW / 2, y: n.y - cardH / 2, w: cardW, h: cardH,
      hot: emph.has(n.id), label: n.label, detail: n.detail, icon: n.icon, badge: null,
    });
  }

  return `<svg class="lead" viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
    ${arrowDef}<g>${edgeSvg}</g><g>${nodeSvg}</g><g>${labelSvg}</g></svg>`;
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

/**
 * Chart measure (ADR-0014): the plot area wants an intent-specific aspect
 * (PLOT_ASPECT); the axis-label padding sits outside the plot as constants,
 * so the reported box is the padded plot.
 */
function measureChart(el, ctx, avail) {
  const pad = CHART_PAD;
  const ideal = PLOT_ASPECT[el.intent] ?? 1.6;
  const plotH = Math.min(avail.h - pad.t - pad.b, (avail.w - pad.l - pad.r) / ideal);
  return {
    w: round(plotH * ideal + pad.l + pad.r),
    h: round(plotH + pad.t + pad.b),
    render: (b) => renderChart(el, b, ctx),
  };
}

function renderChart(el, box, ctx) {
  const { C, fonts, scale } = ctx;
  const pad = CHART_PAD;
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
      // comparison は棒同士を離して並べ、distribution はヒストグラムとして
      // 隣接階級がほぼ接する (分布の連続性が読めるように)。
      const groupW = bandW * (el.intent === 'distribution' ? 0.92 : 0.6);
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
    // ラベルは折れ線が空けている側に置く。隣の点が高い側は線が上へ逃げる
    // ぶん下が空く。右下 (読み方向) を優先、次に左下、両方塞がっていれば上。
    const rightFree = isLine && i < cats.length - 1 && s0.values[i + 1] >= s0.values[i];
    const leftFree = isLine && i > 0 && s0.values[i - 1] >= s0.values[i];
    let ax, ay, anchor;
    if (rightFree || !isLine) { ax = px + 20; ay = py + 74; anchor = 'start'; }
    else if (leftFree) { ax = px - 20; ay = py + 74; anchor = 'end'; }
    else { ax = px + 20; ay = py - 62; anchor = 'start'; }
    const leaderY1 = ay > py ? py + 12 : py - 12;
    const leaderY2 = ay > py ? ay - 22 : ay + 8;
    emph += `<line x1="${round(px)}" y1="${round(leaderY1)}" x2="${round(ax)}" y2="${round(leaderY2)}" stroke="${C.highlight}" stroke-width="1.5" opacity="0.8"/>`;
    emph += `<text x="${round(ax)}" y="${round(ay)}" text-anchor="${anchor}" fill="${C.highlight}" font-size="${scale.node}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(ann.annotate)}</text>`;
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
// Code rendering (SPEC §6.7, ADR-0016) — code is a referenced material, not a
// voice: it gets its own mono typeface (theme.type.mono, DEFAULT_MONO_STACK
// otherwise) and a small, fixed syntax palette derived from the theme rather
// than a declared one (ADR-0014's "renderer owns composition" extended to
// "renderer owns highlight colour").
// ---------------------------------------------------------------------------

/** Monospace text width in px: half-width ≈ 0.6em, full-width (CJK) ≈ 1.0em
 * — coarser than estW's proportional-font ratios because mono glyphs are
 * fixed-width, but comments/filenames may still carry Japanese. */
const monoEstW = (s, fs) =>
  [...String(s)].reduce((t, ch) => t + (ch.codePointAt(0) < 0x2000 ? 0.6 : 1.0), 0) * fs;

/**
 * 1 起点の行番号 / "n-m" 範囲 (SPEC §6.7) を 0 起点の行インデックス集合に展開する。
 */
function expandLineRanges(ranges) {
  const set = new Set();
  for (const r of ranges || []) {
    if (typeof r === 'number') { set.add(r - 1); continue; }
    const [a, b] = String(r).split('-').map(Number);
    for (let i = a; i <= b; i++) set.add(i - 1);
  }
  return set;
}

/**
 * Split highlight.js's single-string output back into per-source-line HTML
 * fragments without breaking a <span> that a multi-line construct (block
 * comment, template string) leaves open across a line boundary: track the
 * open-tag stack and close/reopen it at each newline. This lets every source
 * line become its own element (needed for emphasis bands and per-line dim),
 * while still highlighting the snippet as one contiguous parse (needed for
 * multi-line tokens to resolve correctly).
 */
function splitHighlightedLines(html) {
  const tokens = html.split(/(<span class="[^"]*">|<\/span>)/);
  const lines = [];
  const stack = [];
  let cur = '';
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok === '</span>') { cur += tok; stack.pop(); continue; }
    const m = /^<span class="([^"]*)">$/.exec(tok);
    if (m) { cur += tok; stack.push(m[1]); continue; }
    const parts = tok.split('\n');
    parts.forEach((part, i) => {
      cur += part;
      if (i < parts.length - 1) {
        for (let j = stack.length - 1; j >= 0; j--) cur += '</span>';
        lines.push(cur);
        cur = stack.map((cls) => `<span class="${cls}">`).join('');
      }
    });
  }
  lines.push(cur);
  return lines;
}

/**
 * Per-line HTML for a general (non console/diff) language: highlight.js
 * tokenizes the whole snippet at once (so multi-line constructs stay
 * correct) and already HTML-escapes its output; an unregistered/plaintext
 * language falls back to one escaped line each, no tokenization.
 */
function highlightedLines(code, lang) {
  if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
    try {
      return splitHighlightedLines(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value);
    } catch { /* fall through to the plain-text path below */ }
  }
  return code.split('\n').map((l) => esc(l));
}

/**
 * Code measure (ADR-0014): report the box the panel wants from line count ×
 * line height and the longest line's estimated mono width, shrinking the
 * font (floor 15px) toward avail and — past the floor — accepting the box
 * getting capped rather than clipping content (the shrink philosophy shared
 * with measureList / cardMetrics).
 */
function measureCode(el, ctx, avail) {
  const { scale } = ctx;
  const raw = String(el.code ?? '').replace(/\n$/, '');
  const lines = raw.length ? raw.split('\n') : [''];
  const lang = el.lang || 'plaintext';
  const padX = 34, padY = 26;
  const labelH = el.filename ? 44 : 0;
  const minFs = 15;
  const lineHFor = (f) => Math.round(f * 1.5);
  const widthAt = (f) => Math.max(...lines.map((l) => monoEstW(l, f)));

  let fs = scale.code;
  while (fs > minFs && widthAt(fs) + padX * 2 > avail.w) fs -= 1;
  while (fs > minFs && lines.length * lineHFor(fs) + padY * 2 + labelH > avail.h) fs -= 1;

  const w = Math.min(avail.w, Math.max(480, widthAt(fs) + padX * 2));
  const h = Math.min(avail.h, lines.length * lineHFor(fs) + padY * 2 + labelH);
  return {
    w: round(w), h: round(h),
    render: () => renderCode(el, ctx, { lines, lang, fs, lineH: lineHFor(fs), padX, padY, labelH }),
  };
}

function renderCode(el, ctx, { lines, lang, fs, lineH, padX, padY, labelH }) {
  const { fonts } = ctx;
  const emphSet = expandLineRanges(el.emphasis);
  const hasEmphasis = emphSet.size > 0;

  let htmlLines, extraCls;
  if (lang === 'console') {
    // $ 行はプロンプト (text_strong)、それ以外は出力 (muted) として描き分ける
    // (SPEC §6.7)。トークン単位のハイライトはしない — 端末セッションは
    // コマンド言語を問わないため。
    htmlLines = lines.map((l) => esc(l));
    extraCls = (i) => (/^\s*\$/.test(lines[i]) ? 'cl-prompt' : 'cl-output');
  } else if (lang === 'diff') {
    // 先頭 1 文字で追加/削除を判定する (unified diff の素朴な読み方)。
    // ファイルヘッダ (+++/---) は対象外。
    htmlLines = lines.map((l) => esc(l));
    extraCls = (i) => {
      const l = lines[i];
      if (l.startsWith('+') && !l.startsWith('+++')) return 'cl-add';
      if (l.startsWith('-') && !l.startsWith('---')) return 'cl-del';
      return '';
    };
  } else {
    htmlLines = highlightedLines(lines.join('\n'), lang);
    extraCls = () => '';
  }

  const body = htmlLines.map((html, i) => {
    const cls = ['cl', extraCls(i)].filter(Boolean);
    if (emphSet.has(i)) cls.push('cl-em');
    else if (hasEmphasis) cls.push('cl-dim');
    return `<div class="${cls.join(' ')}" style="height:${lineH}px;line-height:${lineH}px">${html}</div>`;
  }).join('');

  const fileBar = el.filename
    ? `<div class="code-file" style="height:${labelH}px;line-height:${labelH}px">${esc(el.filename)}</div>`
    : '';

  return `<div class="code-panel">${fileBar}<div class="code-body" style="font-family:${fonts.mono};font-weight:${fonts.wMono};font-size:${fs}px;padding:${padY}px ${padX}px">${body}</div></div>`;
}

// ---------------------------------------------------------------------------
// Raw escape hatch (SPEC §6.15) — svg file / inline svg / inline html
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
  const stage = stageRect();
  // 光学中心: 箱の下端を 6% 削って flex 中央に置くと、内容の中心が
  // 幾何中心よりわずかに上に来る
  const pane = { ...stage, h: round(stage.h * 0.94) };
  const el = slide.elements.find((e) => e.slot === 'statement');
  const support = slide.elements.find((e) => e.slot === 'support');
  const token = (slide.role === 'opener' || slide.role === 'closer') ? 'hero' : 'big';
  const fs = ctx.scale[token];
  return `<div class="pane center" style="${boxStyle(pane)}">
    <div class="statement jp" style="font-size:${fs}px">${inlineText(el.text, el.emphasis)}</div>
    ${support ? `<div class="support jp" style="font-size:${ctx.scale.subtitle}px">${inlineText(support.text, support.emphasis)}</div>` : ''}
  </div>`;
}

function titleStage(slide, ctx) {
  const stage = stageRect();
  // タイトル群の下端はキャンバスの黄金分割 (上から 61.8%) に置く
  const band = { x: stage.x, y: stage.y, w: stage.w, h: round(CANVAS.h * 0.618 - stage.y) };
  const title = slide.elements.find((e) => e.slot === 'title');
  const sub = slide.elements.find((e) => e.slot === 'subtitle');
  return `<div class="pane title-band" style="${boxStyle(band)}">
    <div class="title-accent"></div>
    <div class="title-main jp" style="font-size:${ctx.scale.title}px">${inlineText(title.text, title.emphasis)}</div>
    ${sub ? `<div class="title-sub jp" style="font-size:${ctx.scale.subtitle}px">${inlineText(sub.text, sub.emphasis)}</div>` : ''}
  </div>`;
}

/**
 * Headline band + one lead slot, composed by measure/compose (ADR-0014):
 * the lead element reports the box it wants (measure), compose stacks
 * headline + lead and hands the leftover height to whitespace at the
 * optical centre (45:55).
 */
function leadStage(slide, ctx, slotName, measureFn, paneClass = 'pane center') {
  const stage = stageRect();
  const head = slide.elements.find((e) => e.slot === 'headline');
  const el = slide.elements.find((e) => e.slot === slotName);
  const headH = head ? Math.round(ctx.scale.heading * 1.3) : 0;
  const avail = { w: stage.w, h: stage.h - (head ? headH + HEAD_GAP : 0) };
  const m = measureFn(el, ctx, avail);
  const used = (head ? headH + HEAD_GAP : 0) + m.h;
  let y = stage.y + Math.max(0, stage.h - used) * OPTICAL;
  let html = '';
  if (head) {
    html += `<div class="headline jp" style="left:${stage.x}px;top:${round(y)}px;width:${stage.w}px;height:${headH}px;font-size:${ctx.scale.heading}px">${inlineText(head.text, head.emphasis)}</div>`;
    y += headH + HEAD_GAP;
  }
  const box = { x: round(stage.x + (stage.w - m.w) / 2), y: round(y), w: round(m.w), h: round(m.h) };
  html += `<div class="${paneClass}" style="${boxStyle(box)}">${m.render({ w: m.w, h: m.h })}</div>`;
  return html;
}

function diagramStage(slide, ctx) {
  return leadStage(slide, ctx, 'diagram', measureDiagram);
}

function chartStage(slide, ctx) {
  return leadStage(slide, ctx, 'chart', measureChart);
}

/**
 * List measure: estimate wrapped lines, shrink the font (floor 24px) until the
 * list fits, and hug the content height — leftover space goes to whitespace,
 * not to inflated gaps.
 */
function measureList(el, ctx, avail) {
  const n = el.items.length;
  // headline と左端が揃いすぎると本文が飛び出して見えるため、
  // リスト全体を見出しからわずかに下げる (レビュー指摘 2026-07-08)
  const indent = 28;
  const estH = (fs) => el.items.reduce((t, it) => {
    const perLine = Math.max(4, Math.floor((avail.w - indent - fs * 2.2) / fs));
    return t + Math.max(1, Math.ceil(cpLen(String(it)) / perLine)) * fs * 1.4;
  }, 0);
  const gapFor = (fs) => fs * 1.05;
  let fs = ctx.scale.bullet;
  while (fs > 24 && estH(fs) + (n - 1) * gapFor(fs) > avail.h) fs -= 2;
  const gap = gapFor(fs);
  const h = Math.min(avail.h, estH(fs) + (n - 1) * gap);
  return {
    w: avail.w, h: round(h),
    render: () => {
      const items = el.items.map((it) =>
        `<li><span class="dot"></span><span class="jp">${inlineText(it)}</span></li>`).join('');
      return `<ul class="bullets" style="font-size:${fs}px;gap:${round(gap)}px;padding-left:${indent}px">${items}</ul>`;
    },
  };
}

function listStage(slide, ctx) {
  return leadStage(slide, ctx, 'list', measureList, 'pane');
}

/** 画像ファイルの実寸 (px)。png / jpeg / svg のみ。読めなければ null。 */
function imageDims(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    // PNG: シグネチャ 8B + IHDR。width/height は offset 16/20 の BE32
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG: SOF0/1/2 セグメントに height/width
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length && buf[off] === 0xff) {
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xc2) {
          return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
        }
        off += 2 + len;
      }
      return null;
    }
    // SVG: width/height 属性、なければ viewBox
    const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
    if (head.includes('<svg')) {
      const wh = head.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)(?:px)?"[^>]*\sheight="(\d+(?:\.\d+)?)(?:px)?"/);
      if (wh) return { w: Number(wh[1]), h: Number(wh[2]) };
      const vb = head.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"\s*/);
      if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * image-stage の measure (ADR-0015): 実画像の縦横比を読んで箱を申告する。
 * 読めない場合 (プレースホルダ・未対応形式) は 16:9 とみなす。
 */
function measureImage(el, ctx, avail) {
  const abs = el.src ? path.resolve(ctx.deckDir, el.src) : null;
  const dims = abs && fs.existsSync(abs) ? imageDims(abs) : null;
  const aspect = dims && dims.w > 0 && dims.h > 0 ? dims.w / dims.h : 16 / 9;
  const box = fitAspect(aspect, avail.w, avail.h);
  return {
    ...box,
    render: () => {
      if (!abs || !fs.existsSync(abs)) return renderImagePlaceholder(el, ctx);
      const rel = ctx.useAsset(abs, 'assets');
      const img = `<img class="stage-photo" src="${esc(rel)}" alt="">`;
      // framed はスクリーンショットに面のパネルを敷く既存の見た目を流用
      return el.treatment === 'framed' ? `<div class="photo-framed">${img}</div>` : img;
    },
  };
}

function imageStage(slide, ctx) {
  return leadStage(slide, ctx, 'image', measureImage);
}

function codeStage(slide, ctx) {
  return leadStage(slide, ctx, 'code', measureCode);
}

function quoteStage(slide, ctx) {
  const stage = stageRect();
  const pane = { ...stage, h: round(stage.h * 0.94) }; // 光学中心 (statementStage と同じ)
  const q = slide.elements.find((e) => e.slot === 'quote');
  // A short quote is the slide's hero — scale it toward display size instead
  // of leaving it at body-quote size (46px) inside an empty stage.
  const len = cpLen(String(q.text).replace(/\n/g, ''));
  const fs = len <= 12 ? Math.round(ctx.scale.quote * 1.7)
    : len <= 24 ? Math.round(ctx.scale.quote * 1.35)
    : ctx.scale.quote;
  return `<div class="pane center" style="${boxStyle(pane)}">
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
  const stage = stageRect();
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
      ${handle ? `<div class="profile-handle jp" style="font-size:${ctx.scale.node}px">${
        handle.icon && iconExists(handle.icon)
          ? `<svg class="inline-icon" viewBox="0 0 256 256" fill="currentColor">${iconInner(handle.icon, ctx.iconWeight)}</svg>`
          : ''
      }${inlineText(handle.text)}</div>` : ''}
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
  'image-stage': imageStage,
  'code-stage': codeStage,
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
/* overflow:visible — 箱の縁に接するカードの外周ストロークが viewBox で
   半分に切られて線が細く見えるのを防ぐ (2026-07-08 レビュー指摘) */
svg.lead{display:block;max-width:100%;max-height:100%;overflow:visible}

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
.quote-mark{font-family:${fonts.display};font-size:180px;line-height:.7;color:${C.line};
  position:absolute;top:-64px;left:-26px;user-select:none}
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
.inline-icon{height:.95em;width:.95em;vertical-align:-.12em;margin-right:.4em}
.profile-right{justify-content:center;gap:30px}
.profile-label{color:${C.highlight};font-family:${fonts.display};font-weight:${fonts.wDisplay};
  font-size:22px;letter-spacing:.08em;margin-bottom:7px}
.profile-body{font-size:21px;line-height:1.65;color:${C.text}}

.photo{width:100%;height:100%;object-fit:cover;display:block}
.stage-photo{width:100%;height:100%;object-fit:contain;display:block;border-radius:10px;
  border:1px solid ${C.line};box-shadow:0 10px 36px rgba(0,0,0,.12)}
.photo.contain{object-fit:contain}
.photo-framed{width:100%;height:100%;padding:48px;background:${C.surface};display:flex;
  align-items:center;justify-content:center}
.photo-framed .photo{width:100%;height:100%;object-fit:contain}
.photo-cutout{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.raw-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
.raw-wrap svg{max-width:100%;max-height:100%}

/* code (SPEC §6.7, ADR-0016) — surface panel + hairline + optional filename
   label bar. Palette derivation (renderer-owned, ADR-0014): keyword-ish
   tokens take the brand highlight colour (reads as "this declares
   something"); string/number-ish tokens take core[1] (second core slot —
   moss/green for hokuchi, chosen positionally since "green" cannot be found
   in an arbitrary theme's palette by name); comments take muted. Everything
   else inherits the panel's default text colour, keeping the budget to 3
   non-text colours + text (SPEC §6.7). console/diff skip tokenization
   entirely and colour whole lines instead (prompt vs output; added vs
   removed) — a terminal session or a diff is not "a language". */
.code-panel{width:100%;height:100%;background:${C.surface};border:1px solid ${C.line};
  border-radius:14px;overflow:hidden;display:flex;flex-direction:column;text-align:left}
.code-file{flex:0 0 auto;padding:0 24px;color:${C.muted};background:${C.bg}80;
  border-bottom:1px solid ${C.line};font-family:${fonts.body};font-size:16px;letter-spacing:.02em}
.code-body{flex:1 1 auto;overflow:hidden}
.cl{white-space:pre;color:${C.text}}
.cl-prompt{color:${C.textStrong};font-weight:${fonts.wDisplay}}
.cl-output{color:${C.muted}}
/* diff bands: addition = core[1] (moss/green for hokuchi), deletion =
   highlight (ember/coral) — both at ~18% alpha via a hex alpha suffix */
.cl-add{background:${C.core[1] ?? C.core[0]}2e}
.cl-del{background:${C.highlight}2e}
.cl-dim{opacity:.55}
/* emphasis band (~15% alpha) is defined after cl-add/cl-del so it wins on
   a line that is both a diff line and emphasized */
.cl-em{background:${C.highlight}26}
.code-body .hljs-keyword,.code-body .hljs-built_in,.code-body .hljs-type,.code-body .hljs-literal{color:${C.highlight}}
.code-body .hljs-string,.code-body .hljs-number,.code-body .hljs-regexp{color:${C.core[1] ?? C.core[0]}}
.code-body .hljs-comment,.code-body .hljs-quote,.code-body .hljs-doctag{color:${C.muted}}

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
