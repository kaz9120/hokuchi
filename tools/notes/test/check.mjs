// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) HTML パーサ: 属性・エンティティ・入れ子
// (2) 埋め込み: URL だけの 1 行として残る (過去の取り込み失敗の本丸)
// (3) リンク付き画像: <a><img></a> の href を落とさない
// (4) 本文の記法ガード: 行頭の「- 」「## 」、&nbsp;、コード内のフェンス
// (5) verify の負のテスト: 欠落を作れば必ず error になる
// (6) 文体 lint: AI 臭い原稿を捕まえ、研ぎ澄まされた原稿を通す
// (7) アーカイブ全体が検査を通る (articles/note があるときだけ)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML, decodeEntities, textOf } from '../src/html.mjs';
import { parseNote } from '../src/parse.mjs';
import { toMarkdown } from '../src/markdown.mjs';
import { verifyArticle } from '../src/verify.mjs';
import { lintDraft } from '../src/lint.mjs';
import { toPasteText } from '../src/paste.mjs';
import { listArticleDirs } from '../src/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

let passed = 0;
const ok = (name) => { console.log(`  ok  ${name}`); passed++; };

const md = (note) => toMarkdown({ title: note.name ?? 't' }, parseNote(note).blocks);

// (1) HTML パーサ ------------------------------------------------------------
{
  const nodes = parseHTML('<p id="a">あ&amp;い<strong>う</strong><br>え</p>');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].attrs.id, 'a');
  assert.equal(textOf(nodes), 'あ&いう\nえ');
  assert.equal(decodeEntities('&#39;&nbsp;&mdash;&#x41;'), "'\u00a0—A");
  ok('parseHTML が属性・エンティティ・入れ子を復元する');
}

// (2) 埋め込み ---------------------------------------------------------------
{
  const note = {
    body:
      '<p>本文</p>' +
      '<figure data-src="https://x.com/u/status/1" data-identifier="null" ' +
      'embedded-service="twitter" embedded-content-key="k1"></figure>' +
      '<figure data-src="https://example.com/a" data-identifier="null" ' +
      'embedded-service="external-article" embedded-content-key="k2">' +
      '<a href="https://example.com/a"><strong>記事タイトル</strong><em>説明</em><em>example.com</em></a></figure>',
    embedded_contents: [
      {
        key: 'k1', url: 'https://x.com/u/status/1', service: 'twitter', identifier: null,
        html_for_embed: '<blockquote class="twitter-tweet"><p>ポスト本文<br>2行目</p>&mdash; 名前 (@u) <a href="#">May 1, 2026</a></blockquote>',
      },
      { key: 'k2', url: 'https://example.com/a', service: 'external-article', identifier: null, html_for_embed: null },
    ],
  };
  const out = md(note);
  // note のエディタに貼ればカードになる、URL だけの 1 行 (ADR-0021)
  assert.match(out, /^本文\n\nhttps:\/\/x\.com\/u\/status\/1\n\nhttps:\/\/example\.com\/a$/m);
  assert.ok(!out.includes('ポスト本文') && !out.includes('記事タイトル'), '埋め込み先のテキストは index.md に出さない');
  assert.ok(!out.includes(':::'), '独自のディレクティブを出さない');
  ok('埋め込みは URL だけの 1 行になり、順序を保つ');
}

// (3) リンク付き画像 ---------------------------------------------------------
{
  const note = {
    body: '<figure><a href="https://example.com/dest"><img src="https://img/x.png" alt="" width="10" height="10"></a>' +
      '<figcaption>説明</figcaption></figure>',
    embedded_contents: [],
  };
  const blocks = parseNote(note).blocks;
  assert.equal(blocks[0].link, 'https://example.com/dest');
  assert.match(md(note), /\[!\[\]\(https:\/\/img\/x\.png\)\]\(https:\/\/example\.com\/dest\)/);
  assert.match(md(note), /^\*説明\*$/m);

  // キャプションはテキストとは限らない。リンクをテキストに潰すと URL が消える
  const withLink = {
    body: '<figure><img src="https://img/y.png" alt=""><figcaption>' +
      '出典 <a href="https://example.com/src">ここ</a></figcaption></figure>',
    embedded_contents: [],
  };
  assert.match(md(withLink), /^\*出典 \[ここ\]\(https:\/\/example\.com\/src\)\*$/m);
  ok('画像に張られたリンクと、キャプション内のリンクを落とさない');
}

