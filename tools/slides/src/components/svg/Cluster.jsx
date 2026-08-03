// Cluster.jsx — 群と環を描く form (SPEC §6.4)。overlap / enclosed /
// closure / linked / radial.core / cycle。
//
// 環上の座標そのものは render.mjs の ringPositions と ringArcEdge が出す。
// ここはその結果を受け取って描く。

import { Fragment } from 'react';
import { round } from '../../geometry.mjs';
import { estW } from '../../text.mjs';
import { ArrowDef, NodeCard, SvgLead, markerRef } from './Primitives.jsx';

/**
 * cluster.overlap — 半透明の円が重なるベン図 (SPEC §6.4, ADR-0015)。
 *
 * ラベルは重心から外向きに逃がすと、重なり領域と喧嘩しない。描画順は円 →
 * 交差の塗り → ラベルで、ラベルが最前面に来る。
 */
export function Overlap({ el, box, ctx, r, dist }) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  const s = dist * r;

  const centers = n === 3
    ? [
      { x: box.w / 2, y: r },
      { x: box.w / 2 - s / 2, y: r + s * 0.866 },
      { x: box.w / 2 + s / 2, y: r + s * 0.866 },
    ]
    : el.nodes.map((_, i) => ({ x: r + i * s, y: box.h / 2 }));

  const gx = centers.reduce((t, c) => t + c.x, 0) / n;
  const gy = centers.reduce((t, c) => t + c.y, 0) / n;

  const fitFs = (base, text) => {
    const tw = estW(text, base);
    const availW = r * 1.3;
    return tw > availW ? Math.max(15, Math.floor(base * availW / tw)) : base;
  };

  // 交差領域 (ADR-0015): 全円の共通部分を clipPath の入れ子で塗る。
  // 円の重心が共通部分のほぼ中心 (2 円は中点、3 円は重心)。ベースライン描画
  // なので、視覚中心に合わせてわずかに下げる。
  let sharedFill = null;
  if (el.shared?.emphasis) {
    sharedFill = (
      <circle
        cx={round(centers[n - 1].x)} cy={round(centers[n - 1].y)} r={round(r)}
        fill={C.highlight} fillOpacity="0.16"
      />
    );
    for (let i = 0; i < n - 1; i++) {
      sharedFill = <g clipPath={`url(#ov-${ctx.slideKey}-${i})`}>{sharedFill}</g>;
    }
  }

  return (
    <SvgLead box={box}>
      <g>
        {el.nodes.map((nd, i) => (
          <circle
            key={nd.id}
            cx={round(centers[i].x)} cy={round(centers[i].y)} r={round(r)}
            fill={C.surface} fillOpacity="0.55"
            stroke={emph.has(nd.id) ? C.highlight : C.line}
            strokeWidth={emph.has(nd.id) ? 3 : 2.5}
          />
        ))}
      </g>
      <g>
        {el.shared?.emphasis && (
          <defs>
            {Array.from({ length: n - 1 }, (_, i) => (
              <clipPath key={i} id={`ov-${ctx.slideKey}-${i}`}>
                <circle cx={round(centers[i].x)} cy={round(centers[i].y)} r={round(r)} />
              </clipPath>
            ))}
          </defs>
        )}
        {sharedFill}
        {el.shared?.label && (
          <text
            x={round(gx)} y={round(gy + 8 + 7)} textAnchor="middle"
            fill={el.shared.emphasis ? C.highlight : C.muted}
            fontSize={scale.axis}
            fontWeight={el.shared.emphasis ? fonts.wDisplay : 'inherit'}
            fontFamily={fonts.display}
          >
            {el.shared.label}
          </text>
        )}
      </g>
      <g>
        {el.nodes.map((nd, i) => {
          const c = centers[i];
          const hot = emph.has(nd.id);
          const dl = Math.hypot(c.x - gx, c.y - gy) || 1;
          const lx = c.x + ((c.x - gx) / dl) * r * 0.32;
          const ly = c.y + ((c.y - gy) / dl) * r * 0.32;
          return (
            <Fragment key={nd.id}>
              <text
                x={round(lx)} y={round(ly)} textAnchor="middle"
                fill={hot ? C.textStrong : C.text}
                fontSize={fitFs(hot ? scale.node + 2 : scale.node, nd.label)}
                fontWeight={fonts.wDisplay} fontFamily={fonts.display}
              >
                {nd.label}
              </text>
              {nd.detail && (
                <text
                  x={round(lx)} y={round(ly + scale.axis * 1.6)} textAnchor="middle"
                  fill={C.muted} fontSize={fitFs(scale.axis, nd.detail)} fontFamily={fonts.body}
                >
                  {nd.detail}
                </text>
              )}
            </Fragment>
          );
        })}
      </g>
    </SvgLead>
  );
}

