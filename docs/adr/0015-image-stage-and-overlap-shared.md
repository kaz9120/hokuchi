# ADR-0015: deck スキーマ 0.2.0 — image-stage パターンと overlap の交差語彙 (shared) を追加する

- ステータス: 承認
- 日付: 2026-07-08
- スコープ: tools/slides

## 文脈

coverage デッキの serve 注釈レビュー (2026-07-08) で、スキーマの穴が 2 つ見えた。

1. スクリーンショット紹介 (登壇の定番) を組む語彙が grid-direct しかない。grid-direct はフルブリード前提で外周マージンを持たず、タイトルを置くと grid-caption がキャンバスの角に張り付き、他パターンと余白の言語が揃わない。「見出し + 良い寸法の画像」という基本形が書けない。
2. cluster.overlap (ベン図) の主役はしばしば交差領域 (「A でも B でもある」) だが、`emphasis` はノード id しか指せず、交差を強調・ラベル付けする語彙が存在しない。

いずれも書き手の語彙 (deck スキーマ) の問題であり、レンダラ内部では解決できない (ADR-0014 の境界)。

## 選択肢

**画像スライドについて。** A 案: grid-direct の運用で凌ぐ — 余白の言語が揃わず、スクリーンショットのたびにセル指定を書くことになる。B 案: `image-stage` パターンを追加する — headline (任意) + image (必須) のスロット制で、他の *-stage と同じ余白・構図に載る。C 案: statement-stage 等に image スロットを混ぜる — パターンの意味が濁る。

**交差の語彙について。** A 案: `emphasis: ["a+b"]` のような複合 id 記法 — 暗黙の文字列規約はスロット制の設計 (ADR-0007) に反する。B 案: 任意フィールド `shared: { label?, emphasis? }` — 全円の共通部分 1 つだけを表す。C 案: `intersections: [{ of: [a,b], ... }]` のペア毎配列 — 表現力は最大だが、ベン図で語りたいのはほぼ常に「共通部」であり、組合せの複雑さに見合わない。

## 決定

deck スキーマを 0.2.0 に上げ、次の 2 つを後方互換で追加する。

- `layout` の enum に `image-stage` を追加する。スロットは `headline` (statement、任意) と `image` (image、必須)。レンダラの measure は実画像の縦横比 (png / jpeg / svg) を読んで箱を申告し、compose が他パターンと同じ余白・光学中心に置く。
- `diagram` (form が `cluster.overlap` のとき) に任意フィールド `shared: { label?: string, emphasis?: boolean }` を追加する。全円の共通部分のラベルと強調を宣言する。

## 根拠

image-stage は確信度高 — 登壇での実需が明確で、既存の measure プロトコル (ADR-0014) にそのまま載る。shared は確信度中 — 「共通部 1 つで足りる」は実デッキ未検証の仮説なので、最小の語彙から始める。

## 見直しの条件

ペア毎の交差 (「A と B だけの共有」) を必要とする実デッキが現れたら、`intersections` 配列へ拡張する (shared は互換のため残す)。

## 影響

- deck スキーマ 0.2.0 (後方互換追加。0.1.0 のデッキはそのまま妥当)
- SPEC §1.4 / §5.1 / §6.4 / 付録 A の改訂
- レンダラに measureImage (画像寸法読み取り) と overlap の交差描画を追加
- coverage デッキに検証スライドを追加
- crafting-presentation skill の要素選択ガイドに image-stage と cluster 使い分けを追記
