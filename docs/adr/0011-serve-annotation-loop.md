# ADR-0011: serve モードと agentation でアノテーション・フィードバックループを作る

- ステータス: 承認
- 日付: 2026-07-05
- スコープ: tools/slides

## 文脈

スライドのレビューは「shot で PNG を並べて眺め、言葉で修正指示を出す」流れだった。指示は「◯枚目の右上のあれ」のような曖昧な言語化になりがちで、レビュアー (人間) と書き手 (Claude) の間で位置の特定にコストがかかる。

[agentation](https://agentation.com) (npm `agentation`) は、ページ上の要素をクリックしてメモを付け、CSS セレクタ・位置・周辺テキストを含む構造化 Markdown を出力する視覚フィードバックツールである。React 18 コンポーネントとして提供され、ライセンスは PolyForm Shield (社内利用は無料)。

レンダラの出力は静的 HTML であり、React ランタイムを持たない。また Claude がアノテーションを受け取る経路が要る。

## 選択肢

1. **serve コマンドを新設し、agentation を注入する** — `cli.mjs serve <outdir>`。配信時に HTML へ (a) ページ送りナビ (b) React + agentation の事前バンドル を注入し、アノテーション送信を serve プロセスが受けて `<outdir>/annotations.md` に追記する。Claude はそのファイルを読む
2. **アノテーション UI を自作する** — 依存は減るが、セレクタ抽出・複数選択・出力整形を作り直すことになり、脇役のツールに本体より厚い実装が生える
3. **PNG + 言葉の現状維持** — コストゼロだが、位置特定の摩擦が残り続ける

## 決定

1 を採用する。実装の要点は次のとおり。

- `serve` は Node 標準 http で `<outdir>` を配信する。ビルド成果物 (render の出力) は書き換えず、配信時にのみ注入する。プレゼン本番の HTML と開発時の HTML を同一物に保つため
- agentation + React は起動時に esbuild で単一 IIFE にバンドルし、`/__agentation.js` として配信する。esbuild / react / react-dom / agentation は devDependencies
- アノテーションの「Send」は serve の `POST /__annotations` に届き、ページ名・タイムスタンプ付きで `<outdir>/annotations.md` に追記される。人間は送信後に Claude へ「アノテーションを見て」と言うだけでよい
- ページ送り (← → キー) は serve 注入のナビスクリプトが担う

## 撤退ライン

agentation のライセンスや React 依存が問題になったとき、または注入方式が agentation のバージョンアップで壊れ続けるとき (2 回連続でバンドル修正が必要になったら)、自作の最小アノテーション UI (選択肢 2) に切り替える。serve と `POST /__annotations` の口はそのまま使えるように、agentation 依存はバンドルエントリ 1 ファイルに隔離しておく。

## 影響

- cli.mjs にコマンドが 1 つ増える (lint / render / shot / serve)
- package.json に devDependencies が増える (実行時依存は増えない)
- レビューの往復が「PNG を見て言葉で指示」から「ブラウザで注釈して送信」に変わる。skill (crafting-presentation) の Phase 6/7 の運用に組み込む
