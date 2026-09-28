// type-scale.mjs — タイプスケールの既定値と、型の下限の判定に使う定義。
//
// render (描画) と lint (min-type) の両方が読むので、React に依存しない
// 小さなモジュールに分けておく。lint は .jsx を読めない経路からも呼ばれる。

// Type-scale defaults mirror theme.schema.json so a theme that omits a token
// still renders. Present tokens in the theme win.
// 本文系 (BODY_TOKENS) は theme.type.body.min_size_pt 24pt = 32px 以上に置く
// (ADR-0025)。
export const DEFAULT_SCALE = {
  hero: 80, title: 74, big: 70, quote: 46, heading: 34,
  bullet: 34, subtitle: 32, attribution: 32, node: 32, axis: 20,
  code: 22, stat: 160,
};

// 聴衆に読ませる本文を運ぶトークン (SPEC §2.3)。min-type の対象。
// display 系 (hero / title / big / quote / heading / stat) は下限より十分大きい
// ので対象外、axis と code は補助情報・素材として対象外にする。
export const BODY_TOKENS = ['bullet', 'subtitle', 'attribution', 'node'];

// キャンバス 1280×720px を 16:9 の 960×540pt に対応させる (ADR-0025)。
export const PT_PER_PX = 0.75;
export const pxToPt = (px) => Math.round(px * PT_PER_PX * 10) / 10;
export const ptToPx = (pt) => Math.ceil(pt / PT_PER_PX);

/** テーマの scale を既定値で埋めたもの。 */
export function resolveScale(theme) {
  return { ...DEFAULT_SCALE, ...(theme?.type?.scale || {}) };
}
