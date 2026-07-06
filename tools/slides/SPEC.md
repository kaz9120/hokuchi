# hokuchi スライドスキーマ仕様 (SPEC)

- ステータス: 確定版 (schema_version 0.1.0)
- 日付: 2026-07-04
- 参考文献: ナンシー・デュアルテ『slide:ology』BNN、2014年 (以下、ページ番号は同書)
- 決定の一次ソース: [ADR-0001〜0008](../docs/adr/README.md)。設計の全体像は [design.md](docs/design.md)

本書は、書き手 (Claude) が生成し人間がレビューする宣言スキーマの正式仕様です。設計判断の経緯は ADR に、現在の設計像は design.md にあります。本書は、その決定を機械可読スキーマ (`schema/theme.schema.json`, `schema/deck.schema.json`) と一対一で対応する規範仕様として編纂したものです。

規範表現は次の三語で統一します。義務は「〜する」「〜してはならない」、推奨は「〜すべきである」。

---

## 1. 概要と用語

### 1.1 スキーマの狙い

書き手はピクセルではなく意図を宣言し、レンダラが配置を導出します (ADR-0001)。正しさは二段で守ります。原理的に許さない制約はスキーマの型として書けなくし、文脈次第で例外がありうる制約は書けるが linter が警告します (ADR-0002)。

### 1.2 用語

| 用語 | 定義 |
|------|------|
| deck | 1 つのプレゼンテーション全体。`title`・`audience`・`scales`・`theme` 参照・`slides` を持つ (第 3 章) |
| theme | デッキが参照する共有基盤。色・書体・グリッド・タイプスケールを名前付きスロットに固定する (第 2 章、ADR-0003) |
| slide | 1 枚のスライド。1 枚 = 1 アイデア (`idea`) を守る (第 4 章、p.109) |
| element | スライドを構成する要素。7 種 (statement / bullets / image / diagram / chart / quote / raw、第 6 章) |
| slot | 名前付きレイアウトパターンが宣言する配置口。要素は `slot` でスロットに入る (ADR-0007、第 5 章) |
| stage (舞台) | role が定めるレターボックス帯の内側。レイアウトが配置してよい領域 (ADR-0008-6、第 8 章) |
| pattern | 名前付きレイアウトパターン。スロットを宣言する配置テンプレート (第 5 章) |

### 1.3 ファイル構成

デッキとテーマは別ファイルとします。デッキは `deck.theme` にテーマファイルへの相対パスを持ちます。

```
deck.yaml    # schema/deck.schema.json で検証する
theme.yaml   # schema/theme.schema.json で検証する
```

両ファイルとも、最上位に `schema_version` を持ち、その隣に `deck`(+`slides`) ないし `theme` を置きます。

### 1.4 schema_version とバージョニング

`schema_version` は必須フィールドで、semver の文字列とします。

- MAJOR — 後方非互換の変更 (必須フィールドの削除・改名、型の非互換変更)
- MINOR — 後方互換の追加 (任意フィールドの追加、enum への値追加)
- PATCH — 仕様の明確化。スキーマの受理集合は変えない

スキーマを進化させるときは、本書末尾の「付録 A: マイグレーションノート」に変更点を追記します。現行版は deck スキーマが `0.1.0`、theme スキーマが `0.2.0` (brand 追加、ADR-0010) です。1.0.0 未満のため、破壊的変更が MINOR で起こりうる不安定版として扱います。

---

## 2. Theme 仕様

テーマはデッキから参照する共有基盤です。色・書体・グリッドを名前付きスロットに固定し、任意の色値や 3 書体目を書けなくします (ADR-0002)。デフォルトテーマの実値は hokuchi の `BRAND.md` と hidoko `tokens.css` から導出します (ADR-0003)。

### 2.1 grid

| フィールド | 型 | 既定 | 意味 |
|-----------|----|----|------|
| `pattern` | `col-3` \| `col-4` \| `col-5` \| `fibonacci` | — (必須) | 列の分割方式 (p.121) |
| `rows` | 整数 | `6` | グリッドの行数。grid-direct のセル行番号の基準になる (ADR-0008-1、NOTES §2.4) |
| `stage_margin` | 整数 | `1` | 上下に空ける行数。「映画スクリーン」効果のレターボックス帯 (p.122) |

`rows` を明示するのは、`col-4` が列だけ決めて行数が宙に浮く状態を断つためです (ADR-0008-1)。

### 2.2 palette

色は名前付きスロットのみを持ち、任意の色値リテラルを他の場所に書いてはならない (ADR-0002)。

