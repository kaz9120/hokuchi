# ADR — Architecture Decision Records

hokuchi における意思決定の記録。決定に至る過程（選択肢・根拠・撤退ライン）を、決定した時点の姿のまま残す。

## 運用ルール

- 番号は 4 桁ゼロ埋めの通し番号。リポジトリ全体で単一系列とし、ツールの区別は `スコープ` フィールドで表す
- ファイル名は `NNNN-ascii-slug.md`。タイトルは日本語でよい
- ADR は不変。決定を変えるときは新しい ADR を書き、古い方のステータスを `廃止 (→ ADR-NNNN)` に更新する（本文は書き換えない）
- 生きた設計書（各ツールの `docs/design.md`）は常に現在の姿を描き、決定の経緯は ADR へリンクする。役割を混ぜない
- ステータスは `提案` → `承認` → `廃止` の 3 つ

## テンプレート

```markdown
# ADR-NNNN: <決定を 1 文で>

- ステータス: 提案 | 承認 | 廃止 (→ ADR-NNNN)
- 日付: YYYY-MM-DD
- スコープ: presentation | リポジトリ全体 | ...

## 文脈

何の問いに答える決定か。決定を迫った状況。

## 選択肢

検討した選択肢と、それぞれの利害。最低 2 つ。1 案しか無いなら、それはまだ決定の時期ではない。

## 決定

選んだもの。1 段落で。

## 根拠

なぜその選択肢か。確信度（高・中・低）と、確信度を下げている前提があればそれも。

## 見直しの条件

何が起きたらこの決定を再訪するか。書けないなら、まだ決めるべきではない。

## 影響

この決定が他の決定・作業に与える影響。
```

## 索引

| # | タイトル | ステータス | スコープ |
|---|---------|-----------|---------|
| [0001](0001-declarative-intent-schema.md) | スライドは意図宣言型 YAML スキーマで記述する | 承認 | presentation |
| [0002](0002-two-tier-correctness.md) | 正しさの担保は「書けない」と「警告」の 2 段構えにする | 承認 | presentation |
| [0003](0003-theme-from-brand-tokens.md) | デフォルトテーマは BRAND.md と hidoko tokens.css から導出する | 承認 | presentation |
| [0004](0004-defer-regeneration-merge.md) | スライド id を必須にし、再生成と手編集のマージ設計は運用後に行う | 承認 | presentation |
| [0005](0005-replace-presentation-roadmap.md) | skill は presentation-roadmap を置き換える新規とする | 承認 | presentation |
| [0006](0006-image-prompt-as-spec.md) | image 要素は生成プロンプトを画像仕様として保持する | 承認 | presentation |
| [0007](0007-slot-based-elements.md) | 要素はスロット制にし、emphasis を要素別語彙に分け、タイプスケールをテーマに昇格する | 承認 | presentation |
| [0008](0008-spec-remaining-decisions.md) | spike が残した痛点に SPEC 確定へ向けて回答する | 承認 | presentation |
| [0009](0009-content-first-layout.md) | リポジトリはコンテンツを主役に置き、発表済み資料は凍結する | 承認 | リポジトリ全体 |
| [0010](0010-theme-brand-frame.md) | テーマにブランド枠 (brand) を追加し、組織テーマの運用を始める | 承認 | tools/slides |
| [0011](0011-serve-annotation-loop.md) | serve モードと agentation でアノテーション・フィードバックループを作る | 承認 | tools/slides |
| [0012](0012-single-file-spa-output.md) | render の出力を単一ファイル SPA (index.html) に統合する | 承認 | tools/slides |
| [0013](0013-diagram-node-icons.md) | diagram ノードにアイコン語彙を追加する | 承認 | tools/slides |
| [0014](0014-renderer-owned-composition.md) | 構図の知識はレンダラが専有し、レイアウトを measure/compose の 2 パスに再設計する | 承認 | tools/slides |
| [0015](0015-image-stage-and-overlap-shared.md) | deck スキーマ 0.2.0 — image-stage パターンと overlap の交差語彙 (shared) を追加する | 承認 | tools/slides |
