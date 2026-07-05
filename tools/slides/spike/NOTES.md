# spike 実装ノート

捨てる前提の試作。render.mjs が deck.yaml + theme.yaml を読み、静的 HTML/SVG を導出する。
このノートは (1) 仕様が曖昧で自分が埋めた導出ルールと、(2) 実装者として感じたスキーマの痛点を記録する。
(2) が次工程 SPEC.md の最重要インプット。

## 1. 自分で決めた導出ルール

仕様に書かれておらず、レンダラ側で決め打ちした値・規則の一覧。

### キャンバスとグリッド

- キャンバスは 1280×720 固定。テーマにアスペクト比の宣言がないので 16:9 を前提にした。
- 外周マージンは横 96px・縦 64px。数値の根拠はなく「見て気持ちいい」で決めた。
- `grid.pattern: col-4` は列数しか決めない。行数はどこにも書いていないので 6 行と仮定した（grid-direct の `1-6` が 6 行前提なので整合はする）。行高は `(720 − 64×2) / 6 ≈ 98.7px`。
- `stage_margin: 1`（レターボックス）は「上下 1 行ぶんをコンテンツ禁止帯にする」と解釈し、上下インセット = `marginY + rowH ≈ 163px` とした。適用対象は content ロールの statement / diagram / chart / list / quote。opener・closer の statement-stage と grid-direct（full-bleed 画像）はレターボックスを外し、上下インセット 64px にした。

### タイポグラフィ階層

役割ごとのフォントサイズ(px)は全面的に自分で作った。テーマは `min_size_pt: 24` しか持たない。

| 用途 | サイズ | 使う場所 |
|------|-------|---------|
| hero | 80 | opener / closer の statement |
| title | 74 | title-stage の主タイトル |
| big | 70 | content の statement-stage |
| quote | 46 | 引用本文 |
| heading | 34 | diagram / chart / list の見出し statement |
| bullet | 34 | 箇条書き項目 |
| subtitle | 30 | title-stage の副題 |
| attribution | 24 | 引用の出典 |
| node | 24 | ダイアグラムのノードラベル |
| axis | 20 | チャートの軸ラベル |

同じ `kind: statement` が文脈で 80px にも 34px にもなる。この対応表そのものがスキーマに無く、レンダラの発明。

### 要素ごとの描画ルール

- statement のサイズは (role, layout) の組から選ぶ。opener/closer→hero、content×statement-stage→big、title-stage の 1 個目→title・2 個目以降→subtitle、diagram/chart/list の見出し→heading。
- emphasis 語は本文の部分文字列一致で `<span>` にくるんで highlight 色を当てる。
- title-stage は非対称配置（左下寄せ）+ タイトル上に highlight の短いアクセントバー(76×6px)を置いた。緊張感の演出は仕様に書かれておらず自分の判断。
- bullets はビュレットを highlight の 12px 円、項目間 34px。reveal は無視して全項目表示。
- image プレースホルダは surface 面 + 四隅のコーナー枠 + 左上 `IMAGE · prompt` バッジ + カメラのグリフ + muted のプロンプト文。`subject` / `gaze` は実画像が無いと意味を持たないので視覚化していない。
- diagram(flow.cycle) は 3 ノードを −90°/30°/150° に置き、半径 158px の円弧を時計回りに（両端 26° ずつ詰めて）矢印で結ぶ。emphasis ノードだけ highlight 枠 + 一回り大きく。ノードは surface 面 + line 枠。
- chart(trend) は Y 軸を 0–80 固定・20 刻みで決め打ち。3 レイヤー（背景=薄いグリッド線と最小の軸、データ=core[0] の太線、強調=highlight の点 + 注釈）。emphasis の点から下に引き出し線を出して annotate 文言を highlight 色で添えた。
- 主役の SVG（diagram / chart）はレターボックス帯より背が高くなるので `max-height:100%` で帯に収まるよう縮小した。この「はみ出したら縮める」挙動はレンダラの独断。
- quote は引用符グリフ（line 色・装飾）+ 本文 display + 出典を右寄せ muted。

## 2. スキーマの痛点（SPEC.md への最重要インプット）

YAML を解釈していて「足りない／曖昧／扱いにくい」と感じた点。重要度の高い順。

### 2.1 名前付きパターン内の要素スロットが無名で、順序依存になる

