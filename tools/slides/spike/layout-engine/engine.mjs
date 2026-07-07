// engine.mjs — measure/compose 2 パスレイアウトの試作 (ADR-0014)。捨てる前提。
//
// 対象は diagram-stage (flow.cycle) と chart-stage (trend) の 2 枚だけに絞り、
// 現行 render.mjs との差分が「構図」のみになるよう、カード・チャートの
// 視覚言語 (色・線・タイポ) は現行から流用する。検証したい仮説は 3 つ。
//
//   (1) 縦予算 — 外周マージンとレターボックスの重複をやめ、
//       マージンの内側の使い方は compose が決める
//   (2) アスペクト交渉 — measure パスで中身が理想の形を申告し
//       (cycle ≈ 正円、trend のプロット ≈ 2:1)、compose がそれに従う
//   (3) 光学中心 — 余った高さは上:下 = 45:55 で配る
//       (中身がアスペクト制約で高さを使い切らないときに効く)

const CANVAS = { w: 1280, h: 720 };
const MARGIN = { x: 96, y: 64 }; // 外周のみ。レターボックスという概念は持たない

const SCALE = { heading: 34, node: 24, axis: 20 };

const round = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** CJK ≈ 1.04em、ASCII ≈ 0.56em の概算幅 (render.mjs と同じ) */
const estW = (s, fs) => [...String(s)].reduce((t, ch) => t + (ch.codePointAt(0) < 0x2000 ? 0.56 : 1.04), 0) * fs;

// ---------------------------------------------------------------------------
// compose — 箱の交渉と光学配置
// ---------------------------------------------------------------------------

/**
 * maxW×maxH に収まり、アスペクト (w/h) が spec.ideal になる最大の矩形。
 * 中身の申告 (measure の結果) だけが形を決める。呼び手は口を出さない。
 */
function fitAspect(spec, maxW, maxH) {
  let w = maxW, h = w / spec.ideal;
  if (h > maxH) { h = maxH; w = h * spec.ideal; }
  return { w: round(w), h: round(h) };
}

/**
 * headline + 主役 1 つのステージを組む。
 * 主役の measurable ({ aspect, render }) から箱を導出し、
 * 使い残した高さを上:下 = 45:55 で配って全体をわずかに上へ寄せる。
 */
function composeLeadStage(headlineText, measurable, ctx) {
  const stage = { x: MARGIN.x, y: MARGIN.y, w: CANVAS.w - MARGIN.x * 2, h: CANVAS.h - MARGIN.y * 2 };
  const headH = Math.round(SCALE.heading * 1.3);
  const gap = 40;

  const box = fitAspect(measurable.aspect, stage.w, stage.h - headH - gap);
  const usedH = headH + gap + box.h;
  const topY = stage.y + (stage.h - usedH) * 0.45;

  const headline = { x: stage.x, y: round(topY), w: stage.w, h: headH };
  const lead = { x: round(stage.x + (stage.w - box.w) / 2), y: round(topY + headH + gap), w: box.w, h: box.h };

  return `
    <div class="headline jp" style="left:${headline.x}px;top:${headline.y}px;width:${headline.w}px;height:${headline.h}px;font-size:${SCALE.heading}px">${esc(headlineText)}</div>
    <div class="pane" style="left:${lead.x}px;top:${lead.y}px;width:${lead.w}px;height:${lead.h}px">${measurable.render(box)}</div>`;
}

// ---------------------------------------------------------------------------
// カード (render.mjs の nodeCard から流用、アイコン・バッジは今回不要な分を省く)
// ---------------------------------------------------------------------------
function nodeCard(ctx, { x, y, w, h, hot, label, detail }) {
  const { C, fonts } = ctx;
  const fitFs = (base, text, avail) => {
    const tw = estW(text, base);
    return tw > avail ? Math.max(15, Math.floor(base * avail / tw)) : base;
  };
  const fsL = fitFs(hot ? SCALE.node + 2 : SCALE.node, label, w - 30);
  const fsD = detail ? fitFs(SCALE.axis, detail, w - 26) : SCALE.axis;
  const cx = x + w / 2;
  const detailGap = SCALE.axis * 1.75;
  const blockH = fsL + (detail ? detailGap + SCALE.axis * 0.3 : 0);
  const labelY = y + (h - blockH) / 2 + fsL * 0.82;
  return `<g>
    <rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="18"
      fill="${C.surface}" stroke="${hot ? C.highlight : C.line}" stroke-width="${hot ? 3 : 2}"/>
    <text x="${round(cx)}" y="${round(labelY)}" text-anchor="middle" fill="${hot ? C.textStrong : C.text}"
      font-size="${fsL}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(label)}</text>
    ${detail ? `<text x="${round(cx)}" y="${round(labelY + detailGap)}" text-anchor="middle"
      fill="${C.muted}" font-size="${fsD}" font-family='${fonts.body}'>${esc(detail)}</text>` : ''}
  </g>`;
}

