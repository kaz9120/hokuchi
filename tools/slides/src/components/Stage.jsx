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
// lead は移行の進み具合で React 要素にも HTML 文字列にもなる。文字列のときは
// lead-box 自身に流し込むので、どちらでも構造は変わらない。

export function Stage({ headlineHtml, headFontSize, lead, leadW, leadH, align = 'center' }) {
  const boxStyle = { width: `${leadW}px`, height: `${leadH}px` };
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
        {typeof lead === 'string'
          ? <div className="lead-box" style={boxStyle} dangerouslySetInnerHTML={{ __html: lead }} />
          : <div className="lead-box" style={boxStyle}>{lead}</div>}
      </div>
    </div>
  );
}
