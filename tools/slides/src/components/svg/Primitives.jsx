// Primitives.jsx — ダイアグラムが共有する SVG の部品 (ADR-0018)。
//
// 座標の計算は render.mjs が持ち続ける (ADR-0014 — 構図はレンダラ専有)。ここに
// あるのは「与えられた座標に何を描くか」だけで、幾何の判断は入れない。

import { round } from '../../geometry.mjs';
import { iconExists, iconInner, promoteWeight } from '../../icons.mjs';
import { estW } from '../../text.mjs';

/** 主役の SVG。箱の寸法をそのまま viewBox にするので、中の座標は箱の座標系。 */
export function SvgLead({ box, children }) {
  return (
    <svg
      className="lead"
      viewBox={`0 0 ${round(box.w)} ${round(box.h)}`}
      width={round(box.w)}
      height={round(box.h)}
      role="img"
    >
      {children}
    </svg>
  );
}

/**
 * 矢尻の marker 定義。id をスライドごとに名前空間化する — 単一ファイル SPA
 * (ADR-0012) では全スライドの SVG が 1 つの文書に同居するため、共有 id は
 * スライドをまたいで衝突する。
 */
export function ArrowDef({ ctx }) {
  return (
    <defs>
      <marker
        id={`arrow-${ctx.slideKey}`}
        viewBox="0 0 10 10" refX="8.5" refY="5"
        markerWidth="9.5" markerHeight="9.5" orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill={ctx.C.muted} />
      </marker>
    </defs>
  );
}

/** ArrowDef が定義した矢尻への参照。 */
export const markerRef = (ctx) => `url(#arrow-${ctx.slideKey})`;

/** 箱の縁に文字が触れないよう、はみ出す分だけ字を縮める。 */
const fitFs = (base, text, avail) => {
  const tw = estW(text, base);
  return tw > avail ? Math.max(15, Math.floor(base * avail / tw)) : base;
};

/**
 * ノード 1 枚: 角丸の面 + 任意の番号バッジ + [アイコン] ラベル [補足] の縦積み。
 * (x, y) はカードの左上。アイコンの太さはテーマ由来で、強調は 1 段だけ太くする
 * (ADR-0013)。step row と環の双方が使う。
 */
export function NodeCard({ ctx, x, y, w, h, hot, label, detail, icon, badge }) {
  const { C, fonts, scale } = ctx;
  const fsL = fitFs(hot ? scale.node + 2 : scale.node, label, w - 30);
  const fsD = detail ? fitFs(scale.axis, detail, w - 26) : scale.axis;
  const cx = x + w / 2;
  const iconSize = 34, iconGap = 14;
  const detailGap = scale.axis * 1.75;
  const drawIcon = icon && iconExists(icon); // 未知の名前は icon-exists lint が報告し、描画は黙って飛ばす
  const blockH = (drawIcon ? iconSize + iconGap : 0) + fsL + (detail ? detailGap + scale.axis * 0.3 : 0);
  let cursor = y + (h - blockH) / 2;
  const iconY = cursor;
  if (drawIcon) cursor += iconSize + iconGap;
  const labelY = cursor + fsL * 0.82;

  return (
    <g>
      <rect
        x={round(x)} y={round(y)} width={round(w)} height={round(h)} rx="18"
        fill={C.surface} stroke={hot ? C.highlight : C.line} strokeWidth={hot ? 3 : 2}
      />
      {badge != null && (
        <>
          <circle cx={round(x + 30)} cy={round(y + 30)} r="15" fill={hot ? C.highlight : C.muted} />
          <text
            x={round(x + 30)} y={round(y + 36)} textAnchor="middle" fill={C.bg}
            fontSize="17" fontWeight="700" fontFamily={fonts.display}
          >
            {badge}
          </text>
        </>
      )}
      {drawIcon && (
        <svg
          x={round(cx - iconSize / 2)} y={round(iconY)}
          width={iconSize} height={iconSize} viewBox="0 0 256 256"
          fill={hot ? C.highlight : C.text}
          dangerouslySetInnerHTML={{ __html: iconInner(icon, hot ? promoteWeight(ctx.iconWeight) : ctx.iconWeight) }}
        />
      )}
      <text
        x={round(cx)} y={round(labelY)} textAnchor="middle"
        fill={hot ? C.textStrong : C.text}
        fontSize={fsL} fontWeight={fonts.wDisplay} fontFamily={fonts.display}
      >
        {label}
      </text>
      {detail && (
        <text
          x={round(cx)} y={round(labelY + detailGap)} textAnchor="middle"
          fill={C.muted} fontSize={fsD} fontFamily={fonts.body}
        >
          {detail}
        </text>
      )}
    </g>
  );
}

/** エッジに添えるラベル。線の中点の少し上に置く。 */
export function EdgeLabel({ ctx, x, y, children }) {
  if (!children) return null;
  return (
    <text
      x={round(x)} y={round(y)} textAnchor="middle"
      fill={ctx.C.muted} fontSize={ctx.scale.axis} fontFamily={ctx.fonts.body}
    >
      {children}
    </text>
  );
}