| スロット | 型 | 意味 |
|---------|----|------|
| `core` | 色 3〜5 個の配列 | 本体コンテンツ・データ系列の色 (p.156) |
| `neutral` | 役割名スロット (下表) | 面・罫線・テキストの無彩色 |
| `highlight` | 色 1 個 | 強調専用色。ブランド指紋色 ember-400 を置く (ADR-0003、p.156) |
| `background` | `dark` \| `light` | dark=フォーマル/大会場、light=配布/小会議室 (p.152) |

`neutral` は index 参照が不安定なため、役割名スロットとします (ADR-0003、NOTES §1.3)。

| neutral スロット | 用途 |
|-----------------|------|
| `bg` | 背景の地 |
| `surface` | 面 (ノード・カードの下地) |
| `line` | 罫線・チャート背景レイヤー |
| `muted` | dim されたテキスト |
| `text` | 標準テキスト |
| `text_strong` | 見出しテキスト |

色値は `#` に続く 16 進 6 桁 (`^#[0-9a-fA-F]{6}$`) とします。`core` は 3 個以上 5 個以下とします (p.156)。

### 2.3 type

書体スロットは `display` と `body` の 2 つだけとします。3 書体目を書けないことをスキーマが保証します (ADR-0002、p.163)。

| スロット | フィールド | 意味 |
|---------|-----------|------|
| `display` | `family`, `weight` | 見出し系 |
| `body` | `family`, `weight`, `min_size_pt` | 本文系。`min_size_pt` は本文の下限サイズ (p.172-173) |

`type.webfonts` (任意) は `<link>` で読み込む Web フォント CSS の URL 配列です (ADR-0010)。オフライン描画時はフォールバックフォントに落ちます。

タイプスケール (`scale`) は、役割ごとのフォントサイズ (px) を持つトークン群です。これはレンダラの暗黙テーブルからテーマへ昇格した一級の定義です (ADR-0007、NOTES §2.3)。既定値は spike NOTES §1 の実測表を採ります。

| トークン | 既定 (px) | 使う場所 |
|---------|----------|---------|
| `hero` | 80 | opener / closer の statement |
| `title` | 74 | title-stage の主タイトル |
| `big` | 70 | content の statement-stage |
| `quote` | 46 | 引用本文 |
| `heading` | 34 | diagram / chart / list の見出し |
| `bullet` | 34 | 箇条書き項目 |
| `subtitle` | 30 | title-stage の副題 |
| `attribution` | 24 | 引用の出典 |
| `node` | 24 | ダイアグラムのノードラベル |
| `axis` | 20 | チャートの軸ラベル |

### 2.4 iconography と space

| フィールド | 型 | 意味 |
|-----------|----|------|
| `iconography` | `isometric` \| `flat` \| `hand-drawn` | アイコン様式。混在させてはならない (p.188, p.192) |
| `space` | `2d` \| `3d` | 空間表現。デッキ単位でどちらか一方に固定する (p.140) |

### 2.5 brand — ブランド枠 (ADR-0010)

組織テーマのためのブランド枠です。すべて任意で、パスはテーマファイルからの相対とします。レンダラは brand を舞台の外側のレイヤーとして描き、role がレターボックスを支配する構造 (ADR-0008-6) を壊しません。

| フィールド | 型 | 意味 |
|-----------|----|------|
| `brand.logo` | `{ src, src_invert?, height?, placement? }` | ロゴ。右上に描画。`placement` は `bumpers` (既定、p.137 準拠) \| `all` (組織要件による明示的逸脱)。`src_invert` は反転背景用の白版 |
| `brand.footer` | 文字列 | 全スライド右下の短いテキスト (コピーライト等) |
| `brand.backgrounds` | `{ bumper?, title?, transition?, content? }` | role 群ごとの背景アート。各エントリは `{ src, foreground? }` |

`backgrounds` のキーは role 群に対応します (opener/closer → `bumper`)。`foreground: light` は「この背景は濃色である」という宣言で、レンダラはそのスライドの前景 (テキスト・強調・ロゴ) を白系に反転します。

デュアルテはロゴをバンパーに限ることを推奨します (p.137)。`placement: all` は企業テンプレートの要件を宣言で満たすための明示的な逸脱であり、lint は警告しません (テーマの宣言はデッキの逸脱ではないため)。実例は `themes/mosh.yaml`。

### 2.6 例

