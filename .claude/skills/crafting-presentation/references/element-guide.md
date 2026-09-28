# 要素と form の選択ガイド

Phase 5 で「伝えたいこと」を要素と form に翻訳するための判断表です。要素は 15 種あります (statement / bullets / image / diagram / chart / quote / code / post / link / stat / table / versus / agenda / video / raw)。slide:ology 第 3〜4 章、SPEC 第 6 章、ADR-0016 に対応しています。

## 0. まず何を選ぶか — 判断の入口

伝えたいことの形から要素を選びます。上から順に当てはめ、最初に合致したものを使ってください。

| 伝えたいこと | 要素 | レイアウトパターン |
|------------|------|------------------|
| 1 文で刺す主張・キャッチコピー | statement | statement-stage (opener/closer/content), title-stage (タイトル) |
| 数字 1 つで刺す | stat | stat-stage |
| 自己紹介 (顔写真+名前+略歴) | image + statement + bullets の定型 | profile-stage (slideument 対象外) |
| 他者の言葉の権威で語らせる | quote | quote-stage |
| SNS ポストの発言を事実として見せる | post | post-stage (スクショ貼付の代替) |
| 記事・資料を URL つきで紹介する | link | link-stage (QR は url から自動生成) |
| コード・端末セッション・diff | code | code-stage (画像化しない) |
| 要素間の関係・構造・流れ | diagram | diagram-stage |
| 数値の意味 (比較・変化・分布・割合) | chart | chart-stage |
| 二項対立 (従来 vs 提案、Before/After) | versus | versus-stage |
| セルに言葉が入る一覧比較 (✓ 表など) | table | table-stage |
| 目次・いまどの章か | agenda | agenda-stage (transition から導出。手書きしない) |
| 動画・デモ映像 | video | video-stage (静的出力はプレースホルダ) |
| スクリーンショット・図版を見出し付きで紹介 | image | image-stage (箱は実画像の縦横比から導出。ADR-0015) |
| 情景・感情・被写体・世界観 (フルブリード) | image | grid-direct (full-bleed) |
| 上のどれでもなく、並列な短い項目 | bullets | list-stage |

箇条書きは最後の手段です。先に、ほかの要素で置き換えられないかを考えてください。関係があるなら diagram、数値なら chart、対立なら versus、1 点を刺すなら statement か stat です。並列性のない項目 (時系列・因果) を bullets にすると、流れが消えます。`bullets.items` は 5 項目までで (`bullet-count` lint)、ネストは書けません (p.171)。

画像も、最後の手段に近い扱いです。コードのスクショは code、ポストのスクショは post、OGP のスクショは link で書けないかを先に確かめてください。画像に焼いた瞬間に、テーマ追従・再レンダリング・handout の可読性が失われます (ADR-0016)。

これは「要素で書けるものを画像にしない」という話で、実物を避ける話ではありません。当時の画面、現場の写真、手書きのメモのように、要素では再現できない実物は密の山の核になります (`somitsu.md`)。山のスライドでは、実物を大きく見せてください。

主役級の要素 (diagram / chart / statement のほか code / post / link / stat / table / versus / agenda / video) は、1 枚に 1 つにします。2 つ以上あると `one-idea` lint が warn を出します。2 つ要るなら、スライドを分けてください。

---

## 1. diagram — 6 類型から form を選ぶ

図は「絵」ではなく、関係の型として宣言します (slide:ology 第 3 章)。`form` は `<family>.<subtype>` の形で書きます。family は 5 つです。slide:ology の 6 類型のうち「データ」は chart 要素になるので、diagram の family からは外れています。

伝えたい関係から、family と subtype を選びます。

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
| 日付つきの経緯・ロードマップ | `flow.timeline` | 沿革、プロジェクトの歩み (label = 出来事、detail = 日付。等間隔配置) |
| 具体物の手順・内部・経路・位置・影響 | `pictogram.process` / `.cutaway` / `.route` / `.location` / `.influence` | 組立手順、断面図、道案内、地図ピン、因果 |

subtype のカタログは網羅ではありません (p.73)。原典にも「これらのサンプルはけっして網羅的ではない」とあります。近い family を選び、subtype はカタログからいちばん近いものを当ててください。

補足のルールは次のとおりです。

- ノードは `{ id, label, detail?, icon? }` です。`icon` はテーマの icon_set のカタログにある名前で、label の上に描かれます (ADR-0013。カタログに無い名前は `icon-exists` エラー)
- `emphasis` は、強調するノード id の配列です。サイズ・色は階層原則から導出されます (p.119)
- `edges` は `{ from, to, label? }` です。糖衣で `"a -> b"` とも書けます (糖衣では label は書けません)
- 参照するノード id は、必ず `nodes` に存在させます (無いと `edge-ref` エラー)
- 複雑な図は、`reveal: sequential` で段階的に開示します (p.78)

cluster と radial の使い分けの勘所は、次のとおりです。

- `cluster.overlap` の主役は、交差領域 (「A でも B でもある」) であることが多いです。そのときは `shared: { label: "...", emphasis: true }` で、全円の共通部分にラベルと強調を宣言します (ADR-0015)
- nodes[0] が特別な意味を持つ form が 2 つあります。`radial.core` は nodes[0] が中心 (ハブ) で、`cluster.enclosed` は nodes[0] が枠 (ラベル付きの境界) です。残りのノードが中身になります
- `cluster.closure` は、「順序も階層も関係もない、ただの仲間」を配置だけで見せます。位置に意味を持たせたい (象限で分類したい) なら、`structure.matrix` を使います。円環として知覚されるのは 5 ノード以上です。4 以下だと matrix と紛らわしくなります
- `cluster.linked` は、「関係はあるが流れではない」対称な関連です (線に矢印が付きません)。方向・因果・時系列があるなら、flow 系を使います

