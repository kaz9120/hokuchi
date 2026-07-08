# ADR-0016: deck スキーマ 0.3.0 / theme 0.4.0 — 技術素材・紹介・数値の語彙を追加する

- ステータス: 承認
- 日付: 2026-07-08
- スコープ: tools/slides

## 文脈

現行の要素 7 種 (statement / bullets / image / diagram / chart / quote / raw) は slide:ology の語彙 (関係・データ・言葉) を写したもので、技術登壇に固有の素材を持たない。コード・SNS ポスト・記事紹介などは「画像を作って貼る」か raw に逃げるしかなく、逃げた瞬間にテーマ追従・再レンダリング・handout での可読性が失われる。構造化スキーマの意味が素材の頻出領域でこそ消える、という逆転が起きている。

実例もある。ai-survival デッキは X ポストをスクリーンショット画像で貼った (deck.yaml の当時 245 行目付近)。text / author / date で構造化できる内容である。

また初版からの既知の穴が 2 つ残っている。円グラフの宣言経路が無く pie-rules lint が no-op (SPEC 旧・未決事項 4)、そして PNG を Google Slides に貼る現運用が SPA プレゼンテーションモード (ADR-0012 の見込み) に移行したとき、動画を宣言する語彙が無い。

2026-07-08 の対話で列挙・取捨し (image への注釈焼き込みは画像編集の領域として不採用)、残りを一括で入れることを決めた。

## 選択肢

**素材をどう表すか (全体)。** A 案: raw / image の運用で凌ぐ — 上記の通り構造が失われる。B 案: 素材ごとに kind を立てる — 「表現したい事柄と描画方法をセットで提供する」という ADR-0001 の路線をそのまま延長する。C 案: 汎用の embed 要素 1 つに畳む — フィールドが union になり「書けないことの保証」(ADR-0002) が緩む。B 案を採る。

**code の族をどう分けるか。** コード片・端末セッション・diff を別 kind にする案もあるが、違いは「何の言語として色付けするか」だけであり、`lang` フィールド 1 つに畳む (lang: console / diff を含む)。kind の増殖を抑える。

**link の QR。** `qr: true` のようなフィールドは作らず、url から常に導出する。QR を貼りたいから link を書くのであり、書き手に選ばせる意味がない (導出の思想、ADR-0014 と同型)。

**agenda。** 章題を items で手書きする案は、transition スライドと二重管理になり必ずズレる。role: transition の statement から導出し、agenda 自身はフィールドを持たない。

**mono 書体。** SPEC §2.3 は「書体スロットは display と body の 2 つだけ。3 書体目を書けない」(p.163) を保証してきた。この保証は「声の書体を増やさない」ためのもので、コードは声ではなく引用される素材である (アイコンセットと同じ実装層)。theme 0.4.0 に任意スロット `type.mono` を追加し、未指定ならレンダラ既定の mono スタックに落とす。デッキ側からは相変わらず書体を指定できない。

## 決定

deck スキーマを 0.3.0、theme スキーマを 0.4.0 に上げ、次を後方互換で追加する。1 起点・0 起点が混在しないよう、書き手が書く行・番号指定はすべて 1 起点とする (エディタや目視の数え方と揃える)。

### 新要素 8 種

| kind | 必須フィールド | 任意フィールド | 表すもの |
|------|--------------|--------------|---------|
| `code` | `code` または `src` (どちらか一方) | `lang` (既定 plaintext)、`filename`、`emphasis` (1 起点の行番号 / `"3-5"` 範囲の配列) | コード片・端末セッション (`lang: console`)・差分 (`lang: diff`) |
| `post` | `text`, `author` | `handle`, `date`, `avatar` (ローカル画像), `source` (URL) | SNS ポストの引用。スクリーンショット貼付の代替 |
| `link` | `url` | `title`, `description`, `image` (OGP 画像のローカルパス) | 記事・資料の紹介。QR は url からレンダラが常に生成する |
| `stat` | `value` | `label` (何の数字か), `context` (比較・出典の 1 行) | 大きな数字 1 つで刺す |
| `table` | `columns` (2〜6), `rows` | `emphasis: { rows?, cols? }` (1 起点) | 非数値の比較表 (✓ 表など) |
| `versus` | `sides` (ちょうど 2 つ。各 `{ label, items (1〜4), emphasis? }`) | — | 対比 (従来 vs 提案、Before/After) |
| `agenda` | — (slot / id のみ) | — | 目次。transition の statement から導出。直前の transition を現在地として強調 (前に無ければ強調なし) |
| `video` | `src` | `poster` | 動画。静的出力ではポスターフレーム + 再生グリフのプレースホルダを描画し、再生は SPA プレゼンテーションモード実装時に対応する |

