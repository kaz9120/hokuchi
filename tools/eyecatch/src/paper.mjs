// paper.mjs — 見出し画像の台紙の決まりごと
//
// 紙の色と粒は、nano banana が暗い紙に描いた画像の実測から取る (2026-10 に 6 枚を測った)。
// 生成のたびに紙の色がぶれるので、台紙は毎回ここで作り直し、モチーフだけを載せる。

export const WIDTH = 1280;
export const HEIGHT = 670;

/** 紙の色。生成画像の紙の中央値 (#2a251f〜#413933) の真ん中あたりの暖かい炭色 */
export const PAPER = [44, 39, 33];

/** 紙の粒のムラ (標準偏差)。生成画像の縁の実測 2.1〜2.3 に合わせる */
export const GRAIN = 2.3;

/** 端から空ける割合。note の一覧で切り抜かれても欠けないように */
export const MARGIN = 0.08;

/** モチーフのインクの量の既定。画面の面積に対する割合。6 枚を並べて、どれも小さすぎず大きすぎなかった値 */
export const INK = 0.03;

/** 置き場所の名前 → モチーフの中心 (左上を 0、右下を 1 とする割合) */
export const POSITIONS = {
  'upper-left': [0.28, 0.36],
  top: [0.5, 0.32],
  'upper-right': [0.74, 0.34],
  left: [0.26, 0.5],
  right: [0.74, 0.5],
  'lower-left': [0.26, 0.64],
  bottom: [0.5, 0.66],
  'lower-right': [0.7, 0.62],
};

/** "upper-left" か "0.3,0.6" を [x, y] にする */
export function parsePosition(s) {
  if (POSITIONS[s]) return POSITIONS[s];
  const m = /^(0(?:\.\d+)?|1(?:\.0+)?),(0(?:\.\d+)?|1(?:\.0+)?)$/.exec(s ?? '');
  if (!m) throw new Error(`置き場所が読めない: ${s} (${Object.keys(POSITIONS).join(' / ')} か x,y)`);
  return [Number(m[1]), Number(m[2])];
}