const arrowDef = (ctx) => `<defs>
  <marker id="arrow-${ctx.slideKey}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9.5" markerHeight="9.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${ctx.C.muted}"/>
  </marker></defs>`;

/** 環に沿う弧エッジ (render.mjs の ringArcEdge と同じ数値歩行) */
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
  while (inRect(ptAt(t1), rects[b.id], 16) && guardB++ < 360) t1 -= step;
  if (t1 - t0 < step * 4) return null;

  const s = ptAt(t0), e = ptAt(t1);
  const large = t1 - t0 > Math.PI ? 1 : 0;
  const path = `<path d="M ${round(s.x)} ${round(s.y)} A ${round(ring.rx)} ${round(ring.ry)} 0 ${large} 1 ${round(e.x)} ${round(e.y)}"
    fill="none" stroke="${C.muted}" stroke-width="3" marker-end="url(#arrow-${ctx.slideKey})"/>`;

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

// ---------------------------------------------------------------------------
// measure — 中身が理想の形を申告する
// ---------------------------------------------------------------------------

/**
 * flow.cycle: ほぼ正円の環を望む (ideal 1.1 — カードが横長なぶん、
 * わずかに横に広い箱が釣り合う)。render はカードを正多角形の頂点に置き、
 * 環の離心率を 1.15 以内に締める。
 */
function measureCycle(el, ctx) {
  const emph = new Set(el.emphasis || []);
  const hasDetail = el.nodes.some((n) => n.detail);
  const cardH = hasDetail ? 118 : 92;
  const cardW = Math.min(300, Math.max(180, ...el.nodes.map((n) => Math.max(
    estW(n.label, SCALE.node + 2),
    n.detail ? estW(n.detail, SCALE.axis) : 0
  ) + 56)));

  return {
    aspect: { ideal: 1.1 },
    render(box) {
      const cx = box.w / 2, cy = box.h / 2;
      const rx0 = (box.w - cardW) / 2 - 4;
      const ry0 = (box.h - cardH) / 2 - 4;
      // 正円へ寄せる: 小さい方の半径を基準に、大きい方の超過を 15% までに制限
      const r = Math.min(rx0, ry0);
      const ring = { cx, cy, rx: Math.min(rx0, r * 1.15), ry: Math.min(ry0, r * 1.15) };

      const pos = el.nodes.map((n, i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / el.nodes.length;
        return { ...n, ang, x: cx + ring.rx * Math.cos(ang), y: cy + ring.ry * Math.sin(ang) };
      });
      const byId = Object.fromEntries(pos.map((n) => [n.id, n]));
      const rects = Object.fromEntries(pos.map((n) => [
        n.id, { x: n.x - cardW / 2, y: n.y - cardH / 2, w: cardW, h: cardH },
      ]));

      let edgeSvg = '', labelSvg = '';
      for (const edge of el.edges || []) {
        const a = byId[edge.from], b = byId[edge.to];
        if (!a || !b) continue;
        const arc = ringArcEdge(a, b, ring, rects, ctx);
        if (!arc) continue;
        edgeSvg += arc.path;
        if (edge.label) {
          labelSvg += `<text x="${round(arc.label.x)}" y="${round(arc.label.y)}" text-anchor="${arc.label.anchor}"
            fill="${ctx.C.muted}" font-size="${SCALE.axis}" font-family='${ctx.fonts.body}'>${esc(edge.label)}</text>`;
        }
      }
      let nodeSvg = '';
      for (const n of pos) {
        nodeSvg += nodeCard(ctx, {
          x: n.x - cardW / 2, y: n.y - cardH / 2, w: cardW, h: cardH,
          hot: emph.has(n.id), label: n.label, detail: n.detail,
        });
      }
      return `<svg viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
        ${arrowDef(ctx)}<g>${edgeSvg}</g><g>${nodeSvg}</g><g>${labelSvg}</g></svg>`;
    },
  };
}

/**
 * trend チャート: プロット領域が 2:1 を望む。軸ラベル余白 (pad) は
 * プロットの外側に固定で付くため、申告するアスペクトは pad 込みの箱に換算する。
 */
