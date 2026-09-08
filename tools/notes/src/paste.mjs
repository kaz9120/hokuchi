// paste.mjs — 原稿を note のエディタに貼れる形にする。
//
// note のエディタは Markdown を貼ると見出しや強調を解釈するが、画像行
// (![alt](path)) が 1 つでも混ざると本文全体が素のテキストとして入る (実測)。
// ローカルの画像はどのみち貼れないので、画像行とキャプションを Markdown の
// 意味を持たない 1 行に置き換え、画像は note 側で入れる (ADR-0021)。
// index.md の側は ![alt](assets/…) のままにする。プレビューで見えることと、
// verify が画像の並びと実体を検査することを保つため。

import { splitFrontMatter } from './lint.mjs';

// 画像行: ![alt](path) または [![alt](path)](href)。直後のイタリック行はキャプション。
const IMAGE_BLOCK_RE = /^(?:\[)?!\[([^\]]*)\]\(([^)\s]+)\)(?:\]\(([^)\s]+)\))?[ \t]*\n?(?:\*([^\n]*)\*[ \t]*(?:\n|$))?/gm;

/** キャプションを素のテキストにする。リンクは「ラベル (URL)」に開く。 */
const plainCaption = (s) =>
  s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 ($2)').replace(/\\(.)/g, '$1').trim();

const fileName = (p) => p.split('/').pop();

/**
 * 原稿 (index.md) を貼り付け用のテキストに変える。
 * @returns {{ text: string, images: Array<{n:number, file:string, path:string, caption:string, link:string|null}>, eyecatch: string|null }}
 */
export function toPasteText(md) {
  const { fm, body } = splitFrontMatter(md);
  const eyecatch = fm?.match(/^eyecatch: (.+)$/m)?.[1]?.replace(/^"(.*)"$/, '$1') ?? null;
  const images = [];
  const total = (body.match(IMAGE_BLOCK_RE) ?? []).length;

  const text = body.replace(IMAGE_BLOCK_RE, (_m, alt, src, href, cap) => {
    const n = images.length + 1;
    const caption = cap ? plainCaption(cap) : '';
    images.push({ n, file: fileName(src), path: src, caption, link: href ?? null, alt });
    // 丸括弧と全角記号だけで組み、Markdown に引っかからない行にする
    const parts = [`画像 ${n}/${total}: ${fileName(src)}`];
    if (caption) parts.push(`キャプション: ${caption}`);
    if (href) parts.push(`リンク: ${href}`);
    return `（${parts.join(' ｜ ')}）\n`;
  });

  return { text: text.replace(/\n{3,}/g, '\n\n').trim() + '\n', images, eyecatch };
}
