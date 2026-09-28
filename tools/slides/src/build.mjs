// build.mjs — 段階表示の計画 (SPEC §6.2 / §6.4 / §7.1、ADR-0025)。
//
// スライド 1 枚の reveal と build を「ステップごとの状態表」に落とす。描画は
// しない。状態表は SPA の実行時スクリプトが読み、DOM の [data-b] 属性に当てる。
//
// 用語:
//   key    — DOM 上の対象名。要素の添字を起点にする (書き手の命名に依存させない)。
//            要素全体 "2" / 箇条書きの項目 "2.i3" / ノード "2.n.<id>" /
//            エッジ "2.e1" / ベン図の共通部分 "2.shared"
//   state  — key → 'hide' | 'dim' | 'em'。載っていない key は通常表示
//   states — 添字 0 がスライドに入った直後、k が k 回送った後。長さは steps + 1
//   final  — 静的出力 (shot・一覧・印刷) の姿。hide を含まない
//
// 静的出力は「全ステップを表示し終えた姿」を描く。ただし reveal が付ける dim
// は「話し終えた」という時間の印なので、静的出力には持ち込まない (紙の上では
// どの項目も等しく読める必要がある)。build の dim / emphasize は書き手が明示
// した意味なので、最終ステップの状態をそのまま静的出力に残す。

/** 要素の key (スライド内の添字)。 */
export const elementKey = (slide, el) => String(slide.elements.indexOf(el));
export const itemKey = (ek, i) => `${ek}.i${i}`;
export const nodeKey = (ek, id) => `${ek}.n.${id}`;
export const edgeKey = (ek, i) => `${ek}.e${i}`;
export const sharedKey = (ek) => `${ek}.shared`;

/**
 * 参照文字列 (SPEC §7.1) を key に解決する。解決できなければ null。
 *   <E>                 要素全体。E は要素の slot 名 (grid-direct では id)
 *   <E>.items.<i>       bullets の i 番目 (0 起点)
 *   <E>.edges.<i>       diagram の i 番目のエッジ (0 起点)
 *   <E>.<nodeId>        diagram のノード
 */
export function resolveRef(slide, ref) {
  const parts = String(ref).split('.');
  const els = slide.elements || [];
  // 要素は slot か id のどちらか一方だけを持つ (SPEC §6)。名前付きパターンでは
  // slot 名、grid-direct では id で指す。
  const el = els.find((e) => (e.id ?? e.slot) === parts[0]);
  if (!el) return null;
  const ek = elementKey(slide, el);
  if (parts.length === 1) return ek;
  const [, a, b] = parts;
  if (parts.length === 3 && a === 'items' && el.kind === 'bullets') {
    const i = Number(b);
    return Number.isInteger(i) && i >= 0 && i < el.items.length ? itemKey(ek, i) : null;
  }
  if (parts.length === 3 && a === 'edges' && el.kind === 'diagram') {
    const i = Number(b);
    return Number.isInteger(i) && i >= 0 && i < (el.edges || []).length ? edgeKey(ek, i) : null;
  }
  if (parts.length === 2 && el.kind === 'diagram' && el.nodes.some((n) => n.id === a)) {
    return nodeKey(ek, a);
  }
  return null;
}

/** reveal が作るステップ列。各ステップは「そのステップで確定する状態」の差分。 */
function revealSteps(slide) {
  const steps = [];   // [{ key: state|null }] — null は通常表示に戻す
  const hidden = [];  // 入った直後に隠す key
  for (const el of slide.elements || []) {
    const ek = elementKey(slide, el);
    if (el.kind === 'bullets' && el.reveal === 'one-by-one') {
      el.items.forEach((_, i) => {
        hidden.push(itemKey(ek, i));
        const diff = { [itemKey(ek, i)]: null };
        if (i > 0) diff[itemKey(ek, i - 1)] = 'dim'; // 済んだ項目は dim (p.165)
        steps.push(diff);
      });
    }
    if (el.kind === 'diagram' && el.reveal === 'sequential') {
      const order = new Map(el.nodes.map((n, i) => [n.id, i]));
      const perStep = el.nodes.map((n) => ({ [nodeKey(ek, n.id)]: null }));
      el.nodes.forEach((n) => hidden.push(nodeKey(ek, n.id)));
      // エッジは両端のノードが出たステップで出す
      (el.edges || []).forEach((e, i) => {
        if (!order.has(e.from) || !order.has(e.to)) return;
        hidden.push(edgeKey(ek, i));
        perStep[Math.max(order.get(e.from), order.get(e.to))][edgeKey(ek, i)] = null;
      });
      // ベン図の共通部分は全員がそろったときに出る
      if (el.form === 'cluster.overlap' && (el.shared?.label || el.shared?.emphasis) && perStep.length) {
        hidden.push(sharedKey(ek));
        perStep[perStep.length - 1][sharedKey(ek)] = null;
      }
      steps.push(...perStep);
    }
  }
  return { steps, hidden };
}

/**
 * スライド 1 枚の段階表示の計画。段階表示を持たないスライドは null。
 * @returns {null | { steps: number, states: object[], final: object, unresolved: string[] }}
 */
export function buildPlan(slide) {
  const reveal = revealSteps(slide);
  const build = slide.build || [];
  const unresolved = [];
  const resolve = (ref) => {
    const k = resolveRef(slide, ref);
    if (k == null) unresolved.push(ref);
    return k;
  };

  // build の各ステップを { key: state|null } の差分に変換する。transform は
  // 描画対象が定まるまで未実装 (SPEC §7.1)。ステップ自体は数える — 話者の
  // 送り回数を、書かれた build の段数と食い違わせないため。
  const firstOp = new Map(); // key → そのキーに最初に触れた操作
  const buildDiffs = build.map((step) => {
    const diff = {};
    for (const [op, value] of [['show', null], ['dim', 'dim'], ['emphasize', 'em']]) {
      for (const ref of step[op] || []) {
        const k = resolve(ref);
        if (k == null) continue;
        if (!firstOp.has(k)) firstOp.set(k, op);
        diff[k] = value;
      }
    }
    return diff;
  });

  const steps = reveal.steps.length + buildDiffs.length;
  if (steps === 0) return null;

  // 入った直後の状態: reveal の対象と、build で最初に show される対象は隠す
  const s0 = {};
  for (const k of reveal.hidden) s0[k] = 'hide';
  for (const [k, op] of firstOp) if (op === 'show') s0[k] = 'hide';

  const states = [s0];
  let cur = { ...s0 };
  for (const diff of [...reveal.steps, ...buildDiffs]) {
    cur = { ...cur };
    for (const [k, v] of Object.entries(diff)) {
      if (v == null) delete cur[k]; else cur[k] = v;
    }
    states.push(cur);
  }

  // 静的出力: build の操作だけを最後まで積んだ姿 (reveal の dim は持ち込まない)
  const final = {};
  for (const diff of buildDiffs) {
    for (const [k, v] of Object.entries(diff)) {
      if (v == null) delete final[k]; else final[k] = v;
    }
  }

  return { steps, states, final, unresolved };
}

/**
 * push で連なるスライド列 (SPEC §7.2) の判定。自分が push で入るか、次の
 * スライドが push で入るなら、そのスライドは列の一部。
 */
export const isPush = (s) => typeof s?.connect === 'string' && s.connect.startsWith('push-');
export function inPushChain(slides, i) {
  return isPush(slides[i]) || isPush(slides[i + 1]);
}
