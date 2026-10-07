# slides.y-kaz.com

`talks/` の公開トーク (`talk.tsx` が `public: true`) を、最新のフレームワークでビルドして組み立て、Cloudflare Workers で配信します (ADR-0027, ADR-0029)。

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

- `build.mjs`: 全トークのビルド、トップページ・404 ページ・sitemap.xml の生成、見た目の差分検査
- `wrangler.jsonc`: Workers の設定 (`dist/` を静的アセットとして配信、`slides.y-kaz.com` に割り当て)
- `dist/`・`.snapshots/`・`.wrangler/`: 生成物 (Git の管理外)
