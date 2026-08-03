// Cards.jsx — 面を持つ素材 (SPEC §6.7 / §6.12)。
//
// code-panel と versus-panel は自前の不透明な背景を持つので、濃色背景での
// 反転 (.inv) を要さない。カードが背景によらずコントラストを供給する。

import { Fragment } from 'react';
import { InlineText } from '../InlineText.jsx';

/**
 * code — 一次資料としてのコード (SPEC §6.7)。
 *
 * lines は [{ html, className }] で、ハイライト済みの HTML を持つ。トークン
 * 着色は highlight.js の出力なので、行の中身だけは生のまま流し込む。
 *
 * font-family を inline style に書かない理由: mono スタックは値に二重引用符を
 * 含み ("SF Mono" など)、style 属性がそこで途切れて font-size や padding ごと
 * 落ちていた (レビュー指摘 2026-07-09)。書体は .code-body 規則で当てる。
 */
export function CodePanel({ filename, labelH, fs, lineH, padX, padY, lines }) {
  return (
    <div className="code-panel">
      {filename && (
        <div className="code-file" style={{ height: labelH, lineHeight: `${labelH}px` }}>
          {filename}
        </div>
      )}
      <div className="code-body" style={{ fontSize: fs, padding: `${padY}px ${padX}px` }}>
        {lines.map((l, i) => (
          <div
            key={i}
            className={l.className}
            style={{ height: lineH, lineHeight: `${lineH}px` }}
            dangerouslySetInnerHTML={{ __html: l.html }}
          />
        ))}
      </div>
    </div>
  );
}

/** versus — 左右 2 枚の対比 (SPEC §6.12)。両パネルは高い方の高さを共有し、
 * 項目数が違っても対称に読める。 */
export function Versus({ el, panelW, panelH, fsLabel, fsItem, padX, padY, labelGap, itemGap, itemIndent, dividerW }) {
  const hasEmphasis = el.sides.some((s) => s.emphasis);
  const panelClass = (side) => {
    if (side.emphasis) return 'versus-panel versus-em';
    return hasEmphasis ? 'versus-panel versus-dim' : 'versus-panel';
  };
  return (
    <div className="versus-row">
      {el.sides.map((side, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className="versus-divider" style={{ width: dividerW, height: panelH }} />
          )}
          <div
            className={panelClass(side)}
            style={{ width: panelW, height: panelH, padding: `${padY}px ${padX}px` }}
          >
            <div className="versus-label jp" style={{ fontSize: fsLabel }}>
              <InlineText text={side.label} />
            </div>
            <ul
              className="versus-items"
              style={{ fontSize: fsItem, gap: itemGap, marginTop: labelGap, paddingLeft: itemIndent }}
            >
              {side.items.map((it, j) => (
                <li key={j}>
                  <span className="dot" />
                  <span className="jp"><InlineText text={it} /></span>
                </li>
              ))}
            </ul>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