```yaml
schema_version: "0.1.0"
theme:
  grid:
    pattern: col-4
    rows: 6
    stage_margin: 1
  palette:
    core: ["#c8d4e0", "#7a8c5e", "#7c8590"]
    neutral:
      bg: "#0a0907"
      surface: "#1a1814"
      line: "#3a342b"
      muted: "#a8a094"
      text: "#ebe5d8"
      text_strong: "#f5f1e6"
    highlight: "#f47d3a"
    background: dark
  type:
    display: { family: '"LINE Seed JP", "Inter", sans-serif', weight: 700 }
    body:    { family: '"LINE Seed JP", "Inter", sans-serif', weight: 400, min_size_pt: 24 }
    scale:
      hero: 80
      title: 74
      big: 70
      quote: 46
      heading: 34
      bullet: 34
      subtitle: 30
      attribution: 24
      node: 24
      axis: 20
  iconography: flat
  space: 2d
```

---

## 3. Deck 仕様

デッキは最上位オブジェクトです。ファイル構造上、`deck` オブジェクトと `slides` 配列は最上位で兄弟の関係にあります。

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `deck.title` | 文字列 | 必須 | デッキのタイトル |
| `deck.audience` | `{ who, action }` | 必須 | 聴衆プロファイル。レンダリングされない設計メタデータ (p.34-37) |
| `deck.scales` | 名前付きスケールのマップ | 任意 | 軸レンジの共有定義 (ADR-0008-5) |
| `deck.theme` | 文字列 (パス) | 必須 | テーマファイルへの相対パス |
| `slides` | slide の配列 | 必須 | 1 枚以上 |

`audience.who` は聴衆、`audience.action` はプレゼン後に取ってほしい行動です (p.37 の第 5 質問)。

`scales` は、連続する chart スライドが軸を揃えるための名前付きスケールです (ADR-0008-5、NOTES §2.6)。各スケールは `x` / `y` の軸レンジ (`min`, `max`) を持ち、chart 要素が `scale:` で名前参照します。

```yaml
schema_version: "0.1.0"
deck:
  title: "スライドは、意図で書く"
  audience:
    who: "Code to Slide ツールに表現力の限界を感じているエンジニア"
    action: "次の登壇資料を、ピクセルではなく意図で書いてみる"
  scales:
    revenue:
      y: { min: 0, max: 80 }
  theme: ./theme.yaml
slides:
  - id: opener
    # ... (第 4 章)
```

---

## 4. Slide 仕様

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `id` | 文字列 | 必須 | 安定キー。再生成・差分レビューをまたいでスライドを同定する (ADR-0004) |
| `role` | 下表の enum | 必須 | 舞台の枠を支配する (ADR-0008-6) |
| `idea` | 文字列 | 必須 | このスライドが伝える 1 文。1 枚 1 アイデアの検証基準 (p.109) |
| `chapter` | 文字列 | 任意 | 章ラベル。左上に常時表示するテロップ。話者なしで読まれる公開資料の文脈維持用。opener / closer では表示されない |
| `notes` | 文字列 | 任意 | 話者ノート。スライドから削ったテキストの行き先 (p.240-243) |
| `layout` | 文字列 or オブジェクト | 必須 | 舞台内の配置 (第 5 章) |
| `connect` | 下表の enum | 任意 | 前スライドからのつなぎ (第 7 章) |
| `elements` | element の配列 | 必須 | 1 個以上 (第 6 章) |
| `build` | build ステップの配列 | 任意 | 段階的開示 (第 7 章) |

`idea` を必須にするのは、1 文で言えないスライドは分割対象だからです (p.40-43)。linter はこれを one-idea 検出の基準にします。

### 4.1 role — 舞台の枠

role は舞台の枠 (レターボックス・バンパー・ロゴ許可・ヘッダフッタ) を支配します。layout は舞台の内側の配置だけを支配します (ADR-0008-6、NOTES §2.8)。1 つの視覚属性を role と layout が二重に触ることを、この分担で断ちます。

| role | レターボックス | バンパー (ロゴ許可) | 意味 |
|------|:---:|:---:|------|
| `opener` | 外す | 許可 | 開演前のバンパー。キャッチコピー (BRAND.md §6.5、p.137) |
| `title` | 適用 | 不可 | タイトルスライド |
| `transition` | 適用 | 不可 | 場面のつなぎ (p.232) |
| `content` | 適用 | 不可 | 本編 |
| `closer` | 外す | 許可 | 行動喚起で閉じるバンパー (p.37, p.137) |

opener / closer はレターボックスを外し、ロゴを許可します。それ以外のスライドにロゴ要素があると logo-bumper lint が警告します (第 9 章、p.137)。

