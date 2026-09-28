// Chart.jsx — データを描く (SPEC §6.5, §8.4)。
//
// 3 レイヤーの規律を守る。背景 (目盛と軸ラベル) は控えめに、データは主役の色で、
// 強調は 1 点だけ。チャートジャンクは SPEC が禁じる床であり、ここで破らない。
//
// 複数系列は凡例を持たず、系列名をデータの隣に直接置く (p.94)。emphasis が
// あれば強調しない系列を無彩色に落とす (p.95, p.97)。色と導出先の判断は
// chart-policy.mjs が lint と共有する。直接ラベルの配置はここで決める (ADR-0014)。

import { Fragment } from 'react';
import { round } from '../../geometry.mjs';
import { estW } from '../../text.mjs';
import { seriesColors } from '../../chart-policy.mjs';
import { SvgLead } from './Primitives.jsx';

/** 直接ラベルの行送り (フォントサイズ比)。 */
const LABEL_LEADING = 1.25;
/** 直接ラベルとデータの間隔 (px)。 */
const LABEL_GAP = 14;

/** 極座標の点。 */
const polarPt = (cx, cy, r, theta) => ({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });

/**
 * 1 次元の重なり解消。items は { c (望む中心), size }。宣言順を保ったまま
 * 中心を [lo, hi] に収め、隣同士が size/2 + gap 以上離れるよう押し広げる。
 * 収まりきらないときは lo 側に寄せ、hi をはみ出させる (呼び出し側が余白を取る)。
 * @returns {number[]} items と同じ順の中心座標
 */
export function spread1D(items, lo, hi, gap) {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.c - b.c);
  const pos = order.map((it) => Math.min(Math.max(it.c, lo + it.size / 2), hi - it.size / 2));
  for (let k = 1; k < order.length; k++) {
    const min = pos[k - 1] + (order[k - 1].size + order[k].size) / 2 + gap;
    if (pos[k] < min) pos[k] = min;
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const max = k === order.length - 1 ? hi - order[k].size / 2
      : pos[k + 1] - (order[k + 1].size + order[k].size) / 2 - gap;
    if (pos[k] > max) pos[k] = max;
  }
  for (let k = 0; k < order.length; k++) {
    const min = k === 0 ? lo + order[k].size / 2
      : pos[k - 1] + (order[k - 1].size + order[k].size) / 2 + gap;
    if (pos[k] < min) pos[k] = min;
  }
  const out = new Array(items.length);
  order.forEach((it, k) => { out[it.i] = pos[k]; });
  return out;
}

/** 系列名ラベルの色と太さ。強調しない系列は muted で読ませ、線より少しだけ強く保つ。 */
function labelStyle(col, C, fonts) {
  if (col.role === 'deemph') return { fill: C.muted, fontWeight: fonts.wBody, fontFamily: fonts.body };
  if (col.role === 'emph') return { fill: col.color, fontWeight: fonts.wDisplay, fontFamily: fonts.display };
  return { fill: col.color, fontWeight: fonts.wBody, fontFamily: fonts.body };
}

/** 直接ラベルとデータをつなぐ引き出し線。背景レイヤーと同じく控えめに描く。 */
const leaderStyle = (C) => ({ stroke: C.muted, strokeWidth: 1.2, opacity: 0.55 });

/** 強調しない系列を先に描き、強調系列を上に重ねる順序。 */
const paintOrder = (cols) => cols.map((c, i) => i).sort((a, b) => (cols[a].role === 'deemph' ? 0 : 1) - (cols[b].role === 'deemph' ? 0 : 1));

/** annotations を x の添字に解決する。解決できない at は annotation-anchor lint が報告する。 */
function resolveAnnotations(el) {
  const cats = el.data.x;
  return (el.annotations || []).map((ann) => {
    const i = ann.at_index != null ? ann.at_index : cats.indexOf(ann.at);
    return i >= 0 && i < cats.length ? { ann, i } : null;
  }).filter(Boolean);
}

