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
| [0001](0001-declarative-intent-schema.md) | スライドは意図宣言型 YAML スキーマで記述する | 廃止 (→ ADR-0026) | presentation |
| [0002](0002-two-tier-correctness.md) | 正しさの担保は「書けない」と「警告」の 2 段構えにする | 廃止 (→ ADR-0026) | presentation |
| [0003](0003-theme-from-brand-tokens.md) | デフォルトテーマは BRAND.md と hidoko tokens.css から導出する | 承認 | presentation |
| [0004](0004-defer-regeneration-merge.md) | スライド id を必須にし、再生成と手編集のマージ設計は運用後に行う | 廃止 (→ ADR-0026) | presentation |
| [0005](0005-replace-presentation-roadmap.md) | skill は presentation-roadmap を置き換える新規とする | 承認 | presentation |
| [0006](0006-image-prompt-as-spec.md) | image 要素は生成プロンプトを画像仕様として保持する | 廃止 (→ ADR-0026) | presentation |
| [0007](0007-slot-based-elements.md) | 要素はスロット制にし、emphasis を要素別語彙に分け、タイプスケールをテーマに昇格する | 廃止 (→ ADR-0026) | presentation |
| [0008](0008-spec-remaining-decisions.md) | spike が残した痛点に SPEC 確定へ向けて回答する | 廃止 (→ ADR-0026) | presentation |
| [0009](0009-content-first-layout.md) | リポジトリはコンテンツを主役に置き、発表済み資料は凍結する | 承認 | リポジトリ全体 |
| [0010](0010-theme-brand-frame.md) | テーマにブランド枠 (brand) を追加し、組織テーマの運用を始める | 廃止 (→ ADR-0026) | tools/slides |
| [0011](0011-serve-annotation-loop.md) | serve モードと agentation でアノテーション・フィードバックループを作る | 承認 | tools/slides |
| [0012](0012-single-file-spa-output.md) | render の出力を単一ファイル SPA (index.html) に統合する | 廃止 (→ ADR-0026) | tools/slides |
| [0013](0013-diagram-node-icons.md) | diagram ノードにアイコン語彙を追加する | 廃止 (→ ADR-0026) | tools/slides |
| [0014](0014-renderer-owned-composition.md) | 構図の知識はレンダラが専有し、レイアウトを measure/compose の 2 パスに再設計する | 廃止 (→ ADR-0026) | tools/slides |
| [0015](0015-image-stage-and-overlap-shared.md) | deck スキーマ 0.2.0 — image-stage パターンと overlap の交差語彙 (shared) を追加する | 廃止 (→ ADR-0026) | tools/slides |
| [0016](0016-tech-material-vocabulary.md) | deck スキーマ 0.3.0 / theme 0.4.0 — 技術素材・紹介・数値の語彙を追加する | 廃止 (→ ADR-0026) | tools/slides |
| [0017](0017-link-ogp-and-post-embed.md) | link の OGP 自動解決と post の SPA 実埋め込み | 廃止 (→ ADR-0026) | tools/slides |
| [0018](0018-react-renderer-and-css-composition.md) | レンダラを React コンポーネントで再実装し、ページ内の配置を CSS レイアウトに委ねる | 廃止 (→ ADR-0026) | tools/slides |
| [0019](0019-note-archive-two-layer.md) | note の記事は原本 JSON と Markdown の 2 層でアーカイブする | 承認 | リポジトリ全体 / tools/notes |
| [0020](0020-note-writing-skill-and-style-lint.md) | note の執筆はスキルで進め、文体の規範は実測から引いて lint に落とす | 承認 | リポジトリ全体 / tools/notes |
| [0021](0021-note-markdown-paste-ready.md) | note アーカイブの index.md は note のエディタにそのまま貼れる Markdown にする | 承認 | リポジトリ全体 / tools/notes |
| [0022](0022-note-serve-feedback-loop.md) | note の原稿レビューは serve のフィードバックループで回す | 承認 | tools/notes |
| [0023](0023-somitsu-as-design-target.md) | 粗密を構成の設計対象にし、スキルで山を先に決める | 承認 (crafting-presentation 部分は → ADR-0024) | リポジトリ全体 (skills) |
| [0024](0024-crafting-presentation-reread-slideology.md) | crafting-presentation を slide:ology の読み直しに合わせて作り直す | 承認 | リポジトリ全体 (skills) / tools/slides |
| [0025](0025-renderer-lint-reread-slideology.md) | deck スキーマ 0.5.0 — レンダラと lint を slide:ology の読み直しに合わせる | 廃止 (→ ADR-0026) | tools/slides |
| [0026](0026-scene-state-presentation-framework.md) | 発表資料はシーン×状態の React コードで書き、再生と部品のフレームワーク tools/stage を自作する | 承認 | リポジトリ全体 / tools/stage |
| [0027](0027-self-hosted-slides-site.md) | 発表資料は slides.y-kaz.com に自前でホスティングし、PDF と docswell をやめる | 承認 | リポジトリ全体 / tools/stage |
