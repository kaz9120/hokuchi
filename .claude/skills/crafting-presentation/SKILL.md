---
name: crafting-presentation
description: hokuchi のスライドツールで登壇資料を作る。人間との対話で聴衆と One Big Idea を深掘りし、SPEC 準拠の deck.yaml (意図宣言型 YAML) を生成して lint / render / shot まで回す一気通貫フロー。登壇・発表・プレゼン・LT の資料を、作る/直す/構成から相談する依頼に使う。ピクセルではなく意図を書き、レンダラが配置を導出する。
---

# スライドを意図で書く

このスキルは、対話で聴衆とメッセージを深掘りし、hokuchi の宣言スキーマ (SPEC 準拠の `deck.yaml`) を生成し、`hokuchi` CLI で検証・描画するまでを一気に通す。完成の姿は、lint を通した `talks/<YYYY-MM-slug>/deck.yaml` と、そこから描画した `out/` の 2 つ。

書き手は Claude、レビュアーは人間。Claude が書くのはピクセルではなく意図 (何を伝えたいか・要素同士がどう関係するか) であり、配置・色・サイズはテーマとレンダラが導出する (ADR-0001)。人間がレビューするのは主に各スライドの `idea` と `notes`。

## 着手前に開くファイル

生成する YAML は次の仕様に準拠する。SPEC は着手前に開く。references は各 Phase の入口で開く。

- `tools/slides/SPEC.md` — スキーマの規範仕様。フィールド・要素 15 種・レイアウトパターン・lint ルール。生成物はこれに従う
- `tools/slides/docs/design.md` — 設計思想の背景 (なぜ意図を宣言し配置を導出するのか)
- `references/interview-questions.md` — 聴衆プロファイリングの 7 つの問いと対話への言い換え。Phase 1 で開く
- `references/style-defaults.md` — 話者固有の登壇スタイルの既定 (振り返りで育てる)。Phase 4 と Phase 5 で開く
- `references/element-guide.md` — 伝えたいことの形から要素と form を選ぶ判断ガイド。Phase 5 で開く

## 全体の流れ

Phase 0 から 7 まで順に進む。Phase 2 と Phase 4 はユーザーの承認を取る関門で、飛ばすと合意していない前提の上に YAML を積むことになる。Phase 0〜4 は人間との対話で設計を固める段で、YAML はまだ書かない。Phase 5 で初めて YAML を書き、Phase 6 で検証、Phase 7 で磨く。

拡散と収束を混ぜない。Phase 3 は拡散 (案を広げる)、Phase 4 は収束 (プロットを確定)。

---

## Phase 0 — 前提の確認

スライドの設計に入る前に、外枠を固める。次を聞く。文脈から埋まるものは聞き直さない。

1. 発表の場はどこか (カンファレンス登壇 / 社内 LT / 顧客提案 / 勉強会 など)
2. 持ち時間は何分か
3. 締切はいつか
4. 既存素材はあるか (過去スライド、原稿、図、データ)
5. 出力先ディレクトリはどこか。未指定なら発表資料の正式な置き場 `talks/<YYYY-MM-slug>/` を提案する

持ち時間から枚数の目安を出す。SPEC の `deck-size` lint は内容スライドが 10 枚超で info を出す (エラーではない)。opener / title / closer は枠であり、この枚数には数えない。

| 持ち時間 | 内容スライドの目安 |
|---------|------------------|
| LT 5 分 | 5 枚前後 |
| 10 分 | 7 枚前後 |
| 18〜20 分 | 10 枚前後 |
| 30 分 | 15 枚前後 |
| 45 分以上 | 20 枚以上 (分割を検討。`deck-size` info は許容する) |

目安であって上限ではない。1 枚 1 アイデアを守った結果として枚数が増えるのは正常。詰め込んで枚数を減らすのは逆 (Phase 4 で点検する)。

---

## Phase 1 — 聴衆プロファイリング

聴衆を具体的な 1 人として描けると、メッセージの取捨選択の基準が定まる (slide:ology p.34-37)。`references/interview-questions.md` の 7 つの問いを土台にする。

7 問を尋問のように順番に聞かない。文脈やユーザーの最初の説明から埋められるものは埋め、埋まらない核心の 3〜4 問に絞って対話で聞く。核心は次の 3 つ。

1. 聴衆はどんな人々か (第 1 問。個人レベルで。役職・技術レベル・関心)
2. 彼らを悩ませているのは何か (第 3 問。プレゼンが答える痛み)
3. プレゼン後にどんな行動を取ってほしいか (第 5 問。これは Phase 2 の One Big Idea に直結する)

