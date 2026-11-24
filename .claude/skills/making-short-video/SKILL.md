---
name: making-short-video
description: 山本一将の発信に使う短い動画を作る。HyperFrames（HTML を MP4 に書き出す道具）で、note の記事や登壇の予告・告知を、X などに流す縦型 15 秒前後の動画にする。「動画を作って」「ショート動画」「縦型の動画」「X に流す動画」「記事の予告動画」「告知動画」「モーショングラフィックス」「MP4 にして」などの依頼に使う。HyperFrames という名前が出なくても使う。発表資料そのもの（slides.y-kaz.com）は crafting-presentation を使い、このスキルは使わない。
---

# 短い動画を作る

道具は HyperFrames です。HTML・CSS・GSAP で画面を書き、1 コマずつ止めて撮って MP4 にします。作るのは Claude で、決めるのは話者です。話者は HyperFrames の使い方を覚えていない前提で、Claude が段取りを引っ張ります。

このスキルは、話者と使い込みながら育てる途中のものです。作るたびに、分かったことを `references/lessons.md` に足してください。型が固まったら、writing-note の最後の段に組み込むか考えます。

## 道具の準備（2026-11 時点で済んでいる）

- HyperFrames の公式スキル 4 つ（`hyperframes`、`hyperframes-cli`、`hyperframes-registry`、`media-use`）が `~/.claude/skills/` に入っている。作業の前に `hyperframes` スキルを読み込む。書き方の決まりと検査の手順はそちらが正本
- HeyGen に無料アカウントでサインイン済み（`npx hyperframes auth status` で確かめる）。BGM のカタログはこれで使える
- BGM の取得には `heygen` CLI が要る。`~/.local/bin/heygen` にあるが PATH に入っていないことがあるので、`export PATH="$HOME/.local/bin:$PATH"` を付けて実行する
- 使い方の全体像は、案内図のページにまとめてある: https://claude.ai/artifact/29SGyUeQZ9yTVFoffHTkKQ

## 置き場所

動画のプロジェクトは公開リポジトリの外の `~/Hobby/hokuchi-private/videos/<YYYY-MM-DD-slug>/` に置きます。日付と slug は元になる記事や登壇に揃えます。BGM や効果音の利用条件を確かめる前のものを、公開リポジトリに入れないためです。

見本は `~/Hobby/hokuchi-private/videos/2026-11-25-mosh-teaser/` です。MOSH Tech Meetup #6 の登壇の告知で、5 シーン・17.5 秒、効果音と BGM 入り。takibi のトークン・書体・曲線と、火の粉の背景の移し方は、この `index.html` を写してください。KomeKaigi の予告（`2026-11-08-komekaigi-teaser/`）はデザインシステムに沿っていないので、見本にしません。

## デザインシステムに沿う（鉄則）

デザインシステムに沿っていない動画は出しません。直すまで投稿を勧めません。デザインシステムは takibi-design-system（`~/Hobby/takibi-design-system`）で、発信物にも使うと `content/communication/index.md` に書いてあります。書く前に `content/basics/` の color・typography・motion を読みます。

- 色は `packages/takibi/dist/tokens.css` をプロジェクトの `assets/takibi/` に写して読み込み、役割のトークン（`--color-surface`、`--color-fg-*`、`--color-line*`、`--color-brand` など）だけを使う。値を直に書かない
- ブランドカラー（`--color-brand`）は CTA だけに使う。強調したい語は、色ではなく文字の大きさと `fg-strong` / `fg-muted` の差で強調する。温度の色（`--color-heat-*`）は光と火の粉だけに使う
- 書体は Inter と LINE Seed JP。LINE Seed JP の woff2 は `apps/slides/dist/<トーク>/fonts/` にあるので `assets/fonts/` に写し、`@font-face` で読む。太さは 700 まで（見出しは 600 か 700）
- 文字と角丸の段は画面の px なので、動画では 2.5 倍して使う（幅 432px の画面を 2.5 倍で映したものとみなす）
- 動きの長さと曲線は `--duration-*` と `--ease-*` を JS で読んで使う。文字の送りは `ease-ignite`（500ms）、消える要素は `ease-rise` で 10px 上がって 1.03 倍。ぼかし（`filter: blur`）と、takibi にない場面転換（シェーダー）は使わない
- 火の粉の背景は `packages/takibi/src/embers.js` の式を写し、seed 付きの乱数で全編を先に計算して、`hf-seek` で時刻のコマを描く。自分で丸を浮かせない

## 流れ

1. 話者に 3 つだけ聞く。何の動画か（元の記事や登壇）、どこに流すか、いつまでに要るか。尺と画面の形は、聞かずに既定値（下記）で進める
2. 元ネタを読み、写真やスクリーンショットなど本物の素材を探す。記事なら `articles/note/<slug>/assets/` にある
3. `npx hyperframes init <dir> --example blank --resolution portrait --skip-skills --non-interactive` でプロジェクトを作る
4. 絵コンテを文で出し、話者と合意する。シーンごとに秒数・画面の文言・動き・音を 1 行ずつ。合意するまで作らない
5. `hyperframes` スキルの決まりに従って書く。部品は先に `npx hyperframes catalog --query "<英語>" --json` で探す
6. `npx hyperframes check` を通す。エラーは全部直し、警告は読んで判断する
7. `npx hyperframes render` で書き出し、**MP4 から** `ffmpeg -ss <秒> -i <mp4> -frames:v 1` で要所のコマを切り出して見る。プレビューの静止画だけで済ませない（`references/lessons.md` の 1）
8. 音の素材の利用条件を確かめる。効果音は `.media/manifest.jsonl` の `license` を見て、CC BY なら投稿文に入れるクレジットを話者に渡す。BGM の X での利用条件は未確認なので、投稿の前に HeyGen の規約を読む
9. 動画を `open` で開いて話者に見せる。耳での確認は話者に頼む

## hokuchi の既定値

- 画面: 縦 1080×1920（9:16）、30fps、15〜18 秒、6 シーン前後（1 シーン 2.5 秒が目安）。X のデスクトップでは左右に余白が出るが、スマホの縦型の再生を優先して 9:16 にする（`references/lessons.md` の 10）
- 文字を置くのは上端 168px から 1330px までの帯。下と右は X の操作部品に隠れる
- 0 秒のコマがサムネイルになる。最初から結論か問いが見えている状態で始める
- 最後は記事の見出し画像・タイトル・「note で読む →」で終える

## 動画を地味にしないために

1 本目が地味だった原因と、2 本目で効いたことです。

どれもデザインシステムの範囲の中で行います。

- 登場した文字はそこで止め、動き続けるのは背景にする。見本では火の粉が全編で昇り続ける
- 効果音を、画面で何かが起きる瞬間に当てる。BGM は盛り上がる拍を山場に合わせる（`npx hyperframes beats <曲> --json` で拍を出し、`data-start` をずらして揃える）

## やらないこと

- 発表資料を HyperFrames で作り直さない。発表は `packages/stage` と crafting-presentation の領分
- 利用条件を確かめていない BGM や効果音のまま、公開を勧めない
- 話者の確認なしに、`publish` やクラウド書き出しなど外部に上げる操作をしない
