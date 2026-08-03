// Chart.jsx — データを描く (SPEC §6.5, §8.4)。
//
// 3 レイヤーの規律を守る。背景 (目盛と軸ラベル) は控えめに、データは主役の色で、
// 強調は 1 点だけ。チャートジャンクは SPEC が禁じる床であり、ここで破らない。

import { Fragment } from 'react';
import { round } from '../../geometry.mjs';
import { SvgLead } from './Primitives.jsx';

/** 極座標の点。 */
const polarPt = (cx, cy, r, theta) => ({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });

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

/** composition intent, 単一系列 → ドーナツ (SPEC §6.5, ADR-0016)。 */
export function Donut({ el, box, ctx, pad }) {
  const { C, fonts, scale } = ctx;
  const cats = el.data.x;
  const values = el.data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = box.w / 2, cy = box.h / 2;
  const rOuter = Math.min(box.w, box.h) / 2 - pad;
  const rInner = rOuter * 0.55;

  const hot = new Set();
  for (const ann of el.annotations || []) {
    if (ann.style !== 'highlight') continue;
    const i = ann.at_index != null ? ann.at_index : cats.indexOf(ann.at);
    if (i >= 0 && i < cats.length) hot.add(i); // 解決できない at は annotation-anchor lint が報告する
  }

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
              fontSize={scale.node} fontFamily={fonts.body}
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

/**
 * composition intent, 複数系列 → 100% 積み上げ棒 (SPEC §6.5, ADR-0016)。
 * 割合は棒単位で 100% に正規化する。系列間の絶対量は composition の主題では
 * ないため、背景は 0/50/100% の目盛とカテゴリラベルだけに留め、annotations も
 * 適用しない (主役は割合の内訳であり、単一の注目点ではない)。
 */
export function StackedComposition({ el, box, ctx, pad }) {
  const { C, fonts, scale } = ctx;
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const series = el.data.series;
  const bandW = Math.min(plot.w / cats.length, 280);
  const bandX0 = plot.x + (plot.w - bandW * cats.length) / 2;
  const barW = bandW * 0.6;

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
        {cats.map((c, i) => {
          const total = series.reduce((t, s) => t + (s.values[i] || 0), 0) || 1;
          const x = bandX0 + bandW * (i + 0.5) - barW / 2;
          let acc = 0;
          return series.map((s, si) => {
            const frac = (s.values[i] || 0) / total;
            const yTop = plot.y + plot.h * (1 - (acc + frac));
            const yBot = plot.y + plot.h * (1 - acc);
            acc += frac;
            return (
              <rect
                key={`${i}-${si}`}
                x={round(x)} y={round(yTop)} width={round(barW)} height={round(yBot - yTop)}
                fill={C.core[si % C.core.length]}
              />
            );
          });
        })}
      </g>
    </SvgLead>
  );
}

/**
 * trend / comparison / distribution — 軸を持つチャート (SPEC §6.5, §8.4)。
 *
 * 折れ線は点を端から端へ広げ、棒は中央寄せの帯に置く。帯の幅には上限があり、
 * カテゴリが少なくても隣り合って比較できる。distribution はヒストグラムとして
 * 階級がほぼ接し、comparison は棒同士を離す。
 */
export function AxisChart({ el, box, ctx, pad, yMin, yMax }) {
  const { C, fonts, scale } = ctx;
  const plot = { x: pad.l, y: pad.t, w: box.w - pad.l - pad.r, h: box.h - pad.t - pad.b };
  const cats = el.data.x;
  const ticks = 4;
  const isLine = el.intent === 'trend';

  const xAt = (i) => (cats.length === 1
    ? plot.x + plot.w / 2
    : plot.x + (plot.w * i) / (cats.length - 1));
  const bandW = Math.min(plot.w / cats.length, 280);
  const bandX0 = plot.x + (plot.w - bandW * cats.length) / 2;
  const xPos = isLine ? xAt : (i) => bandX0 + bandW * (i + 0.5);
  const yAt = (v) => plot.y + plot.h * (1 - (v - yMin) / (yMax - yMin));

  const annotations = (el.annotations || []).map((ann) => {
    const i = ann.at_index != null ? ann.at_index : cats.indexOf(ann.at);
    return i >= 0 && i < cats.length ? { ann, i } : null; // 不一致は annotation-anchor lint が報告する
  }).filter(Boolean);
  const s0 = el.data.series[0];

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

      {/* データ: 折れ線 (trend) か、並んだ棒 (comparison / distribution) */}
      <g>
        {el.data.series.map((s, si) => {
          const col = C.core[si % C.core.length];
          if (isLine) {
            return (
              <Fragment key={si}>
                <polyline
                  points={s.values.map((v, i) => `${round(xAt(i))},${round(yAt(v))}`).join(' ')}
                  fill="none" stroke={col} strokeWidth="4.5"
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={round(xAt(i))} cy={round(yAt(v))} r="5" fill={col} />
                ))}
              </Fragment>
            );
          }
          const groupW = bandW * (el.intent === 'distribution' ? 0.92 : 0.6);
          const barW = groupW / el.data.series.length;
          return (
            <Fragment key={si}>
              {s.values.map((v, i) => {
                const y = yAt(v);
                return (
                  <rect
                    key={i}
                    x={round(xPos(i) - groupW / 2 + barW * si)} y={round(y)}
                    width={round(barW)} height={round(plot.y + plot.h - y)}
                    fill={col}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </g>

      {/* 強調: at (x の完全一致) か at_index で解決した 1 点 */}
      <g>
        {annotations.map(({ ann, i }, k) => {
          const px = xPos(i), py = yAt(s0.values[i]);
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
                fill={C.highlight} fontSize={scale.node}
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