/** annotations の style: highlight が指す項目の添字 (composition の単一系列用)。 */
function hotIndices(el) {
  return new Set(resolveAnnotations(el).filter(({ ann }) => ann.style === 'highlight').map(({ i }) => i));
}

// ---------------------------------------------------------------------------
// composition, 単一系列
// ---------------------------------------------------------------------------

/** ドーナツの 1 切れ。外周を時計回りに描き、内周を逆にたどって閉じる。 */
function donutSlicePath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p0 = polarPt(cx, cy, rOuter, a0);
  const p1 = polarPt(cx, cy, rOuter, a1);
  const q1 = polarPt(cx, cy, rInner, a1);
  const q0 = polarPt(cx, cy, rInner, a0);
  return [
    `M ${round(p0.x)} ${round(p0.y)}`,
    `A ${round(rOuter)} ${round(rOuter)} 0 ${large} 1 ${round(p1.x)} ${round(p1.y)}`,
    `L ${round(q1.x)} ${round(q1.y)}`,
    `A ${round(rInner)} ${round(rInner)} 0 ${large} 0 ${round(q0.x)} ${round(q0.y)}`,
    'Z',
  ].join(' ');
}

/** composition intent, 単一系列で構成比の差が大きい → ドーナツ (SPEC §6.5, ADR-0016)。 */
export function Donut({ el, box, ctx, pad }) {
  const { C, fonts, scale } = ctx;
  const cats = el.data.x;
  const values = el.data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = box.w / 2, cy = box.h / 2;
  const rOuter = Math.min(box.w, box.h) / 2 - pad;
  const rInner = rOuter * 0.55;
  const hot = hotIndices(el);

  // 12 時起点、時計回り (角度が増える方向)
  let angle = -Math.PI / 2;
  const slices = values.map((v, i) => {
    const frac = v / total;
    const a0 = angle, a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    return { i, frac, a0, a1, mid: (a0 + a1) / 2 };
  });

  return (
    <SvgLead box={box}>
      <g>
        {slices.map(({ i, a0, a1 }) => (
          <path
            key={i}
            d={donutSlicePath(cx, cy, rOuter, rInner, a0, a1)}
            fill={hot.has(i) ? C.highlight : C.core[i % C.core.length]}
          />
        ))}
      </g>
      <g>
        {slices.map(({ i, frac, mid }) => {
          const lp = polarPt(cx, cy, rOuter + 30, mid);
          const anchor = Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle';
          return (
            <text
              key={i}
              x={round(lp.x)} y={round(lp.y)} textAnchor={anchor}
              fill={hot.has(i) ? C.textStrong : C.text}
              fontSize={ctx.body('円グラフのラベル', scale.node)} fontFamily={fonts.body}
            >
              {cats[i]}
              <tspan fill={C.muted} dx="6">{Math.round(frac * 100)}%</tspan>
            </text>
          );
        })}
      </g>
    </SvgLead>
  );
}

/** 100% 横棒の帯の太さ (px)。 */
const HBAR_THICKNESS = 88;

/**
 * 100% 横棒のラベル配置。ラベルは 2 行 (上に %、下にカテゴリ) で、各区画の
 * 中央の下に置く。1 列に収まらなければ偶数番目を帯の下、奇数番目を上に振り分ける。
 * @returns {{ rows: 1 | 2, blockH: number, labels: { i, w, side: 'below' | 'above' }[] }}
 */
export function hbarLabelPlan(el, ctx, width) {
  const { scale } = ctx;
  const cats = el.data.x;
  const values = el.data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const pctFs = scale.node + 6;
  const labels = cats.map((c, i) => ({
    i,
    w: Math.max(estW(c, scale.node), estW(`${Math.round((values[i] / total) * 100)}%`, pctFs)),
  }));
  const need = labels.reduce((t, l) => t + l.w, 0) + LABEL_GAP * (labels.length - 1);
  const rows = need <= width ? 1 : 2;
  for (const l of labels) l.side = rows === 1 || l.i % 2 === 0 ? 'below' : 'above';
  const blockH = (pctFs + scale.node) * LABEL_LEADING;
  return { rows, blockH, labels, pctFs };
}

