# hokuchi（火口）

山本一将の発信のためのリポジトリです。何のために発信し、hokuchi が何をするかは `GOALS.md` にあります。機能や画面を迷ったら、まず `GOALS.md` に照らしてください。ブランド定義は `BRAND.md` にあります（ビジュアルの一次ソースです。実装トークンは hidoko の `packages/ui/src/tokens.css` にあります）。

## 文書の置き場

設計の正はコードとテストです。設計判断の経緯は残しません。必要になったら、その時点で `GOALS.md` に照らして考え直します。

- 目的・成功の基準・hokuchi の役割は `GOALS.md` に書きます。照らして決められないときは、話者と相談して書き換えます
- ツールの考え方（コードを読んでも分からない原則）・用語・使い方は、各ディレクトリの `README.md` に書きます
- 数値や挙動の理由は、それを定義しているコードのコメントに書きます
- ADR・設計書・経緯の記録を新しく作りません

## ディレクトリ

主役は発信物（コンテンツ）で、ツールは脇役です。

```
talks/             発表資料（主役。公開する発表だけを置く）
  <YYYY_MM_DD_タグ_演題>/   命名は過去資料と同じ。URL は日付とタグから作る（/2026-09-29-devsgarden/）
    storyboard.md  絵コンテ。話者と合意する設計図で、話すこと（ノート）の正本
    feedback.yaml  指摘のスレッド。話者・聴衆役・Claude の往復を残す
    readers.yaml   この発表を読んでもらう聴衆役
    reads/         聴衆役の読みの結果（回ごと。アンケートとコマへの感想）
    talk.tsx       トークの定義（テーマ・公開の可否・シーンの並び）
    scenes/        シーン（1 ファイル 1 シーン。React + Motion）
    assets/        実画像など
    out/           作業出力（git 管理外）
parts/             トークをまたいで使い回す中身（自己紹介・会社紹介・写真）
personas/          聴衆役のペルソナのプリセット。発表でも記事でも使い回す
articles/note/     note.com の記事アーカイブ（原本 + Markdown の 2 層）
packages/stage/    発表のフレームワーク。再生機・部品・テーマ・トーク単位の CLI
apps/
  slides/          slides.y-kaz.com。全トークを最新のフレームワークでビルドして組み立てる
  studio/          ローカルの制作アプリ。発表と note の記事を、企画から公開まで作る
archive/talks/     旧方式（意図宣言型 YAML）の deck.yaml と写真。作り直すときの素材で、ビルドしない
tools/
  notes/           note の CLI（sync / build / verify / lint / paste / index）
  eyecatch/        note の見出し画像の下地を作る CLI
.claude/skills/
  crafting-presentation/  対話から発表資料を作る skill（Phase 0〜8）
  writing-note/           note の記事を書く skill（Phase 0〜7。studio の記事の作品の画面と同じ流れ）
  making-short-video/     X などに流す短い動画を HyperFrames で作る skill（使い込みながら育てる途中）
```

作品の企画シートとネタ帳、記事の原稿（`notes/<slug>/`）、短い動画のプロジェクト（`videos/<slug>/`）、社内向けの発表は、公開リポジトリの外の `~/Hobby/hokuchi-private` に置きます。

依存はルートの bun ワークスペース（`packages/*`・`apps/*`・`tools/eyecatch`、hoisted）で管理します。`bun install` はルートで実行します。`tools/notes` は対象外です。

## note の記事

記事を書く依頼は、writing-note skill に従ってください。原稿は公開リポジトリの外の `~/Hobby/hokuchi-private/notes/<slug>/` に置き、studio の原稿の面で段落ごとに直します。文体は `hokuchi-note lint <slug>` で検査します。文体の規範は公開済み記事の実測（2026-09 時点で 44 本）から引いています。記事が増えたら測り直してください。

公開済みの記事は `hokuchi-note sync` で取り込みます。`index.md` は生成物なので、手では直しません。直したいときは変換規則を直して、`build` を回します。取り込みの欠落は `verify` が検査するので、記事を足したら必ず通してください。

`hokuchi-note` が PATH に無いときは、リポジトリのルートから `node tools/notes/cli.mjs <サブコマンド>` で同じように動きます。

見出し画像の下地は `bun run eyecatch` で作ります。モチーフと置き場所の決め方は writing-note skill の `references/eyecatch.md` にあります。

## スライド

発表資料を作る依頼は、crafting-presentation skill に従ってください。絵コンテ `storyboard.md` で話者と合意してから、シーンを `packages/stage` の React コードで実装します。フレームワークの考え方は `packages/stage/README.md` にあります。

テーマは登壇の立場で選びます。個人としては `hokuchi`（明るい会場なら `hokuchi-light`）、MOSH としては `mosh` です。

よく使うコマンドは次のとおりです。`<talk>` は `talks/` の中の名前の先頭だけでも指定できます（例: `2026_09_29`）。

```sh
bun run studio                 # 制作アプリ（http://localhost:5300/）。ホームの「いま」から作品を開く。中でサイト全体（5280）も立てる
bun run test:studio            # studio のファイルの形・振る舞い・API の規則のテスト（偽物の claude で動く）
bun run dev                    # サイト全体の開発サーバだけ（http://localhost:5280/）。studio を使わずに見るとき
bun run dev <talk>             # トーク 1 本の作業用サーバ。いずれも長く動くので、話者に別ターミナルで立ててもらう
bun run check <talk> --motion  # 全状態の静止画・検査・絵コンテとの照合・遷移のコマ撮り
bun run single <talk>          # 1 つの HTML と PDF に書き出す (公開用の画面。--present で発表用)。社内向けの発表をファイルで共有するとき
bun run typecheck
bun run site                   # slides.y-kaz.com を apps/slides/dist に組み立てる
bun run deploy                 # 組み立てて公開する（話者の確認を取ってから。手順は apps/slides/README.md）
```

発表資料は `https://slides.y-kaz.com/<日付-タグ>/` で公開します。PDF と docswell は使いません。凍結はしません。公開のたびに全トークを最新のフレームワークでビルドし、前回と見た目が変わった状態があれば止まります。サイトに載るのは `public: true` のトークだけです。このリポジトリは GitHub で公開されているので、社内向けの発表はリポジトリの外に置きます。デプロイは話者の確認を取ってから行います。

## コミット

コミットメッセージは日本語で書きます。1 行目には「〜を追加」「〜を修正」のように、変更内容を書いてください。
