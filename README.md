# hokuchi

山本一将の発信のためのリポジトリです。考えを磨き、発表や記事として世に出し、出したものを積み上げます。

| 文書 | 中身 |
|---|---|
| `GOALS.md` | 何のために発信し、どうなったら成功とするか。そのために hokuchi が何をするか |
| `BRAND.md` | 「焚き火を愛するエンジニア」として、何を発信し、どう見せるか |
| `CLAUDE.md` | Claude Code と作業するときの約束。ディレクトリとコマンドの一覧もここにある |

## 中身

- `talks/`: 発表資料。公開しているものは https://slides.y-kaz.com/ で見られます
- `articles/note/`: note の記事のアーカイブ
- `packages/stage`: 発表資料のフレームワーク
- `apps/studio`: 発表と記事を作るローカルの制作アプリ
- `apps/slides`: slides.y-kaz.com の組み立て
- `tools/notes`・`tools/eyecatch`: note の記事の取り込み・検査と、見出し画像の下地を作る CLI

各ディレクトリの README に、考え方と使い方があります。設計の正はコードです。

```sh
bun install
bun run studio   # 制作アプリ (http://localhost:5300/)
```