/** hbar の箱の高さ。 */
export function hbarHeight(plan) {
  return HBAR_THICKNESS + plan.rows * (plan.blockH + LABEL_GAP);
}

/**
 * composition intent, 単一系列で構成比の差が小さい → 100% 横棒 (SPEC §6.5, p.91)。
 * 角度では読み分けられない差を、共通の基線に並んだ長さで見せる。
 */
export function HBar100({ el, box, ctx }) {
  const { C, fonts, scale } = ctx;
  const cats = el.data.x;
  const values = el.data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const hot = hotIndices(el);
  const plan = hbarLabelPlan(el, ctx, box.w);
  const barY = plan.rows === 2 ? plan.blockH + LABEL_GAP : 0;
  const SEP = 3; // 区画の境目に空ける背景色の隙間

  let acc = 0;
  const segs = values.map((v, i) => {
    const frac = v / total;
    const x0 = box.w * acc, x1 = box.w * (acc + frac);
    acc += frac;
    return { i, frac, x0, x1, mid: (x0 + x1) / 2 };
  });

  const place = (side) => {
    const ls = plan.labels.filter((l) => l.side === side);
    const xs = spread1D(ls.map((l) => ({ c: segs[l.i].mid, size: l.w })), 0, box.w, LABEL_GAP);
    return ls.map((l, k) => ({ ...l, x: xs[k] }));
  };
  const placed = [...place('below'), ...place('above')];

  return (
    <SvgLead box={box}>
      <g>
        {segs.map(({ i, x0, x1 }) => (
          <rect
            key={i}
            x={round(x0 + (i > 0 ? SEP / 2 : 0))} y={round(barY)}
            width={round(Math.max(0, x1 - x0 - (i > 0 ? SEP / 2 : 0) - (i < segs.length - 1 ? SEP / 2 : 0)))}
            height={HBAR_THICKNESS}
            fill={hot.has(i) ? C.highlight : C.core[i % C.core.length]}
          />
        ))}
      </g>
      <g>
        {placed.map(({ i, x, side }) => {
          const s = segs[i];
          const below = side === 'below';
          const top = below ? barY + HBAR_THICKNESS + LABEL_GAP : barY - LABEL_GAP - plan.blockH;
          const pctY = top + plan.pctFs;
          const catY = pctY + scale.node * LABEL_LEADING;
          const displaced = Math.abs(x - s.mid) > 8;
          return (
            <Fragment key={i}>
              {displaced && (
                <line
                  x1={round(s.mid)} y1={round(below ? barY + HBAR_THICKNESS + 2 : barY - 2)}
                  x2={round(x)} y2={round(below ? top + 2 : top + plan.blockH - 2)}
                  {...leaderStyle(C)}
                />
              )}
              <text
                x={round(x)} y={round(pctY)} textAnchor="middle"
                fill={hot.has(i) ? C.highlight : C.textStrong}
                fontSize={plan.pctFs} fontWeight={fonts.wDisplay} fontFamily={fonts.display}
              >
                {Math.round(s.frac * 100)}%
              </text>
              <text
                x={round(x)} y={round(catY)} textAnchor="middle"
                fill={hot.has(i) ? C.textStrong : C.text}
                fontSize={scale.node} fontFamily={fonts.body}
              >
                {cats[i]}
              </text>
            </Fragment>
          );
        })}
      </g>
    </SvgLead>
  );
}

// ---------------------------------------------------------------------------
// composition, 複数系列
// ---------------------------------------------------------------------------

/** 右端に並べる系列名ラベルが要る幅 (px)。 */
export function seriesLabelWidth(el, ctx) {
  return Math.max(0, ...(el.data.series || []).map((s) => estW(s.label, ctx.scale.node)));
}

