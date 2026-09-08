// render.mjs — 原稿の Markdown を、serve で見せる HTML に変える。
//
// 対象は markdown.mjs が出す (= 原稿で使う) 記法だけ。見出し・段落・強調・
// リンク・画像とキャプション・引用・リスト・コード・区切り線・URL だけの行
// (埋め込み)。汎用の Markdown 処理系を依存に足さないための最小実装で、
// 各ブロックに data-block (0 始まりの通し番号) を付け、フィードバックの位置の
// 手掛かりにする。

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const URL_RE = /https?:\/\/[^\s<>)\]]+/g;
const BARE_URL_LINE_RE = /^https?:\/\/\S+$/;

// バックスラッシュのエスケープは、記法の処理が終わるまで私用領域の文字に退避する。
const ESC = '';
const stash = (s, box) => s.replace(/\\(.)/g, (_m, c) => { box.push(c); return `${ESC}${box.length - 1}${ESC}`; });
const unstash = (s, box) => s.replace(new RegExp(`${ESC}(\\d+)${ESC}`, 'g'), (_m, i) => escapeHtml(box[Number(i)]));

/** インライン記法を HTML にする。 */
export function inlineHtml(src) {
  const box = [];
  let s = stash(src, box);
  // コードスパンは中を触らない
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_m, c) => { codes.push(`<code>${escapeHtml(c)}</code>`); return `${codes.length - 1}`; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/(^|[^"'>])(https?:\/\/[^\s<)\]]+)/g, (_m, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/ {2}\n/g, '<br>\n');
  s = s.replace(/(\d+)/g, (_m, i) => codes[Number(i)]);
  return unstash(s, box);
}

const IMAGE_RE = /^(?:\[)?!\[([^\]]*)\]\(([^)\s]+)\)(?:\]\(([^)\s]+)\))?\s*$/;
const CAPTION_RE = /^\*([^*].*)\*\s*$/;

/** 行の配列をブロックの配列に切る。 */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  const peek = () => lines[i] ?? null;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const fence = line.match(/^(`{3,})/);
    if (fence) {
      const close = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && lines[i] !== close) buf.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: buf.join('\n') });
      continue;
    }
    if (/^<!--/.test(line)) {
      while (i < lines.length && !/-->/.test(lines[i])) i++;
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6}) (.*)$/);
    if (heading) { blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] }); i++; continue; }
    if (/^---+\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue; }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ''));
      blocks.push({ kind: 'quote', blocks: parseBlocks(buf) });
      continue;
    }
    if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && /^(?:- |\d+\. )/.test(lines[i])) {
        let item = lines[i++].replace(/^(?:- |\d+\. )/, '');
        while (i < lines.length && /^\s+\S/.test(lines[i])) item += `\n${lines[i++].trim()}`;
        items.push(item);
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const img = line.match(IMAGE_RE);
    if (img) {
      i++;
      const cap = peek()?.match(CAPTION_RE);
      if (cap) i++;
      blocks.push({ kind: 'image', alt: img[1], src: img[2], link: img[3] ?? null, caption: cap ? cap[1] : '' });
      continue;
    }
    if (BARE_URL_LINE_RE.test(line.trim())) { blocks.push({ kind: 'embed', url: line.trim() }); i++; continue; }

    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6} |>|```|---+\s*$|(?:- |\d+\. ))/.test(lines[i])
      && !IMAGE_RE.test(lines[i]) && !BARE_URL_LINE_RE.test(lines[i].trim())) {
      buf.push(lines[i++]);
    }
    if (buf.length === 0) { i++; continue; }
    blocks.push({ kind: 'paragraph', text: buf.join('\n') });
  }
  return blocks;
}

function blockHtml(b, attr) {
  switch (b.kind) {
    case 'heading': return `<h${b.level}${attr}>${inlineHtml(b.text)}</h${b.level}>`;
    case 'paragraph': return `<p${attr}>${inlineHtml(b.text)}</p>`;
    case 'hr': return `<hr${attr}>`;
    case 'code': return `<pre${attr}><code>${escapeHtml(b.text)}</code></pre>`;
    case 'quote': return `<blockquote${attr}>${b.blocks.map((x) => blockHtml(x, '')).join('\n')}</blockquote>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}${attr}>${b.items.map((t) => `<li>${inlineHtml(t)}</li>`).join('')}</${tag}>`;
    }
    case 'image': {
      const img = `<img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}">`;
      const body = b.link ? `<a href="${escapeHtml(b.link)}" target="_blank" rel="noopener">${img}</a>` : img;
      const cap = b.caption ? `<figcaption>${inlineHtml(b.caption)}</figcaption>` : '';
      return `<figure${attr}>${body}${cap}</figure>`;
    }
    case 'embed': {
      const host = b.url.replace(/^https?:\/\//, '').split('/')[0];
      return `<a class="embed"${attr} href="${escapeHtml(b.url)}" target="_blank" rel="noopener">` +
        `<span class="embed-host">${escapeHtml(host)}</span><span class="embed-url">${escapeHtml(b.url)}</span></a>`;
    }
    default: return '';
  }
}

/**
 * 原稿の本文 (front matter を除いたもの) を HTML にする。
 * @returns {{ html: string, blocks: number }}
 */
export function renderBody(body) {
  const blocks = parseBlocks(body.replace(/\r\n?/g, '\n').split('\n'));
  const html = blocks.map((b, n) => blockHtml(b, ` data-block="${n}"`)).join('\n');
  return { html, blocks: blocks.length };
}
