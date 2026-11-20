# 出す (Phase 7)

パスは、このスキルのフォルダ (`.claude/skills/writing-note/`) からの相対です。

検査の段 (`steps/check.md`) で `<!-- 聞く -->` が残っている原稿は、ここに進めません。

`references/structure.md` を開きます。

1. タイトルを 3 案出します。先頭 25 字に核を置き、内容を隠しません。案は質の違うものにします (`references/structure.md` と `references/interest.md` の 9)
2. タグの案を出します。数と選び方は `references/structure.md` の「タグ」にあります。決めるのは話者です
3. 見出し画像を用意します。1280×670px です。有無で PV とスキ数が変わります。下地は `references/eyecatch.md` に沿って、芯の 1 文からモチーフを 3 案出し、選ばれたものを `bun run eyecatch` で作ります
4. 本文の画像は山場に寄せます。枚数の目安は 800 字に 1 枚です。ただし均等には撒きません。スクリーンショットや当時のポストは山場の核になります

studio の中では、タイトル 3 案 (`title`)・タグ (`tags`)・名前 3 案 (`slug`)・見出し画像のモチーフ 3 案 (`motif`) を `proposals.yaml` に書きます。ユーザーが公開の画面で選び、モチーフを選ぶと下地を作るよう頼まれます。タイトルの正は原稿の front matter です。本文は公開の画面の「本文をコピー」か、`paste` でクリップボードに入れて、note のエディタに貼ります。見出し・強調・埋め込みの URL 行はそのまま入ります。画像行は `（画像 n/N: ファイル名 ｜ キャプション: …）` に置き換わります。note 側でその行を消して、公開の画面で 1 枚ずつコピーした画像を貼ります。

```
hokuchi-note paste <slug>
```

studio の中では、ユーザーが公開した記事の URL を貼ると、studio が `slugs.json` への追記・取り込み・作品との結びつけ・原稿のフォルダの片付けを行い、公開版と原稿の差から学びの案を頼んできます。学びの案は `proposals.yaml` の `learnings` に書きます (`voice.md` は書けません。ユーザーが採ったものだけを studio が足します)。

ターミナルで進めるときは、公開したら次を回してアーカイブに凍結します。

```
hokuchi-note sync
```

公開日と note key が入った `articles/note/<公開日>-<slug>/` ができます。

公開済みの記事を直すときは、studio で作品を開き、「改稿する」を押します。アーカイブの本文と画像が原稿の置き場に写ります。直したら note の記事を更新し、「note を更新した」を押すと取り込み直します。ターミナルでは `sync` で取り込み直します。アーカイブの `index.md` は生成物なので、直接は直しません。`articles/note/slugs.json` に slug を足しておくと、ディレクトリ名が読める形になります。凍結を確認したら、`~/Hobby/hokuchi-private/notes/<slug>/` は消さずに `~/Hobby/hokuchi-private/trash/<日時>-notes-<slug>/` に移します。
