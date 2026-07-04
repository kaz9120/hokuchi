# hokuchi（火口）

発信に関するツールとドキュメントを置くリポジトリ。ブランド定義は `BRAND.md`（ビジュアルの一次ソース。実装トークンは hidoko の `packages/ui/src/tokens.css`）。

## 意思決定の記録

設計判断はすべて `docs/adr/` に ADR として記録する。フォーマットと索引は `docs/adr/README.md`。ADR は不変で、決定を変えるときは新しい ADR を書いて古い方を廃止にする。各ツールの `docs/design.md` は生きた設計書で、常に現在の設計を描く。

## ディレクトリ

```
docs/adr/          意思決定の記録（リポジトリ全体で単一系列）
.claude/skills/
  crafting-presentation/  対話からスライドを作る skill（Phase 0〜7）
presentation/      スライドスキーマとレンダラ
  SPEC.md          スキーマの規範仕様（唯一の真実）
  schema/          JSON Schema（deck / theme）
  src/ + cli.mjs   lint / render / shot の CLI（npm test で検証）
  themes/          デフォルトテーマ（hokuchi.yaml）
  examples/        テスト用フィクスチャ
  decks/           実デッキの置き場（skill の既定出力先）
  docs/design.md   生きた設計書
  spike/           捨て前提の試作（検証記録として保持）
```

スライドを作る依頼は crafting-presentation skill に従う。デッキは `presentation/decks/<スラグ>/deck.yaml` に置き、テーマは `themes/hokuchi.yaml` を相対参照する（コピーしない）。

## コミット

コミットメッセージは日本語、1 行目は「〜を追加」「〜を修正」のように変更内容を書く。