```yaml
- id: opener
  role: opener
  idea: "焚き火を愛するエンジニアの登壇が始まる"
  layout: statement-stage
  elements:
    - kind: statement
      slot: statement
      text: "焚き火を愛するエンジニア"
      emphasis: ["焚き火"]
  notes: |
    開演前のバンパースライド。キャッチコピーのみ。
```

---

## 5. Layout 仕様

配置は 2 段階で書けます。9 割は名前付きパターンで足り、残りをグリッド直接指定 (grid-direct) で書きます。どちらもグリッドセル単位であり、ピクセルは書けません (第 6 原則、p.126-127)。

### 5.1 名前付きパターン

`layout` に文字列でパターン名を指定します。各パターンはスロットを宣言し、要素は `slot:` でスロットに入ります (ADR-0007)。配列順や kind の暗黙ルールに依存してはならない (NOTES §2.1)。

| パターン | スロット | 受け入れる kind | タイプスケール | 必須 |
|---------|---------|----------------|--------------|:---:|
| `statement-stage` | `statement` | statement | `big` (content) / `hero` (opener・closer) | 必須 |
| | `support` | statement | `subtitle` | 任意。主張の下に置く 1 行の文脈。muted 色で描画され、one-idea の主役級に数えない |
| `title-stage` | `title` | statement | `title` | 必須 |
| | `subtitle` | statement | `subtitle` | 任意 |
| `diagram-stage` | `headline` | statement | `heading` | 任意 |
| | `diagram` | diagram | `node` (ラベル) | 必須 |
| `chart-stage` | `headline` | statement | `heading` | 任意 |
| | `chart` | chart | `axis` (軸ラベル) | 必須 |
| `list-stage` | `headline` | statement | `heading` | 任意 |
| | `list` | bullets | `bullet` | 必須 |
| `quote-stage` | `quote` | quote | `quote` 本文 / `attribution` 出典 | 必須 |
| `profile-stage` | `portrait` | image | — (丸抜き描画) | 必須 |
| | `name` | statement | `heading` ×1.2 | 必須 |
| | `affiliation` | statement | `attribution` | 任意 |
| | `handle` | statement | `node` | 任意 |
| | `bio` | bullets | `node` 相当 | 任意 |

`profile-stage` は自己紹介の定型です (毎回の登壇の 2 枚目に置く運用)。`bio` の各項目は `ラベル ── 本文` の形で書くと、ラベルが highlight 色の見出しとして描画されます。自己紹介は聴衆が流し読みする参照情報であり読み上げ原稿ではないため、slideument lint の対象外とします (§9)。`name` / `affiliation` / `handle` の statement は従属スロットで、one-idea の主役級に数えません。

主役スロット (diagram-stage の `diagram`、chart-stage の `chart`、list-stage の `list`、statement-stage の `statement`、quote-stage の `quote`) の要素は、舞台高さの 85% を目安にスケールします。収まらなければ縮小し、縮小が発生したことを shrink-report lint が報告します (ADR-0008-2、NOTES §2.4)。

```yaml
- id: how-it-works
  role: content
  idea: "書くのは意図、導出するのはレンダラ、確かめるのは目"
  layout: diagram-stage
  elements:
    - kind: statement
      slot: headline
      text: "意図を書けば、配置は導出できる"
    - kind: diagram
      slot: diagram
      form: flow.cycle
      nodes:
        - { id: declare, label: "意図を書く" }
        - { id: derive,  label: "配置を導出する" }
        - { id: verify,  label: "目で確かめる" }
      edges:
        - { from: declare, to: derive }
        - { from: derive,  to: verify }
        - { from: verify,  to: declare }
      emphasis: [declare]
```

### 5.2 grid-direct

`layout` にオブジェクトを指定します。要素は `id` で参照されます (名前付きパターンの `slot` の代わり、ADR-0007)。

| フィールド | 型 | 既定 | 意味 |
|-----------|----|----|------|
| `areas` | `{ element, cell }` の配列 | — (必須) | 要素 id とグリッド占有範囲の対応 |
| `whitespace_min` | 数値 (0〜1) | `0.3` | 空けるべき面積比。既定未満に下げると whitespace lint が警告する (p.126-127) |

`cell` は `"colStart-colEnd / rowStart-rowEnd"` の記法とします。単一セルは範囲を省略できます (例: `"4 / 2-3"` は列 4・行 2〜3)。行番号は `theme.grid.rows` を基準にします。

