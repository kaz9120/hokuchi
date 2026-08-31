// parse.mjs — note の body HTML を中間表現 (ブロック配列) にする。
//
// note が使う語彙は有限なので、ブロックの種類も有限で数え上げられる。
// 未知のタグは捨てずに kind:'unknown' として残し、verify が気づけるようにする。

import { parseHTML, textOf, find, findAll } from './html.mjs';

// ---------------------------------------------------------------------------
// インライン
// ---------------------------------------------------------------------------
function inlineOf(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      // note は &nbsp; を多用する。Markdown では見えない差になるので通常空白へ寄せる
      const v = n.value.replace(/\u00a0/g, ' ');
      if (v !== '') out.push({ t: 'text', v });
      continue;
    }
    switch (n.tag) {
      case 'br': out.push({ t: 'br' }); break;
      case 'a': out.push({ t: 'link', href: n.attrs.href ?? '', children: inlineOf(n.children) }); break;
      case 'strong': case 'b': out.push({ t: 'strong', children: inlineOf(n.children) }); break;
      case 'em': case 'i': out.push({ t: 'em', children: inlineOf(n.children) }); break;
      case 'code': out.push({ t: 'code', children: inlineOf(n.children) }); break;
      default: out.push(...inlineOf(n.children));
    }
  }
  return out;
}

const isBlank = (inline) =>
  inline.every((x) => (x.t === 'text' ? x.v.trim() === '' : x.t === 'br'));

// ---------------------------------------------------------------------------
// 埋め込みのテキスト表現
// ---------------------------------------------------------------------------

// X のポスト: html_for_embed の blockquote から本文と署名行を取り出す。
// 埋め込み先が消えても本文が残るように、Markdown 側にも書き出す。
function twitterText(embedHtml) {
  if (!embedHtml) return null;
  const nodes = parseHTML(embedHtml);
  const bq = find(nodes, (n) => n.tag === 'blockquote');
  if (!bq) return null;
  const p = bq.children.find((n) => n.type === 'element' && n.tag === 'p');
  const body = p ? textOf([p]) : '';
  // blockquote 直下の p 以外 (— 表示名 (@handle) 日付) が署名行
  const rest = bq.children.filter((n) => n !== p);
  const byline = textOf(rest).replace(/\s+/g, ' ').trim().replace(/^[—–-]\s*/, '');
  return { body: body.trim(), byline };
}

// 外部記事カード: body 側の figure に strong (タイトル) / em (説明) / em (ドメイン) が入る。
function externalArticleText(figure) {
  const a = find(figure.children, (n) => n.tag === 'a');
  if (!a) return null;
  const strong = find([a], (n) => n.tag === 'strong');
  const ems = findAll([a], (n) => n.tag === 'em');
  const clean = (n) => (n ? textOf([n]).replace(/\s+/g, ' ').trim() : '');
  return {
    title: clean(strong),
    description: clean(ems[0]),
    site: clean(ems[1]),
  };
}

// oembed (Spotify など) は iframe の title 属性しか手掛かりがない。
function oembedTitle(embedHtml) {
  if (!embedHtml) return '';
  const iframe = find(parseHTML(embedHtml), (n) => n.tag === 'iframe');
  return iframe?.attrs.title?.trim() ?? '';
}

function embedBlock(figure, embedsByKey) {
  const key = figure.attrs['embedded-content-key'] ?? '';
  const meta = embedsByKey.get(key) ?? {};
  const service = figure.attrs['embedded-service'] ?? meta.service ?? 'unknown';
  const identifier = figure.attrs['data-identifier'];
  const block = {
    kind: 'embed',
    service,
    url: meta.url || figure.attrs['data-src'] || '',
    identifier: identifier && identifier !== 'null' ? identifier : null,
    key,
  };

  if (service === 'twitter') {
    const t = twitterText(meta.html_for_embed);
    if (t) { block.text = t.body; block.byline = t.byline; }
  } else if (service === 'external-article') {
    const t = externalArticleText(figure);
    if (t) Object.assign(block, t);
  } else if (service === 'oembed') {
    const title = oembedTitle(meta.html_for_embed);
    if (title) block.title = title;
  }
  return block;
}

// ---------------------------------------------------------------------------
// figure の 3 態: 画像 / 埋め込み / 引用
// ---------------------------------------------------------------------------
function figureBlock(figure, embedsByKey) {
  if (figure.attrs['embedded-service']) return embedBlock(figure, embedsByKey);

  const caption = (() => {
    const fc = find(figure.children, (n) => n.tag === 'figcaption');
    return fc ? textOf([fc]).replace(/\u00a0/g, ' ').trim() : '';
  })();

  const img = find(figure.children, (n) => n.tag === 'img');
  if (img) {
    // note では画像そのものにリンクを張れる (<a href><img></a>)。href を捨てると
    // 「画像は残ったのにリンク先が消えた」という気づきにくい欠落になる。
    const anchor = findAll(figure.children, (n) => n.tag === 'a' && findAll([n], (c) => c === img).length > 0)[0];
    return {
      kind: 'image',
      src: img.attrs.src ?? '',
      alt: img.attrs.alt ?? '',
      width: img.attrs.width ? Number(img.attrs.width) : null,
      height: img.attrs.height ? Number(img.attrs.height) : null,
      link: anchor?.attrs.href || null,
      caption,
    };
  }

  const bq = find(figure.children, (n) => n.tag === 'blockquote');
  if (bq) return { kind: 'quote', blocks: blocksOf(bq.children, embedsByKey), caption };

  return { kind: 'unknown', tag: 'figure', text: textOf([figure]).trim() };
}

// ---------------------------------------------------------------------------
// ブロック
// ---------------------------------------------------------------------------
function blocksOf(nodes, embedsByKey) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      // ブロック間の空白テキストは捨てる (意味を持つ裸テキストは note には出ない)
      if (n.value.trim() !== '') out.push({ kind: 'paragraph', inline: inlineOf([n]) });
      continue;
    }
    switch (n.tag) {
      case 'p': {
        const inline = inlineOf(n.children);
        if (!isBlank(inline)) out.push({ kind: 'paragraph', inline });
        break;
      }
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        out.push({ kind: 'heading', level: Number(n.tag[1]), inline: inlineOf(n.children) });
        break;
      case 'figure':
        out.push(figureBlock(n, embedsByKey));
        break;
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocksOf(n.children, embedsByKey), caption: '' });
        break;
      case 'ul': case 'ol': {
        const items = n.children
          .filter((c) => c.type === 'element' && c.tag === 'li')
          .map((li) => inlineOf(li.children));
        out.push({ kind: 'list', ordered: n.tag === 'ol', items });
        break;
      }
      case 'pre':
        out.push({ kind: 'code', text: textOf([n]).replace(/\n$/, '') });
        break;
      case 'hr':
        out.push({ kind: 'hr' });
        break;
      case 'table-of-contents':
        out.push({ kind: 'toc' });
        break;
      case 'br':
        break; // ブロック間の裸 <br> は捨てる
      default:
        out.push({ kind: 'unknown', tag: n.tag, text: textOf([n]).trim() });
    }
  }
  return out;
}

/**
 * note の記事 (source.json 相当) を中間表現にする。
 * @param {object} note - body / embedded_contents を持つ記事オブジェクト
 * @returns {{blocks: Array}}
 */
export function parseNote(note) {
  const embedsByKey = new Map((note.embedded_contents ?? []).map((e) => [e.key, e]));
  return { blocks: blocksOf(parseHTML(note.body ?? ''), embedsByKey) };
}