function measureTrendChart(el, ctx) {
  const pad = { l: 84, r: 60, t: 26, b: 64 };
  const PLOT_ASPECT = 2.0;
  // 箱のアスペクトは可変 (pad が定数のため) なので、compose には
  // 「ステージ幅・高さから逆算した箱の形」を理想として渡す。
  const stageW = CANVAS.w - MARGIN.x * 2;
  const stageH = CANVAS.h - MARGIN.y * 2 - Math.round(SCALE.heading * 1.3) - 40;
  const plotH = Math.min(stageH - pad.t - pad.b, (stageW - pad.l - pad.r) / PLOT_ASPECT);
  const boxW = plotH * PLOT_ASPECT + pad.l + pad.r;
  const boxH = plotH + pad.t + pad.b;

  return {
    aspect: { ideal: boxW / boxH },
    render(box) {
      const { C, fonts } = ctx;
      const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
      const cats = el.data.x;
      const yr = (el.scale && ctx.scales[el.scale]?.y) || null;
      const all = el.data.series.flatMap((s) => s.values);
      const yMin = yr ? yr.min : Math.min(0, ...all);
      const yMax = yr ? yr.max : Math.max(...all);
      const ticks = 4;
      const xAt = (i) => cats.length === 1 ? plot.x + plot.w / 2 : plot.x + (plot.w * i) / (cats.length - 1);
      const yAt = (v) => plot.y + plot.h * (1 - (v - yMin) / (yMax - yMin));

      let bg = '';
      for (let t = 0; t <= ticks; t++) {
        const val = yMin + ((yMax - yMin) * t) / ticks;
        const y = yAt(val);
        bg += `<line x1="${round(plot.x)}" y1="${round(y)}" x2="${round(plot.x + plot.w)}" y2="${round(y)}" stroke="${C.line}" stroke-width="1" opacity="0.35"/>`;
        bg += `<text x="${round(plot.x - 16)}" y="${round(y + 6)}" text-anchor="end" fill="${C.muted}" font-size="${SCALE.axis}" font-family='${fonts.body}'>${round(val)}</text>`;
      }
      bg += `<line x1="${round(plot.x)}" y1="${round(plot.y)}" x2="${round(plot.x)}" y2="${round(plot.y + plot.h)}" stroke="${C.line}" stroke-width="1.5"/>`;
      bg += `<line x1="${round(plot.x)}" y1="${round(plot.y + plot.h)}" x2="${round(plot.x + plot.w)}" y2="${round(plot.y + plot.h)}" stroke="${C.line}" stroke-width="1.5"/>`;
      cats.forEach((c, i) => {
        bg += `<text x="${round(xAt(i))}" y="${round(plot.y + plot.h + 36)}" text-anchor="middle" fill="${C.muted}" font-size="${SCALE.axis}" font-family='${fonts.body}'>${esc(c)}</text>`;
      });

      let data = '';
      el.data.series.forEach((s, si) => {
        const col = C.core[si % C.core.length];
        const pts = s.values.map((v, i) => `${round(xAt(i))},${round(yAt(v))}`).join(' ');
        data += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        s.values.forEach((v, i) => { data += `<circle cx="${round(xAt(i))}" cy="${round(yAt(v))}" r="5" fill="${col}"/>`; });
      });

      let emphSvg = '';
      const s0 = el.data.series[0];
      for (const ann of el.annotations || []) {
        const i = ann.at_index != null ? ann.at_index : cats.indexOf(ann.at);
        if (i < 0 || i >= cats.length) continue;
        const px = xAt(i), py = yAt(s0.values[i]);
        emphSvg += `<circle cx="${round(px)}" cy="${round(py)}" r="13" fill="none" stroke="${C.highlight}" stroke-width="2" opacity="0.5"/>`;
        emphSvg += `<circle cx="${round(px)}" cy="${round(py)}" r="7.5" fill="${C.highlight}"/>`;
        // ラベルは折れ線が空けている側に置く。隣の点が高い側は、線が上へ
        // 逃げるぶん下が空く。右下 (読み方向) を優先し、次に左下、両方
        // 塞がっていれば上に置く。
        const rightFree = i < cats.length - 1 && s0.values[i + 1] >= s0.values[i];
        const leftFree = i > 0 && s0.values[i - 1] >= s0.values[i];
        let ax, ay, anchor;
        if (rightFree) { ax = px + 20; ay = py + 74; anchor = 'start'; }
        else if (leftFree) { ax = px - 20; ay = py + 74; anchor = 'end'; }
        else { ax = px + 20; ay = py - 62; anchor = 'start'; }
        const leaderY1 = ay > py ? py + 12 : py - 12;
        const leaderY2 = ay > py ? ay - 22 : ay + 8;
        emphSvg += `<line x1="${round(px)}" y1="${round(leaderY1)}" x2="${round(ax)}" y2="${round(leaderY2)}" stroke="${C.highlight}" stroke-width="1.5" opacity="0.8"/>`;
        emphSvg += `<text x="${round(ax)}" y="${round(ay)}" text-anchor="${anchor}" fill="${C.highlight}" font-size="${SCALE.node}" font-weight="${fonts.wDisplay}" font-family='${fonts.display}'>${esc(ann.annotate)}</text>`;
      }

      return `<svg viewBox="0 0 ${round(box.w)} ${round(box.h)}" width="${round(box.w)}" height="${round(box.h)}" role="img">
        <g>${bg}</g><g>${data}</g><g>${emphSvg}</g></svg>`;
    },
  };
}