/**
 * composition intent, 複数系列 → 100% 積み上げ棒 (SPEC §6.5, ADR-0016)。
 * 割合は棒単位で 100% に正規化する。系列間の絶対量は composition の主題では
 * ないため、背景は 0/50/100% の目盛とカテゴリラベルだけに留め、annotations も
 * 適用しない (主役は割合の内訳であり、単一の注目点ではない)。
 * 系列名は右端の棒の各層の高さに直接置く (p.94)。
 */
export function StackedComposition({ el, box, ctx, pad }) {
  const { C, fonts, scale } = ctx;
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const series = el.data.series;
  const cols = seriesColors(el, C);
  const bandW = Math.min(plot.w / cats.length, 280);
  const bandX0 = plot.x + (plot.w - bandW * cats.length) / 2;
  const barW = bandW * 0.6;
  const SEP = 2; // 層の境目。同じ無彩色の層が隣り合っても境界が読める

  const bars = cats.map((c, i) => {
    const total = series.reduce((t, s) => t + (s.values[i] || 0), 0) || 1;
    const x = bandX0 + bandW * (i + 0.5) - barW / 2;
    let acc = 0;
    const segs = series.map((s) => {
      const frac = (s.values[i] || 0) / total;
      const yTop = plot.y + plot.h * (1 - (acc + frac));
      const yBot = plot.y + plot.h * (1 - acc);
      acc += frac;
      return { yTop, yBot };
    });
    return { x, segs };
  });

  const last = bars[bars.length - 1];
  const lineH = scale.node * LABEL_LEADING;
  const ys = spread1D(
    last.segs.map((sg) => ({ c: (sg.yTop + sg.yBot) / 2, size: lineH })),
    plot.y - pad.t / 2, plot.y + plot.h + pad.b / 2, 2,
  );
  const labelX = last.x + barW + LABEL_GAP;

  return (
    <SvgLead box={box}>
      <g>
        {[0, 50, 100].map((pct) => {
          const y = plot.y + plot.h * (1 - pct / 100);
          return (
            <Fragment key={pct}>
              <line
                x1={round(plot.x)} y1={round(y)} x2={round(plot.x + plot.w)} y2={round(y)}
                stroke={C.line} strokeWidth="1" opacity="0.35"
              />
              <text
                x={round(plot.x - 16)} y={round(y + 6)} textAnchor="end"
                fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
              >
                {pct}%
              </text>
            </Fragment>
          );
        })}
        {cats.map((c, i) => (
          <text
            key={c}
            x={round(bandX0 + bandW * (i + 0.5))} y={round(plot.y + plot.h + 36)}
            textAnchor="middle" fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
          >
            {c}
          </text>
        ))}
      </g>
      <g>
        {bars.map(({ x, segs }, i) => segs.map(({ yTop, yBot }, si) => {
          const top = si < segs.length - 1 ? yTop + SEP / 2 : yTop;
          const bot = si > 0 ? yBot - SEP / 2 : yBot;
          if (bot - top <= 0) return null;
          return (
            <rect
              key={`${i}-${si}`}
              x={round(x)} y={round(top)} width={round(barW)} height={round(bot - top)}
              fill={cols[si].color}
            />
          );
        }))}
      </g>
      <g>
        {series.map((s, si) => {
          const sg = last.segs[si];
          const mid = (sg.yTop + sg.yBot) / 2;
          const ly = ys[si];
          return (
            <Fragment key={si}>
              {Math.abs(ly - mid) > 6 && (
                <line
                  x1={round(last.x + barW + 2)} y1={round(mid)}
                  x2={round(labelX - 4)} y2={round(ly)}
                  {...leaderStyle(C)}
                />
              )}
              <text
                x={round(labelX)} y={round(ly + scale.node * 0.36)}
                fontSize={scale.node} {...labelStyle(cols[si], C, fonts)}
              >
                {s.label}
              </text>
            </Fragment>
          );
        })}
      </g>
    </SvgLead>
  );
}

