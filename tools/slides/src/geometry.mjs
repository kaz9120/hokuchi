// geometry.mjs — キャンバスと舞台の寸法 (ADR-0014 / ADR-0018)。
//
// 構図の知識はレンダラが専有する (ADR-0014)。ここに置くのはその最下層、
// キャンバスの大きさと外周マージン、そして矩形をスタイルに変える小道具だけ。
// スキーマ・テーマ・SPEC のいずれにも露出しない。

export const CANVAS = { w: 1280, h: 720 };
export const MARGIN = { x: 96, y: 64 }; // 外周のみ。レターボックスという概念は持たない

export const round = (n) => Math.round(n * 100) / 100;

/** 舞台 = キャンバスから外周マージンを差し引いた矩形。内側の分け方は
 * パターンごとに決まる (ADR-0018 以降は CSS が担う)。 */
export function stageRect() {
  return { x: MARGIN.x, y: MARGIN.y, w: CANVAS.w - MARGIN.x * 2, h: CANVAS.h - MARGIN.y * 2 };
}

/** 文字列版 — 移行が済んでいない文字列生成の呼び出し元向け。 */
export const boxStyle = (r) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;

/** React の style オブジェクト版。数値には px が自動で付く。 */
export const boxStyleObj = (r) => ({ left: r.x, top: r.y, width: r.w, height: r.h });
