# tools/stage 設計書

発表資料を、シーン×状態の React コードで書くためのフレームワークです。この文書は現在の設計を描きます。決定の経緯は ADR-0026 (方式) と ADR-0027 (配信) にあります。

## 1. 考え方

発表は「1 枚ずつのスナップショットの連続」ではなく、「シーンが移り変わる映画」として作ります (slide:ology p.212)。

- シーンは 1 つの画面空間です。中の要素は役者として状態をまたいで生き続け、クリックごとに移動・変形・強調されます
- シーンが変わるときは、画面が横にパンします。ブランド枠 (ロゴ・フッター) はパンの外に置くので、カメラだけが動いて見えます
- 動きは、関係性の変化・画面の演出・オブジェクトの変化・連続性・強調の 5 役割のどれかを果たすときだけ付けます (p.205)。どれにも当たらない動きは付けません

フレームワークが持つのは再生と部品だけです。どこに何を置くか、どんな図にするかは、シーンを書く側が毎回決めます。部品はスキーマではなく出発点で、シーンは素の要素や SVG を自由に使えます。

## 2. トークの形

```
talks/<YYYY-MM-slug>/
  talk.tsx        トークの定義 (defineTalk)。メタ情報・テーマ・シーンの並び
  scenes/*.tsx    シーン (defineScene)。1 ファイル 1 シーン
  assets/         画像など。シーンから import する
  out/            作業出力 (git 管理外)
  final/          発表後の凍結。ビルドした静的ファイル一式 (コミットする)
```

`talk.tsx` の例は次のとおりです。

```tsx
import { defineTalk } from '@hokuchi/stage'
import { mosh } from '@hokuchi/stage/themes/mosh'
import cycle from './scenes/cycle'

export default defineTalk({
  title: '…', description: '…（OGP と一覧に出る 1〜2 文）', date: '2026-09-29',
  event: { name: "Dev's Garden" }, speaker: '山本 一将', theme: mosh,
  scenes: [cycle],
})
```

シーンは `steps` (状態の数) と、状態ごとの `notes` (話す内容) を持ちます。`notes` は発表者ビューと、ノートを読むモードに出ます。

```tsx
export default defineScene({ id: 'cycle', title: '改善が広がる流れ', steps: 4, Component: Cycle, notes: ['…', '…', '…', '…'] })
```

シーンの中では `useStep()` でいまの状態の番号を取り、`pick(step, [...])` で状態ごとの値を選びます。

## 3. 部品

| 部品 | 使いどころ |
|---|---|
| `Headline` | 状態ごとに見出しを差し替える。古い文言が抜けきってから新しい文言が入る |
| `Swap` | 任意の文言の差し替え (Headline の中身) |
| `Reveal` | 指定した状態の間だけ見せる (`at` / `until`)。`node` を付けると Connect の端点になる |
| `Morph` | 状態をまたいで生き続ける箱。`box` で位置と大きさ、`tone` で色を状態ごとに変える。`refit` は幅が変わって折り返しが変わるときに使う |
| `Connect` | 2 つの要素を名前でつなぐ線。位置は DOM から測る。`flow` で粒を一度流し、`label` は座布団付きで線の中ほどに置く |
| `DrawPath` / `Flow` | 手で書いたパスを描く・流す |
| `CountUp` | 状態ごとの数を数え上げる |

状態遷移で起きる崩れは、部品が吸収します。シーンの側で対処しないでください。

- 見出しの差し替えで新旧の文言が重なる → `Swap` が待ってから入れ替える
- 縮む箱の中で子要素が引き伸ばされる → `Morph` の中の `Reveal` は退場を 0 秒にし、中身は `layout="position"` で歪みを補正する
- 幅が変わった箱で折り返しが先に飛ぶ → `Morph refit` が、移動のあとに中身を出し直す
- 途中の状態から現れる線が、描画なしで出る → `Connect` が、シーンに入ってから状態が進んだかを見て描き始めから見せる