/** cluster.enclosed — nodes[0] が境界 (ラベル付きの容れ物)、残りが中身の一列。 */
export function Enclosed({ el, box, ctx, members, cardW, cardH, gap, headH }) {
  const { C, fonts, scale } = ctx;
  const [group] = el.nodes;
  const emph = new Set(el.emphasis || []);
  const hotGroup = emph.has(group.id);
  const cx = box.w / 2;
  const rowW = members.length * cardW + (members.length - 1) * gap;
  const x0 = (box.w - rowW) / 2;
  return (
    <SvgLead box={box}>
      <rect
        x="0" y="0" width={round(box.w)} height={round(box.h)} rx="22"
        fill={C.surface} fillOpacity="0.45"
        stroke={hotGroup ? C.highlight : C.line} strokeWidth={hotGroup ? 3 : 2}
      />
      <text
        x={round(cx)} y={round(headH - (group.detail ? scale.axis * 1.9 : 0) - 24)}
        textAnchor="middle" fill={hotGroup ? C.textStrong : C.text}
        fontSize={scale.node + 2} fontWeight={fonts.wDisplay} fontFamily={fonts.display}
      >
        {group.label}
      </text>
      {group.detail && (
        <text
          x={round(cx)} y={round(headH - 26)} textAnchor="middle"
          fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
        >
          {group.detail}
        </text>
      )}
      {members.map((nd, i) => (
        <NodeCard
          key={nd.id}
          ctx={ctx}
          x={x0 + i * (cardW + gap)} y={headH} w={cardW} h={cardH}
          hot={emph.has(nd.id)} label={nd.label} detail={nd.detail} icon={nd.icon} badge={null}
        />
      ))}
    </SvgLead>
  );
}

/**
 * cluster.closure / linked — 環に並べる。linked は向きのない線を引く。
 *
 * 線のラベルは線上ではなく、法線方向・環の外側へ逃がす (レビュー指摘
 * 2026-07-08)。
 */
export function RingCluster({ el, box, ctx, cardW, cardH, pos, exitRect }) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  const byId = Object.fromEntries(pos.map((n) => [n.id, n]));
  const rectFor = (p) => ({ x: p.x - cardW / 2, y: p.y - cardH / 2, w: cardW, h: cardH });

  const lines = (el.edges || []).map((e, k) => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return null; // edge-ref lint が報告する
    const p1 = exitRect(a, b, rectFor(a), 6);
    const p2 = exitRect(b, a, rectFor(b), 6);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const dl = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    let nx = -(p2.y - p1.y) / dl, ny = (p2.x - p1.x) / dl;
    if (nx * (mx - box.w / 2) + ny * (my - box.h / 2) < 0) { nx = -nx; ny = -ny; }
    return (
      <Fragment key={k}>
        <line
          x1={round(p1.x)} y1={round(p1.y)} x2={round(p2.x)} y2={round(p2.y)}
          stroke={C.muted} strokeWidth="2.5" opacity="0.7"
        />
        {e.label && (
          <text
            x={round(mx + nx * 18)} y={round(my + ny * 18 + 6)} textAnchor="middle"
            fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
          >
            {e.label}
          </text>
        )}
      </Fragment>
    );
  });

  return (
    <SvgLead box={box}>
      <g>{lines}</g>
      <g>
        {pos.map((n) => {
          const rc = rectFor(n);
          return (
            <NodeCard
              key={n.id}
              ctx={ctx}
              x={rc.x} y={rc.y} w={rc.w} h={rc.h}
              hot={emph.has(n.id)} label={n.label} detail={n.detail} icon={n.icon} badge={null}
            />
          );
        })}
      </g>
    </SvgLead>
  );
}

