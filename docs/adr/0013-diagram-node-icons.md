# ADR-0013: diagram ノードにアイコン語彙を追加する

- ステータス: 承認
- 日付: 2026-07-07
- スコープ: tools/slides

## 文脈

coverage デッキのアノテーションレビュー (2026-07-06) で、diagram ノードの表現力不足が指摘された。ラベル+補足 1 行 (detail) は揃ったが、「アイコンを入れられるくらいの表現力」への要望が残っている。ai-survival の運用でも同種の指摘があった (annotations.md slide-16)。

一方、theme には `iconography: isometric | flat | hand-drawn` という様式宣言が最初からあるのに (SPEC §2.4、slide:ology p.188「様式を混在させない」由来)、それを実装する実体のアイコンが語彙に存在しない。様式の一貫性を守る仕組みだけあって、守る対象が無い状態である。

前提となる設計思想 (ADR-0001): デッキは意図を書き、見た目はテーマとレンダラが導出する。アイコンをどう入れるかは、この分担を壊さない形でなければならない。

## 選択肢

1. **キュレーション済みアイコンセットを依存に取り、名前参照させる** — `nodes[].icon: "<name>"`。セットとウェイトはテーマが決め、レンダラがビルド時に SVG パスをインライン化する (実行時依存なし)。未知の名前は lint エラー (`icon-exists`)。候補セットは 2 つ:
   - **Phosphor Icons** — MIT。約 1,500 種 × 6 ウェイト (thin / light / regular / bold / fill / duotone)。ウェイトの語彙があるため、強調 (emphasis) との連動を機械的に導出できる (例: 通常ノードは regular、強調ノードは fill)。`@phosphor-icons/core` が全 SVG を同梱
   - **Lucide** — ISC。約 1,600 種。ストロークベースの単一様式で、太さは stroke-width の数値調整のみ。実績と普及度は最も高い。`lucide-static` が全 SVG を同梱
2. **任意の SVG / 絵文字を許す** — 自由度は最大だが、場当たりな見た目を書ける口が開く。「スキーマ上そもそも書けない」(ADR-0002 の correct by construction) が崩れ、様式の一貫性 (p.188) を lint でも守れなくなる
3. **見送り** — detail までで止める。図解のリッチ化はレビューで繰り返し要望されており、根本の解決にならない

## 決定

1 を採用し、セットは Phosphor とする。実装の骨子は次のとおり。

- スキーマ: diagram の `nodes[].icon` に名前 (文字列) を追加。名前はセットのカタログに存在しなければならない (`icon-exists` lint、エラー)
- テーマ: `iconography` を実体と結びつける。`flat` の実装として `icon_set: phosphor` / `icon_weight: regular` をテーマに持たせる (デッキ側はセットを知らない)
- 導出: 強調ノードのウェイト昇格 (regular → fill) はレンダラが導出する。デッキにウェイトは書けない
- 描画: ビルド時に SVG パスを読み、ノードカードにインライン展開する。色は palette スロットから導出 (アイコンに色は書けない)
- 配置: カード内のアイコン位置 (バッジ位置との調停を含む) はレンダラの責務

## 根拠と確信度

Phosphor に決めた理由は 2 つ。

1. **ウェイト機構** — 6 ウェイトという語彙が「強調は書く、見た目は導出」の設計にそのまま噛み合う。強調ノードの regular → fill 昇格をレンダラが機械的に導出できる。Lucide で同じことをするには stroke-width の数値をレンダラが発明することになり、導出規則が恣意的になる
2. **ブランドロゴの収録** (決め手、2026-07-07 議論) — Phosphor は主要サービスのロゴ (x-logo / github-logo / youtube-logo / slack-logo など) をアイコン全体と同一テイストで含む。X アカウントを紹介する自己紹介スライドのような実需に、様式の一貫性 (p.188) を保ったまま応えられる。Lucide は方針としてブランドアイコンを持たない (既存分も廃止してきた) ため、この用途では別ソースの混入 = 様式の混在が避けられない

確信度は高。ライセンス (MIT)・網羅性 (regular だけで 1,512 種)・SVG 構造 (viewBox 256 + currentColor でインライン化容易) は導入時に実物で確認済み。coverage デッキでの描画確認により、見た目の相性の懸念も潰した。

## 議論で確定した論点 (2026-07-07)

1. セット — Phosphor に確定。ロゴの収録が決め手 (上記)
2. `iconography` の再定義 — 2 層を保つ。`iconography: flat` は様式の分類のまま残し、その実装として theme が `icon_set` / `icon_weight` を持つ
3. スコープ — diagram nodes に加え、profile-stage の handle 行頭 (X アカウント紹介の実需) も対象にする。bullets などへの展開は実需が出てから

## 見直しの条件

- 採用セットのカタログに必要なアイコンが繰り返し見つからないとき (代替セットへの差し替えを検討する。icon 名はセット固有なので、差し替え時は既存デッキの icon 名の書き換えが必要 — この移行コストを撤退コストとして認識しておく)
- アイコンが「飾り」として濫用され、意味を運ばないノードに付き始めたとき (lint での抑制、または語彙の縮小を検討する)

## 影響

- deck スキーマ (deck.schema.json) と SPEC §6.4 に `nodes[].icon` が、statement (SPEC §6.1) に行頭 `icon` (描画は profile-stage handle のみ) が増える
- theme スキーマに `icon_set` / `icon_weight` が増え、`iconography` との関係を SPEC §2.4 で定義し直す
- lint に `icon-exists` (error) が増える
- package.json に `@phosphor-icons/core` が増える (ビルド時のみ使用、出力にはインライン化)
- coverage デッキに icon 付きノードと handle ロゴの実例を追加する