// (4) 記法ガード -------------------------------------------------------------
{
  const note = {
    body: '<p>- 手順を減らす<br>## 見出しではない</p>' +
      '<p>全角&nbsp;空白</p>' +
      '<pre><code>```yaml\nname: x\n```</code></pre>',
    embedded_contents: [],
  };
  const out = md(note);
  assert.match(out, /^\\- 手順を減らす/m, '行頭の「- 」がリストに化けない');
  assert.match(out, /^\\## 見出しではない/m, '行頭の「## 」が見出しに化けない');
  assert.ok(out.includes('全角 空白') && !out.includes('\u00a0'), '&nbsp; を通常の空白に寄せる');
  assert.match(out, /^````$/m, 'コード内に ``` があればフェンスを伸ばす');
  ok('Markdown の記法と衝突する本文をガードする');
}

// (5) verify の負のテスト ----------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hokuchi-note-'));
  const source = {
    key: 'nX', name: 't', publish_at: '2026-01-01T00:00:00+09:00', note_url: 'https://note.com/x',
    body: '<p>残る文</p><p>消える文</p>' +
      '<figure data-src="https://x.com/u/status/9" data-identifier="null" embedded-service="twitter" embedded-content-key="k"></figure>',
    embedded_contents: [{ key: 'k', url: 'https://x.com/u/status/9', service: 'twitter', identifier: null, html_for_embed: null }],
    hashtags: [], eyecatch: null,
  };
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(source));
  const fm = '---\ntitle: t\nnote_key: nX\nnote_url: https://note.com/x\npublished_at: "2026-01-01T00:00:00+09:00"\n---\n';
  const good = `${fm}\n残る文\n\n消える文\n\nhttps://x.com/u/status/9\n`;
  fs.writeFileSync(path.join(dir, 'index.md'), good);
  assert.deepEqual(verifyArticle(dir).errors, [], '過不足なければ error は出ない');

  fs.writeFileSync(path.join(dir, 'index.md'), good.replace('消える文\n\n', ''));
  assert.match(verifyArticle(dir).errors.join('\n'), /本文が落ちている/, '本文の欠落を検知する');

  fs.writeFileSync(path.join(dir, 'index.md'), good.replace('https://x.com/u/status/9\n', ''));
  assert.match(verifyArticle(dir).errors.join('\n'), /埋め込み \(twitter\) が落ちている/, '埋め込みの欠落を検知する');

  // URL が文中に紛れたら埋め込みではない
  fs.writeFileSync(path.join(dir, 'index.md'), good.replace('\nhttps://x.com/u/status/9', '\n参照 https://x.com/u/status/9'));
  assert.match(verifyArticle(dir).errors.join('\n'), /埋め込み \(twitter\) が落ちている/, 'URL だけの行でなければ埋め込みと数えない');

  // 「含まれるか」だけの検査だと素通りする欠陥 — 順序の入れ替え
  fs.writeFileSync(path.join(dir, 'index.md'), good.replace('残る文\n\n消える文', '消える文\n\n残る文'));
  assert.match(verifyArticle(dir).errors.join('\n'), /順序か出現回数/, '段落の入れ替えを検知する');

  // 同じく — リンクのラベルが別の URL に付け替わる
  const linked = { ...source, body: '<p><a href="https://a.example/">A の話</a><a href="https://b.example/">B の話</a></p>' };
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(linked));
  fs.writeFileSync(path.join(dir, 'index.md'),
    `${fm}\n[A の話](https://b.example/)[B の話](https://a.example/)\n`);
  assert.match(verifyArticle(dir).errors.join('\n'), /リンクの文字列と URL の組/, 'ラベルの付け替えを検知する');

  // 同じく — 見出し画像に note の縮小版 (?width=1280) を掴んでしまう
  const png = (w, h) => {
    const b = Buffer.alloc(32);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(b, 0);
    b.write('IHDR', 12);
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets/eye.png'), png(1280, 670));
  const shrunk = {
    ...source, body: '<p>残る文</p>', embedded_contents: [],
    eyecatch: 'https://img/eye.png?width=1280', eyecatch_width: 1920, eyecatch_height: 1005,
  };
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(shrunk));
  const withEye = '---\ntitle: t\nnote_key: nX\nnote_url: https://note.com/x\n' +
    'published_at: "2026-01-01T00:00:00+09:00"\neyecatch: assets/eye.png\n---\n\n残る文\n';
  fs.writeFileSync(path.join(dir, 'index.md'), withEye);
  assert.match(verifyArticle(dir).errors.join('\n'), /見出し画像が縮小版/, '縮小版の見出し画像を検知する');

  fs.writeFileSync(path.join(dir, 'assets/eye.png'), Buffer.from('not an image'));
  assert.match(verifyArticle(dir).errors.join('\n'), /見出し画像として読めない/, '壊れた画像を検知する');

  fs.rmSync(dir, { recursive: true, force: true });
  ok('verify は欠落・順序・リンクの取り違え・縮小画像を検知する');
}