/**
 * radial.core — nodes[0] が中心、残りが環上の正多角形の頂点に座る。cycle と
 * 違って環の離心率に上限を設けない。中心がまんなかを占めるぶん、衛星は水平
 * 方向いっぱいの距離を必要とする。宣言されたエッジは矢印で描き、エッジが無い
 * ときは幾何そのものが素の輻を供給する。
 */
export function Radial({ el, box, ctx, cardW, cardH, pts, exitRect }) {
  const { C } = ctx;
  const [core, ...sats] = el.nodes;
  const emph = new Set(el.emphasis || []);
  const rectFor = (p) => ({ x: p.x - cardW / 2, y: p.y - cardH / 2, w: cardW, h: cardH });

  const hasEdges = (el.edges || []).length > 0;
  const lines = hasEdges
    ? el.edges.map((e, k) => {
      const a = pts[e.from], b = pts[e.to];
      if (!a || !b) return null;
      const p1 = exitRect(a, b, rectFor(a), 8);
      const p2 = exitRect(b, a, rectFor(b), 14);
      return (
        <line
          key={k}
          x1={round(p1.x)} y1={round(p1.y)} x2={round(p2.x)} y2={round(p2.y)}
          stroke={C.muted} strokeWidth="3" markerEnd={markerRef(ctx)}
        />
      );
    })
    : sats.map((n) => {
      const p = pts[n.id];
      const p1 = exitRect(pts[core.id], p, rectFor(pts[core.id]), 8);
      const p2 = exitRect(p, pts[core.id], rectFor(p), 8);
      return (
        <line
          key={n.id}
          x1={round(p1.x)} y1={round(p1.y)} x2={round(p2.x)} y2={round(p2.y)}
          stroke={C.muted} strokeWidth="2" opacity="0.6"
        />
      );
    });

  return (
    <SvgLead box={box}>
      <ArrowDef ctx={ctx} />
      <g>{lines}</g>
      <g>
        {el.nodes.map((n) => {
          const rc = rectFor(pts[n.id]);
          return (
            <NodeCard
              key={n.id}
              ctx={ctx}
              x={rc.x} y={rc.y} w={rc.w} h={rc.h}
              hot={emph.has(n.id)} label={n.label} detail={n.detail} icon={n.icon} badge={null}
            />
          );
        })}
      </g>
    </SvgLead>
  );
}

/**
 * flow.cycle — ほぼ正円の環に置いたカードと、環そのものの弧としてのエッジ。
 *
 * カードに番号バッジは付けない。ループに「最初の一歩」はなく、順序は矢印が
 * 語る。ノードは正多角形の頂点に座るので、3 ノードの循環は潰れた三角形では
 * なく正三角形として読める。ラベルは最前面に置き、カードに隠れないようにする。
 */
export function Cycle({ el, box, ctx, cardW, cardH, pos, arcs }) {
  const { C, fonts, scale } = ctx;
  const emph = new Set(el.emphasis || []);
  return (
    <SvgLead box={box}>
      <ArrowDef ctx={ctx} />
      <g>
        {arcs.map((arc, k) => (
          <path
            key={k}
            d={arc.d} fill="none" stroke={C.muted} strokeWidth="3" markerEnd={markerRef(ctx)}
          />
        ))}
      </g>
      <g>
        {pos.map((n) => (
          <NodeCard
            key={n.id}
            ctx={ctx}
            x={n.x - cardW / 2} y={n.y - cardH / 2} w={cardW} h={cardH}
            hot={emph.has(n.id)} label={n.label} detail={n.detail} icon={n.icon} badge={null}
          />
        ))}
      </g>
      <g>
        {arcs.map((arc, k) => arc.label && arc.text && (
          <text
            key={k}
            x={round(arc.label.x)} y={round(arc.label.y)} textAnchor={arc.label.anchor}
            fill={C.muted} fontSize={scale.axis} fontFamily={fonts.body}
          >
            {arc.text}
          </text>
        ))}
      </g>
    </SvgLead>
  );
}
