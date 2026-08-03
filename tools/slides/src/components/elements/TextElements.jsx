// TextElements.jsx — 文字が主体の要素 (SPEC §6.2 / §6.10 / §6.11 / §6.13)。
//
// いずれも寸法は measure が決め、ここは描画だけを持つ。スライドの地の上に
// じかに置かれるので、濃色背景での反転 (.inv) は CSS 側が面倒を見る。

import { round } from '../../geometry.mjs';
import { InlineText } from '../InlineText.jsx';

/** bullets — 箇条書き (SPEC §6.2)。 */
export function Bullets({ items, fs, gap, indent }) {
  return (
    <ul className="bullets" style={{ fontSize: fs, gap: round(gap), paddingLeft: indent }}>
      {items.map((it, i) => (
        <li key={i}>
          <span className="dot" />
          <span className="jp"><InlineText text={it} /></span>
        </li>
      ))}
    </ul>
  );
}

/** stat — 大きな数字 1 つ (SPEC §6.10)。 */
export function Stat({ el, fs, fsLabel, fsContext }) {
  return (
    <div className="stat-block">
      <div className="stat-value" style={{ fontSize: fs }}>{el.value}</div>
      {el.label && (
        <div className="stat-label jp" style={{ fontSize: fsLabel }}>
          <InlineText text={el.label} />
        </div>
      )}
      {el.context && (
        <div className="stat-context jp" style={{ fontSize: fsContext }}>
          <InlineText text={el.context} />
        </div>
      )}
    </div>
  );
}

/** agenda — 目次と現在地 (SPEC §6.13)。 */
export function Agenda({ chapters, currentIdx, fs, numW, gapNum, gap }) {
  return (
    <ul className="agenda-list" style={{ gap: round(gap) }}>
      {chapters.map((c, i) => {
        const hot = i === currentIdx;
        return (
          <li key={i} style={{ gap: gapNum }}>
            <span
              className={hot ? 'agenda-num agenda-num-hot' : 'agenda-num'}
              style={{ width: numW, fontSize: fs }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className={hot ? 'agenda-text jp agenda-text-hot' : 'agenda-text jp'}
              style={{ fontSize: fs }}
            >
              <InlineText text={c.text} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * table — 罫線を最小にした比較表 (SPEC §6.11)。
 *
 * 強調はセルごとの塗りではなく、対象の行・列を覆う 1 枚の角丸帯として描く。
 * セルごとに塗ると列間のギャップで帯が途切れて見える (レビュー指摘
 * 2026-07-09)。ヘッダ下の罫線も同じ理由で、表の実幅ぴったりの 1 本にする。
 */
export function Table({ el, fs, colWidths, rowH, headH, colGap }) {
  const emphRows = new Set(el.emphasis?.rows || []);
  const emphCols = new Set(el.emphasis?.cols || []);
  const totalW = colWidths.reduce((a, b) => a + b, 0) + colGap * (colWidths.length - 1);
  const totalH = headH + el.rows.length * rowH;
  const bandPad = 16;

  const colX = [];
  let acc = 0;
  for (const w of colWidths) { colX.push(acc); acc += w + colGap; }

  // 1 列目 (行ラベル) は左揃え、データ列はヘッダ・セルとも中央揃え
  const cellClass = (ci, extra = '') =>
    `table-cell${ci === 0 ? '' : ' table-col-data'}${extra}`;
  const markClass = (cell) =>
    cell === '✓' ? ' table-mark-yes' : cell === '—' ? ' table-mark-no' : '';

  return (
    <div className="table-wrap" style={{ width: round(totalW), height: round(totalH) }}>
      <div className="table-rule" style={{ left: 0, top: round(headH - 2), width: round(totalW) }} />
      {[...emphCols].filter((c) => c - 1 >= 0 && c - 1 < colWidths.length).map((c) => (
        <div
          key={`c${c}`}
          className="table-em-band"
          style={{
            left: round(colX[c - 1] - bandPad),
            top: 0,
            width: round(colWidths[c - 1] + bandPad * 2),
            height: round(totalH),
          }}
        />
      ))}
      {[...emphRows].filter((r) => r - 1 >= 0 && r - 1 < el.rows.length).map((r) => (
        <div
          key={`r${r}`}
          className="table-em-band"
          style={{
            left: round(-bandPad),
            top: round(headH + (r - 1) * rowH),
            width: round(totalW + bandPad * 2),
            height: round(rowH),
          }}
        />
      ))}
      <div
        className="table-grid"
        style={{
          gridTemplateColumns: colWidths.map((w) => `${round(w)}px`).join(' '),
          columnGap: colGap,
          fontSize: fs,
        }}
      >
        {el.columns.map((c, ci) => (
          <div key={`h${ci}`} className={cellClass(ci, ' table-head')} style={{ height: headH, lineHeight: `${headH}px` }}>
            {c}
          </div>
        ))}
        {el.rows.map((row, ri) => row.map((cell, ci) => (
          <div
            key={`${ri}-${ci}`}
            className={cellClass(ci, markClass(cell))}
            style={{ height: rowH, lineHeight: `${rowH}px` }}
          >
            {cell}
          </div>
        )))}
      </div>
    </div>
  );
}