余白を明示するのは、「余白は 1 つの要素」(p.126) を運用可能にするためです。詰め込みたい圧力を、予約されたスペースとして先取りします。

```yaml
- id: campfire-scene
  role: content
  idea: "夜の焚き火を囲む時間が、このツールの世界観の原点"
  layout:
    areas:
      - { element: hero,    cell: "1-2 / 1-6" }
      - { element: caption, cell: "3-4 / 3-4" }
    whitespace_min: 0.3
  elements:
    - kind: image
      id: hero
      prompt: "夜のキャンプ場で焚き火を囲む 3 人のエンジニア。炎の暖色光が顔を照らす。望遠、浅い被写界深度"
      treatment: full-bleed
      subject: third-left
    - kind: statement
      id: caption
      text: "火を囲むように、聴衆と向き合う"
```

---

## 6. Element 仕様

要素は 7 種です。要素は常に `slot` (名前付きパターン内) または `id` (grid-direct 参照用) を、どちらか一方だけ持ちます (ADR-0007、NOTES §2.7)。両方を持ってはならない。

### 6.1 statement — 1 文を大きく見せる (第 7 章)

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `text` | 文字列 | 必須 | 本文。サイズはスロットのタイプスケールから導出 |
| `emphasis` | 文字列の配列 | 任意 | 強調する語。highlight 色が当たる |

`emphasis` は「強調語の配列」であり、diagram や chart の同名フィールドとは別物です (ADR-0007、NOTES §2.2)。

```yaml
- kind: statement
  slot: statement
  text: "配置がストーリーを決める"
  emphasis: ["配置"]
```

### 6.2 bullets — 箇条書き (第 7 章)

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `items` | 文字列の平坦な配列 | 必須 | 箇条書き項目。ネスト構造は型として存在しない (p.171) |
| `reveal` | `one-by-one` | 任意 | 1 項目ずつ表示。済んだ項目は dim (p.165)。省略時は一括表示 |

`items` はネストできません。サブ項目を書けないことをスキーマが保証します (ADR-0002、p.171)。

```yaml
- kind: bullets
  slot: list
  items:
    - "聴衆を犠牲にしない"
    - "控えめに使う"
    - "見出しのつもりで作成する"
  reveal: one-by-one
```

### 6.3 image — 写真 (第 8 章)

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `src` | 文字列 | — | 画像ファイルへの参照。省略時は `prompt` からプレースホルダを描画 |
| `prompt` | 文字列 | — | 画像生成 AI 向けプロンプト。「どんな画像であるべきか」の仕様として残る (ADR-0006) |
| `treatment` | `full-bleed` \| `framed` \| `cutout` | 任意 | 見せ方 (p.43) |
| `subject` | `third-left` \| `third-right` | 任意 | 被写体を三分割交点に置く。空いた側がテキスト領域 (p.181) |
| `gaze` | `toward-content` \| `away-from-content` | 任意 | 人物の視線の向き。コンテンツと逆向きなら gaze lint が警告 (p.117) |

`src` と `prompt` は少なくとも一方を持つ (両方欠けた image は描画できないため、スキーマ違反とする)。prompt を仕様として残すことで、実画像が無い段階でもスライドの意図が失われません (ADR-0006)。

```yaml
- kind: image
  id: hero
  prompt: "夕方の教室で、窓からの自然光の中で笑う小学生。望遠、浅い被写界深度"
  treatment: full-bleed
  subject: third-right
  gaze: toward-content
```

### 6.4 diagram — ダイアグラム 6 類型 (第 3 章)

図を「絵」ではなく関係の型として宣言します (p.64-77)。

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `form` | `<family>.<subtype>` | 必須 | レイアウト戦略の指定。描画テンプレートの ID ではない (p.156) |
| `nodes` | `{ id, label, detail? }` の配列 | 必須 | ノード。`detail` は補足 1 行で、非 cycle のカード型描画で label の下に muted で表示される |
| `edges` | 構造化形または文字列糖衣の配列 | 任意 | ノード間の関係 |
| `emphasis` | ノード id の配列 | 任意 | 強調ノード。サイズ・色は階層原則から導出 (p.119) |
| `reveal` | `sequential` | 任意 | 複雑な図は段階的に示す (p.78)。省略時は一括表示 |

`form` の family は次の 5 つとします。subtype はカタログを既定としつつ、網羅的ではありません (p.73)。