// ---------------------------------------------------------------------------
// trend / comparison / distribution
// ---------------------------------------------------------------------------

/**
 * 目盛りの本数を選ぶ。レンジが整数なら、割り切れる本数を優先する。
 * 人数や件数のように整数しか取らないデータで、4 分割固定だと 3.75 のような
 * 意味のない目盛りが出るため (2026-08-19)。割り切れなければ従来どおり 4 分割。
 */
function tickCount(yMin, yMax) {
  const span = yMax - yMin;
  if (Number.isInteger(span) && span > 0) {
    for (const n of [4, 5, 3, 6, 2]) if (span % n === 0) return n;
  }
  return 4;
}

/**
 * 軸を持つチャートの幾何。measure (render.mjs) と描画の両方が使う。
 * 折れ線は点を端から端へ広げ、棒は中央寄せの帯に置く。帯の幅には上限があり、
 * カテゴリが少なくても隣り合って比較できる。distribution はヒストグラムとして
 * 階級がほぼ接し、comparison は棒同士を離す。
 */
export function axisGeometry(el, box, pad, yMin, yMax) {
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const isLine = el.intent === 'trend';
  const xAt = (i) => (cats.length === 1
    ? plot.x + plot.w / 2
    : plot.x + (plot.w * i) / (cats.length - 1));
  const bandW = Math.min(plot.w / cats.length, 280);
  const bandX0 = plot.x + (plot.w - bandW * cats.length) / 2;
  const xPos = isLine ? xAt : (i) => bandX0 + bandW * (i + 0.5);
  const yAt = (v) => plot.y + plot.h * (1 - (v - yMin) / (yMax - yMin));
  const groupW = bandW * (el.intent === 'distribution' ? 0.92 : 0.6);
  const barW = groupW / el.data.series.length;
  const barCx = (i, si) => xPos(i) - groupW / 2 + barW * (si + 0.5);
  return { plot, isLine, xAt, xPos, yAt, groupW, barW, barCx };
}

/** 棒の直接ラベルを 1 行に並べたときの、最も高い棒の上端からの持ち上げ (px)。引き出し線の長さになる。 */
const BAR_LABEL_RISE = 30;

/**
 * 複数系列の棒の直接ラベル。1 つのカテゴリの棒群にだけ系列名を置く。
 * 系列名がどれも棒の幅に収まれば、各棒の上端の真上に置く。収まらなければ
 * 棒群の上に 1 行で並べ、横に重ならないよう広げて、各棒の上端へ引き出し線を
 * 引く。どのカテゴリに置くかは、最も高い棒が最も低いカテゴリ (上に余白が
 * ある所) を選ぶ。同じ高さなら左。
 * @returns {{ labels: { si, x, y, w, leader: { x, y } | null }[], minTop: number }} y はベースライン
 */
export function barLabelLayout(el, geo, ctx, boxW) {
  const fs = ctx.scale.node;
  const series = el.data.series;
  const cats = el.data.x;
  let gi = 0;
  const peak = (i) => Math.max(...series.map((s) => s.values[i] ?? 0));
  for (let i = 1; i < cats.length; i++) if (peak(i) < peak(gi)) gi = i;

  const ws = series.map((s) => estW(s.label, fs));
  const tops = series.map((s) => geo.yAt(s.values[gi] ?? 0));
  const cxs = series.map((_, si) => geo.barCx(gi, si));
  let labels;
  if (ws.every((w) => w <= geo.barW + 6)) {
    labels = series.map((_, si) => ({ si, x: cxs[si], y: tops[si] - 10, w: ws[si], leader: null }));
  } else {
    const y = Math.min(...tops) - BAR_LABEL_RISE;
    const xs = spread1D(ws.map((w, si) => ({ c: cxs[si], size: w })), 0, boxW, 10);
    labels = series.map((_, si) => ({ si, x: xs[si], y, w: ws[si], leader: { x: cxs[si], y: tops[si] - 3 } }));
  }
  const minTop = Math.min(...labels.map((l) => l.y - fs));
  return { labels, minTop };
}

