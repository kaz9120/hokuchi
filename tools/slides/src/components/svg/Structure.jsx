// Structure.jsx — 構造を描く form (SPEC §6.4)。layer / matrix。
//
// どちらも矢印を引かない。層は隣接で、四象限は位置で意味を伝える。

import { NodeCard, SvgLead } from './Primitives.jsx';

/** structure.layer — 宣言順に上から積む全幅の帯。隣接で読ませるので矢印はない。 */
export function Layer({ el, box, ctx, bandH, gap }) {
  const emph = new Set(el.emphasis || []);
  const n = el.nodes.length;
  // measure が高さで切り詰めた場合は帯を等率で縮める
  const bh = Math.min(bandH, (box.h - (n - 1) * gap) / n);
  return (
    <SvgLead box={box}>
      {el.nodes.map((nd, i) => (
        <NodeCard
          key={nd.id}
          ctx={ctx}
          x={0} y={i * (bh + gap)} w={box.w} h={bh}
          hot={emph.has(nd.id)} label={nd.label} detail={nd.detail} icon={nd.icon} badge={null}
        />
      ))}
    </SvgLead>
  );
}

/** structure.matrix — 2 列のカード格子 (定石の 4 つなら 2×2)。 */
export function Matrix({ el, box, ctx, cardW, cardH, gap }) {
  const emph = new Set(el.emphasis || []);
  return (
    <SvgLead box={box}>
      {el.nodes.map((nd, i) => (
        <NodeCard
          key={nd.id}
          ctx={ctx}
          x={(i % 2) * (cardW + gap)} y={Math.floor(i / 2) * (cardH + gap)}
          w={cardW} h={cardH}
          hot={emph.has(nd.id)} label={nd.label} detail={nd.detail} icon={nd.icon} badge={null}
        />
      ))}
    </SvgLead>
  );
}
