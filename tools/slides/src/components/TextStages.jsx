// TextStages.jsx — テキストだけで成立する 3 つのパターン (SPEC §5.1)。
//
// statement / title / quote は主役が 1 文で、measure を必要としない。舞台を
// そのまま使い、光学中心に載せる。ADR-0018 の移行では最初に JSX へ移す群で、
// 以降のパターンが従う書き方の見本になる。

import { CANVAS, boxStyleObj, round, stageRect } from '../geometry.mjs';
import { cpLen } from '../text.mjs';
import { InlineText } from './InlineText.jsx';

/** 箱の下端を 6% 削って flex 中央に置くと、内容の中心が幾何中心よりわずかに
 * 上に来る。3 パターンで共有する光学中心の作り方。 */
function opticalPane() {
  const stage = stageRect();
  return { ...stage, h: round(stage.h * 0.94) };
}

export function StatementStage({ slide, ctx }) {
  const el = slide.elements.find((e) => e.slot === 'statement');
  const support = slide.elements.find((e) => e.slot === 'support');
  const token = (slide.role === 'opener' || slide.role === 'closer') ? 'hero' : 'big';
  return (
    <div className="pane center" style={boxStyleObj(opticalPane())}>
      <div className="statement jp" style={{ fontSize: ctx.scale[token] }}>
        <InlineText text={el.text} emphasis={el.emphasis} />
      </div>
      {support && (
        <div className="support jp" style={{ fontSize: ctx.scale.subtitle }}>
          <InlineText text={support.text} emphasis={support.emphasis} />
        </div>
      )}
    </div>
  );
}

export function TitleStage({ slide, ctx }) {
  const stage = stageRect();
  // タイトル群の下端はキャンバスの黄金分割 (上から 61.8%) に置く
  const band = { x: stage.x, y: stage.y, w: stage.w, h: round(CANVAS.h * 0.618 - stage.y) };
  const title = slide.elements.find((e) => e.slot === 'title');
  const sub = slide.elements.find((e) => e.slot === 'subtitle');
  return (
    <div className="pane title-band" style={boxStyleObj(band)}>
      <div className="title-accent" />
      <div className="title-main jp" style={{ fontSize: ctx.scale.title }}>
        <InlineText text={title.text} emphasis={title.emphasis} />
      </div>
      {sub && (
        <div className="title-sub jp" style={{ fontSize: ctx.scale.subtitle }}>
          <InlineText text={sub.text} emphasis={sub.emphasis} />
        </div>
      )}
    </div>
  );
}

export function QuoteStage({ slide, ctx }) {
  const q = slide.elements.find((e) => e.slot === 'quote');
  // 短い引用はそのスライドの主役なので、本文引用のサイズ (46px) のまま空いた
  // 舞台に置かず、display 側へ寄せて大きくする。
  const len = cpLen(String(q.text).replace(/\n/g, ''));
  const fs = len <= 12 ? Math.round(ctx.scale.quote * 1.7)
    : len <= 24 ? Math.round(ctx.scale.quote * 1.35)
    : ctx.scale.quote;
  return (
    <div className="pane center" style={boxStyleObj(opticalPane())}>
      <div className="quote-block">
        <div className="quote-mark">&ldquo;</div>
        <div className="quote-text jp" style={{ fontSize: fs }}>
          <InlineText text={q.text} />
        </div>
        {q.attribution && (
          <div className="quote-attr" style={{ fontSize: ctx.scale.attribution }}>
            — {q.attribution}
          </div>
        )}
      </div>
    </div>
  );
}