専用の描画を持つ form は、cycle / branch / converge / timeline / matrix / tree / layer / overlap / closure / enclosed / linked / radial.core です。`flow.linear` は step-row (順序を持つ横並びカード) で描かれ、これが linear 本来の形です。残る form (`flow.network`、`radial.semi` / `coreless`、`pictogram.*`) も同じ step-row に落ちるため、関係の型は絵に出ません。使うなら、描画結果を確認してください。

---

## 2. chart — intent 3 種の使い分け

チャートは「グラフの種類」ではなく、intent (何を言いたいか) で宣言します。棒・折れ線・円の選択は、レンダラが規則で決めます (p.90-91)。`message` (データの意味) は必須です。

| intent | 言いたいこと | 典型 | 例 |
|--------|------------|------|----|
| `comparison` | 2 組以上を並べて違いを見せる | 棒 | 部門別売上、選択肢 A/B/C |
| `trend` | 時間による変化・推移 | 折れ線・面 | 月次の売上推移、成長曲線 |
| `distribution` | ばらつきの中のパターン | 散布・ヒストグラム | 相関、正規分布 |
| `composition` | 全体に占める割合 | 円 (単一系列)・100% 積み上げ棒 (複数系列) | シェア、時間配分 (ADR-0016) |

- `message` には、データそのものではなく「データの意味」を書きます (p.84)。例: 「3 月の研修開始と売上の底が一致する」
- 意味を語る第 3 レイヤーは、`annotations: [{ at, annotate, style: highlight }]` です。`at` は x 配列の値と完全に一致させます (ずれると `annotation-anchor` エラー)。位置で指定するなら `at_index` を使います
- 連続する chart で軸を揃えるなら、`deck.scales` を定義して `scale:` で参照します (`axis-lock` 対策)
- 完全版のデータは、`detail: appendix` で配布資料へ回します。スライドには意味だけを載せます
- 円グラフは 8 項目以内で、合計 100% にします (`pie-rules` lint)。背景の目盛・グリッド線・3D・枠線は書けません (チャートジャンクの排除)

---

## 3. statement / quote / image / bullets を分ける基準

同じ「短いテキスト」でも、狙いによって要素が変わります。

| 要素 | 選ぶ基準 | 注意 |
|------|---------|------|
| statement | 自分の言葉で 1 点を大きく刺す。opener/closer のキャッチ、章の主張 | `emphasis` は強調語の配列。1 枚 1 主張。statement-stage の `support` スロットで主張の下に文脈 1 行を添えられる |
| quote | 他者の言葉の権威・当事者性で語らせる。出典が効くとき | `attribution` に出典。地の文の言い換えなら statement にする |
| image | 情景・感情・被写体で世界観を作る。論理より情動 | `treatment` (full-bleed/framed/cutout)、`subject` で三分割配置、`gaze` は視線をコンテンツ側へ (逆向きは `gaze` lint)。`src` が無くても `prompt` を残す |
| bullets | 上のどれでもなく、対等・並列な短い項目の列挙 | 最後の手段。5 項目まで、ネスト不可。並列性が無いなら散文か diagram に |

判断に迷ったら、先に 3 つを問います。この内容は関係を持つか (→ diagram)、数値か (→ chart)、1 点に絞れるか (→ statement) です。どれにも当てはまらない純粋な列挙だけが、bullets に残ります。

---

## 4. 技術素材と紹介系 — 8 要素の使い分け (ADR-0016)

「画像を作って貼る」前に、この 8 要素で書けないかを確かめてください。

| 要素 | 選ぶ基準 | 紛らわしい相手との境界 |
|------|---------|---------------------|
| code | コード・端末 (`lang: console`)・diff (`lang: diff`) を見せる | 17 行以上か 81 桁以上の行があれば抜粋する (`code-budget` lint)。強調行は `emphasis: ["3-5"]` (1 起点) |
| post | SNS の発言が「実際にあった」ことを見せる | 発言者の権威で語らせるだけなら quote。日付・アカウント名が効くなら post。`source` を書いておくと SPA では実埋め込みになる (ADR-0017) |
| link | 記事・資料へ誘導する (QR は自動) | title / image 未指定なら render 時に OGP を自動解決し `assets/ogp/` にキャッシュする (ADR-0017)。URL を読ませたいだけなら statement にしない — QR が要るなら常に link |
| stat | 数字 1 つで刺す | 比較や推移を語るなら chart。単位は value に含める (`"3.2 倍"`) |
| table | セルに言葉が入る一覧比較 | 数値の意味なら chart、2 軸の分類なら structure.matrix、対立が主役なら versus |
| versus | 二項対立そのものが主張 | 対等な並置 (どちらも推さない) なら table か bullets ×2 枚。推す側に `emphasis: true` |
| agenda | 目次・現在地 | フィールドなし。transition の statement から導出される。章題を手書きしたくなったら transition 側を直す |
| video | デモ映像 | 静的出力 (PNG / Google Slides 運用) では再生されない。プレースホルダ描画のみと知って使う |

## 5. raw — 脱出口

raw は、語彙で表せない 1 枚のためだけの口です (p.135「一貫したデザインを 20 枚見せた後の意図的な 1 枚」)。`svg` か `html` の少なくとも一方と、`waiver` (逸脱の理由) が必須です。デッキの 1 割を超えると `raw-budget` warn が出ます。安易には使わないでください。raw に頼りたくなったら、まず diagram / chart / image で表せないかを確かめます。
