// Flow.jsx — 流れを描く form (SPEC §6.4)。linear / branch / converge / tree /
// timeline。cycle は環の幾何を共有するので Ring.jsx にある。
//
// 箱の寸法は measure が申告し、その中での配置はここが決める。ADR-0014 の
// 「構図はレンダラ専有」の内側であり、スキーマにもテーマにも露出しない。

import { Fragment } from 'react';
import { round } from '../../geometry.mjs';
import { estW } from '../../text.mjs';
import { ArrowDef, EdgeLabel, NodeCard, SvgLead, markerRef } from './Primitives.jsx';

/**
 * 既定の form — 宣言順に並ぶ 1 列のステップ。両端はステージの縁から少し
 * 引き、番号バッジで順序を明示する。
 */
export function StepRow({ el, box, ctx }) {
  const { C } = ctx;
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  const hasDetail = el.nodes.some((nd) => nd.detail);
  const hasIcon = el.nodes.some((nd) => nd.icon);
  const usable = box.w * 0.94; // 左右の余白で列を舞台の縁から離す
  const gap = Math.min(56, usable * 0.05);
  const cardW = Math.min(350, (usable - gap * (n - 1)) / n);
  const cardH = (hasDetail ? 150 : 108) + (hasIcon ? 44 : 0);
  const totalW = cardW * n + gap * (n - 1);
  const x0 = (box.w - totalW) / 2;
  const cy = box.h / 2;
  const y = cy - cardH / 2;

  const byId = {};
  el.nodes.forEach((nd, i) => {
    byId[nd.id] = { ...nd, i, x: x0 + i * (cardW + gap) };
  });

  const edges = (el.edges || []).map((edge, k) => {
    const a = byId[edge.from], b = byId[edge.to];
    if (!a || !b) return null; // edge-ref lint が報告する。描画は黙って飛ばす
    const [l, r] = a.i < b.i ? [a, b] : [b, a];
    const x1 = l.x + cardW + 5, x2 = r.x - 7;
    if (x2 <= x1) return null;
    return (
      <Fragment key={k}>
        <line
          x1={round(x1)} y1={round(cy)} x2={round(x2)} y2={round(cy)}
          stroke={C.muted} strokeWidth="3" markerEnd={markerRef(ctx)}
        />
        <EdgeLabel ctx={ctx} x={(x1 + x2) / 2} y={cy - 14}>{edge.label}</EdgeLabel>
      </Fragment>
    );
  });

  return (
    <SvgLead box={box}>
      <ArrowDef ctx={ctx} />
      <g>{edges}</g>
      <g>
        {el.nodes.map((nd, i) => (
          <NodeCard
            key={nd.id}
            ctx={ctx}
            x={byId[nd.id].x} y={y} w={cardW} h={cardH}
            hot={emph.has(nd.id)} label={nd.label} detail={nd.detail} icon={nd.icon}
            badge={i + 1}
          />
        ))}
      </g>
    </SvgLead>
  );
}

/**
 * flow.timeline — 日付つきの経緯 (SPEC §6.4)。
 *
 * 基線の始点・終点を端ノードのラベル実測半幅ぶん内側に取る。以前は等間隔の
 * 基線をそのまま使い、はみ出す端ラベルだけを内側へ寄せていたが、マーカー
 * 中央寄せの他ラベルと置き場所が揃わず違和感があった (レビュー指摘
 * 2026-07-09)。これで全ノードが dot の真下・真上に中央揃えで並ぶ。
 *
 * detail (日付) は基線の上に固定して千鳥にしない。日付が「常に上」であること
 * が読み手の基準点になるため、可読性は label 側の自由度だけで確保する。
 */
