# hokuchi studio

発表資料と note の記事を、AI と一緒に企画から公開まで作るローカルの制作アプリです (ADR-0030, ADR-0035, ADR-0036)。設計は `docs/design.md`、その根拠の調査は `docs/research/` にあります。

```sh
bun run studio           # http://localhost:5300/ にホームを立てる
bun run studio <talk>    # 同じものを立て、そのトークの編集画面の URL も出す (<talk> は名前の先頭か slug)
```

長く動くので、別ターミナルで立ててください。同じプロセスの中で、サイト全体の開発サーバ (http://localhost:5280/) も立てます。`bun run dev` と同じポートを使うので、両方は立てられません。

| 環境変数 | 既定 | 中身 |
|---|---|---|
| `HOKUCHI_PRIVATE` | `~/Hobby/hokuchi-private` | 作品の企画シートとネタ帳の置き場 (公開リポジトリの外) |
| `HOKUCHI_STUDIO_PORT` | 5300 | studio の画面 |
| `HOKUCHI_SITE_PORT` | 5280 | 中で立てるサイト全体の開発サーバ |

## 画面

画面は、ホーム → 作品の画面 → 面、の 2 階層です (ADR-0049。設計は `docs/design.md` 3 章)。

- ホーム (`/`): 上が「いま」(下書き・完成・改稿中)、下が「積み上げ」(公開したもの。月で区切る)。ネタは帯の 1 行で書き留めます。右上の「作成」か、ネタの「発表にする」「記事にする」で作品を始めます
- 作品の画面 (`/works/<key>#<面>/<場所>`): 発表 1 本・記事 1 本を、帯 1 行・左のレール・面の骨組みで進めます。公開済みの記事も、企画シートの無い発表も、同じ画面で開きます
  - 帯: 戻る・タイトル・状態 (下書き・完成・公開・改稿中)・「⋯」(その状態で押せる操作と、置き場を開く)
  - レール: 伝えたいことと聴衆、工程 (面の並び。開いた面は段階・シーン・見出しを子に出す)、あなた宛てと Claude への件数、イベントと日付
  - 面: 企画・流れ (記事は構成)・コマ (記事は原稿)・読み・公開

指摘は、余白で書き (行にカーソルを乗せると「指摘を書く」が出ます)、レールの「あなた宛て」で開く受信箱で裁きます。「Claude へ」を押すと依頼文がコピーされるので、ターミナルの Claude Code に貼ってください。指摘そのものは `feedback.yaml` にあります。前の `/talks/<slug>`・`/notes/<dir>` は、作品の画面に移ります。

## しくみ

2026-10 に作り直しました (ADR-0049・ADR-0050。経緯は `docs/rebuild.md`、いまの設計は `docs/design.md`)。

```
server/
  main.ts    起動。画面 (5300)・サイト全体の開発サーバ (5280)・撮影に使うブラウザを立てる
  http/      ルーティングと、薄いハンドラ (routes.ts)
  domain/    作品 (work.ts)・状態の表 (state.ts)・企画シート・ネタ・指摘・読み・ごみ箱・原稿の名前 (slug.ts)・作品ごとの購読 (sessions.ts)
  media/     発表と記事の違いを持つ部品 (talk.ts・note.ts)。kind の分岐は media/index.ts の 1 か所だけ
  infra/     ファイルの読み書き (版つき)・監視・SSE・claude の呼び出し・撮影・サイト
shared/      画面とサーバで共有する型 (API の契約。先頭に API の一覧)
ui/          画面。lib/router.ts がルータ、lib/works.ts が作品ごとのデータの層 (取得・購読・楽観的な更新・409)、work/ が作品の画面の骨組み (帯・レール・「⋯」)
test/        振る舞いの固定 (studio.test.ts) と API の規則 (contract.test.ts)。bun run test:studio
```

- サーバは TypeScript で、Node 22 の型の取り除き (`--experimental-strip-types`) で動かします。ビルドは要りません。型検査は `bun run typecheck` です
- 書き込みは、どのファイルも「読んだ版や中身と違えば保存しない」(409) にそろえています。Claude Code と画面が同じファイルを直すためです
- 撮影とファイルの監視は、作品の画面を開いているあいだだけ動きます。閉じると止まります
- 新しいトークを置き場の `talks/` に足すと、ホームを開き直すだけで一覧に並びます (studio の立て直しは要りません)
- 新しい画面は shadcn/ui (Tailwind v4) で作っています。部品は `ui/components/ui/` にあり、`bunx shadcn@latest add <部品>` で足せます (`apps/studio` で実行)。CLI が `cn` の読み込み先を `"cn"` と書くことがあるので、`@/lib/utils` に直してください
