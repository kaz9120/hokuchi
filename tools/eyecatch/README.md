# tools/eyecatch

note の見出し画像の下地を作る CLI です。nano banana に暗い紙の手描きのモチーフを描かせ、作り直した紙の指定位置に置きます。タイトル・号数・日付は hidoko の note-ogp で入れます。モチーフと置き場所の決め方は writing-note skill の `references/eyecatch.md` にあります。

## 使い方

1. 記事のモチーフ (場面) と季節の光を決め、`eyecatch.json` に書く
2. `build` で生成して置く
3. `sheet` で直近の見出し画像と並べ、動きが出ているか見る
4. note-ogp でタイトル・号数・日付を入れる

ルートから `bun run eyecatch <サブコマンド>` で使います。

| コマンド | すること |
|---|---|
| `build <ディレクトリ>...` | `eyecatch.json` から、無い `motif.jpg` を生成し、古い `eyecatch.jpg` を置き直す。生成の上限に当たったら止まり、終了コード 75 を返す |
| `generate --scene <場面> --light <季節の光> --out <画像>` | 1 枚だけ生成する |
| `place <生成画像> <出力> --at <置き場所> [--ink <量>]` | モチーフを切り出し、台紙の指定位置に置く |
| `sheet <出力.png> <画像>...` | 3 列で並べた見本を作る |
| `prompt --scene <場面> --light <季節の光>` | プロンプトを出す。agy 以外で生成するとき |

モチーフを作り直すときは `motif.jpg` を消して `build` を回します。置き場所だけを変えるときは `at` を直して回せば、生成せずに置き直します。テストは `bun run test:eyecatch` です。

## 置き場所

下地は公開リポジトリの外の `~/Hobby/hokuchi-private/eyecatch/<記事のディレクトリ名>/` に置きます。公開リポジトリを画像で重くせず、note から取り込んだアーカイブに note に無いものを混ぜないためです。

```json
{
  "title": "なぜEMはまた「余白」に帰ってくるのか",
  "at": "upper-right",
  "scene": "A small wooden bench under the shade of a single young tree, ...",
  "light": "Early summer, just after the rainy season: ...",
  "ink": 0.03
}
```

`at` は `upper-left`・`top`・`upper-right`・`left`・`right`・`lower-left`・`bottom`・`lower-right` か、`x,y` (左上 0、右下 1) です。`ink` は省けます。

## 生成の上限

agy の生成の上限 (`429 RESOURCE_EXHAUSTED`) に当たると、画像は保存されません。時間をおいて試します。実測では 5 時間で約 15 枚の枠があり、別に長い期間の上限もあります (約 20 時間で 58 枚を生成したところで、6 日待つよう言われた)。公式の資料では確かめていません。使われたモデルは `gemini-3.1-flash-image` でした。