| family | subtype カタログ | 表すもの |
|--------|-----------------|---------|
| `flow` | linear / cycle / branch / converge / network | プロセス・手順 (p.66-67) |
| `structure` | matrix / tree / layer | 階層・並置 (p.68-69) |
| `cluster` | overlap / closure / enclosed / linked | まとまり・共有 (p.70-71) |
| `radial` | semi / core / coreless | 中心と広がり (p.72-73) |
| `pictogram` | process / cutaway / route / location / influence | 具体物の図解 (p.74-76) |

`edges` の正準形は `{ from, to, label? }` です。`"a -> b"` の文字列は読み込み時に正準形へ展開される糖衣とします (ADR-0008-7)。存在しないノード id への参照は edge-ref lint がエラーとして検出します (NOTES §2.9)。`emphasis` はノード id の配列です (statement の強調語とは別物、ADR-0007)。

```yaml
- kind: diagram
  slot: diagram
  form: flow.cycle
  nodes:
    - { id: plan,  label: "計画" }
    - { id: do,    label: "実行" }
    - { id: check, label: "検証" }
  edges:
    - { from: plan,  to: do }
    - { from: do,    to: check }
    - { from: check, to: plan, label: "改善" }
  emphasis: [check]
  reveal: sequential
```

`edges` は文字列糖衣でも書けます。次は上と同じ意味です (`label` は糖衣では書けません)。

```yaml
  edges: [plan -> do, do -> check, check -> plan]
```

### 6.5 chart — データ (第 4 章)

チャートは「グラフ種類」ではなく intent で宣言し、3 レイヤーモデル (背景/データ/強調、p.92-93) をスキーマの形に写します。

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `intent` | `comparison` \| `trend` \| `distribution` | 必須 | 何を言いたいか (p.77) |
| `message` | 文字列 | 必須 | データの意味。message のない chart は書けない (C5、p.84) |
| `data` | 正準形または source 糖衣 | 必須 | データ本体 |
| `annotations` | 注釈オブジェクトの配列 | 任意 | 第 3 レイヤー。意味を語る |
| `scale` | 文字列 (`deck.scales` の名前) | 任意 | 共有軸スケールの参照 (ADR-0008-5) |
| `detail` | `appendix` | 任意 | 完全版データを配布資料へ回す (p.84, p.86、第 10 章) |

`data` の正準形は `{ x: [...], series: [{ label, values }] }` です。外部ソース `{ source: file.csv, x: 列名, y: 列名 }` は、描画前に正準形へ解決される入力糖衣とします (ADR-0008-3、NOTES §2.5)。

`annotations` の各要素は `{ at | at_index, annotate, style }` です。`at` は x 配列の値との完全一致で解決します。表記ゆれで黙って壊れることを防ぐため、解決できない `at` は annotation-anchor lint がエラーとして検出します (ADR-0008-4)。位置で指したい場合は `at_index` (0 起点の整数) を使います。`at` と `at_index` はどちらか一方だけ持ちます。`style` は `highlight` とします (色値リテラルは書けません)。

背景レイヤー (目盛・グリッド線) を書き手は触りません。3D・グラデーション・枠線などのチャートジャンク (p.94) は、そもそも指定する場所がありません (ADR-0002)。

```yaml
- kind: chart
  slot: chart
  intent: trend
  message: "3 月の研修開始と売上の底が一致する"
  scale: revenue
  data:
    x: ["1月", "2月", "3月", "4月", "5月", "6月"]
    series:
      - { label: "売上 (百万円)", values: [42, 35, 28, 39, 55, 71] }
  annotations:
    - { at: "3月", annotate: "販売研修 開始", style: highlight }
  detail: appendix
```

### 6.6 quote — 引用

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `text` | 文字列 | 必須 | 引用本文 |
| `attribution` | 文字列 | 任意 | 出典 |

```yaml
- kind: quote
  slot: quote
  text: "データスライドが伝えるべきは、データそのものではなく、データの意味です。"
  attribution: "ナンシー・デュアルテ『slide:ology』"
```

### 6.7 raw — 脱出口

| フィールド | 型 | 必須 | 意味 |
|-----------|----|----|------|
| `svg` | 文字列 | — | 埋め込む SVG への参照または内容 |
| `html` | 文字列 | — | 埋め込む HTML |
| `waiver` | 文字列 | 必須 | 逸脱の理由。lint レポートに常に列挙される |

`raw` は「一貫したデザインを 20 枚見せた後の意図的な 1 枚」(p.135) のための口です。`svg` と `html` は少なくとも一方を持つ (両方欠けた raw は埋め込む内容が無いため、スキーマ違反とする)。`waiver` のない raw はスキーマ違反とします (ADR-0002)。raw 要素がデッキの 1 割を超えると raw-budget lint が警告します (第 9 章、p.135)。

