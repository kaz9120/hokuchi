// lint.mjs — note の原稿を機械で検査する。
//
// 文体の規範のうち、機械で確実に判定できるものだけをここに置く。「濃いか」
// 「フックが効いているか」は人が読んで決めることで、lint は数えられるものを
// 数えるに徹する。数えられないものをルールにすると誤検知が増え、警告が信用を
// 失う (ADR-0002 の 2 段構えと同じ考え方)。
//
// 閾値は articles/note の公開済み 44 本を実測して決めた。抽象的な理想ではなく
// 「自分が実際に書けている水準」を基準にする。

const SEV = { error: 'error', warn: 'warn', info: 'info' };

// --- 原稿の分解 -------------------------------------------------------------

/** front matter を切り離す。 */
export function splitFrontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? { fm: m[1], body: md.slice(m[0].length) } : { fm: null, body: md };
}

/** 地の文の段落だけを返す。見出し・画像・引用・コード・埋め込み (URL だけの行)・HTML コメントは除く。 */
export function proseBlocks(body) {
  const stripped = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1$/gm, '');
  return stripped
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^(#{1,6} |!\[|\[!\[|> |\||---$|\*|https?:\/\/\S+$)/.test(b))
    .map((b) => b.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<([^>\s]+)>/g, '$1').replace(/\\(.)/g, '$1'));
}

