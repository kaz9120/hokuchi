// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) HTML パーサ: 属性・エンティティ・入れ子
// (2) 埋め込み: 種別と URL が :::embed に残る (過去の取り込み失敗の本丸)
// (3) リンク付き画像: <a><img></a> の href を落とさない
// (4) 本文の記法ガード: 行頭の「- 」「## 」、&nbsp;、コード内のフェンス
// (5) verify の負のテスト: 欠落を作れば必ず error になる
// (6) アーカイブ全体が検査を通る (articles/note があるときだけ)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML, decodeEntities, textOf } from '../src/html.mjs';
import { parseNote } from '../src/parse.mjs';
import { toMarkdown } from '../src/markdown.mjs';
import { verifyArticle } from '../src/verify.mjs';
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
  assert.match(out, /^:::embed\{service="twitter" url="https:\/\/x\.com\/u\/status\/1"\}$/m);
  assert.match(out, /^:::embed\{service="external-article" url="https:\/\/example\.com\/a"\}$/m);
  assert.match(out, /> ポスト本文/);
  assert.match(out, /> — 名前 \(@u\) May 1, 2026/);
  assert.match(out, /\*\*記事タイトル\*\*/);
  ok('埋め込みは種別・URL・本文テキストを保って :::embed になる');
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
  ok('画像に張られたリンクと figcaption を落とさない');
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
  const good = '---\ntitle: t\n---\n\n残る文\n\n消える文\n\n:::embed{service="twitter" url="https://x.com/u/status/9"}\n:::\n';
  fs.writeFileSync(path.join(dir, 'index.md'), good);
  assert.deepEqual(verifyArticle(dir).errors, [], '過不足なければ error は出ない');

  fs.writeFileSync(path.join(dir, 'index.md'), good.replace('消える文\n\n', ''));
  assert.match(verifyArticle(dir).errors.join('\n'), /本文が落ちている/, '本文の欠落を検知する');

  fs.writeFileSync(path.join(dir, 'index.md'), good.replace(/:::embed\{[^\n]*\}\n:::/, 'https://x.com/u/status/9'));
  const stripped = verifyArticle(dir).errors.join('\n');
  assert.match(stripped, /埋め込み twitter/, '埋め込みを素の URL に潰したら検知する');
  fs.rmSync(dir, { recursive: true, force: true });
  ok('verify は本文・埋め込みの欠落を必ず検知する');
}

// (6) アーカイブ全体 ---------------------------------------------------------
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