// (6) 原稿の文体 lint --------------------------------------------------------
{
  const bad = `---
title: 【完全保存版】エンジニアのための通知術
hashtags:
  - エンジニア
---

本記事では、フルリモートで働き始めてから半年が経った頃に集中力の低下を感じるようになったことをきっかけに、Slack の通知設定を根本から見直した経緯についてご紹介します。

僕がやったのは圧倒的に効果のある方法で、業界初の試みと言えるでしょう。皆さんも経験があると思いますが、通知は集中力を奪うものなのかもしれません。そう思います。気がします。

## おわりに

この経験をこれからも大切にしていきたいと思います。通知と向き合うことは、自分と向き合うことなのかもしれません。そんな日々を、これからも続けていきたいと思っています。
`;
  const ids = new Set(lintDraft(bad).map((f) => f.id));
  for (const want of [
    'opening-boilerplate', 'ai-phrase', 'first-person', 'high-calorie',
    'superlative', 'sympathy-seeking', 'hedging', 'closing-poem', 'heading-empty', 'tag-count',
  ]) {
    assert.ok(ids.has(want), `lint が ${want} を検出する`);
  }

  const good = `---
title: サクッと作れる楽しさに、飽きた
hashtags:
  - エンジニア
  - 個人開発
  - AI駆動開発
---

自分が欲しいツールがその日のうちに動く。最初はそれだけで楽しかった。

でも、すぐに飽きた。

## 100個並べて、選ぶ

そこでやったのが、レイアウト案を100個作らせることです。写真もタイトルも入れず、矩形だけの抽象で100通り並べる。そこから自分の好みで12を選ぶ。

選べる幅は広がった。でも、使うのが面倒になった。

新宿が近い人はぜひ。
`;
  const goodFindings = lintDraft(good);
  assert.deepEqual(goodFindings.filter((f) => f.severity !== 'info'), [],
    `研ぎ澄まされた原稿は warn を出さない: ${JSON.stringify(goodFindings)}`);
  ok('lint は AI 臭い原稿を捕まえ、研ぎ澄まされた原稿を通す');
}

// (6b) 貼り付け用の変換 ------------------------------------------------------
{
  const draft = `---
title: t
eyecatch: assets/eye.png
---

## 見出し

本文 **太字**

![](assets/a.png)
*キャプション [元](https://example.com/src)*

[![alt](assets/b.png)](https://example.com/dest)

https://x.com/u/status/1
`;
  const { text, images, eyecatch } = toPasteText(draft);
  assert.equal(eyecatch, 'assets/eye.png');
  assert.equal(images.length, 2);
  assert.ok(!text.includes('!['), '画像行を残さない');
  assert.ok(!text.includes('---\ntitle'), 'front matter を落とす');
  assert.match(text, /^（画像 1\/2: a\.png ｜ キャプション: キャプション 元 \(https:\/\/example\.com\/src\)）$/m);
  assert.match(text, /^（画像 2\/2: b\.png ｜ リンク: https:\/\/example\.com\/dest）$/m);
  assert.match(text, /^## 見出し\n\n本文 \*\*太字\*\*\n\n（画像 1/m, '見出し・強調・段落はそのまま');
  assert.match(text, /\nhttps:\/\/x\.com\/u\/status\/1\n$/, '埋め込みの URL 行はそのまま');
  ok('paste は画像行だけを置き換え、それ以外の本文を変えない');
}

// (7) アーカイブ全体 ---------------------------------------------------------
{
  const root = path.join(repoRoot, 'articles/note');
  const dirs = listArticleDirs(root);
  if (dirs.length === 0) {
    console.log('  --  articles/note が空なので全体検査はスキップ');
  } else {
    const bad = dirs.map(verifyArticle).filter((r) => r.errors.length > 0);
    assert.deepEqual(bad.map((r) => path.basename(r.dir)), [], 'アーカイブ全記事が検査を通る');
    ok(`アーカイブ ${dirs.length} 本が検査を通る`);
  }
}

console.log(`\n${passed} checks passed.`);