export function Timeline({ el, box, ctx, fsLabel, fsDetail, stagger, labelRowH, detailH, dotR, gap, marginX }) {
  const { C, fonts } = ctx;
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  const baseY = detailH + dotR;
  const halfW = (nd) => Math.max(
    estW(nd.label, fsLabel) / 2,
    nd.detail ? estW(nd.detail, fsDetail) / 2 : 0,
  );
  const x0 = Math.max(marginX, halfW(el.nodes[0]));
  const x1 = box.w - Math.max(marginX, halfW(el.nodes[n - 1]));
  const usableW = Math.max(0, x1 - x0);
  const xAt = (i) => (n > 1 ? x0 + (usableW * i) / (n - 1) : box.w / 2);
  // 安全弁: 千鳥判定のあとでなおラベルが枠をはみ出す場合だけ内側へ寄せる
  const clampTextX = (cx, textW) => {
    const half = textW / 2, pad = 4;
    const lo = half + pad, hi = box.w - half - pad;
    return lo <= hi ? Math.min(Math.max(cx, lo), hi) : box.w / 2;
  };

  return (
    <SvgLead box={box}>
      <line
        x1={round(x0)} y1={round(baseY)} x2={round(x1)} y2={round(baseY)}
        stroke={C.line} strokeWidth="2"
      />
      {el.nodes.map((nd, i) => {
        const x = xAt(i);
        const hot = emph.has(nd.id);
        const row = stagger ? i % 2 : 0;
        return (
          <Fragment key={nd.id}>
            <circle
              cx={round(x)} cy={round(baseY)} r={hot ? dotR + 2 : dotR}
              fill={hot ? C.highlight : C.core[0]}
            />
            {nd.detail && (
              <text
                x={round(clampTextX(x, estW(nd.detail, fsDetail)))}
                y={round(baseY - dotR - gap + fsDetail * 0.35)}
                textAnchor="middle" fill={C.muted} fontSize={fsDetail} fontFamily={fonts.body}
              >
                {nd.detail}
              </text>
            )}
            <text
              x={round(clampTextX(x, estW(nd.label, fsLabel)))}
              y={round(baseY + dotR + gap + labelRowH * row + fsLabel * 0.85)}
              textAnchor="middle"
              fill={hot ? C.textStrong : C.text}
              fontWeight={hot ? fonts.wDisplay : fonts.wBody}
              fontSize={fsLabel} fontFamily={fonts.display}
            >
              {nd.label}
            </text>
          </Fragment>
        );
      })}
    </SvgLead>
  );
}

/**
 * structure.tree / flow.branch / flow.converge — 深さで列に分けた DAG。
 *
 * 同じノードへ流入する複数のエッジは、手前の合流点で 1 本に束ねる。各カードの
 * 矢尻が 1 つになり (複数の矢尻は団子に見える。レビュー指摘 2026-07-08)、
 * 到達点も左辺の中央 1 点に揃う。高さが変わるエッジは S 字カーブで、水平に出て
 * 水平に入る。矢印がカードへ水平に刺さり、斜めの直線より視線の流れが柔らかい。
 */
export function Dag({ el, box, ctx, cols, cardW, cardH, colGap, rowGap }) {
  const { C } = ctx;
  const emph = new Set(el.emphasis || []);
  const pos = {};
  cols.forEach((col, ci) => {
    const colH = col.length * cardH + (col.length - 1) * rowGap;
    const y0 = (box.h - colH) / 2;
    col.forEach((nd, ri) => {
      pos[nd.id] = { ...nd, x: ci * (cardW + colGap), y: y0 + ri * (cardH + rowGap) };
    });
  });

  const inCount = {};
  for (const e of el.edges || []) {
    if (pos[e.from] && pos[e.to]) inCount[e.to] = (inCount[e.to] || 0) + 1;
  }

  const junctionDrawn = new Set();
  const edges = (el.edges || []).map((e, k) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return null; // edge-ref lint が報告する
    const x1 = a.x + cardW + 5, y1 = a.y + cardH / 2;
    const xEnd = b.x - 7, yEnd = b.y + cardH / 2;
    if (xEnd <= x1) return null; // 同列・逆行は描かない (form の誤用)
    const merged = inCount[e.to] >= 2;
    // 合流点はカード左辺の少し手前。そこまでは矢尻なしの曲線で集め、合流点から
    // カードへの短い直線 1 本だけが矢尻を持つ。
    const x2 = merged ? xEnd - 30 : xEnd;
    const mx = round((x1 + x2) / 2);
    const drawJunction = merged && !junctionDrawn.has(e.to);
    if (drawJunction) junctionDrawn.add(e.to);
    return (
      <Fragment key={k}>
        <path
          d={`M ${round(x1)} ${round(y1)} C ${mx} ${round(y1)}, ${mx} ${round(yEnd)}, ${round(x2)} ${round(yEnd)}`}
          fill="none" stroke={C.muted} strokeWidth="3"
          markerEnd={merged ? undefined : markerRef(ctx)}
        />
        {drawJunction && (
          <line
            x1={round(x2)} y1={round(yEnd)} x2={round(xEnd)} y2={round(yEnd)}
            stroke={C.muted} strokeWidth="3" markerEnd={markerRef(ctx)}
          />
        )}
        <EdgeLabel ctx={ctx} x={mx} y={(y1 + yEnd) / 2 - 10}>{e.label}</EdgeLabel>
      </Fragment>
    );
  });

  return (
    <SvgLead box={box}>
      <ArrowDef ctx={ctx} />
      <g>{edges}</g>
      <g>
        {Object.keys(pos).map((id) => {
          const p = pos[id];
          return (
            <NodeCard
              key={id}
              ctx={ctx}
              x={p.x} y={p.y} w={cardW} h={cardH}
              hot={emph.has(id)} label={p.label} detail={p.detail} icon={p.icon} badge={null}
            />
          );
        })}
      </g>
    </SvgLead>
  );
}