### レイアウトパターン 8 種

`code-stage` / `post-stage` / `link-stage` / `stat-stage` / `table-stage` / `versus-stage` / `agenda-stage` / `video-stage` を追加する。すべて `headline` (statement、任意) + 主役スロット (必須) の leadStage 型で、既存の measure/compose (ADR-0014) に載せる。

### 既存要素の拡張

- `chart.intent` に `composition` (全体に占める割合) を追加する。単一系列は円 (ドーナツ)、複数系列は 100% 積み上げ棒に導出する。pie-rules lint が実働化する (旧・未決事項 4 の解消)
- `diagram` の subtype カタログに `flow.timeline` を追記する (スキーマの form パターンは開いているため改版不要)。node.label = 出来事、node.detail = 日付。配置は等間隔とし、日付比例はしない (可読性優先)

### theme 0.4.0

- `type.mono` (任意): `family`, `weight`。未指定はレンダラ既定の mono スタック
- `scale` の既定表にトークン `code: 22`、`stat: 160` を追加

### lint

- 追加: `code-budget` warn (17 行以上または 81 桁以上)、`table-size` warn (データ行 8 行以上。列上限はスキーマが 6 で保証)、`agenda-source` error (transition が 1 枚も無いデッキの agenda)
- 実働化: `pie-rules` warn (composition 単一系列で 9 項目以上、または合計が 100±2 を外れる)
- 修正: `one-idea` の主役級に新要素 8 種を数える。`slideument` の可視テキストに post / link / stat / table / versus を数える。code は参照素材として除外する (profile-stage の免除と同じ理由)

### 依存

ビルド時依存に highlight.js (シンタックスハイライト) と qrcode-generator (QR の SVG 生成) を追加する。どちらも出力へは静的に焼き込まれ、出力の自己完結 (実行時依存なし) は維持する。ハイライトの配色はパレットから導出するレンダラ専有の知識とし、テーマ・デッキに配色語彙は作らない (ADR-0014)。

## 根拠

確信度は要素ごとに違う。code / post / link は高 — 頻度と「逃げたとき失うもの」の両方が大きく、実例もある。composition / timeline は高 — 既知の穴の解消と改版不要の追記。stat / table / versus / agenda / video は中 — 実デッキ未検証だが、発表準備の途中でスキーマ改版を挟むコストの方が高いため、まとめて入れる判断をした (2026-07-08 の対話でユーザーが全量追加を選択)。

## 見直しの条件

- 実デッキ 3 本を作っても使われなかった要素は、1.0 までに削除を検討する (追加は安いが、語彙の肥大は選択ガイドを濁らせる)
- code の段階的ハイライト (emphasis を build で進める walk-through) は、実デッキで欲しくなった時点で reveal 語彙を設計する
- link の OGP 画像取得の自動化 (CLI ヘルパー) は手運用が痛くなってから
- video の実再生は SPA プレゼンテーションモードの設計 (ADR-0012 の見直し条件) と同時に決める

## 影響

- deck スキーマ 0.3.0 / theme スキーマ 0.4.0 (どちらも後方互換追加)
- SPEC §1.4 / §2.3 / §5.1 / §6 (8 節追加) / §6.4 / §6.5 / §9 / 付録 A の改訂。未決事項 4 の解消
- レンダラに 8 要素の measure/render、composition チャート、timeline 描画、mono 書体を追加
- lint に 3 ルール追加、2 ルール修正、pie-rules 実働化
- coverage デッキに検証スライドを追加
- crafting-presentation skill の要素選択ガイドを全面改訂 (入口の判断表に 8 要素を組み込む)
