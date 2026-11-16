// lint.mjs — note の原稿を機械で検査する。
//
// 文体の規範のうち、機械で確実に判定できるものだけをここに置く。「濃いか」
// 「フックが効いているか」は人が読んで決めることで、lint は数えられるものを
// 数えるに徹する。数えられないものをルールにすると誤検知が増え、警告が信用を
// 失う。
//
// 閾値は articles/note の公開済み記事を実測して決めた (値は NORM)。抽象的な理想ではなく
// 「自分が実際に書けている水準」を基準にする。

const SEV = { error: 'error', warn: 'warn', info: 'info' };

// 公開済みの記事の実測。2026-06 以降の 24 本 (2026-11 に測った)。writing-note の voice.md の表と同じ値
const NORM = { n: 24, sentence: 28, opening: 44, closing: 38, hedgePer1k: 1.6, polite: 86, commaPerSentence: 0.8, kanji: 33 };

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
// 公開済みの記事で実際に出た語を優先して並べる。理屈で思いつく語ではなく、
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
// 受け (主張と体感を柔らかく受ける文末)。語幹で数え、過去形、「〜く感じました」「〜とも思います」、
// 回数を避けるための言い換え (「〜ような印象を持っていました」) も含める。
// 公開済み 24 本で千字あたり中央値 1.8 回。4 回以上かつ千字あたり 3 回超は 4 本 (2026-11 に測った)
export const UKE_RE = /(?:とも?|く|に)(?:思(?:います|いました|っています|っていました|った|う|える)|考え(?:ます|ました|ています|ていました|た|る)|感じ(?:ます|ました|ています|ていました|た|る))|(?:という|ような)(?:気持ち|印象|感覚)(?:でいます|を持っ|になり|です)|という考えです|気がし(?:ます|ました|ています|た)/g;
// 話し言葉の程度の語。公開済み 24 本では、どれも 0〜1 回
const SPOKEN = ['結構', '相当', 'どんどん', 'めちゃくちゃ', 'バーッと', 'すごく', '全然'];
const KIZA = ['という確信に至', 'という結論に達', 'を断言でき', '私の持論では', '言うまでもなく', 'ご存知のとおり'];

const count = (text, word) => text.split(word).length - 1;

// --- 検査 -------------------------------------------------------------------

/**
 * note の原稿を検査する。
 * @param {string} md - 原稿 (front matter は任意)
 * @returns {Array<{severity, id, message, at?: string}>} at は該当箇所を探すための本文の抜粋 (studio が段落に寄せるのに使う)
 */