```yaml
- kind: raw
  id: custom-visual
  svg: ./custom-visual.svg
  waiver: "書籍の図版を忠実に再現するため"
```

---

## 7. Build と Connect — 時間軸 (第 9 章)

アニメーションは自由なエフェクト指定ではなく、デュアルテの 5 つの役割 (p.204) から導いた意味語彙だけを許します。バウンス・スピンインのような「機能があるから使う」動き (p.220) は語彙に存在しません。

### 7.1 build — 段階的開示

`build` はステップの配列です。各ステップは 1 つ以上の操作を持ちます。

| 操作 | 型 | 意味 (p.204 の役割) |
|------|----|--------------------|
| `show` | 参照の配列 | 要素を表示する (連続性) |
| `dim` | 参照の配列 | 済んだ要素をグレーにする (p.165) |
| `emphasize` | 参照の配列 | 強調する (役割 5) |
| `transform` | `{ target, to }` | 要素を変化させる (役割 3) |

参照は要素 (`chart`)、要素内の下位対象 (`chart.annotations.0`)、ノード (`cause.root`) を文字列で指します。

```yaml
build:
  - show: [chart]
  - emphasize: ["chart.annotations.0"]
```

### 7.2 connect — 場面のつなぎ

`connect` は前スライドからのつなぎ方です。

| 値 | 意味 |
|----|------|
| `cut` | 切り替え |
| `push-left` / `push-right` / `push-up` / `push-down` | パノラマ接続 (p.210-212) |

`push-*` の連鎖はパノラマを作ります。push 接続されたスライド列では、つなぎ目に装飾が入らないよう、ヘッダ・フッタ類がレンダラによって自動で外れます (p.212)。

---

## 8. レンダラ要件

レンダラはスキーマ外の実装ですが、次を導出規則として守ります。

### 8.1 キャンバスと舞台

キャンバスは 1280×720 (16:9) の固定とします。外周マージンと行高はレンダラが導出します (推奨値: 横 96px・縦 64px、行高 `(720 − 縦マージン×2) / rows`)。

role が舞台の枠を導出します (ADR-0008-6)。content / title / transition は `stage_margin` 行ぶんのレターボックス帯を上下に置き、その内側を舞台とします。opener / closer と grid-direct のフルブリード画像はレターボックスを外します (NOTES §1.1)。

### 8.2 スロット→タイプスケール

各スロットの要素サイズは、role × layout × slot の組から `theme.type.scale` のトークンを選んで導出します (第 5 章の表、ADR-0007)。同じ `kind: statement` が opener では `hero` (80px)、diagram-stage の見出しでは `heading` (34px) になります。

### 8.3 主役のスケール

主役スロットの要素は舞台高さの 85% を目安にスケールします。舞台に収まらなければ縮小し、縮小が発生したことを shrink-report lint が情報として報告します (ADR-0008-2)。はみ出しやエラーにはしません。

### 8.4 チャートの 3 レイヤー

チャートは 3 レイヤーで描きます (p.92-93)。背景 (目盛・グリッド線) は `neutral.line` で最小限、データは `core`、強調は `highlight` とします。3D・グラデーション・枠線などのチャートジャンクを描いてはならない (p.94)。円グラフは 12 時起点・時計回り・8 項目以内とします (p.91)。

### 8.5 ブランド枠の描画 (ADR-0010)

brand を持つテーマでは、レンダラは各スライドに 3 つのレイヤーを足します。背景アート (舞台の下、キャンバス全面に object-fit: cover)、ロゴ (右上)、フッタ (右下)。`foreground: light` の背景では前景色 (テキスト・強調・箇条書きドット・アクセントバー) を白系に反転し、ロゴは `src_invert` に切り替えます。参照されたアセットは render 時に出力ディレクトリ (`theme-assets/`、deck 側の image src は `assets/`) へコピーされ、出力は自己完結を保ちます。

### 8.6 日本語の改行

statement / quote のような大きなテキストは、BudouX 相当の文節単位で折り返し、行バランスを取ります。行末に 1 文字だけ孤立させてはならない (ADR-0008-8)。書き手が `text` に明示的な改行を入れた場合は、それを優先します。強調 (emphasis) のマークアップは改行機会を作ってはならない。分節を先に行い、強調は文節の内側に適用します (「意図で」の途中で折れる、といった助詞の行頭落ちを防ぐため)。

---

## 9. Linter ルール一覧