補助として、なぜ聴衆はここにいるのか (第 2 問)、どんな反発を受けるか (第 6 問) を必要に応じて聞く。

結果を `deck.audience` に落とす。

- `audience.who` — 聴衆像 (第 1〜3 問の統合。「〜に悩む〜な人々」の形)
- `audience.action` — プレゼン後に取ってほしい行動 (第 5 問)

`audience` はレンダリングされない設計メタデータ。以降のスライド設計の判断基準として使い続ける。

---

## Phase 2 — One Big Idea

プレゼン後に聴衆に取ってほしい行動を 1 文で確定する。これが全スライドの `idea` の親になる。

1. `audience.action` を、聴衆が「だから何をすればいいか」に迷わない 1 文に磨く
2. その 1 文をユーザーに提示し、同意を取る
3. 確定した One Big Idea を書き留める。以降のすべてのスライドは、この 1 文に奉仕するかで採否を判断する

One Big Idea に貢献しないスライドは、どれだけ面白くても落とす候補。ここで基準を握っておくと、Phase 3〜4 の取捨選択が速くなる。

---

## Phase 3 — 構成の発散と収束

構成案を 3 案提示し、ユーザーに選ばせる。1 つのアイデアに集中し過ぎると、他のよりよいアイデアを探すチャンスが失われる (slide:ology p.47)。

定番の 3 つの切り口を起点にする。題材に合わせて変えてよいが、必ず質の違う 3 案にする。

| 案 | 起点 | 向く題材 |
|----|------|---------|
| 問題起点 | 聴衆の痛み → 原因 → 解決 → 行動 | 課題解決型・提案 |
| 物語起点 | 現状 → 転機 → 変化 → 教訓 | 体験談・事例共有 |
| デモ起点 | 完成形を先に見せる → 仕組み → 応用 | ツール紹介・技術デモ |

各案について、大まかな流れ (章立て 4〜6 ブロック) と、One Big Idea への効き方を 1 行添える。ユーザーが選んだら Phase 4 へ。

---

## Phase 4 — プロット承認

選ばれた構成を、スライドごとの `idea` 1 行リストに展開し、レビューを受ける。まだ YAML は書かない。

出力の形。

```
1. title    この 30 分で「意図で書く」選択肢を持ち帰ってもらう
2. content  焚き火を愛するエンジニアが 10 年スライドを書いてきた (profile-stage)
3. content  スライドの意味の半分は配置が担っている
...
N. closer   聴衆が次の登壇資料を意図で書き始める
```

提示前に自己点検する。

- 各行が 1 文で言えているか。言えないスライドは 2 アイデアが混ざっている。分割する (SPEC の `one-idea` lint の基準)
- 各 `idea` が One Big Idea に貢献しているか。しないものは落とす
- 行動喚起で閉じる closer があるか (p.37)。opener は既定では置かない (`style-defaults.md`)
- 構成が `references/style-defaults.md` の既定 (自己紹介・章立て・transition) に沿っているか。外すなら理由を言えるか
- 枚数が Phase 0 の目安から大きく外れていないか

ユーザーの承認を得てから Phase 5 へ。プロットが変わるなら Phase 3〜4 に戻る。

---

## Phase 5 — YAML 生成

承認済みプロットを SPEC 準拠の `deck.yaml` に書く。要素選択は `references/element-guide.md` に従う。話者固有の既定 (support の付け方・実写真優先など) は `references/style-defaults.md` に従う。

### 手順

1. テーマを登壇の立場で選ぶ。個人としての登壇は `tools/slides/themes/hokuchi.yaml`、MOSH としての登壇は `tools/slides/themes/mosh.yaml` (ADR-0010)。どちらも相対パスで参照する。コピーするとテーマの単一ソースが壊れる。この 2 つ以外を新しく作らない。立場が判断できなければ Phase 0 で聞く
2. `deck` ブロックを書く。`title` / `audience` (Phase 1 の結果) / `theme` (相対パス)。連続する chart で軸を揃えるなら `scales` を定義
3. 各スライドを書く。`id` (安定キー) / `role` / `idea` (Phase 4 の 1 行) / `layout` / `elements` / `notes`
4. 語る内容は `notes` に、スライドの可視テキストは最小に。スライドは見出し、本文はノート (下記)

### 要素選択の原則

