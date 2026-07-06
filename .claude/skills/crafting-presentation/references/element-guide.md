# 要素と form の選択ガイド

Phase 5 で「伝えたいこと」を要素と form に翻訳するための判断表。要素は 7 種 (statement / bullets / image / diagram / chart / quote / raw)。slide:ology 第 3〜4 章と SPEC 第 6 章に対応する。

## 0. まず何を選ぶか — 判断の入口

伝えたいことの形から要素を選ぶ。上から順に当てはめ、最初に合致したものを使う。

| 伝えたいこと | 要素 | レイアウトパターン |
|------------|------|------------------|
| 1 文で刺す主張・キャッチコピー | statement | statement-stage (opener/closer/content), title-stage (タイトル) |
| 自己紹介 (顔写真+名前+略歴) | image + statement + bullets の定型 | profile-stage (slideument 対象外) |
| 他者の言葉の権威で語らせる | quote | quote-stage |
| 要素間の関係・構造・流れ | diagram | diagram-stage |
| 数値の意味 (比較・変化・分布) | chart | chart-stage |
| 情景・感情・被写体・世界観 | image | grid-direct (full-bleed) |
| 上のどれでもなく、並列な短い項目 | bullets | list-stage |

箇条書きは最後の手段。「関係があるなら diagram、数値なら chart、1 点を刺すなら statement」で置き換えられないかを先に考える。並列性のない項目 (時系列・因果) を bullets にすると流れが消える。`bullets.items` は 5 項目まで (`bullet-count` lint)、ネストは書けない (p.171)。

主役級の要素 (diagram / chart / statement) は 1 枚に 1 つ。2 つ以上あると `one-idea` lint が warn を出す。2 つ要るならスライドを分ける。

---

## 1. diagram — 6 類型から form を選ぶ

図は「絵」ではなく関係の型として宣言する (slide:ology 第 3 章)。`form` は `<family>.<subtype>` で書く。family は 5 つ。slide:ology の 6 類型のうち「データ」は chart 要素になるので、diagram の family からは外れる。

伝えたい関係から family と subtype を選ぶ。

| 伝えたい関係 | family.subtype | 例 |
|------------|---------------|----|
| 明確な始点と終点を持つ手順 | `flow.linear` | 導入 → 設計 → 実装 → 公開 |
| 終わりのない反復・ループ | `flow.cycle` | PDCA、リリースサイクル |
| 途中で枝分かれ・合流する | `flow.branch` / `flow.converge` | 意思決定木、複数入力の統合 |
| 複雑な多方向の関係 | `flow.network` | 依存グラフ、相関図 |
| 2 軸で要素を分類する | `structure.matrix` | 重要度 × 緊急度、機能比較表 |
| 上下の階層 | `structure.tree` | 組織図、分類、ファイル構造 |
| 積み重なった層・順序 | `structure.layer` | 技術スタック、プロトコル階層 |
| 集合の重なり・共有 | `cluster.overlap` | ベン図、責任の共有領域 |
| 欠けを脳が補う「全体は部分に勝る」 | `cluster.closure` | 不完全な円で一体感を示す |
| 内包・入れ子 | `cluster.enclosed` | システムの中の業務ルール |
| リンクで結ばれた集まり | `cluster.linked` | パズル、鎖、ネットワーク |
| 起点から一方向に広がる | `radial.semi` | 根の広がり、波及 |
| 中心 (親) と周辺 (子) | `radial.core` | ハブ&スポーク、太陽と惑星 |
| 中心なしに引き合う集まり | `radial.coreless` | 対等な相互引力 |
| 具体物の手順・内部・経路・位置・影響 | `pictogram.process` / `.cutaway` / `.route` / `.location` / `.influence` | 組立手順、断面図、道案内、地図ピン、因果 |

subtype カタログは網羅ではない (p.73)。「これらのサンプルはけっして網羅的ではない」ので、近い family を選び、subtype はカタログから最も近いものを当てる。

補足のルール。

- `emphasis` は強調するノード id の配列。サイズ・色は階層原則から導出される (p.119)
- `edges` は `{ from, to, label? }`。糖衣で `"a -> b"` とも書ける (糖衣では label 不可)
- 参照するノード id は必ず `nodes` に存在させる (無いと `edge-ref` エラー)
- 複雑な図は `reveal: sequential` で段階的に開示する (p.78)

---

## 2. chart — intent 3 種の使い分け

チャートは「グラフ種類」ではなく intent (何を言いたいか) で宣言する。棒/折れ線/円の選択はレンダラが規則で決める (p.90-91)。`message` (データの意味) は必須。

| intent | 言いたいこと | 典型 | 例 |
|--------|------------|------|----|
| `comparison` | 2 組以上を並べて違いを見せる | 棒・円 | 部門別売上、選択肢 A/B/C |
| `trend` | 時間による変化・推移 | 折れ線・面 | 月次の売上推移、成長曲線 |
| `distribution` | ばらつきの中のパターン | 散布・ヒストグラム | 相関、正規分布 |

- `message` にはデータそのものではなく「データの意味」を書く (p.84)。例: 「3 月の研修開始と売上の底が一致する」
- 意味を語る第 3 レイヤーは `annotations: [{ at, annotate, style: highlight }]`。`at` は x 配列の値と完全一致 (ずれると `annotation-anchor` エラー)。位置指定なら `at_index`
- 連続する chart で軸を揃えるなら `deck.scales` を定義し `scale:` で参照 (`axis-lock` 対策)
- 完全版データは `detail: appendix` で配布資料へ回す。スライドは意味だけ
- 円グラフは 8 項目以内・合計 100% (`pie-rules` lint)。背景の目盛・グリッド線・3D・枠線は書けない (チャートジャンク排除)

---

## 3. statement / quote / image / bullets を分ける基準

同じ「短いテキスト」でも狙いで要素が変わる。

| 要素 | 選ぶ基準 | 注意 |
|------|---------|------|
| statement | 自分の言葉で 1 点を大きく刺す。opener/closer のキャッチ、章の主張 | `emphasis` は強調語の配列。1 枚 1 主張。statement-stage の `support` スロットで主張の下に文脈 1 行を添えられる |
| quote | 他者の言葉の権威・当事者性で語らせる。出典が効くとき | `attribution` に出典。地の文の言い換えなら statement にする |
| image | 情景・感情・被写体で世界観を作る。論理より情動 | `treatment` (full-bleed/framed/cutout)、`subject` で三分割配置、`gaze` は視線をコンテンツ側へ (逆向きは `gaze` lint)。`src` が無くても `prompt` を残す |
| bullets | 上のどれでもなく、対等・並列な短い項目の列挙 | 最後の手段。5 項目まで、ネスト不可。並列性が無いなら散文か diagram に |

判断に迷ったら「この内容は関係を持つか (→ diagram)、数値か (→ chart)、1 点に絞れるか (→ statement)」を先に問う。どれにも当てはまらない純粋な列挙だけが bullets に残る。

---

## 4. raw — 脱出口

語彙で表せない 1 枚のためだけの口 (p.135「一貫したデザインを 20 枚見せた後の意図的な 1 枚」)。`svg` か `html` の少なくとも一方と、`waiver` (逸脱の理由) が必須。デッキの 1 割を超えると `raw-budget` warn。安易に使わない。raw に頼りたくなったら、まず diagram / chart / image で表せないかを疑う。