色は CSS 変数 (テーマのトークン) で書きます。Motion は CSS 変数の色を補間できないので、状態で色を変えるときは `tone` (CSS の transition) を使います。トーンは `accent`・`hot`・`quiet`・`dim` です。

よく使う型のクラスとして `headline`・`card`・`label`・`source`・`chip`・`bullet`・`tile` を用意しています。使わずに素で書いてもかまいません。

## 4. テーマ

| テーマ | 立場 | 基調 |
|---|---|---|
| `mosh` | MOSH として | 淡ピンクの背景、コーラル #FA6E78、Nunito + Noto Sans JP |
| `hokuchi` | 個人として | 夜の焚き火 (hidoko の tokens.css)、ember #F47D3A、LINE Seed JP |

テーマはトークン (CSS 変数)・ブランド枠 (`Frame`)・OGP カード (`OgCard`) を持ちます。和文は Web フォントに固定します。閲覧環境で字幅が変わると、手で置いた構図が崩れるためです。和文の折り返しは `word-break: auto-phrase` で文節単位にしています。

## 5. 見る・話す

| 操作 | 内容 |
|---|---|
| → / スペース / クリック | 次の状態へ。左 1/4 のクリックで戻る |
| ← | 前の状態へ |
| スワイプ | スマホでの送り |
| `n` | ノートを読むモード。話者なしで読む人のために、ノートをステージの下に出す。スマホの縦画面では既定 |
| `o` / `g` | 一覧 |
| `p` | 発表者ビューを別ウィンドウで開く。時間・次の状態・話す内容を出し、ライブと同期する |
| `f` | 全画面 |

URL のハッシュ `#/<scene-id>/<step>` で状態を直接開けます。

## 6. CLI と検証のループ

```sh
node tools/stage/cli.mjs dev talks/<slug>            # 作業用サーバ (別ターミナルで立てる)
node tools/stage/cli.mjs check talks/<slug>          # 全状態の静止画と検査 → out/check.md
node tools/stage/cli.mjs check talks/<slug> --motion # 遷移のコマ撮りも出す → out/motion/
node tools/stage/cli.mjs build talks/<slug>          # 公開用 → out/build/ (OGP 画像つき)
node tools/stage/cli.mjs freeze talks/<slug>         # 発表後の凍結 → final/
node tools/stage/cli.mjs site                        # talks/*/final を集めて out/site/ に組み立てる
cd tools/stage && ./node_modules/.bin/tsc -p tsconfig.json  # 型検査
```

`check` は、静止画モードで全状態を描き、次の 3 つを機械で探します。

- 重なり: 別々の文字の箱が重なっている
- はみ出し: ステージと交わる文字が、ステージの外にはみ出している (完全に外へ退場したものは対象外)
- 小さい文字: 18px 未満 (ブランド枠は対象外)

機械で拾えないもの (線と文字の重なり、構図の釣り合い、動きの自然さ) は、`out/states/` と `out/motion/` を目で見て確かめます。遷移のコマ撮りは、各遷移を 0〜1400ms の 6 コマで切った一覧です。

## 7. 配信

- 各トークは `https://slides.y-kaz.com/<slug>/` に置きます。`build` が、タイトル・説明・OGP 画像 (1200×630)・Twitter カードのメタタグを HTML に入れます
- 発表後は `freeze` で `final/` に凍結してコミットします。フレームワークを変えても、凍結済みのトークは変わりません
- `site` は `final/` を集めて一覧ページを作ります。旧方式の `final/` (index.html か PDF) もそのまま載せます
- 配信は Cloudflare Workers の静的アセット (`wrangler.jsonc`)。デプロイは話者の確認を取ってから行います

## 8. まだ無いもの

- 絵コンテの形式と、crafting-presentation の書き換え
- アノテーションでのレビュー (ADR-0011 の移植)
- Web フォントの同梱。いまは Google Fonts を読むので、会場がオフラインだと字形が変わる。使った文字だけをサブセット化してビルドに含める予定
- グラフの部品。数件のトークで書いてから、部品に昇格させる