title-stage には `kind: statement` が 2 つ並ぶだけで、どちらが主タイトルでどちらが副題かをスキーマが表さない。「配列の 1 個目=タイトル」という順序でしか判別できず、壊れやすい。chart-stage / list-stage も「statement は見出し、もう 1 個の要素が主役」を kind の暗黙ルールで当てているだけ。grid-direct は `element:` で名前参照できるのに、名前付きパターンには slot 名が無い。パターンごとに埋めるべきスロット（headline / subhead / hero など）を宣言し、要素がどのスロットに入るかを明示する仕組みが要る。

### 2.2 `emphasis` が要素ごとに全く別物を指す

同じキー名 `emphasis` が 3 種類の意味で使われている。statement では強調する語の配列、diagram ではノード id の配列、chart では `{at, annotate, style}` の注釈オブジェクト配列。実装では kind による分岐が必須で、スキーマ検証も型が割れる。名前を分けるか（emphasis_words / emphasis_nodes / annotations）、共通の「強調」抽象を設計し直すべき。

### 2.3 statement のサイズ導出ルールが仕様に無い

design.md は「サイズは役割から導出（主役なら大、見出しなら小）」としか言わない。実際には (role × layout × slot) の組ごとにサイズを決める大きな表が要る（上の階層表）。この表がレンダラ内に隠れている限り、見た目はレンダラ実装に完全依存し、テーマを差し替えても制御できない。SPEC ではサイズ・ラダーを第一級で定義すべき。

### 2.4 グリッドの行数と stage_margin の相互作用が未定義

`col-4` は列だけ決めて行数を決めない。grid-direct のセル記法は行番号（`1-6`）を使うのに、行数の出どころがテーマに無い。加えて stage_margin でレターボックス化した帯より主役(diagram/chart)が大きいとき、どう振る舞うべきか（縮小 / はみ出し / エラー）が定義されていない。「余白は 1 つの要素」を貫くなら、帯に収まらない要素の扱いを仕様で決める必要がある。

### 2.5 chart のデータ形が design.md と deck.yaml で食い違う

design.md は `data: {source: sales.csv, x: month, y: revenue}`（外部ソース + 列名）。deck.yaml は `data: {x: [...], series: [{label, values}]}`（インライン配列）。どちらが正なのか決まっていない。さらに emphasis の `at: "3月"` は X 軸の表示ラベル文字列に一致させる方式で、ラベルの表記ゆれに弱い（"3月" と "3 月" で壊れる）。強調点はインデックスかキー値で指すべき。

### 2.6 複数チャート間の軸そろえ（axis-lock）を宣言する場所が無い

design.md の linter に axis-lock（連続チャートの軸位置をそろえる）があるのに、Y 軸レンジを固定・共有する field がスキーマに無い。今回は 0–80 を決め打ちしたが、複数チャートのデッキでは書き手が軸をそろえられない。共有スケールをテーマかデッキ単位で宣言できる必要がある。

### 2.7 `id` が必須になったり無かったりする

grid-direct では要素が `element:` から参照されるので `id` 必須。名前付きパターンでは `id` が無く、kind と順序で拾う。同じ要素モデルなのに id の要否がレイアウト種別で変わり、一貫しない。2.1 と合わせて「要素は常に slot / id を持つ」に寄せると素直になる。

### 2.8 `role` と `layout` が同じ視覚属性を二重に支配する

opener/closer（role）はレターボックスを外す、という判断を role から下した。一方 layout(statement-stage) も配置を決める。レターボックスの有無という 1 つの視覚属性を role と layout の両方が触るため、優先順位を実装者が決めるしかなかった。どちらが何を支配するのかの分担を仕様で切り分けるべき。

### 2.9 diagram の edges / emphasis が文字列ベースで検証が効かない

`edges: [declare -> derive]` は 1 本の文字列を `->` で割ってノード id を取り出す。id のタイポが静的に検出できず、黙って壊れる。YAML の構造（`{from, to}`）にするか、スキーマ側でノード id 参照を検証できる形にしたい。

## 3. 総括（中心仮説への所感）

「意図を書けば配置は導出できる」は、この 9 枚の範囲では成立している。書き手が書いたのは意図（idea / text / nodes / emphasis の意味）だけで、色・サイズ・座標・軸・矢印は一切書いていないのに、視覚的に成立するスライドが出た。raw 要素も grid-direct も 1 枚ずつで、名前付きパターンが主役という比率も design.md §8 の撤退ラインの範囲内。

ただし成立の裏で、レンダラが暗黙に持つ導出テーブル（サイズ階層・スロット割り当て・軸レンジ）がかなり厚い。この試作で「レンダラの発明」と書いた部分がそのまま SPEC.md で明文化すべき導出モデルの本体になる。痛点 2.1〜2.3 が最優先。