要素は 15 種 (statement / bullets / image / diagram / chart / quote / code / post / link / stat / table / versus / agenda / video / raw、ADR-0016)。何を選ぶかは `element-guide.md` の判断表に従う。箇条書き (bullets) は最後の手段。

`layout` は名前付きパターンを優先する (9 割はこれで足りる)。パターンとスロットの対応は SPEC §5.1、要素はどのパターンに載るかは `element-guide.md`。凝った配置が要るときだけ grid-direct を使う。

要素は `slot` (名前付きパターン内) または `id` (grid-direct 参照用) を、どちらか一方だけ持つ。両方を持たせない (SPEC §6)。

### スライドは見出し、本文は notes

削るべきテキストは消さずに `notes` に落とす (slide:ology p.240-243 の Reduce)。可視テキストの目安は 1 枚 100 字未満 (`slideument` lint は 100 字で warn、150 字でエラー)。話して伝わる文はスライドに書かず notes に置く。

### SPEC で間違えやすい点

- chart の注釈は `annotations: [{ at | at_index, annotate, style: highlight }]`。`at` は x 配列の値と完全一致させる (ずれると `annotation-anchor` エラー)。色値リテラルは書かない
- chart には `message` が必須 (データの意味。無いと書けない)
- diagram の `emphasis` はノード id の配列。statement の `emphasis` (強調語の配列) とは別物
- diagram の `edges` が参照するノード id は `nodes` に存在させる (無いと `edge-ref` エラー)
- 色・書体・サイズは書かない。テーマのスロットとタイプスケールから導出される
- image は `src` か `prompt` の少なくとも一方を持つ。実画像が無くても `prompt` を仕様として残す (ADR-0006)
- raw を使うなら `waiver` (理由) が必須。デッキの 1 割を超えると `raw-budget` warn

---

## Phase 6 — 検証

`hokuchi` コマンド (`tools/slides/cli.mjs` を npm link したもの) で lint / render / shot を回す。任意のディレクトリから実行できる。コマンドが見つからないときは `tools/slides` で `npm link` を一度実行する (nodenv 環境では続けて `nodenv rehash`)。

```sh
hokuchi lint <deck.yaml>
hokuchi render <deck.yaml>     # 出力は deck と同じ場所の out/ (-o で変更可)
hokuchi shot <outdir>
hokuchi serve <outdir>         # 人間レビュー用のアノテーション付きプレビュー (ADR-0011)
```

1. `lint` を実行し、警告を原則すべて解消する。テキスト超過 (`slideument`) は本文を `notes` へ移す。`one-idea` はスライドを分割する。`annotation-anchor` / `edge-ref` はエラーであり、直すまで先へ進まない。解消せず残す警告があれば、理由を添えてユーザーに報告する
2. `render` で単一ファイル SPA (`out/index.html`) を描画する (ADR-0012)
3. `shot` でスクリーンショットを生成し、自分の目で確かめてからユーザーに見せる
4. 人間の細かいレビューには `serve` を提案する。ユーザーは ← → でページを送り、`g` で全スライドの一覧モードに切り替え、要素をクリックしてメモを付ける。Send を押すと `<outdir>/annotations.md` に追記される (一覧モードならデッキ全体の注釈を 1 回で送れる)
5. ユーザーから「アノテーションを送った」と言われたら `<outdir>/annotations.md` を読み、Phase 7 の入力にする

lint レポートは捨てずに残る一級の成果物 (ADR-0002)。逸脱を黙って常態化させない。

---

## Phase 7 — 磨き

ユーザーのフィードバック (口頭・テキスト・`annotations.md` のアノテーション) を、スライド `id` 単位で反映する。

- 変更は指示された `id` のスライドに限る。他のスライドには触らない (ADR-0004)
- 人間が手編集した YAML を、対話の再生成で上書きしない。特定 id のスライドだけを書き換える
- 反映のたびに Phase 6 の lint / render / shot を回し、変更が意図どおりか目で確かめる

フィードバックが構成そのものに及ぶなら、Phase 3〜4 に戻って合意し直してから書き換える。

---

## 発表後 — 凍結と振り返り

発表が終わったら 2 つやる。

1. 最終レンダリングを `talks/<slug>/final/` にコミットして凍結する (ADR-0009)
2. 振り返りをする。初版の deck.yaml と最終版の diff を読み、修正を「スタイル由来 (話者の型とのズレ)」「語彙不足 (スキーマに表現手段がなかった)」「内容の推敲」に分類する。スタイル由来の学びは `references/style-defaults.md` に追記し、次の登壇の初版から当てる。語彙不足はツール側の課題として起票する