/**
 * 折れ線の終端ラベル。系列名を線の右端の高さに置き、縦に重なれば押し広げる。
 * @returns {{ si, x, y, anchorY }[]} y はラベルの中心、anchorY は線の終端
 */
function lineEndLabels(el, geo, ctx, box) {
  const lineH = ctx.scale.node * LABEL_LEADING;
  const n = el.data.x.length;
  const ends = el.data.series.map((s) => geo.yAt(s.values[n - 1]));
  const ys = spread1D(ends.map((c) => ({ c, size: lineH })), lineH / 2, box.h - lineH / 2, 2);
  return el.data.series.map((_, si) => ({ si, x: geo.xAt(n - 1) + LABEL_GAP, y: ys[si], anchorY: ends[si] }));
}

/** 折れ線の終端ラベルが要る右余白 (px)。 */
export function lineLabelPadR(el, ctx) {
  return seriesLabelWidth(el, ctx) + LABEL_GAP + 12;
}

/**
 * trend / comparison / distribution — 軸を持つチャート (SPEC §6.5, §8.4)。
 * 複数系列は直接ラベルで系列名を示す。注釈は強調系列 (無ければ第 1 系列) の点に付ける。
 */
export function AxisChart({ el, box, ctx, pad, yMin, yMax }) {
  const { C, fonts, scale } = ctx;
  const geo = axisGeometry(el, box, pad, yMin, yMax);
  const { plot, isLine, xAt, xPos, yAt, barW, barCx } = geo;
  const cats = el.data.x;
  const ticks = tickCount(yMin, yMax);
  const series = el.data.series;
  const cols = seriesColors(el, C);
  const multi = series.length >= 2;

  const annotations = resolveAnnotations(el);
  const firstEmph = cols.findIndex((c) => c.role === 'emph');
  const aSi = firstEmph >= 0 ? firstEmph : 0;
  const aSeries = series[aSi];
  const anchorX = (i) => (isLine || !multi ? xPos(i) : barCx(i, aSi));

  const lineLabels = isLine && multi ? lineEndLabels(el, geo, ctx, box) : [];
  const barLabels = !isLine && multi ? barLabelLayout(el, geo, ctx, box.w).labels : [];

  return (
    <SvgLead box={box}>
      {/* 背景: 薄い目盛線と最小限の軸ラベル */}
      <g>
        {Array.from({ length: ticks + 1 }, (_, t) => {
          const val = yMin + ((yMax - yMin) * t) / ticks;
          const y = yAt(val);
          return (
            <Fragment key={t}>
              <line
                x1={round(plot.x)} y1={round(y)} x2={round(plot.x + plot.w)} y2={round(y)}
                stroke={C.line} strokeWidth="1" opacity="0.35"
              />
              <text
                x={round(plot.x - 16)} y={round(y + 6)} textAnchor="end"
                fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
              >
                {round(val)}
              </text>
            </Fragment>
          );
        })}
        <line
          x1={round(plot.x)} y1={round(plot.y)} x2={round(plot.x)} y2={round(plot.y + plot.h)}
          stroke={C.line} strokeWidth="1.5"
        />
        <line
          x1={round(plot.x)} y1={round(plot.y + plot.h)}
          x2={round(plot.x + plot.w)} y2={round(plot.y + plot.h)}
          stroke={C.line} strokeWidth="1.5"
        />
        {cats.map((c, i) => (
          <text
            key={c}
            x={round(xPos(i))} y={round(plot.y + plot.h + 36)} textAnchor="middle"
            fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
          >
            {c}
          </text>
        ))}
      </g>

      {/* データ: 折れ線 (trend) か、並んだ棒 (comparison / distribution)。
          強調しない系列を先に描き、強調系列を上に重ねる */}
      <g>
        {paintOrder(cols).map((si) => {
          const s = series[si];
          const { color: col, role } = cols[si];
          if (isLine) {
            const dim = role === 'deemph';
            return (
              <Fragment key={si}>
                <polyline
                  points={s.values.map((v, i) => `${round(xAt(i))},${round(yAt(v))}`).join(' ')}
                  fill="none" stroke={col} strokeWidth={dim ? 3 : 4.5}
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={round(xAt(i))} cy={round(yAt(v))} r={dim ? 3.5 : 5} fill={col} />
                ))}
              </Fragment>
            );
          }
          return (
            <Fragment key={si}>
              {s.values.map((v, i) => {
                const y = yAt(v);
                return (
                  <rect
                    key={i}
                    x={round(barCx(i, si) - barW / 2)} y={round(y)}
                    width={round(barW)} height={round(plot.y + plot.h - y)}
                    fill={col}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </g>

      {/* 直接ラベル: 凡例の代わりに系列名をデータの隣に置く (p.94) */}
      <g>
        {lineLabels.map(({ si, x, y, anchorY }) => (
          <Fragment key={si}>
            {Math.abs(y - anchorY) > 6 && (
              <line
                x1={round(x - LABEL_GAP + 8)} y1={round(anchorY)} x2={round(x - 3)} y2={round(y)}
                {...leaderStyle(C)}
              />
            )}
            <text
              x={round(x)} y={round(y + scale.node * 0.36)}
              fontSize={scale.node} {...labelStyle(cols[si], C, fonts)}
            >
              {series[si].label}
            </text>
          </Fragment>
        ))}
        {barLabels.map(({ si, x, y, leader }) => (
          <Fragment key={si}>
            {leader && (
              <line
                x1={round(x)} y1={round(y + 8)} x2={round(leader.x)} y2={round(leader.y)}
                {...leaderStyle(C)}
              />
            )}
            <text
              x={round(x)} y={round(y)} textAnchor="middle"
              fontSize={scale.node} {...labelStyle(cols[si], C, fonts)}
            >
              {series[si].label}
            </text>
          </Fragment>
        ))}
      </g>

      {/* 強調: at (x の完全一致) か at_index で解決した 1 点 */}
      <g>
        {annotations.map(({ ann, i }, k) => {
          const vals = aSeries.values;
          const px = anchorX(i), py = yAt(vals[i]);
          // ラベルは折れ線が空けている側に置く。隣の点が高い側は線が上へ逃げる
          // ぶん下が空く。右下 (読み方向) を優先、次に左下、両方塞がっていれば上。
          const rightFree = isLine && i < cats.length - 1 && vals[i + 1] >= vals[i];
          const leftFree = isLine && i > 0 && vals[i - 1] >= vals[i];
          let ax, ay, anchor;
          if (rightFree || !isLine) { ax = px + 20; ay = py + 74; anchor = 'start'; }
          else if (leftFree) { ax = px - 20; ay = py + 74; anchor = 'end'; }
          else { ax = px + 20; ay = py - 62; anchor = 'start'; }
          const leaderY1 = ay > py ? py + 12 : py - 12;
          const leaderY2 = ay > py ? ay - 22 : ay + 8;
          return (
            <Fragment key={k}>
              <circle
                cx={round(px)} cy={round(py)} r="13"
                fill="none" stroke={C.highlight} strokeWidth="2" opacity="0.5"
              />
              <circle cx={round(px)} cy={round(py)} r="7.5" fill={C.highlight} />
              <line
                x1={round(px)} y1={round(leaderY1)} x2={round(ax)} y2={round(leaderY2)}
                stroke={C.highlight} strokeWidth="1.5" opacity="0.8"
              />
              <text
                x={round(ax)} y={round(ay)} textAnchor={anchor}
                fill={C.highlight} fontSize={ctx.body('チャートの注釈', scale.node)}
                fontWeight={fonts.wDisplay} fontFamily={fonts.display}
              >
                {ann.annotate}
              </text>
            </Fragment>
          );
        })}
      </g>
    </SvgLead>
  );
}
