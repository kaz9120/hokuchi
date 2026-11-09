// verify.mjs — 取り込みが忠実かを機械的に確かめる。
//
// 過去の取り込みが失敗したのは、埋め込みリンクや画像が「気づかないうちに」
// 落ちていたからだった。だから検査は parse.mjs とは別経路で書く。原本 HTML を
// 正規表現で直接数え、生成物 (index.md と assets/) と突き合わせる。
// パーサのバグと検査のバグが同時に同じ方向へ倒れないようにするための二重化。

import fs from 'node:fs';
import path from 'node:path';
import { decodeEntities } from './html.mjs';
import { imageInfo } from './assets.mjs';
import { readSource, INDEX } from './build.mjs';

const FIGURE_RE = /<figure\b[^>]*>[\s\S]*?<\/figure>/g;

const stripTags = (html) => decodeEntities(html.replace(/<[^>]+>/g, '\n'));
const squash = (s) => s.replace(/[\s ]+/g, '');

const stripFrontMatter = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

// 強調記号は Markdown 側で付くので、原本と生成物の両方から落として比べる。
const dropEmphasis = (s) => s.replace(/[*`]/g, '');

// 行頭の見出し・引用記号は Markdown 側にしかない。「#」を一律に消すと本文の
// 「#1」「#Dev将」まで落ちて、原本と照合したときに偽の欠落として出る。
const dropLineMarks = (s) => s.replace(/^(?:> )*/gm, '').replace(/^#{1,6} /gm, '');

// フェンスは中身に応じて長さが変わる (markdown.mjs 参照) ので後方参照で閉じる。
const FENCE_RE = /^(`{3,})[^\n]*\n([\s\S]*?)\n\1$/gm;

/** コードブロックの中身。地の文と混ぜると記法の除去がコードを壊すので分けて持つ。 */
const codeBlocks = (md) => [...stripFrontMatter(md).matchAll(FENCE_RE)].map((m) => squash(m[2]));

/** index.md から Markdown 記法を落として、本文テキストだけの 1 本の文字列にする。 */
function markdownText(md) {
  const text = stripFrontMatter(md)
    .replace(FENCE_RE, '')                             // コードブロックは別で照合する
    .replace(/<!--[\s\S]*?-->/g, '')                   // 未知タグの印
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // リンクはラベルだけ残す
    .replace(/\\(.)/g, '$1');                          // エスケープ解除 (素の URL は本文として残る)
  return squash(dropEmphasis(dropLineMarks(text)));
}

/** 原本 HTML から、本文として残るべきテキストの断片を切り出す。 */
function expectedFragments(body) {
  // 埋め込み figure の中身は note が持つカードのキャッシュで、Markdown へは
  // 種別と URL、および代表テキストだけを持ち出す。テキスト一致の対象外にする。
  const withoutEmbeds = body.replace(FIGURE_RE, (fig) =>
    /embedded-service=/.test(fig) ? '' : fig
  );
  const fragments = [];
  const re = /<(p|h[1-6]|li|figcaption|pre)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(withoutEmbeds)) !== null) {
    const text = squash(dropEmphasis(stripTags(m[2])));
    if (text !== '') fragments.push({ tag: m[1], text });
  }
  return fragments;
}

const countMatches = (s, re) => (s.match(re) ?? []).length;

// 引用ブロックは、連続する「>」行のかたまり (空行は「>」だけになる)。
const QUOTE_BLOCK_RE = /(?:^>(?: .*)?(?:\n|$))+/gm;
// 埋め込みは URL だけの 1 行。
const BARE_URL_LINE_RE = /^https?:\/\/\S+$/gm;

