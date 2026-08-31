// html.mjs — note 本文 HTML の最小パーサ。
//
// note の body は限られたタグ (p / h2 / h3 / figure / img / a / strong / em /
// br / ul / ol / li / pre / code / blockquote / hr / table-of-contents) しか
// 使わない整形式に近い HTML なので、依存を足さずに自前で木にする。
// 未知のタグが来ても捨てずに要素として残し、parse 側で警告できるようにする。

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source']);
const RAW_TEXT = new Set(['script', 'style']);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00a0', mdash: '—', ndash: '–', hellip: '…',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°',
  times: '×', divide: '÷', yen: '¥', euro: '€', pound: '£', sect: '§',
};

/** HTML エンティティを文字に戻す。数値参照 (10 進 / 16 進) にも対応する。 */
export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const hit = NAMED_ENTITIES[body];
    return hit === undefined ? whole : hit;
  });
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([-a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[m[1].toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

/**
 * HTML 文字列を { type: 'element' | 'text', ... } の木にする。
 * 戻り値はルート直下のノード配列。
 */
export function parseHTML(html) {
  const root = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  let i = 0;
  const pushText = (raw) => {
    if (raw === '') return;
    top().children.push({ type: 'text', value: decodeEntities(raw) });
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(html.slice(i)); break; }
    pushText(html.slice(i, lt));

    // コメント
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    // <!DOCTYPE ...> など
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const gt = html.indexOf('>', lt);
    if (gt === -1) { pushText(html.slice(lt)); break; }
    const inner = html.slice(lt + 1, gt);

    // 閉じタグ
    if (inner[0] === '/') {
      const tag = inner.slice(1).trim().toLowerCase();
      // 対応する開始タグまで遡って閉じる (不一致は暗黙クローズ扱い)
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].tag === tag) { stack.length = d; break; }
      }
      i = gt + 1;
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const space = body.search(/\s/);
    const tag = (space === -1 ? body : body.slice(0, space)).toLowerCase();
    const attrs = space === -1 ? {} : parseAttrs(body.slice(space));
    const node = { type: 'element', tag, attrs, children: [] };
    top().children.push(node);
    i = gt + 1;

    if (RAW_TEXT.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      const end = close === -1 ? html.length : close;
      node.children.push({ type: 'text', value: html.slice(i, end) });
      i = end === -1 ? html.length : html.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }

  return root.children;
}

/** ノード配列からテキストだけを連結する (改行や空白は保たない)。 */
export function textOf(nodes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.tag === 'br') out += '\n';
    else if (n.type === 'element') out += textOf(n.children);
  }
  return out;
}

/** 木を深さ優先で辿り、条件に合う要素をすべて返す。 */
export function findAll(nodes, pred) {
  const hits = [];
  const walk = (list) => {
    for (const n of list) {
      if (n.type !== 'element') continue;
      if (pred(n)) hits.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return hits;
}

/** 木を深さ優先で辿り、条件に合う最初の要素を返す。 */
export function find(nodes, pred) {
  return findAll(nodes, pred)[0] ?? null;
}
