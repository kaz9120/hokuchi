// Stage.jsx — 見出し帯と主役を縦に積む舞台 (ADR-0018)。
//
// ADR-0014 までは、見出しと主役の合計高さを求めてから舞台の光学中心に置いて
// いた。主役が薄いスライドほど塊が短くなり、見出しの Y が 85px から 267px の
// 間で動く。1 枚ずつは整うが、通しで見ると見出しが跳ねる (design.md §2 の C3
// が求めるデッキ全体の一貫性を満たさない)。
//
// ここでは配置を CSS の flex に委ねる。見出しは舞台の上端に固定され、主役は
// 残りの領域を受け取る。主役の箱の寸法は measure が決めたものをそのまま使い、
// 縦は常に中央、横は align で選ぶ。左端は動かない。
//
// headlineHtml と leadHtml が HTML 文字列なのは移行途中のため。要素側を順次
// コンポーネントに移し、最終的に children で受け取る形にする。

export function Stage({ headlineHtml, headFontSize, leadHtml, leadW, leadH, align = 'center' }) {
  return (
    <div className="stage">
      {headlineHtml != null && (
        <div
          className="headline jp"
          style={{ fontSize: `${headFontSize}px` }}
          dangerouslySetInnerHTML={{ __html: headlineHtml }}
        />
      )}
      <div className={`stage-lead ${align}`}>
        <div
          className="lead-box"
          style={{ width: `${leadW}px`, height: `${leadH}px` }}
          dangerouslySetInnerHTML={{ __html: leadHtml }}
        />
      </div>
    </div>
  );
}
