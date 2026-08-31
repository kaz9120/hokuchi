// verify.mjs — 取り込みが忠実かを機械的に確かめる。
//
// 過去の取り込みが失敗したのは、埋め込みリンクや画像が「気づかないうちに」
// 落ちていたからだった。だから検査は parse.mjs とは別経路で書く。原本 HTML を
// 正規表現で直接数え、生成物 (index.md と assets/) と突き合わせる。
// パーサのバグと検査のバグが同時に同じ方向へ倒れないようにするための二重化。

import fs from 'node:fs';
import path from 'node:path';
import { decodeEntities } from './html.mjs';
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
    .replace(/^:::.*$/gm, '')                          // ディレクティブの開閉行
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // リンクはラベルだけ残す
    .replace(/<([^>\s]+)>/g, '$1')                     // 自動リンクは URL 自体が本文
    .replace(/\\(.)/g, '$1');                          // エスケープ解除
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

  // --- 本文テキスト: 1 文字も落ちていないこと ---------------------------------
  const fragments = expectedFragments(body);
  const codes = codeBlocks(md).map(dropEmphasis);
  const missing = fragments.filter((f) =>
    f.tag === 'pre' ? !codes.some((c) => c.includes(f.text)) : !flat.includes(f.text)
  );
  for (const f of missing.slice(0, 5)) {
    errors.push(`本文が落ちている <${f.tag}>: ${f.text.slice(0, 40)}…`);
  }
  if (missing.length > 5) errors.push(`ほか ${missing.length - 5} 件の本文欠落`);

  // --- 埋め込み: 数と種別が一致すること ---------------------------------------
  const srcEmbeds = [...body.matchAll(/embedded-service="([^"]+)"/g)].map((m) => m[1]);
  const mdEmbeds = [...md.matchAll(/^:::embed\{service="([^"]+)" url="([^"]*)"\}/gm)];
  const tally = (list) => list.reduce((acc, s) => acc.set(s, (acc.get(s) ?? 0) + 1), new Map());
  const srcTally = tally(srcEmbeds);
  const mdTally = tally(mdEmbeds.map((m) => m[1]));
  for (const [service, n] of srcTally) {
    const got = mdTally.get(service) ?? 0;
    if (got !== n) errors.push(`埋め込み ${service}: 原本 ${n} 件 → Markdown ${got} 件`);
  }

  // --- 埋め込み URL: 原本の data-src がすべて残っていること --------------------
  const srcUrls = [...body.matchAll(/<figure\b[^>]*\bdata-src="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  const mdUrls = new Set(mdEmbeds.map((m) => m[2]));
  for (const u of srcUrls) {
    if (!mdUrls.has(u)) errors.push(`埋め込み URL が落ちている: ${u}`);
  }
  for (const m of mdEmbeds) {
    if (m[2] === '') errors.push(`URL が空の埋め込みがある (service=${m[1]})`);
  }

  // --- 本文中のリンク: href がすべて残っていること -----------------------------
  const bodyNoEmbed = body.replace(FIGURE_RE, (fig) => (/embedded-service=/.test(fig) ? '' : fig));
  const inlineHrefs = [...bodyNoEmbed.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  for (const href of new Set(inlineHrefs)) {
    if (href && !md.includes(href)) errors.push(`本文リンクが落ちている: ${href}`);
  }

  // --- 画像: 数が合い、実体がローカルにあること ---------------------------------
  const srcImgs = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  const mdImgs = [...md.matchAll(/!\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[1]);
  if (srcImgs.length !== mdImgs.length) {
    errors.push(`画像の数が合わない: 原本 ${srcImgs.length} → Markdown ${mdImgs.length}`);
  }
  for (const rel of mdImgs) {
    if (/^https?:/.test(rel)) errors.push(`画像がローカルに落ちていない: ${rel}`);
    else if (!fs.existsSync(path.join(dir, rel))) errors.push(`画像ファイルがない: ${rel}`);
  }
  const eyecatch = md.match(/^eyecatch: (.+)$/m)?.[1];
  if (src.eyecatch && !eyecatch) warnings.push('見出し画像が取り込まれていない');
  else if (eyecatch && !fs.existsSync(path.join(dir, eyecatch))) errors.push(`見出し画像がない: ${eyecatch}`);

  // --- 構造: 見出し・リスト項目・区切り線・コードの数 ---------------------------
  // front matter (hashtags が「- 」で始まる) と埋め込みブロックの中身は、記事の
  // 構造ではないので数えない。引用の中の構造は数えるので「> 」は剥がしておく。
  const prose = stripFrontMatter(md)
    .replace(FENCE_RE, '')
    .replace(/^:::embed\{[^\n]*\}\n[\s\S]*?^:::$/gm, '')
    .replace(/^(?:> )+/gm, '');
  const pairs = [
    ['見出し h2', countMatches(body, /<h2\b/g), countMatches(prose, /^## /gm)],
    ['見出し h3', countMatches(body, /<h3\b/g), countMatches(prose, /^### /gm)],
    ['リスト項目', countMatches(body, /<li\b/g), countMatches(prose, /^\s*(?:- |\d+\. )/gm)],
    ['区切り線', countMatches(body, /<hr\b/g), countMatches(prose, /^---$/gm)],
    ['コードブロック', countMatches(body, /<pre\b/g), codeBlocks(md).length],
  ];
  for (const [label, want, got] of pairs) {
    if (want !== got) errors.push(`${label}の数が合わない: 原本 ${want} → Markdown ${got}`);
  }

  // --- 未知の要素 ---------------------------------------------------------------
  if (md.includes(':::unknown{')) warnings.push('未知の要素が含まれている (:::unknown)');

  return {
    dir,
    errors,
    warnings,
    stats: {
      fragments: fragments.length,
      embeds: srcEmbeds.length,
      images: srcImgs.length,
      links: new Set(inlineHrefs).size,
    },
  };
}
