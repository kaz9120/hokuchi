# slides.y-kaz.com

`talks/` の公開トーク (`talk.tsx` が `public: true`) を、最新のフレームワークでビルドして組み立て、Cloudflare Workers で配信します (ADR-0027, ADR-0029)。

## ローカルで見る

```sh
bun run dev             # http://localhost:5280/ にサイト全体を立てる (dev.mjs)
```

studio (`bun run studio`) を立てているときは、studio が同じサーバを中で立てているので、`bun run dev` は要りません (同じポートを使うので、両方は立てられません)。

トップページと全トークを、本番と同じ URL (`/<slug>/`) で開けます。保存すると即座に反映され、トップページでもトークでも agentation でメモを付けられます (ADR-0034)。一覧のサムネイルは、表紙をその場で撮ります。非公開のトークも、印を付けて一覧に出します (本番には載りません)。

公開する直前に、組み立てたもの (`dist/`) を本番の配信と同じ形で確かめたいときだけ、`bun run site` のあとに `cd apps/slides && bunx wrangler dev` を使います。

## 公開の手順

デプロイは、話者の確認を取ってから行います。

```sh
bun run site            # apps/slides/dist に組み立てる
bun run site --accept   # 見た目の変化を確かめたうえで受け入れる
bun run deploy          # 組み立てて、そのまま公開する (cd apps/slides && bunx wrangler deploy と同じ)
```

1. `bun run site` で組み立てます。全トークの全状態を撮り、前回 (`.snapshots/`) と比べます
2. 見た目が変わった状態があれば、前後の画像を `.snapshots/_diff/` に並べて止まります。フレームワークの変更で過去のトークが意図せず変わっていないかを確かめます。意図した変化なら `--accept` を付けて組み立て直します
3. `bun run deploy` で公開します。`dist/` の静的ファイルが `hokuchi-slides` (Workers) にアップロードされ、`slides.y-kaz.com` (カスタムドメイン) で配信されます
4. 公開したら、トップページ・トークのページ・OGP 画像 (`/<slug>/og.png`) が返ることを確かめます

## つまずいたとき

- `Not logged in` と出たら、wrangler のログインが切れています。対話できるターミナルで `cd apps/slides && bunx wrangler login` を実行し、ブラウザでログインします (アカウント kyamamoto9120)
- 初めて組み立てるトークは比べる基準がないので、差分の検査は次回から効きます
- `.snapshots/` は手元にだけ置く比較の基準です (Git の管理外)。別のマシンで組み立てると、最初の 1 回は比べられません

## 中身

- `build.mjs`: 全トークのビルド、見た目の差分検査
- `pages.mjs`: トップページ・404 ページ・sitemap.xml。組み立てと開発サーバで共有する
- `site-server.mjs`: サイト全体の開発サーバの本体。`dev.mjs` と studio が使う
- `dev.mjs`: `bun run dev` の入口。引数でトークを指定すると、トーク 1 本の作業用サーバに渡す
- `wrangler.jsonc`: Workers の設定 (`dist/` を静的アセットとして配信、`slides.y-kaz.com` に割り当て)
- `dist/`・`.snapshots/`・`.wrangler/`: 生成物 (Git の管理外)