/** 原本の埋め込み figure を、出現順に種別と URL の組で返す。 */
const sourceEmbeds = (body) =>
  [...body.matchAll(/<figure\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((attrs) => /\bembedded-service="/.test(attrs))
    .map((attrs) => ({
      service: attrs.match(/\bembedded-service="([^"]*)"/)[1],
      url: decodeEntities(attrs.match(/\bdata-src="([^"]*)"/)?.[1] ?? ''),
    }));

/**
 * 記事 1 本を検査する。
 * @returns {{dir: string, errors: string[], warnings: string[], stats: object}}
 */
export function verifyArticle(dir) {
  const src = readSource(dir);
  const body = src.body ?? '';
  const mdPath = path.join(dir, INDEX);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(mdPath)) {
    return { dir, errors: [`${INDEX} がない`], warnings, stats: {} };
  }
  const md = fs.readFileSync(mdPath, 'utf8');
  const flat = markdownText(md);

  // --- 本文テキスト: 1 文字も落ちず、順序も回数も原本どおりであること -----------
  // 前方へ進むカーソルで照合する。「含まれるか」だけを見ると、段落が入れ替わって
  // いても、2 回書いた文が 1 回に減っていても通ってしまう。
  const fragments = expectedFragments(body);
  const codes = codeBlocks(md).map(dropEmphasis);
  const found = [];
  let cursor = 0;
  let codeCursor = 0;
  for (const f of fragments) {
    if (f.tag === 'pre') {
      const at = codes.findIndex((c, i) => i >= codeCursor && c.includes(f.text));
      if (at === -1) found.push({ f, why: codes.some((c) => c.includes(f.text)) ? '順序' : '欠落' });
      else codeCursor = at + 1;
      continue;
    }
    const at = flat.indexOf(f.text, cursor);
    if (at === -1) found.push({ f, why: flat.includes(f.text) ? '順序' : '欠落' });
    else cursor = at + f.text.length;
  }
  for (const { f, why } of found.slice(0, 5)) {
    const label = why === '順序' ? '本文の順序か出現回数が違う' : '本文が落ちている';
    errors.push(`${label} <${f.tag}>: ${f.text.slice(0, 40)}…`);
  }
  if (found.length > 5) errors.push(`ほか ${found.length - 5} 件の本文の不一致`);

  // --- 埋め込み: 原本の data-src が、順序どおりすべて残っていること ------------
  // 埋め込みは URL だけの行になる。URL だけの段落は他にもあり得るので、
  // 原本の埋め込み URL と一致する行だけを埋め込みとして数える。
  const srcEmbeds = sourceEmbeds(body);
  const srcUrls = srcEmbeds.map((e) => e.url);
  const srcUrlSet = new Set(srcUrls);
  const mdBody = stripFrontMatter(md).replace(FENCE_RE, '');
  const mdUrls = (mdBody.match(BARE_URL_LINE_RE) ?? []).filter((u) => srcUrlSet.has(u));
  for (const { service, url } of srcEmbeds) {
    if (url === '') errors.push(`URL が空の埋め込みがある (service=${service})`);
    else if (!mdUrls.includes(url)) errors.push(`埋め込み (${service}) が落ちている: ${url}`);
  }
  if (srcUrls.length !== mdUrls.length && srcUrls.every((u) => mdUrls.includes(u))) {
    errors.push(`埋め込みの数が合わない: 原本 ${srcUrls.length} 件 → Markdown ${mdUrls.length} 件`);
  } else if (srcUrls.join(' | ') !== mdUrls.join(' | ') && srcUrls.every((u) => mdUrls.includes(u))) {
    errors.push('埋め込みの並び順が原本と違う');
  }

  // --- 本文中のリンク: href とラベルの組が保たれていること ----------------------
  // href の存在だけを見ると、ラベルが別のリンクに付け替わっても気づけない。
  const bodyNoEmbed = body.replace(FIGURE_RE, (fig) => (/embedded-service=/.test(fig) ? '' : fig));
  const inlineLinks = [...bodyNoEmbed.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: decodeEntities(m[1]), label: squash(dropEmphasis(stripTags(m[2]))) }));
  const mdLinkPairs = new Set([
    ...[...md.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)].map((m) => `${squash(dropEmphasis(m[1].replace(/\\(.)/g, '$1')))}\0${m[2]}`),
    // ラベルが URL そのものの本文リンクは、素の URL として書かれる。直後に付く
    // 強調やリンクの閉じ記号は URL ではない
    ...[...md.matchAll(/https?:\/\/[^\s)>\]*]+/g)].map((m) => `${squash(m[0])}\0${m[0]}`),
  ]);
  for (const { href, label } of inlineLinks) {
    if (!href) continue;
    if (!md.includes(href)) errors.push(`本文リンクが落ちている: ${href}`);
    else if (label && !mdLinkPairs.has(`${label}\0${href}`)) {
      errors.push(`リンクの文字列と URL の組が違う: [${label.slice(0, 20)}] → ${href}`);
    }
  }

  // --- 画像: 並び順まで原本と一致し、実体がローカルにあること --------------------
  const fileName = (u) => u.split('?')[0].split('/').pop();
  const srcImgs = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  const mdImgs = [...md.matchAll(/!\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[1]);
  const wantNames = srcImgs.map(fileName).join(' | ');
  const gotNames = mdImgs.map(fileName).join(' | ');
  if (wantNames !== gotNames) {
    errors.push(`画像の枚数か並び順が合わない: 原本 ${srcImgs.length} 枚 → Markdown ${mdImgs.length} 枚`);
  }
  for (const rel of mdImgs) {
    if (/^https?:/.test(rel)) { errors.push(`画像がローカルに落ちていない: ${rel}`); continue; }
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) { errors.push(`画像ファイルがない: ${rel}`); continue; }
    if (imageInfo(fs.readFileSync(abs)) === null) errors.push(`画像として読めないファイル: ${rel}`);
  }
  // alt テキスト (note で設定していれば) を落としていないこと
  const srcAlts = [...body.matchAll(/<img\b[^>]*\balt="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  const mdAlts = [...md.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  if (srcAlts.join(' | ') !== mdAlts.join(' | ')) errors.push('画像の alt が原本と合わない');
  const eyecatch = md.match(/^eyecatch: (.+)$/m)?.[1];
  if (src.eyecatch && !eyecatch) warnings.push('見出し画像が取り込まれていない');
  else if (eyecatch && !fs.existsSync(path.join(dir, eyecatch))) errors.push(`見出し画像がない: ${eyecatch}`);
  else if (eyecatch) {
    // note の eyecatch URL は配信用に縮小した版を指す。原本が宣言する寸法より
    // 小さいファイルを掴んでいたら、縮小版を取り込んでしまっている。
    const info = imageInfo(fs.readFileSync(path.join(dir, eyecatch)));
    if (info === null) errors.push(`見出し画像として読めない: ${eyecatch}`);
    else if (info.width && src.eyecatch_width && info.width < src.eyecatch_width) {
      errors.push(`見出し画像が縮小版: 実 ${info.width}px < 原本 ${src.eyecatch_width}px`);
    }
  }

  // --- front matter: 記事メタが原本と一致すること -------------------------------
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  const fmValue = (key) => {
    const raw = fm.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1] ?? null;
    return raw === null ? null : raw.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  };
  const metaPairs = [
    ['title', src.name, fmValue('title')],
    ['note_key', src.key, fmValue('note_key')],
    ['note_url', src.note_url, fmValue('note_url')],
    ['published_at', src.publish_at, fmValue('published_at')],
  ];
  for (const [label, want, got] of metaPairs) {
    if (want && want !== got) {
      errors.push(`front matter の ${label} が違う: 原本 "${want}" → ${got === null ? 'なし' : `"${got}"`}`);
    }
  }
  const wantTags = (src.hashtags ?? []).map((h) => h.replace(/^#/, ''));
  const gotTags = [...fm.matchAll(/^ {2}- (.*)$/gm)].map((m) => m[1].replace(/^"(.*)"$/, '$1'));
  if (wantTags.join(',') !== gotTags.join(',')) {
    errors.push(`ハッシュタグが合わない: 原本 ${wantTags.length} 件 → ${gotTags.length} 件`);
  }

  // --- 構造: 見出し・リスト項目・区切り線・コードの数 ---------------------------
  // front matter (hashtags が「- 」で始まる) は記事の構造ではないので数えない。
  // 引用の中の構造は数えるので「> 」は剥がしておく。
  const prose = mdBody.replace(/^(?:> )+/gm, '');
  // 引用は行数ではなくブロック数 (連続する「>」行のかたまり) で数える
  const quoteBlocks = countMatches(mdBody, QUOTE_BLOCK_RE);
  // 強調は本文の意味に関わるので数を見る。画像キャプション (figcaption) も
  // イタリック行にしているので、原本側は <em> と figcaption の合計で数える。
  const proseNoImg = prose.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  const pairs = [
    ['見出し h2', countMatches(body, /<h2\b/g), countMatches(prose, /^## /gm)],
    ['見出し h3', countMatches(body, /<h3\b/g), countMatches(prose, /^### /gm)],
    ['リスト項目', countMatches(body, /<li\b/g), countMatches(prose, /^\s*(?:- |\d+\. )/gm)],
    ['区切り線', countMatches(body, /<hr\b/g), countMatches(prose, /^---$/gm)],
    ['コードブロック', countMatches(body, /<pre\b/g), codeBlocks(md).length],
    ['引用', countMatches(bodyNoEmbed, /<blockquote\b/g), quoteBlocks],
    ['太字 strong', countMatches(bodyNoEmbed, /<strong\b/g), countMatches(proseNoImg, /\*\*/g) / 2],
    [
      '斜体 em とキャプション',
      countMatches(bodyNoEmbed, /<em\b/g) + countMatches(bodyNoEmbed, /<figcaption>(?!<\/figcaption>)/g),
      countMatches(proseNoImg.replace(/\*\*/g, ''), /\*/g) / 2,
    ],
  ];
  for (const [label, want, got] of pairs) {
    if (want !== got) errors.push(`${label}の数が合わない: 原本 ${want} → Markdown ${got}`);
  }

  // --- 未知の要素 ---------------------------------------------------------------
  if (mdBody.includes('<!-- unknown:')) warnings.push('未知の要素が含まれている (<!-- unknown: -->)');

  return {
    dir,
    errors,
    warnings,
    stats: {
      fragments: fragments.length,
      embeds: srcEmbeds.length,
      images: srcImgs.length,
      links: inlineLinks.length,
    },
  };
}
