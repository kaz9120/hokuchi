# hokuchi（火口）

発信に関するツールとドキュメントを置くリポジトリです。ブランド定義は `BRAND.md` にあります（ビジュアルの一次ソースです。実装トークンは hidoko の `packages/ui/src/tokens.css` にあります）。

## 意思決定の記録

設計判断はすべて、`docs/adr/` に ADR として記録します。フォーマットと索引は `docs/adr/README.md` にあります。ADR は書き換えません。決定を変えるときは新しい ADR を書き、古い方を廃止にします。各ツールの `docs/design.md` は生きた設計書で、いつも現在の設計を描いています。

## ディレクトリ

主役は発信物（コンテンツ）で、ツールは脇役です。root は、発信形態ごとのコンテンツと tools/ で構成しています（ADR-0009）。

```
docs/adr/          意思決定の記録（リポジトリ全体で単一系列）
talks/             発表資料（主役。時系列に蓄積）
  <YYYY-MM-slug>/
    deck.yaml      意図宣言型のソース
    assets/        実画像など
    out/           作業レンダリング（git 管理外）
    final/         発表済みの凍結出力（コミットする）
articles/
  note/            note.com の記事アーカイブ（原本 + Markdown の 2 層。ADR-0019）
    drafts/        執筆中の原稿（<slug>/index.md。公開したら sync が凍結する）
    slugs.json     note key → slug。ディレクトリ名の唯一の真実
    <YYYY-MM-DD-slug>/
      source.json  原本。note API の不変フィールドを凍結したもの
      index.md     読む用。source.json から生成（手で直さない）
      assets/      見出し画像と本文画像の実体
tools/
  notes/           note の CLI（sync / build / verify / lint / index）
    docs/design.md 生きた設計書
  slides/          スライドスキーマとレンダラ
    SPEC.md        スキーマの規範仕様（唯一の真実）
    schema/        JSON Schema（deck / theme）
    src/ + cli.mjs lint / render / shot / serve の CLI（npm link で hokuchi コマンドに。npm test で検証）
    themes/        テーマ（個人 hokuchi.yaml / MOSH mosh.yaml）
    examples/      テスト用フィクスチャ
    docs/design.md 生きた設計書
    spike/         捨て前提の試作（検証記録として保持）
.claude/skills/
  crafting-presentation/  対話からスライドを作る skill（Phase 0〜7）
  writing-note/           note の記事を書く skill（Phase 0〜7。ADR-0020）
```

## note の記事

記事を書く依頼は、writing-note skill に従ってください。原稿は `articles/note/drafts/<slug>/` に置き、`hokuchi-note lint` で文体を検査します。文体の規範は、公開済み記事の実測（2026-09 時点で 44 本）から引いています。記事が増えたら測り直してください（ADR-0020）。

公開済みの記事は、`hokuchi-note sync` で取り込みます。`index.md` は生成物なので、手では直しません。直したいときは変換規則を直して、`build` を回します。取り込みの欠落は `verify` が検査するので、記事を足したら必ず通してください（ADR-0019）。

`hokuchi-note` が PATH に無いときは、リポジトリのルートから `node tools/notes/cli.mjs <サブコマンド>` で同じように動きます。

## スライド

スライドを作る依頼は、crafting-presentation skill に従ってください。デッキは `talks/<YYYY-MM-slug>/deck.yaml` に置きます。

テーマは登壇の立場で選び、相対パスで参照します。個人としては `tools/slides/themes/hokuchi.yaml`、MOSH としては `tools/slides/themes/mosh.yaml` です。コピーはしません（ADR-0010）。

発表が終わったら、最終レンダリングを `final/` にコミットして凍結します。レンダラは進化していくので、deck.yaml だけでは当時の見た目を再現できないためです。人間の細かいレビューは、`hokuchi serve` のアノテーションで受けます（ADR-0011）。

## コミット

コミットメッセージは日本語で書きます。1 行目には「〜を追加」「〜を修正」のように、変更内容を書いてください。
