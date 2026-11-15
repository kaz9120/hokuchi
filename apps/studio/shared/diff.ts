// サイトに出す前の見た目の差の判定。build.mjs は画像のバイトで比べるので、目に見えない揺れでも止まる。
// ここで画素を比べ、話者が確かめる関門を緩めずに「揺れ」と「変化」を分ける

/** RGB の差の和がこれを超えた画素を「強く変わった」とみなす。文字のにじみ (アンチエイリアス) の揺れはこれ以下に収まる */
export const STRONG = 48

/** 弱く変わった画素がこの割合を超えたら、揺れではなく広い範囲の色の変化 (テーマの色味など) とみなす。
 *  文字の縁の揺れは depm の 3 件で 33〜40 画素 (0.005% 未満) だった。0.5% はその 100 倍の目安で、実測した境ではない */
export const TINT_RATIO = 0.005

export type DiffResult = {
  /** same: 画素が同じ / jitter: 弱い揺れが少しだけ / tint: 広い範囲で色が少し変わった / changed: 強く変わった画素がある / size: 大きさが違う */
  kind: 'same' | 'jitter' | 'tint' | 'changed' | 'size'
  strong: number
  weak: number
  /** 比べた画素の数 */
  total: number
}

/** RGBA の画素の並び 2 つを比べる。強く変わった画素が 1 個でもあれば changed (小さな数字 1 文字の差し替えも見逃さない)。
 *  弱い変化でも広い範囲なら tint (色味の変更も見逃さない) */
export const isChange = (r: DiffResult) => r.kind === 'changed' || r.kind === 'tint' || r.kind === 'size'

export function classifyDiff(a: ArrayLike<number>, b: ArrayLike<number>, sizeA: [number, number], sizeB: [number, number]): DiffResult {
  if (sizeA[0] !== sizeB[0] || sizeA[1] !== sizeB[1]) return { kind: 'size', strong: 0, weak: 0, total: 0 }
  let strong = 0
  let weak = 0
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d > STRONG) strong++
    else if (d > 0) weak++
  }
  const total = a.length / 4
  return { kind: strong ? 'changed' : weak > total * TINT_RATIO ? 'tint' : weak ? 'jitter' : 'same', strong, weak, total }
}
