# hokuchi（火口）

発信に関するツールとドキュメントを置くリポジトリ。ブランド定義は `BRAND.md`（ビジュアルの一次ソース。実装トークンは hidoko の `packages/ui/src/tokens.css`）。

## 意思決定の記録

設計判断はすべて `docs/adr/` に ADR として記録する。フォーマットと索引は `docs/adr/README.md`。ADR は不変で、決定を変えるときは新しい ADR を書いて古い方を廃止にする。各ツールの `docs/design.md` は生きた設計書で、常に現在の設計を描く。

## ディレクトリ

発信物（コンテンツ）が主役、ツールは脇役。root は発信形態ごとのコンテンツと tools/ で構成する（ADR-0009）。

```
docs/adr/          意思決定の記録（リポジトリ全体で単一系列）
talks/             発表資料（主役。時系列に蓄積）
  <YYYY-MM-slug>/
    deck.yaml      意図宣言型のソース
    assets/        実画像など
    out/           作業レンダリング（git 管理外）
    final/         発表済みの凍結出力（コミットする）
articles/          （将来）記事など、他の発信形態も root に並べる
tools/
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
```

スライドを作る依頼は crafting-presentation skill に従う。デッキは `talks/<YYYY-MM-slug>/deck.yaml` に置く。テーマは登壇の立場で選び、相対パスで参照する（個人は `tools/slides/themes/hokuchi.yaml`、MOSH としては `tools/slides/themes/mosh.yaml`。コピーしない。ADR-0010）。発表が終わったら最終レンダリングを `final/` にコミットして凍結する。レンダラは進化するので、deck.yaml だけでは当時の見た目を再現できない。人間の細かいレビューは `hokuchi serve` のアノテーション (ADR-0011) で受ける。

## コミット

コミットメッセージは日本語、1 行目は「〜を追加」「〜を修正」のように変更内容を書く。
