# ADR-0032: 作業用サーバに agentation を差し込み、画面の要素に付けたメモで細かいフィードバックを返す

- ステータス: 承認
- 日付: 2026-10-09
- スコープ: packages/stage / .claude/skills/crafting-presentation

## 文脈

ADR-0011 で、旧方式 (tools/slides) の serve に agentation を注入していた。ADR-0026 で発表資料を packages/stage に作り直したとき、この仕組みは移植していない (design.md の「まだ無いもの」)。ADR-0030 の studio は状態の単位で文脈を付けるだけで、見直しの条件に「アノテーションが必要になったとき」を挙げていた。

slides.y-kaz.com の公開後、話者から「細かいフィードバックもしていきたいので、agentation を入れたい」という要望があった。出典の書き方や文字の位置のような細部は、状態の単位では「どこの話か」を言葉で伝える手間が残る。

agentation (npm `agentation`、3.1.2、PolyForm Shield 1.0.0) は React のコンポーネントで、画面の要素をクリックしてメモを付け、セレクタ・位置・周辺の文字を含む Markdown をコピーできる。送信先を自前で決める口 (`onSubmit`) や、MCP サーバとの同期もある。

## 選択肢

**A 案: studio のプレビューに入れ、送信で studio のチャットに流し込む。** コピーが要らない。studio のサーバとプレビューの iframe の間に、受け渡しを作る必要がある。

**B 案: 作業用サーバ (`bun run dev`) に入れ、コピーした Markdown を Claude に貼る。** 作りは小さい。貼る手間が 1 回残る。

**C 案: MCP サーバ (`agentation-mcp`) と同期させる。** Claude が直接メモを読める。常駐するプロセスと設定が増える。

## 決定

B 案を採る (話者の選択)。

- 開発サーバだけで動く Vite のプラグインが、HTML に `src/runtime/feedback.tsx` の script を差し込む。公開用のビルドの依存グラフには入らない。PolyForm Shield のコードを公開物に同梱しないためでもある
- ライブ再生だけに出す。静止画の撮影 (`?shot`)、発表者ビュー、studio のプレビュー (iframe) には出さない
- `useHashLocation` で、メモの置き場を状態 (`#/<scene-id>/<step>`) ごとに分ける。コピーした Markdown の見出しにハッシュが載るので、どの状態へのメモかが分かる。再生機はハッシュを `replaceState` で書き換えるので、`stage:moved` のイベントで知らせる
- 再生機のキー操作は、入力欄で打った文字を拾わないようにした。メモ欄で打った文字でスライドが進まないためである

## 根拠

- 状態の特定 (ハッシュ) と要素の特定 (セレクタ・周辺の文字) が両方そろうので、「どこの話か」を言葉で説明しなくてよい (確信度: 高。deploys の状態 0 で、メモの追加と状態の切り替えを確かめた)
- 公開用ビルドに agentation が入らないことを、ビルドの出力を検索して確かめた (確信度: 高)
- 貼る手間は 1 回なので、まずは小さく始める。手間が気になれば A 案か C 案に進める (確信度: 中)

## 見直しの条件

- 貼る往復が多く、studio のチャットへ直接送りたくなったとき (A 案)
- agentation のライセンスや、React のバージョンとの相性が問題になったとき
- バージョンアップで差し込みが 2 回続けて壊れたとき。ADR-0011 と同じく、依存は `feedback.tsx` 1 ファイルに閉じている

## 影響

- packages/stage の devDependencies に agentation が増えた
- design.md の「まだ無いもの」から、アノテーションでのレビューを外した
- crafting-presentation の Phase 8 で、話者から agentation の Markdown が届いたときの読み方を足した
