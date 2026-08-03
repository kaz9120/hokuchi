// InlineText.jsx — 本文 1 かたまりの描画 (SPEC §8.5、ADR-0018)。
//
// 順序が意味を持つ。行はまず BudouX で文節に分かれ、改行機会 (<wbr>) は文節の
// 境目にだけ置く。強調は文節の内側で文字範囲から適用するので、.hi の境界が
// 改行機会を作ることはない。「意図で」は「意図」を強調しても 1 つの文節の
// まま折れない。
//
// 明示的な \n は <br> として最優先で効く。

import { Fragment } from 'react';
import { emphasisRanges, mergeShortPhrases, parser } from '../text.mjs';

/** 1 文節。行内の位置 [offset, offset+len) に重なる強調範囲を .hi で包む。 */
function Phrase({ phrase, offset, ranges }) {
  const end = offset + phrase.length;
  const parts = [];
  let cursor = offset;
  for (const r of ranges) {
    if (r.end <= offset || r.start >= end) continue;
    const s = Math.max(r.start, offset);
    const e = Math.min(r.end, end);
    if (s > cursor) parts.push(phrase.slice(cursor - offset, s - offset));
    parts.push(<span className="hi" key={s}>{phrase.slice(s - offset, e - offset)}</span>);
    cursor = e;
  }
  if (cursor < end) parts.push(phrase.slice(cursor - offset));
  return <>{parts}</>;
}

function Line({ line, emphasis }) {
  const ranges = emphasisRanges(line, emphasis);
  const phrases = mergeShortPhrases(parser.parse(line));
  let offset = 0;
  const out = [];
  phrases.forEach((p, i) => {
    if (i > 0) out.push(<wbr key={`w${offset}`} />);
    out.push(<Phrase key={`p${offset}`} phrase={p} offset={offset} ranges={ranges} />);
    offset += p.length;
  });
  return <>{out}</>;
}

export function InlineText({ text, emphasis = [] }) {
  const lines = String(text).split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Line line={line} emphasis={emphasis} />
        </Fragment>
      ))}
    </>
  );
}
