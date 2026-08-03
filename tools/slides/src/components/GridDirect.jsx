// GridDirect.jsx — グリッド直接指定 (SPEC §5.2)。
//
// 名前付きパターンで足りないときの脱出口。キャンバス全面をグリッドに割り、
// 要素は id で領域に入る。セルに置けるのは image / statement / quote / raw。

import { InlineText } from './InlineText.jsx';

const COLS = { 'col-3': 3, 'col-4': 4, 'col-5': 5, fibonacci: 4 };

function cellStyle(cell) {
  const [colSpec, rowSpec] = cell.split('/').map((s) => s.trim());
  const [c1, c2 = c1] = colSpec.split('-').map(Number);
  const [r1, r2 = r1] = rowSpec.split('-').map(Number);
  return { gridColumn: `${c1} / ${c2 + 1}`, gridRow: `${r1} / ${r2 + 1}` };
}

/**
 * image と raw は移行が済むまで HTML 文字列で受け取る。セル自身に流し込むので
 * 余分な要素は増えない (renderHtml が呼び出し側の描画関数)。
 */
export function GridDirect({ slide, ctx, renderHtml }) {
  const cols = COLS[ctx.grid.pattern] || 4;
  return (
    <div
      className="grid-stage"
      style={{
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gridTemplateRows: `repeat(${ctx.grid.rows},1fr)`,
      }}
    >
      {slide.layout.areas.map((a, i) => {
        const el = slide.elements.find((e) => e.id === a.element);
        const style = cellStyle(a.cell);
        if (el.kind === 'statement' || el.kind === 'quote') {
          return (
            <div className="grid-cell" style={style} key={i}>
              <div className="grid-caption jp">
                <InlineText text={el.text} emphasis={el.kind === 'statement' ? el.emphasis : undefined} />
              </div>
            </div>
          );
        }
        return (
          <div
            className="grid-cell"
            style={style}
            key={i}
            dangerouslySetInnerHTML={{ __html: renderHtml(el) }}
          />
        );
      })}
    </div>
  );
}