// ---------------------------------------------------------------------------
// スライド組み立てとドキュメント出力
// ---------------------------------------------------------------------------
function renderSlideAfter(slide, ctx) {
  ctx.slideKey = slide.id;
  const headline = slide.elements.find((e) => e.slot === 'headline');
  const lead = slide.elements.find((e) => e.slot === 'diagram' || e.slot === 'chart');
  const measurable = lead.kind === 'diagram' ? measureCycle(lead, ctx) : measureTrendChart(lead, ctx);
  const bg = ctx.brandBg ? `<img class="bg" src="${esc(ctx.brandBg)}" alt="">` : '';
  const logo = ctx.brandLogo ? `<img class="brand-logo" src="${esc(ctx.brandLogo)}" alt="" style="height:${ctx.brandLogoH}px">` : '';
  const footer = ctx.brandFooter ? `<div class="brand-footer">${esc(ctx.brandFooter)}</div>` : '';
  return `<div class="slide">${bg}${composeLeadStage(headline.text, measurable, ctx)}${logo}${footer}</div>`;
}

export function renderAfter(deckRoot, themeRoot) {
  const T = themeRoot.theme;
  const P = T.palette;
  const ctx = {
    scales: deckRoot.deck.scales || {},
    fonts: {
      display: T.type.display.family, body: T.type.body.family,
      wDisplay: T.type.display.weight, wBody: T.type.body.weight,
    },
    C: {
      bg: P.neutral.bg, surface: P.neutral.surface, line: P.neutral.line,
      muted: P.neutral.muted, text: P.neutral.text, textStrong: P.neutral.text_strong,
      highlight: P.highlight, core: P.core,
    },
    // ブランド枠は content グループのみ流用 (spike の 2 枚は content)
    brandBg: T.brand?.backgrounds?.content ? `theme-assets/${T.brand.backgrounds.content.src.split('/').pop()}` : null,
    brandLogo: T.brand?.logo ? `theme-assets/${T.brand.logo.src.split('/').pop()}` : null,
    brandLogoH: T.brand?.logo?.height ?? 24,
    brandFooter: T.brand?.footer || null,
  };

  const sections = deckRoot.slides.map((s, i) => `
  <section class="page" id="p${String(i + 1).padStart(2, '0')}" data-slide-id="${esc(s.id)}">
    <div class="frame">${renderSlideAfter(s, ctx)}</div>
  </section>`).join('');

  const fontLinks = (T.type.webfonts || []).map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('\n');

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=${CANVAS.w}">
<title>layout-engine spike (after)</title>
${fontLinks}
<style>
*{margin:0;padding:0;box-sizing:border-box}
.slide{width:${CANVAS.w}px;height:${CANVAS.h}px;position:relative;overflow:hidden;
  background:${ctx.C.bg};color:${ctx.C.text};font-family:${ctx.fonts.body};font-weight:${ctx.fonts.wBody};
  -webkit-font-smoothing:antialiased;letter-spacing:.01em}
.jp{word-break:keep-all;overflow-wrap:normal;line-break:strict}
.pane{position:absolute;display:flex;align-items:center;justify-content:center}
.headline{position:absolute;display:flex;align-items:flex-end;font-family:${ctx.fonts.display};
  font-weight:${ctx.fonts.wDisplay};color:${ctx.C.text};text-align:left;line-height:1.3}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.slide>.pane,.slide>.headline{z-index:1}
.brand-logo{position:absolute;top:25px;right:20px;z-index:2}
.brand-footer{position:absolute;bottom:20px;right:20px;z-index:2;font-size:13px;
  color:${ctx.C.muted};letter-spacing:.03em;font-family:${ctx.fonts.body}}
.page{display:none}
.page:target{display:flex;position:fixed;inset:0;align-items:center;justify-content:center}
.frame{width:${CANVAS.w}px;height:${CANVAS.h}px;flex:0 0 auto}
</style>
</head><body class="deck" data-slides="${deckRoot.slides.length}">
<main>${sections}
</main></body></html>`;
}