/** 段落を文に割る。「。」「！」「？」で切り、改行も文の切れ目として扱う。 */
export const toSentences = (para) =>
  para
    .split(/(?<=[。！？])|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const visibleLength = (s) => s.replace(/\s/g, '').length;

// --- 検出したい言い回し ------------------------------------------------------
// 実測 (44 本) で実際に出た語を優先して並べる。理屈で思いつく語ではなく、
// 自分が書いてしまった語を並べたほうが効く。

const HIGH_CALORIE = ['圧倒的', '革命的', '究極', '最強', '驚異的', '劇的', '抜群', '格段', '飛躍的', '画期的', '待望', 'とにかく凄い', '神ってる'];
const SUPERLATIVE = ['No.1', 'ナンバーワン', '世界初', '業界初', '唯一無二', '最高峰'];
const AI_PHRASES = [
  '本記事では', 'ご紹介します', 'ご紹介しました', 'いかがでしたでしょうか',
  'することが重要です', 'と言えるでしょう', '以下の通りです', 'については以下',
  'することができます', 'していきたいと思います', 'なのではないでしょうか',
];
const SYMPATHY = ['ですよね？', 'ではないでしょうか？', '共感していただける', '皆さんも', 'みなさんも', '一緒に頑張り'];
const HEDGES = ['かもしれません', 'かもしれない', 'と思います', 'と思う', '気がします', '感じています', 'ように思います'];
const KIZA = ['という確信に至', 'という結論に達', 'を断言でき', '私の持論では', '言うまでもなく', 'ご存知のとおり'];

const count = (text, word) => text.split(word).length - 1;

// --- 検査 -------------------------------------------------------------------

/**
 * note の原稿を検査する。
 * @param {string} md - 原稿 (front matter は任意)
 * @returns {Array<{severity, id, message}>}
 */
export function lintDraft(md) {
  const findings = [];
  const add = (severity, id, message) => findings.push({ severity, id, message });

  const { fm, body } = splitFrontMatter(md);
  const paras = proseBlocks(body);
  const text = paras.join('\n');
  const chars = visibleLength(text);
  const sentences = paras.flatMap(toSentences);

  if (paras.length === 0) {
    add(SEV.error, 'empty', '地の文が 1 段落もない');
    return findings;
  }

  // --- 文の長さ -------------------------------------------------------------
  // 公開済み 44 本の実測は中央値 29 字、60 字超が 7.4%、80 字超が 2.2%。
  // 60 字超の文を 1 本ずつ挙げると、すでに書けている水準まで否定することになる。
  // 個別に挙げるのは 80 字超だけにして、あとは記事全体の率で見る。
  for (const s of sentences) {
    const n = visibleLength(s);
    if (n > 80) add(SEV.warn, 'sentence-too-long', `1 文 ${n} 字。切る: ${s.slice(0, 32)}…`);
  }
  const longRate = sentences.filter((s) => visibleLength(s) > 60).length / sentences.length;
  if (longRate > 0.15) {
    add(SEV.warn, 'long-sentence-rate', `60 字超の文が ${(longRate * 100).toFixed(0)}%。公開済み記事は 7% 前後`);
  }
  const medianLen = [...sentences.map(visibleLength)].sort((a, b) => a - b)[Math.floor(sentences.length / 2)];
  if (sentences.length >= 20 && medianLen > 45) {
    add(SEV.warn, 'sentence-median', `文の中央値が ${medianLen} 字。公開済み記事は 29 字`);
  }

  // --- 段落の長さ -----------------------------------------------------------
  // 実測は中央値 60 字、120 字超が 5%。文字の壁を作らない。
  for (const p of paras) {
    const n = visibleLength(p);
    if (n > 200) add(SEV.warn, 'paragraph-too-long', `1 段落 ${n} 字。改行を入れる: ${p.slice(0, 30)}…`);
    else if (n > 120) add(SEV.info, 'paragraph-long', `1 段落 ${n} 字: ${p.slice(0, 30)}…`);
  }

  // --- 語彙 -----------------------------------------------------------------
  for (const w of HIGH_CALORIE) if (count(text, w)) add(SEV.warn, 'high-calorie', `ハイカロリーな語「${w}」`);
  for (const w of SUPERLATIVE) if (count(text, w)) add(SEV.error, 'superlative', `最上級表現「${w}」は客観的な根拠がなければ使わない`);
  for (const w of AI_PHRASES) if (count(text, w)) add(SEV.warn, 'ai-phrase', `型どおりの言い回し「${w}」`);
  for (const w of SYMPATHY) if (count(text, w)) add(SEV.warn, 'sympathy-seeking', `読者に共感を求める「${w}」`);
  for (const w of KIZA) if (count(text, w)) add(SEV.warn, 'affected', `キザな言い回し「${w}」`);

  // --- ぼかし ---------------------------------------------------------------
  // 実測は千字あたり 1.5 回。体験を断定できていないと、ここが増える。
  const hedges = HEDGES.reduce((n, w) => n + count(text, w), 0);
  const per1k = chars ? (hedges / chars) * 1000 : 0;
  if (per1k > 4) add(SEV.warn, 'hedging', `ぼかし表現が千字あたり ${per1k.toFixed(1)} 回 (公開済み記事は 1.5 回)。体験と事実は断定する`);
  const runs = text.match(/かもしれ(ません|ない)/g) ?? [];
  if (runs.length >= 3) add(SEV.info, 'hedge-repeat', `「かもしれません」が ${runs.length} 回`);

  // --- 一人称 ---------------------------------------------------------------
  // 引用した他人の発言に「僕」が入るのは自然なので、カギカッコの中は見ない。
  const narration = text.replace(/[「『][^」』]*[」』]/g, '');
  if (count(narration, '僕')) add(SEV.warn, 'first-person', '地の文の一人称は「私」で統一する (「僕」が混ざっている)');

  // --- 文末のリズム ---------------------------------------------------------
  // です・ます基調に、断定したい一文だけ常体を落とすのが公開済み記事のリズム。
  // どちらかに寄りきると、説明文か箇条書きのようになる。
  const ended = sentences.filter((s) => /[。！？]$/.test(s));
  const polite = ended.filter((s) => /(です|ます|ました|ません|でした|でしょう)[。！？]$/.test(s)).length;
  const ratio = ended.length ? polite / ended.length : 0;
  if (ended.length >= 25 && ratio > 0.85) {
    add(SEV.info, 'rhythm-flat', `文末の ${(ratio * 100).toFixed(0)}% が です・ます。断定したい一文を常体に落とすとリズムが出る (公開済み記事は 65%)`);
  }

  // --- 結び -----------------------------------------------------------------
  // 実測の最終段落は中央値 44 字。まとめ直し・抱負・余韻はいらない。
  const last = paras[paras.length - 1];
  const lastSentences = toSentences(last);
  if (lastSentences.length > 3) add(SEV.warn, 'closing-long', `結びが ${lastSentences.length} 文。3 文以内で終える`);
  if (visibleLength(last) > 120) add(SEV.warn, 'closing-heavy', `結びが ${visibleLength(last)} 字。公開済み記事は 44 字前後`);
  if (/(いきたいと思います|と思っています|願いです|大切にしていきたい|感じた一日でした)[。！]?$/.test(last)) {
    add(SEV.warn, 'closing-poem', '結びが抱負・余韻で着地している。次のアクションか、一番言いたかったことで終える');
  }

  // --- 冒頭 -----------------------------------------------------------------
  const first = paras[0];
  if (/^(本記事|この記事)(は|では)/.test(first)) {
    add(SEV.warn, 'opening-boilerplate', '冒頭が記事の説明から始まっている。場面かエピソードから入る');
  }
  if (visibleLength(first) > 160) {
    add(SEV.warn, 'opening-heavy', `冒頭の段落が ${visibleLength(first)} 字。公開済み記事は 41 字前後`);
  }

  // --- 漢字の詰まり ---------------------------------------------------------
  const hira = (text.match(/[ぁ-ゟ]/g) ?? []).length;
  const kanji = (text.match(/[一-鿿]/g) ?? []).length;
  if (hira + kanji > 200) {
    const kanjiRate = kanji / (hira + kanji);
    if (kanjiRate > 0.42) add(SEV.warn, 'kanji-dense', `漢字が ${(kanjiRate * 100).toFixed(0)}% (公開済み記事は 33%)。ひらがなに開く`);
  }
  for (const m of text.matchAll(/[一-鿿]{7,}/g)) {
    add(SEV.info, 'kanji-run', `漢字が ${m[0].length} 字続く「${m[0]}」`);
  }

  // --- 見出し ---------------------------------------------------------------
  // 見出しは説明ではなく主張にする。中身が読めない見出しは、拾い読みされたときに
  // 何も伝えない。
  const EMPTY_HEADINGS = ['おわりに', 'はじめに', 'まとめ', '最後に', 'さいごに', '前置き', '背景', 'おまけ'];
  for (const m of body.matchAll(/^#{2,3} (.+)$/gm)) {
    const h = m[1].trim().replace(/\\(.)/g, '$1');
    if (EMPTY_HEADINGS.includes(h)) add(SEV.info, 'heading-empty', `見出し「${h}」に中身がない。何が書いてあるかを出す`);
    if (visibleLength(h) > 40) add(SEV.info, 'heading-long', `見出しが ${visibleLength(h)} 字 (平均 18 字): ${h.slice(0, 24)}…`);
  }

  // --- front matter (公開の準備) --------------------------------------------
  if (fm !== null) {
    const tags = [...fm.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
    if (!/^title: /m.test(fm)) add(SEV.error, 'no-title', 'title がない');
    if (tags.length && (tags.length < 3 || tags.length > 5)) {
      add(SEV.warn, 'tag-count', `タグが ${tags.length} 個。3〜5 個にする`);
    }
    const title = fm.match(/^title: (.+)$/m)?.[1]?.replace(/^"(.*)"$/, '$1') ?? '';
    if (title && [...title].length > 40) add(SEV.info, 'title-long', `タイトルが ${[...title].length} 字。先頭 25 字に核を置く`);
  }

  return findings;
}

/** 文字数などの目安を返す (lint とは別に、書き手が見て判断するための材料)。 */
export function draftStats(md) {
  const { body } = splitFrontMatter(md);
  const paras = proseBlocks(body);
  const sentences = paras.flatMap(toSentences);
  const lens = sentences.map(visibleLength).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  return {
    chars: visibleLength(paras.join('')),
    paragraphs: paras.length,
    sentences: sentences.length,
    medianSentence: median,
    images: (body.match(/^!\[|^\[!\[/gm) ?? []).length,
    headings: (body.match(/^## /gm) ?? []).length,
  };
}
