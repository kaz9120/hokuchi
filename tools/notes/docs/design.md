# tools/notes — 設計

note.com の記事を hokuchi に取り込み、原本と Markdown の 2 層でアーカイブする。決定の経緯は [ADR-0019](../../../docs/adr/0019-note-archive-two-layer.md)。

## 置き場所

```
articles/note/
  slugs.json                    note key → slug。ディレクトリ名の唯一の真実
  README.md                     索引 (hokuchi-note index が生成)
  <公開日>-<slug>/
    source.json                 原本。note API の不変フィールドを凍結したもの
    index.md                    読む用。source.json から決定的に生成する
    assets/                     見出し画像と本文画像の実体
```

`index.md` と `README.md` は生成物なので手で直さない。直したくなったら変換規則の側を直して `hokuchi-note build` を回す。`source.json` と `assets/` と `slugs.json` が真実である。

## コマンド

| コマンド | すること | ネットワーク |
|---|---|---|
| `hokuchi-note sync` | 一覧取得 → 記事取得 → 画像取得 → build → verify → index | 使う |
| `hokuchi-note build [dir...]` | `source.json` から `index.md` を作り直す | 使わない |
| `hokuchi-note verify [dir...]` | 取り込みの忠実さを検査する。欠落があれば終了コード 1 | 使わない |
| `hokuchi-note lint [原稿.md...]` | 原稿の文体を検査する。引数を省くと公開済み記事全部 | 使わない |
| `hokuchi-note index` | `articles/note/README.md` を作り直す | 使わない |

`tools/notes` で一度 `npm link` すると `hokuchi-note` として使える。`npm test` は変換規則の回帰テストとアーカイブ全体の検査を回す。

## 取り込みの流れ

1. `/api/v2/creators/<urlname>/contents` で公開記事の key を全件集める
2. key ごとに `/api/v3/notes/<key>` を叩き、`freezeNote` で不変フィールドだけに絞って `source.json` に書く。内容が変わっていなければファイルを書き換えない (取得時刻だけの差分を出さない)
3. 見出し画像と本文中の `<img>` を `assets/` に落とす。ファイル名は note のまま、既にあれば取りに行かない。見出し画像の URL は note が配信用に縮小した版 (`?fit=bounds&quality=85&width=1280`) を指すので、クエリを外したオリジナルを先に試す
4. 全記事を `build` する。他記事のタイトルを引くので、記事単位ではなくアーカイブ単位で回す
5. `verify` で検査する

## 変換の規則

note の body HTML が使う語彙は有限で、次の対応で Markdown にする。

| 原本 | index.md |
|---|---|
| `<h2>` / `<h3>` | `##` / `###` |
| `<p>` | 段落。`<br>` は行末 2 スペースの改行 |
| `<figure><img>` | `![alt](assets/…)`。`<figcaption>` は直後のイタリック行 |
| `<figure><a href><img></a>` | `[![alt](assets/…)](href)` |
| `<figure embedded-service>` | URL だけの 1 行 |
| `<figure><blockquote>` | `>` の引用 |
| `<ul>` / `<ol>` / `<li>` | `-` / `1.` |
| `<pre><code>` | フェンス。中身に ``` があれば長いフェンスで囲む |
| `<hr>` | `---` |
| `<table-of-contents>` | 出さない (note が見出しから作る部品) |
| 未知のタグ | `<!-- unknown: tag -->` + テキスト (verify が warn を出す) |

本文は front matter を除けば note のエディタにそのまま貼れる形にする ([ADR-0021](../../../docs/adr/0021-note-markdown-paste-ready.md))。埋め込みは URL だけの 1 行で、note に貼るとカードになる。ポスト本文や記事タイトル、種別 (service) は `index.md` に書かず、`source.json` の `embedded_contents` が持つ。ラベルが URL そのもののリンクも `<url>` ではなく素の URL にする。

`parse.mjs` は埋め込みの代表テキスト (X のポストの本文と署名行、外部記事カードのタイトル・説明・ドメイン、oembed の iframe title、自分の他記事のタイトル) を中間表現に持っている。`index.md` には出さないが、別の出力を作るときに使える。

読みやすさのために割り切っている点が 3 つある。`&nbsp;` は半角空白に寄せる。エスケープは Markdown の記法と衝突する文字 (`` \ ` * [ ] < ``) に絞り、`_` は単語内で強調にならないので触らない。キャプションはイタリック行にする。いずれも原本が別にあるから許される割り切りである。

## 検査

`verify` は原本 `source.json` と生成物 (`index.md` + `assets/`) を突き合わせる。実装は `parse.mjs` を通さず、原本 HTML を正規表現で直接数える。パーサと検査が同じ勘違いをして揃って通ることを避けるためである。

「原本の要素が生成物のどこかにあるか」だけでは足りない。それだと段落の入れ替えも、2 回書いた文が 1 回に減ることも、リンクのラベルが別の URL に付け替わることも通ってしまう。順序と組を見る。

- **本文** — 原本の `<p>` `<h*>` `<li>` `<figcaption>` `<pre>` からテキストを取り出し、空白と強調記号を落として照合する。カーソルを前へ進めながら探すので、欠落だけでなく順序と出現回数も見ている。コードブロックは記法の除去がコードを壊すので、フェンスの中身と別に照合する
- **埋め込み** — URL だけの行のうち原本の `data-src` と一致するものを埋め込みとみなし、原本の `data-src` が並び順どおりすべて残っているか。URL だけの段落は埋め込み以外にもあり得るので、原本の URL で見分ける
- **本文リンク** — 埋め込み以外の `<a href>` について、href とラベルの組が保たれているか
- **画像** — ファイル名の並びが原本と一致し、参照が相対パスで、実体がディスクにあり、画像として読めるか。alt も原本どおりか
- **見出し画像** — 実解像度が原本の宣言サイズ以上か (縮小版を掴んでいないか)
- **front matter** — タイトル・note key・URL・公開日・ハッシュタグが原本と一致するか
- **構造** — 見出し・リスト項目・区切り線・コードブロック・引用・太字・斜体の数。front matter は数えない

## 文体の検査 (lint)

`verify` が「取り込みが忠実か」を見るのに対し、`lint` は「文章が研ぎ澄まされているか」を見る。別物なので実装も分けてある (`src/lint.mjs`)。執筆の手順は writing-note skill が持ち、lint はそのうち機械で数えられる部分だけを担う (ADR-0020)。

見るのは、文と段落の長さ、ぼかし表現の密度、ハイカロリーな語、最上級表現、型どおりの言い回し、共感を求める表現、キザな言い回し、一人称の揺れ、文末のリズム、冒頭と結びの重さ、漢字率、見出しの中身、タグの数。

閾値は公開済み 44 本の実測から引いている。理想値ではなく「自分が実際に書けている水準」を基準にするためで、**公開済み記事が error を出さず、warn が改善余地として出る位置**に合わせてある。記事が増えたら測り直す。

```
hokuchi-note lint articles/note/drafts/<slug>/index.md   # 原稿を検査する
hokuchi-note lint                                        # 公開済み全部 (閾値の校正用)
```

濃いかどうか、フックが効いているかは lint では測れない。それは人が読んで決める。

## 記事を書き足したとき

`hokuchi-note sync` を回す。`slugs.json` にない記事は key のままのディレクトリに作られ、その旨を出力する。slug を足して再実行すればディレクトリごと引っ越す。記事を書き直したときも同じで、`source.json` が更新され、差分として読める。