linter はエラーで止めず警告を中心とします。ただし逸脱はすべてレポートに残します (ADR-0002)。重大度は error / warn / info の 3 段です。error は解決不能な参照など黙って壊れるものに限ります。

| id | 重大度 | 検出条件 | 出典 |
|----|-------|---------|------|
| `slideument` | warn (100字) / error (150字) | 可視テキスト合計が閾値超過 (英語 50/75 語相当。換算は要検証)。profile-stage は参照情報のため対象外 (§5.1) | p.26, p.164 |
| `one-idea` | warn | 主役級要素 (diagram/chart/statement) が 1 枚に 2 つ以上。従属スロット (headline / subtitle / attribution) に入った statement は主役級に数えない | p.109, p.256 |
| `bullet-count` | warn | `bullets.items` が 5 項目超 | p.171 |
| `pie-rules` | warn | 円グラフが 9 項目以上、または合計が 100% でない | p.91 |
| `axis-lock` | warn | 連続する chart 間で軸位置が揃わない (共有 `scale` 未指定) | p.90 |
| `contrast` | warn | 背景とのコントラスト不足、グレースケール変換で判別不能な系列 | p.152, p.156 |
| `whitespace` | warn | `whitespace_min` を既定値 0.3 未満に下げた | p.126-127 |
| `gaze` | warn | 人物画像の視線がコンテンツと逆向き (`gaze: away-from-content`) | p.117 |
| `logo-bumper` | warn | opener / closer 以外のスライドにロゴ要素 | p.137 |
| `raw-budget` | warn | raw 要素がデッキの 1 割超 | p.135 |
| `deck-size` | info | 内容スライドが 10 枚超 (10/20/30 は文脈依存) | p.254 |
| `annotation-anchor` | error | chart の `at` が x 配列の値と一致しない | ADR-0008-4 |
| `edge-ref` | error | diagram の edge が存在しないノード id を参照 | ADR-0008-7 |
| `shrink-report` | info | 主役要素が舞台に収まらず縮小された | ADR-0008-2 |

lint レポートは捨てられる副産物ではなく、逸脱の履歴を残す一級の成果物とします (ADR-0002)。

---

## 10. 配布資料 (handout) 出力

配布資料は、スライド (投影) と分離した読み物です (p.84)。次の枠を定義します。詳細仕様は将来に回します (design.md §8 未決事項 3)。

- `detail: appendix` を指定した chart の完全版データを収録する
- 各スライドの `idea` と `notes` を本文として並べる

配布資料の生成は上記 2 つを入力とします。レイアウト・書式の詳細は本書の対象外です。

---

## 11. 未決事項

design.md §8 から次を引き継ぎます。

1. 日本語のテキスト量閾値 (100/150 字) は英語 50/75 語からの粗い換算であり、実測での調整が必要 (ADR-0002)
2. スピーカーノート駆動 (notes が主・スライドが従) の執筆フローを、スキーマがどこまで支援するか (design.md §8-2)
3. 配布資料の詳細出力仕様 (第 10 章、design.md §8-3)

初版実装 (0.1.0) で見つかった仕様の穴を追加で引き継ぎます。

4. 円グラフを宣言する経路が無い。chart の `intent` は comparison / trend / distribution のみで、書き手が円グラフを選ぶフィールドが存在しない。§8.4 と pie-rules lint は宣言経路ができるまで実質 no-op
5. 「ロゴ要素」が未定義。logo-bumper lint (p.137) は、ロゴを表す要素種別かフィールドが定義されるまで実質 no-op
6. shrink-report の真の判定はレンダラの実縮小に紐づく。lint の静的推定は list-stage の高さ超過など追跡可能なケースに限る

再生成と手編集のマージ戦略は運用後に設計します。安定キーとしてスライド `id` を先行して必須化済みです (ADR-0004)。

---

## 付録 A: マイグレーションノート

スキーマを進化させたら、ここに版ごとの変更点を追記します。

- `0.1.0` — 初版。spike (`0.0.1-spike`) を ADR-0007 (スロット制・emphasis 分割・タイプスケール昇格) と ADR-0008 (グリッド行数・chart 正準形・注釈アンカー・scales・role/layout 分担・edges 構造化・文節改行・主役スケール) で確定した正式版
- `0.2.0` (theme のみ) — ADR-0010。`theme.brand` (logo / footer / backgrounds) と `theme.type.webfonts` を任意フィールドとして追加。後方互換 (0.1.0 のテーマはそのまま妥当)。deck スキーマは 0.1.0 のまま