export function lintDraft(md) {
  const findings = [];
  const add = (severity, id, message, at) => findings.push(at ? { severity, id, message, at } : { severity, id, message });

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
  // 2026-06 以降の 24 本の実測は中央値 28 字、60 字超が 3.4%、80 字超がほぼ 0。
  // 60 字超の文を 1 本ずつ挙げると、すでに書けている水準まで否定することになる。
  // 個別に挙げるのは 80 字超だけにして、あとは記事全体の率で見る。
  for (const s of sentences) {
    const n = visibleLength(s);
    if (n > 80) add(SEV.warn, 'sentence-too-long', `1 文 ${n} 字。切る: ${s.slice(0, 32)}…`, s);
  }
  const longRate = sentences.filter((s) => visibleLength(s) > 60).length / sentences.length;
  if (longRate > 0.15) {
    add(SEV.warn, 'long-sentence-rate', `60 字超の文が ${(longRate * 100).toFixed(0)}%。公開済み記事は 3% 前後`);
  }
  const medianLen = [...sentences.map(visibleLength)].sort((a, b) => a - b)[Math.floor(sentences.length / 2)];
  // 2026-06 以降の公開済み記事は 1 本ごとの中央値が 20〜37 字 (全体の中央値 28 字)。34 字を超える記事は 21 本中 2 本
  if (sentences.length >= 15 && medianLen > 34) {
    add(SEV.warn, 'sentence-median', `文の中央値が ${medianLen} 字。公開済み記事は ${NORM.sentence} 字。理由と逆接でない所でつないだ文を切る`);
  }

  // --- 段落の長さ -----------------------------------------------------------
  // 実測は中央値 58 字、120 字超が 3.3%。文字の壁を作らない。
  for (const p of paras) {
    const n = visibleLength(p);
    if (n > 200) add(SEV.warn, 'paragraph-too-long', `1 段落 ${n} 字。改行を入れる: ${p.slice(0, 30)}…`, p.slice(0, 30));
    else if (n > 120) add(SEV.info, 'paragraph-long', `1 段落 ${n} 字: ${p.slice(0, 30)}…`, p.slice(0, 30));
  }

  // --- 語彙 -----------------------------------------------------------------
  for (const w of HIGH_CALORIE) if (count(text, w)) add(SEV.warn, 'high-calorie', `ハイカロリーな語「${w}」`, w);
  for (const w of SUPERLATIVE) if (count(text, w)) add(SEV.error, 'superlative', `最上級表現「${w}」は客観的な根拠がなければ使わない`, w);
  for (const w of AI_PHRASES) if (count(text, w)) add(SEV.warn, 'ai-phrase', `型どおりの言い回し「${w}」`, w);
  for (const w of SYMPATHY) if (count(text, w)) add(SEV.warn, 'sympathy-seeking', `読者に共感を求める「${w}」`, w);
  for (const w of KIZA) if (count(text, w)) add(SEV.warn, 'affected', `キザな言い回し「${w}」`, w);

  // --- ぼかし ---------------------------------------------------------------
  // HEDGES (受けとぼかしを合わせたもの) の実測は千字あたり 1.6 回 (受け 1.4 回 + ぼかし 0.2 回)。体験を断定できていないと、ここが増える。
  const hedges = HEDGES.reduce((n, w) => n + count(text, w), 0);
  const per1k = chars ? (hedges / chars) * 1000 : 0;
  if (per1k > 4) add(SEV.info, 'hedging', `ぼかし表現が千字あたり ${per1k.toFixed(1)} 回 (公開済み記事は ${NORM.hedgePer1k} 回)。体験と事実は断定する`);
  const runs = text.match(/かもしれ(ません|ない)/g) ?? [];
  if (runs.length >= 3) add(SEV.info, 'hedge-repeat', `「かもしれません」が ${runs.length} 回`);
  // 1 つの主張の留保は 1 回にまとめる。同じ段落に 2 回あると、留保が重なって歯切れが悪くなる
  // (公開済み 24 本では、2 本に 1 段落ずつだけ)
  const uke = (text.match(UKE_RE) ?? []).length
  const ukePer1k = chars ? (uke / chars) * 1000 : 0
  if (uke >= 4 && ukePer1k > 3.0) add(SEV.warn, 'uke-heavy', `受け (〜と思います・〜と感じました など) が ${uke} 回、千字あたり ${ukePer1k.toFixed(1)} 回 (公開済み記事は中央値 1.8 回)。断りを 1 か所にまとめ、あとは言い切る (具体のある文は削らない)`)
  for (const p of paras) {
    const n = HEDGES.reduce((a, w) => a + count(p, w), 0)
    if (n >= 2) add(SEV.info, 'hedge-paragraph', `同じ段落に受け・ぼかしが ${n} 回。1 回にまとめる: ${p.slice(0, 24)}…`, p.slice(0, 30))
  }

  // --- 一人称 ---------------------------------------------------------------
  // 引用した他人の発言に「僕」が入るのは自然なので、カギカッコの中は見ない。
  const narration = text.replace(/[「『][^」』]*[」』]/g, '');
  if (count(narration, '僕')) add(SEV.warn, 'first-person', '地の文の一人称は「私」で統一する (「僕」が混ざっている)');

  // --- 文末 -----------------------------------------------------------------
  // 基調は です・ます。2026-06 以降の公開済み 24 本は、文末の です・ます が中央値 86%
  // (最小 75%)。常体は話者が自分で選んだ一文だけで、Claude が足した常体は 4 回続けて
  // です・ます に戻されている。以前は「常体を落とせ」と促していたが、それが下書きの
  // AI っぽさ (短文を同じ調子で並べる) の原因になっていたので向きを反転した。
  const ended = sentences.filter((s) => /[。！？]$/.test(s));
  const polite = ended.filter((s) => /(です|ます|ました|ません|でした|でしょう)[。！？]$/.test(s)).length;
  // 全文が常体の記事 (2026-05 以前に数本ある) は、話者が選んだ文体なので見ない。
  // 見るのは、です・ます基調に常体が 25% を超えて混ざった中間だけ。
  const jotai = ended.length ? 1 - polite / ended.length : 0;
  if (ended.length >= 15 && jotai > 0.25 && jotai < 0.7) {
    add(SEV.warn, 'jotai-mixed', `文末の ${(jotai * 100).toFixed(0)}% が常体。基調は です・ます (公開済み記事は ${NORM.polite}%)。常体は話者が選んだ一文だけにする`);
  }

  for (const w of SPOKEN) {
    const n = count(text, w)
    if (n >= 2) add(SEV.warn, 'spoken-degree', `話し言葉の程度の語「${w}」が ${n} 回。素材の口癖を写していないか (公開済み記事は 0〜1 回)`, w)
    else if (n === 1) add(SEV.info, 'spoken-degree', `話し言葉の程度の語「${w}」。素材の口癖を写していないか`, w)
  }
  // 考えたことを「〜と思いました」で並べる型。公開済み 24 本では 2 文続く所が無い
  let omo = 0
  for (const s of sentences) {
    omo = /(と思いました|と感じました|と思ったのです|と思ったんです)[。！]?$/.test(s) ? omo + 1 : 0
    if (omo === 2) add(SEV.warn, 'omoimashita-run', `「〜と思いました」で終わる文が続いている。考えた中身をそのまま書く: ${s.slice(0, 24)}…`, s)
  }
  // 短文の連打。公開済み 24 本で 15 字以下が 4 文続くのは、話者が常体を選んだ回の 3 本だけ
  let short = 0
  for (const s of sentences) {
    short = visibleLength(s) <= 15 ? short + 1 : 0
    if (short === 4) add(SEV.warn, 'short-run', `15 字以下の文が 4 つ続く。山場でなければ、つないで書く: ${s.slice(0, 20)}`, s)
  }
  // 読点の多さ。公開済み 24 本は 1 文あたり中央値 0.8 個、最大 1.17 個
  const commaRate = sentences.length ? (text.match(/、/g) ?? []).length / sentences.length : 0
  if (sentences.length >= 15 && commaRate > 1.25) {
    add(SEV.info, 'comma-heavy', `読点が 1 文あたり ${commaRate.toFixed(2)} 個 (公開済み記事は ${NORM.commaPerSentence} 個)。主語や時の短い句のあとの読点を外す`)
  }

  // --- 結び -----------------------------------------------------------------
  // 実測の最終段落は中央値 38 字。まとめ直し・抱負・余韻はいらない。
  const last = paras[paras.length - 1];
  const lastSentences = toSentences(last);
  const lastAt = last.slice(0, 30);
  if (lastSentences.length > 3) add(SEV.warn, 'closing-long', `結びが ${lastSentences.length} 文。3 文以内で終える`, lastAt);
  if (visibleLength(last) > 120) add(SEV.warn, 'closing-heavy', `結びが ${visibleLength(last)} 字。公開済み記事は ${NORM.closing} 字前後`, lastAt);
  if (/(いきたいと思います|と思っています|願いです|大切にしていきたい|感じた一日でした)[。！]?$/.test(last)) {
    add(SEV.warn, 'closing-poem', '結びが抱負・余韻で着地している。次のアクションか、一番言いたかったことで終える', lastAt);
  }

  // --- 冒頭 -----------------------------------------------------------------
  const first = paras[0];
  if (/^(本記事|この記事)(は|では)/.test(first)) {
    add(SEV.warn, 'opening-boilerplate', '冒頭が記事の説明から始まっている。場面かエピソードから入る', first.slice(0, 30));
  }
  if (visibleLength(first) > 160) {
    add(SEV.warn, 'opening-heavy', `冒頭の段落が ${visibleLength(first)} 字。公開済み記事は ${NORM.opening} 字前後`, first.slice(0, 30));
  }

  // --- 漢字の詰まり ---------------------------------------------------------
  const hira = (text.match(/[ぁ-ゟ]/g) ?? []).length;
  const kanji = (text.match(/[一-鿿]/g) ?? []).length;
  if (hira + kanji > 200) {
    const kanjiRate = kanji / (hira + kanji);
    if (kanjiRate > 0.42) add(SEV.warn, 'kanji-dense', `漢字が ${(kanjiRate * 100).toFixed(0)}% (公開済み記事は ${NORM.kanji}%)。ひらがなに開く`);
  }
  for (const m of text.matchAll(/[一-鿿]{7,}/g)) {
    add(SEV.info, 'kanji-run', `漢字が ${m[0].length} 字続く「${m[0]}」`, m[0]);
  }

  // --- 見出し ---------------------------------------------------------------
  // 見出しは説明ではなく主張にする。中身が読めない見出しは、拾い読みされたときに
  // 何も伝えない。
  const EMPTY_HEADINGS = ['おわりに', 'はじめに', 'まとめ', '最後に', 'さいごに', '前置き', '背景', 'おまけ'];
  for (const m of body.matchAll(/^#{2,3} (.+)$/gm)) {
    const h = m[1].trim().replace(/\\(.)/g, '$1');
    if (EMPTY_HEADINGS.includes(h)) add(SEV.info, 'heading-empty', `見出し「${h}」に中身がない。何が書いてあるかを出す`, h);
    if (visibleLength(h) > 40) add(SEV.info, 'heading-long', `見出しが ${visibleLength(h)} 字 (平均 18 字): ${h.slice(0, 24)}…`, h.slice(0, 24));
  }

  // --- front matter (公開の準備) --------------------------------------------
  if (fm !== null) {
    const tags = [...fm.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
    if (!/^title: /m.test(fm)) add(SEV.error, 'no-title', 'title がない');
    // 公開済みの記事は 2〜5 個。イベントレポートは「イベントレポート」とイベントの
    // ハッシュタグの 2 個に絞った例があり、決めるのは話者なので 2 個は許す。
    if (tags.length && (tags.length < 2 || tags.length > 5)) {
      add(SEV.warn, 'tag-count', `タグが ${tags.length} 個。2〜5 個にする`);
    }
    const title = fm.match(/^title: (.+)$/m)?.[1]?.replace(/^"(.*)"$/, '$1') ?? '';
    if (title && [...title].length > 40) add(SEV.info, 'title-long', `タイトルが ${[...title].length} 字。先頭 25 字に核を置く`);
  }

  return findings;
}

/**
 * 原稿の節ごとの字数を、outline.yaml の予算と比べる (writing-note の Phase 4 の手順 6)。
 * outline.yaml は studio が書く形 (sections: の下に title・grain・budget) だけを読む。
 * 粗の節が予算の 1.1 倍を超えたら warn。素材が多いと全部使いたくなって長くなる。
 */
export function lintOutline(md, outlineText) {
  const findings = [];
  const sections = [];
  for (const block of outlineText.split(/\n\s*-\s+(?=title:)/).slice(1)) {
    const title = block.match(/title:\s*(.+)/)?.[1]?.trim().replace(/^["']|["']$/g, '');
    const grain = block.match(/grain:\s*(\S+)/)?.[1];
    const budget = Number(block.match(/budget:\s*(\d+)/)?.[1]);
    if (title) sections.push({ title, grain, budget });
  }
  const { body } = splitFrontMatter(md);
  const parts = body.split(/^## /m);
  const chunks = [{ title: '冒頭', text: parts[0] }, ...parts.slice(1).map((p) => ({ title: p.split('\n')[0].trim(), text: p.split('\n').slice(1).join('\n') }))];
  for (const sec of sections) {
    const chunk = chunks.find((c) => c.title === sec.title);
    if (!chunk) continue;
    if (!sec.budget) {
      const n0 = visibleLength(proseBlocks(chunk.text).join(''));
      sec.chars = n0;
      const cap0 = sec.title === '冒頭' ? 100 : 150;
      if (sec.grain === '粗' && n0 > cap0) findings.push({ severity: SEV.info, id: 'rough-too-long', message: `「${sec.title}」は粗なのに ${n0} 字 (粗は ${cap0} 字まで)。言い直しと要約の文がないか見る (具体は削らない)`, at: sec.title });
      continue;
    }
    const n = visibleLength(proseBlocks(chunk.text).join(''));
    sec.chars = n;
    findings.push({ severity: SEV.info, id: 'section-chars', message: `「${sec.title}」${sec.grain} ${n} 字 / 予算 ${sec.budget} 字`, at: sec.title });
    if (sec.grain === '粗' && n > sec.budget * 1.1) findings.push({ severity: SEV.info, id: 'over-budget', message: `「${sec.title}」は粗で予算 ${sec.budget} 字なのに ${n} 字。話者の言葉を選び直す`, at: sec.title });
    // 粗は 150 字まで (冒頭は 100 字まで)。予算を大きく書いても粗は粗 (somitsu.md)
    // 予算は話者が承認したものなので、超えたかは over-budget で見る。予算そのものが上限を超えるときだけ知らせる
    const cap = sec.title === '冒頭' ? 100 : 150;
    if (sec.grain === '粗' && sec.budget > cap) findings.push({ severity: SEV.info, id: 'rough-budget-large', message: `「${sec.title}」は粗なのに予算が ${sec.budget} 字 (粗は ${cap} 字まで)。話者が決めた予算でなければ見直す`, at: sec.title });
  }
  // 字数は見出しを除いた本文 (地の文) で数える
  const sum = (g) => sections.filter((x) => x.grain === g && x.chars != null).reduce((a, x) => a + x.chars, 0);
  // 予算は話者と合意した記事の長さ。検査の直しで説明を足すと、気づかないうちに長くなる
  const budgetTotal = sections.reduce((a, x) => a + (x.budget || 0), 0);
  const charsTotal = sum('密') + sum('粗');
  if (budgetTotal && sections.every((x) => x.budget) && charsTotal > budgetTotal * 1.1) findings.push({ severity: SEV.warn, id: 'over-total', message: `本文 ${charsTotal} 字が予算の合計 ${budgetTotal} 字を 1 割以上超えている。言い直し・総評・説明の重なりから削る (具体は残す)` });
  if (sum('密')) findings.push({ severity: SEV.info, id: 'grain-sums', message: `粗の合計 ${sum('粗')} 字 / 密の合計 ${sum('密')} 字` });
  if (sum('密') && sum('粗') > sum('密')) findings.push({ severity: SEV.info, id: 'rough-over-dense', message: `粗の合計 ${sum('粗')} 字が密の合計 ${sum('密')} 字を超えている。粗の要約・言い換えの文を削る (具体と合意した節は残す。密の節に別の論点を入れて字数を合わせない)` });
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
