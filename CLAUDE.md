# hokuchi（火口）

発信に関するツールとドキュメントを置くリポジトリです。ブランド定義は `BRAND.md` にあります（ビジュアルの一次ソースです。実装トークンは hidoko の `packages/ui/src/tokens.css` にあります）。

## 意思決定の記録

設計判断はすべて、`docs/adr/` に ADR として記録します。フォーマットと索引は `docs/adr/README.md` にあります。ADR は書き換えません。決定を変えるときは新しい ADR を書き、古い方を廃止にします。各ツールの `docs/design.md` は生きた設計書で、いつも現在の設計を描いています。

## ディレクトリ

主役は発信物（コンテンツ）で、ツールは脇役です。root は、発信形態ごとのコンテンツと tools/ で構成しています（ADR-0009）。

```
docs/adr/          意思決定の記録（リポジトリ全体で単一系列）
talks/             発表資料（主役。公開する発表だけを置く）
  <YYYY_MM_DD_タグ_演題>/   命名は過去資料と同じ。URL は日付とタグから作る（/2026-09-29-devsgarden/）
    storyboard.md  絵コンテ。話者と合意する設計図で、話すこと（ノート）の正本（ADR-0028）
    talk.tsx       トークの定義（テーマ・公開の可否・シーンの並び）
    scenes/        シーン（1 ファイル 1 シーン。React + Motion）
    assets/        実画像など
    out/           作業出力（git 管理外）
parts/             トークをまたいで使い回す中身（自己紹介・会社紹介・写真）
articles/
  note/            note.com の記事アーカイブ（原本 + Markdown の 2 層。ADR-0019）
    drafts/        執筆中の原稿（<slug>/index.md。公開したら sync が凍結する）
    slugs.json     note key → slug。ディレクトリ名の唯一の真実
    <YYYY-MM-DD-slug>/
      source.json  原本。note API の不変フィールドを凍結したもの
      index.md     読む用。source.json から生成（手で直さない）
      assets/      見出し画像と本文画像の実体
packages/
  stage/           発表のフレームワーク（ADR-0026）。再生機・部品・テーマ・トーク単位の CLI
    docs/design.md 生きた設計書
apps/
  slides/          slides.y-kaz.com。全トークを最新のフレームワークでビルドして組み立てる（ADR-0029）
  studio/          ローカルの制作アプリ。絵コンテのボードを見ながら Claude とチャットして作る（ADR-0030）
archive/talks/     旧方式（意図宣言型 YAML）の deck.yaml と写真。作り直すときの素材で、ビルドしない
tools/
  notes/           note の CLI（sync / build / verify / lint / index）
    docs/design.md 生きた設計書
.claude/skills/
  crafting-presentation/  対話から発表資料を作る skill（Phase 0〜8。ADR-0024・ADR-0028）
  writing-note/           note の記事を書く skill（Phase 0〜7。ADR-0020）
```

依存はルートの bun ワークスペース（`packages/*`・`apps/*`、hoisted）で管理します。`bun install` はルートで実行します。`tools/notes` は対象外です。

## note の記事

記事を書く依頼は、writing-note skill に従ってください。原稿は `articles/note/drafts/<slug>/` に置き、`hokuchi-note lint` で文体を検査します。文体の規範は、公開済み記事の実測（2026-09 時点で 44 本）から引いています。記事が増えたら測り直してください（ADR-0020）。

公開済みの記事は、`hokuchi-note sync` で取り込みます。`index.md` は生成物なので、手では直しません。直したいときは変換規則を直して、`build` を回します。取り込みの欠落は `verify` が検査するので、記事を足したら必ず通してください（ADR-0019）。

`hokuchi-note` が PATH に無いときは、リポジトリのルートから `node tools/notes/cli.mjs <サブコマンド>` で同じように動きます。

## スライド

発表資料を作る依頼は、crafting-presentation skill に従ってください。絵コンテ `storyboard.md` で話者と合意してから、シーンを `packages/stage` の React コードで実装します（ADR-0026・ADR-0028）。フレームワークの仕様は `packages/stage/docs/design.md` にあります。

テーマは登壇の立場で選びます。個人としては `hokuchi`（明るい会場なら `hokuchi-light`）、MOSH としては `mosh` です。

よく使うコマンドは次のとおりです。`<talk>` は `talks/` の中の名前の先頭だけでも指定できます（例: `2026_09_29`）。

```sh
bun run studio <talk>          # 制作アプリ（http://localhost:5300）。話者に別ターミナルで立ててもらう
bun run dev <talk>             # 作業用サーバ。長く動くので、話者に別ターミナルで立ててもらう
bun run check <talk> --motion  # 全状態の静止画・検査・絵コンテとの照合・遷移のコマ撮り
bun run typecheck
bun run site                   # slides.y-kaz.com を apps/slides/dist に組み立てる
```

発表資料は `https://slides.y-kaz.com/<日付-タグ>/` で公開します（ADR-0027）。PDF と docswell は使いません。凍結はしません。公開のたびに全トークを最新のフレームワークでビルドし、前回と見た目が変わった状態があれば止まります（ADR-0029）。サイトに載るのは `public: true` のトークだけです。このリポジトリは GitHub で公開されているので、社内向けの発表はリポジトリの外に置きます。デプロイは話者の確認を取ってから行います。

## コミット

コミットメッセージは日本語で書きます。1 行目には「〜を追加」「〜を修正」のように、変更内容を書いてください。
