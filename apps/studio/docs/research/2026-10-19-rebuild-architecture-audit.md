# studio 作り直しの棚卸し (2026-10-19 時点)

studio を作り直す前に、いまの機能・データ・構造を並べた記録です。作り直しの仕様は、1 章の機能の一覧を正にします。読んだだけで、コードもデータも変えていません。行番号は、コミット `0eacea6` 時点のものです。

対象のファイルと行数は次のとおりです。

| 場所 | ファイル | 行数 |
|---|---|---|
| サーバ | `apps/studio/server.mjs` | 702 |
| | `apps/studio/readers.mjs` | 317 |
| | `apps/studio/draft.mjs` | 229 |
| | `apps/studio/threads.mjs` | 174 |
| | `apps/studio/store.mjs` | 119 |
| | `apps/studio/ai.mjs` | 84 |
| | `apps/studio/notes.mjs` | 66 |
| 画面 | `ui/Work.tsx` 551・`ui/Home.tsx` 331・`ui/lib/stages.ts` 338・`ui/talk/Koma.tsx` 297・`ui/note/DraftView.tsx` 303・`ui/note/OutlineView.tsx` 245・`ui/note/NotePublish.tsx` 237・`ui/talk/Reads.tsx` 186・`ui/talk/Flow.tsx` 171・`ui/talk/Threads.tsx` 171・`ui/lib/talk.ts` 144・`ui/note/NoteReads.tsx` 138・`ui/lib/note.ts` 121・`ui/talk/TalkTabs.tsx` 114・ほか | 約 3,300 |
| 接点 | `apps/slides/site-server.mjs` 168・`packages/stage/node/storyboard.mjs` 134・`packages/stage/node/talk.mjs` 42・`tools/notes/src/{lint,paste,render,drafts}.mjs` | |

以下、パスは `apps/studio/` を省きます。

---

## 1. 機能の一覧

### 1.1 画面の振り分け

`ui/main.tsx` が、パスの正規表現で 4 つの画面に振り分けます (4-7 行)。ルータは使っていません。どの画面にも agentation を載せます (10-13 行)。

| URL | 画面 | 中身 |
|---|---|---|
| `/` | `Home` | ネタ帳と、発表・記事の一覧 |
| `/works/<id>` | `Work` | 作品 1 本をタブで進める。タブと場所はハッシュ (`#koma/<scene>`・`#draft/<n>`・`#<段階のkey>`) |
| `/talks/<slug>` | `TalkPage` | 企画シートに紐づいていないトーク。紐づいていれば `/works/<id>` に飛ばす (`ui/talk/TalkPage.tsx:23-25`) |
| `/notes/<dir>` | `NoteView` | アーカイブの公開済みの記事を読む。「改稿する」 |

### 1.2 ホーム (`ui/Home.tsx`)

| 操作 | できること | 画面 | API・ファイル |
|---|---|---|---|
| 一覧を読む | 作品・企画の無いトーク・企画の無い公開記事を 1 つの一覧に並べる | `Works` 251-307 | `GET /api/home` → `server.mjs home()` 213-283 |
| 絞り込み・検索 | 種類・進み具合・公開範囲で絞る。タイトル・タグ・イベントで探す。各タブに件数 | `Works` 252-295 | クライアントだけ |
| 作成 | 「作成」から発表か記事を選んで企画シートを作り、作品の画面に移る | `CreateMenu.tsx`・`start` 24-27 | `POST /api/works` → `store.createWork` 44-54 |
| ネタを書き留める | 「気になったこと」と「なぜ」。Enter で追加 | `Seeds` 174-238 | `POST /api/seeds` → `store.saveSeed` 114-119 |
| ネタから始める | 「発表にする」「記事にする」。ネタの中身を企画の `happening` に写す | `Seeds` 223-228 | `POST /api/works {seedId}` → `store.createWork` 46-52 |
| 下書きのカード | 次にやることを 1 つ出し、該当タブへのボタンを置く | `WorkCard` 67-147 | `home()` の `talkInfo`・`draftInfo` |
| 企画の無い下書きのトーク | 「コマを開く」で `/talks/<slug>` | `DraftTalkCard` 150-171 | |
| 完成・公開のカード | 表紙 (トークは `og.png`、記事は見出し画像) を出す | `CoverCard` 310-331 | `site-server.mjs` 94-102 が表紙を撮る |
| サイトを開く | 本番 `https://slides.y-kaz.com/` を開く | 36-40 | `home().siteUrl` (`talk.mjs SITE`) |

「次にやること」の決め方 (`Home.tsx` 75-96) は、次の順です。

- 発表: 企画が残る → 絵コンテが無い → あなた宛ての指摘 → 読みが 0 回 → コマを読む
- 記事: 企画が残る → 原稿が無い → 構成が無い → 本文が無い → あなた宛て → 読みが 0 回 → 公開。改稿中は、企画と構成を飛ばす

### 1.3 作品の画面の共通部 (`ui/Work.tsx`)

| 操作 | できること | 画面 | API・ファイル |
|---|---|---|---|
| 読み込み | 企画シートと、実物から決めた値 (published・revising・repoFiles・trashDir) | `useBrief` 30-54 | `GET /api/works/<id>` → `workView` 298-302 |
| タイトル | 原稿が無ければ企画シートの `title`、あれば原稿の front matter (`DraftTitle` 300-314) | 114-123 | `PUT /api/works/<id>`、または `PUT /api/drafts/<slug>/meta` → `setDraftTitle` 388-392 |
| 自動保存 | 企画の欄を 600ms 待ってまとめて保存 | `useBrief` 37-52 | `PUT /api/works/<id>` (title・fields・gates だけ) |
| 状態のバッジ | 進み具合と公開範囲 | 113・`status.tsx` 22-36 | クライアントで再計算 |
| 完成にする / 下書きに戻す | `finishedAt` を書く・消す | `Progress` 185-205 | `PUT /api/works/<id> {finishedAt}` → `store.saveWork` 57-64 |
| 公開の手順 | 頼み方の吹き出しを出すだけ | `PublishHowTo` 208-223 | — |
| 削除 (下書きだけ) | 企画シート・外のトーク・記事の原稿をごみ箱へ | `DeleteDraft` 226-262 | `DELETE /api/works/<id>` → `deleteWork` 305-322 → `store.trashWork` 71-86 |
| 改稿をやめる | 改稿の原稿だけをごみ箱へ | `CancelRevision` 265-297 | `DELETE /api/works/<id>/revise` → `store.trashRevision` 92-97 |
| 上の帯 | 伝えたいこと・聴衆 (発表は readers.yaml の人)・Claude に渡す指摘 | `Compass` (`ui/talk/TalkTabs.tsx` 36-69)・151 行 | |
| タブ | 発表: 企画・流れ・コマ・読み・公開。記事: 企画・構成・原稿・読み・公開。読みのタブに「あなた宛て」の数 | `TabBar` (`TalkTabs.tsx` 22-33)・94-96 | |

### 1.4 企画 (発表・記事で共通。段階 1〜4)

定義は `ui/lib/stages.ts` の `STAGES` (115-305) です。画面は `Work.tsx` の `StageNav` 316-333・`StagePanel` 335-369 です。

| 操作 | できること | 場所 |
|---|---|---|
| 欄を書く | 段階ごとの text・textarea・choice の欄 | `FieldInput` 371-397 |
| 聴衆を描く (発表だけ) | 名前のある聴衆を複数。7 つの問い | `Personas` 411-446・`PERSONA_FIELDS` (`stages.ts` 68-111) |
| 確定する | 段階 4 だけ。値を `gates.oneLiner` に写す。値が変われば未確定に戻る | `Confirm` 449-467・`stageStatus` (`stages.ts` 310-326) |
| Claude に頼む | 段階ごとの単発の依頼。候補を企画シートの `candidates` に残す | `AiTasks` 484-550 → `POST /api/works/<id>/ask` (`server.mjs` 491-500) → `ai.mjs ask` 65-84 |
| 案を使う | 候補を欄に入れる (1 文・ゴール・反論) | `applyTarget` 470-481 |
| 段階の状態 | todo・doing・done のアイコン | `stageStatus` |

依頼の種類は `ai.mjs` の `TASKS` (12-44) の 6 つです。`audience.gaps`・`audience.pushback`・`goal.candidates`・`oneLiner.candidates`・`oneLiner.critique`・`title.candidates` (記事の公開タブだけ。原稿を渡す) です。

### 1.5 発表のタブ

| タブ | 操作 | 画面 | API・ファイル |
|---|---|---|---|
| 流れ | 全体の時間・持ち時間との差・章ごとの帯を見る | `ui/talk/Flow.tsx` 10-109 | `GET /api/talks/<slug>/state` → `Workspace.state` 93-125 |
| | シーンの「伝えること」を直す | `SceneCard` 149-155 | `PUT /api/talks/<slug>/meta {key:'伝えること'}` → `replaceSceneMeta` (`storyboard.mjs` 86-104) |
| | シーンの時間を直す (`粗密:` に「中（1 分）」の形で書く) | 117-123 | 同上 `{key:'粗密'}` |
| | 章の中で前後に動かす | 161-168 | `POST /api/talks/<slug>/move` → `moveScene` (`storyboard.mjs` 110-134) |
| | カードの絵 (最初のコマ) | 55 | `GET /api/talks/<slug>/thumb/<scene>-<i>` (メモリの JPEG) |
| コマ | 絵コンテを縦に読む。左に目次、あなた宛ての数 | `ui/talk/Koma.tsx` 13-107 | |
| | 話すことを直す (欄の外で保存) | `KomaRow` 147-192 | `PUT /api/talks/<slug>/note` → `replaceNotes` (`storyboard.mjs` 65-80) |
| | 絵を押して動きを再生。← → で前後 | `Player` 251-297 | サイトの開発サーバのトークを iframe で開き、`postMessage({type:'stage:goto'})` |
| | 絵の作り方を出す切り替え | 91-93・181-186 | |
| | シーン・コマに指摘を書く・返信・閉じる・開き直す | `Margin` 195-225・`ui/talk/Threads.tsx` | `POST /api/talks/<slug>/threads`・`threads/<id>/(reply|close|reopen)` → `threads.mjs` |
| 読み | 聴衆役に読んでもらう (数分。進み具合を出す) | `ui/talk/Reads.tsx` 46-49 | `POST /api/talks/<slug>/read` → `Workspace.read` 133-151 → `readers.runRead` 179-213 → `threads.importRead` 139-174 |
| | アンケートの表・理由・前回比。回を選ぶ | `Survey` 92-186 | `reads/NNN.yaml` |
| | あなた宛ての指摘を一覧で返す | 57-72 | 同上 |
| | 読み手を選ぶ | 無い (readers.yaml を手で書く) | — |
| 公開 | 最初から再生・発表者ビューを別タブで開く | `PublishView` (`TalkTabs.tsx` 90-114) | `stageUrl` |

### 1.6 記事のタブ

原稿の置き場は `<HOKUCHI_PRIVATE>/notes/<slug>/` です。API は `/api/drafts/<slug>/<操作>` (`server.mjs` 504-587) に集まっています。

| タブ | 操作 | 画面 | API・ファイル |
|---|---|---|---|
| (原稿が無いとき) | slug を決めて原稿を作る | `CreateDraft` (`ui/note/DraftView.tsx` 261-303) | `POST /api/works/<id>/draft` (`server.mjs` 478-490) → `draft.createDraft` 224-229 |
| 構成 | 見出しのカードを足す・消す・並べ替える・粗密・予算・伝えること | `ui/note/OutlineView.tsx` 15-99・`SectionCard` 165-245 | `PUT /api/drafts/<slug>/outline` → `draft.saveOutline` 135-138 (丸ごと書き換え) |
| | 原稿の見出しから作る・取り込む | `mergeFromDraft` 102-107 | 同上 |
| | 実際の字数と予算の帯・密の割合・粗の太りすぎ | `Band` 110-143 | `draft.sectionChars` 103-110 |
| 原稿 | 段落ごとに本文を直す (欄の外で保存。空で削除) | `Row` (`DraftView.tsx` 133-182) | `PUT /api/drafts/<slug>/block {n, orig, text}` → `draft.replaceBlock` 188-200 (orig が違えば 409) |
| | 末尾に段落を足す | `AddParagraph` 217-258 | `POST /api/drafts/<slug>/append` → `draft.appendBlock` 203-209 |
| | 段落ごと・記事全体の lint を出す | `Checks` 198-214 | `draft.lintBlocks` 69-77 → `tools/notes/src/lint.mjs lintDraft` |
| | 見出しの目次・あなた宛ての数 | 34-43・84-88 | |
| | 段落・記事全体への指摘のスレッド | `Margin` (発表のコマから借用) | `POST /api/drafts/<slug>/threads {para}`・`threads/<id>/…` |
| | 画像の段落に絵を出す | `ImagePreview` 185-189 | `GET /api/drafts/<slug>/assets/…` (514-520) |
| 読み | 読み手を personas/ から選ぶ | `ChooseReaders` (`ui/note/NoteReads.tsx` 114-138) | `PUT /api/drafts/<slug>/readers` → `readers.saveReaders` 314-317 |
| | 読んでもらう・アンケート・あなた宛て | `NoteReadsView` 15-111 (`Survey` は発表から借用) | `POST /api/drafts/<slug>/read` → `readDraftByReaders` 369-385 → `readers.runNoteRead` 274-311 |
| 公開 | タイトルを直す・Claude に 3 案を出させる | `TitleCard` (`ui/note/NotePublish.tsx` 41-93) | `PUT …/meta`・`POST /api/works/<id>/ask {task:'title.candidates'}` |
| | タグ (3〜5 個) | `TagsCard` 96-122 | `PUT …/meta {tags}` → front matter の `hashtags` |
| | 見出し画像を選ぶ・Finder で assets を開く | `EyecatchCard` 125-159 | `PUT …/meta {eyecatch}`・`POST …/open-assets` |
| | note に貼る本文をコピー | `PasteCard` 162-204 | `GET …/paste` → `tools/notes/src/paste.mjs toPasteText` |
| | 公開後の依頼文をコピー | `AfterCard` 207-237 | — |

### 1.7 公開済みの記事 (`ui/NoteView.tsx`)

| 操作 | できること | API |
|---|---|---|
| 読む | note 風に描画 | `GET /api/notes/<dir>` → `notes.readNote` 43-58 (`tools/notes/src/render.mjs renderBody`) |
| note で開く | `note_url` | — |
| 改稿する | アーカイブを原稿に写し、企画シートを作るか紐づけて原稿タブへ | `POST /api/notes/<dir>/revise` (`server.mjs` 589-602) → `draft.reviseFromArchive` 172-181 |

### 1.8 Claude に渡す

画面から Claude Code を直接は呼びません。「Claude に渡す指摘 n 件」で依頼文をコピーし、話者がターミナルに貼ります (`ui/talk/Handoff.tsx` 15-45)。依頼文は発表が `handoffText` (`ui/lib/talk.ts` 136-144)、記事が `draftHandoffText` (`ui/lib/note.ts` 98-106) です。

`claude -p` を呼ぶのは 2 か所です。企画の「Claude に頼む」(`ai.mjs`、cwd はリポジトリ) と、聴衆役の読み (`readers.mjs`、cwd は一時ディレクトリ) です。

### 1.9 裏で動くもの

| もの | 場所 | 中身 |
|---|---|---|
| サイト全体の開発サーバ | `server.mjs` 35-43 → `site-server.mjs startSite` 25-124 | 起動時に `talks/` と `<PRIVATE>/talks/` の全トークの Vite を立てる |
| 縮小画像の撮影 | `Workspace.shoot` 153-178 | Playwright で `?shot=all` を開き、`[data-frame]` を JPEG でメモリに持つ |
| トークの監視 | `Workspace` 76-89 | トークのディレクトリを再帰で監視。絵に関わるファイルなら撮り直す |
| 原稿の監視 | `watchDraft` 327-339 | 原稿のディレクトリを再帰で監視し、`draftState` を送る |
| 表紙の撮影 | `site-server.mjs shootCover` 65-75 | `og.png` を初回に撮ってメモリに持つ |
| 検査 | `Workspace.check` 180-190・`POST …/check` | `packages/stage/cli.mjs check` を起動。画面からは呼ばれていない |

---

## 2. データのモデル

### 2.1 置き場

| もの | 置き場 | 正 / 派生 | 読み書き |
|---|---|---|---|
| 企画シート | `<PRIVATE>/works/<id>/brief.yaml` | 正 | `store.mjs` 25-64 |
| ネタ | `<PRIVATE>/seeds/<id>.yaml` | 正 | `store.mjs` 100-119 |
| 公開予定・公開のトーク | `talks/<YYYY_MM_DD_タグ_演題>/` | 正 | stage・`site-server.mjs` |
| 非公開のトーク | `<PRIVATE>/talks/<名前>/` | 正 | 同上 (`outside: true`) |
| 絵コンテ | `<トーク>/storyboard.md` | 正 (話すことの正本。ADR-0028) | `storyboard.mjs` |
| トークの定義 | `<トーク>/talk.tsx` | 正 (slug・public・title・date・event) | `site-server.mjs mountTalk` 130-163 |
| 指摘のスレッド | `<トーク>/feedback.yaml`・`<原稿>/feedback.yaml` | 正 | `threads.mjs` |
| 古い指摘 | `<トーク>/archive/feedback-2026-10-12.yaml` | 記録 (ADR-0040) | 読まない |
| 読み手 | `<トーク>/readers.yaml`・`<原稿>/readers.yaml` | 正 | `readers.mjs` 65-68・314-317 |
| 読みの結果 | `<トーク>/reads/NNN.yaml`・`<原稿>/reads/NNN.yaml` | 正 (追記だけ) | `readers.mjs` 200-212・305-310 |
| ペルソナ | `personas/<id>.yaml` (12 人) | 正 | `readers.listPersonas` 55-62 |
| 原稿 | `<PRIVATE>/notes/<slug>/index.md`・`assets/` | 正 | `draft.mjs` |
| 構成 | `<PRIVATE>/notes/<slug>/outline.yaml` | 正 | `draft.mjs` 123-138 |
| アーカイブ | `articles/note/<YYYY-MM-DD>-<slug>/` (`source.json` が正、`index.md` は生成物) | 正 | `notes.mjs` (読むだけ)・`tools/notes` |
| ごみ箱 | `<PRIVATE>/trash/…` | 退避 | `store.trashWork`・`trashRevision` |
| 縮小画像・表紙 | メモリ | 派生 | `Workspace.thumbs`・`site-server` の `t.og` |
| 検査の報告 | `<トーク>/out/check.md` | 派生 | `packages/stage` |

`PRIVATE` の既定値は 2 か所で同じものを定義しています (`store.mjs` 14・`tools/notes/src/drafts.mjs` 16)。

### 2.2 企画シート (brief.yaml) の欄

| 欄 | 型 | 書くもの |
|---|---|---|
| `id` | `YYYY-MM-DD-xxxx` | `store.newId` 19 |
| `kind` | `talk` / `note` | 作成時に固定 |
| `title` | 文字列 | 原稿があるあいだは front matter の `title` に揃える (`setDraftTitle`) |
| `createdAt`・`updatedAt` | ISO 文字列 (YAML では引用符なしのタイムスタンプ) | |
| `seedId` | id / null | |
| `talk` | トークの URL の slug (talk.tsx の `slug`。例 `2026-10-31-komekaigi`) | ディレクトリ名ではない |
| `note` | 原稿の slug | アーカイブは `dir.slice(11) === note` で引く |
| `finishedAt` | ISO | 「完成にする」。null が来たら消す (`store.saveWork` 61) |
| `gates.oneLiner` | `{passedAt, value}` | 確定した 1 文 |
| `candidates.<task>` | `{at, items:[{text, note}]}` | 依頼ごとに最新 1 回分 |
| `fields` (発表) | `event`・`eventUrl`・`date`・`duration`・`venue`・`stance` (個人/MOSH)・`publish` (公開する/社内向け/未定)・`materials`・`personas[{name, who, why, trouble, solve, action, pushback, approach}]`・`callToAction`・`relation` (ヒーロー/応援団長)・`oneLiner` | `stages.ts` 129-272 |
| `fields` (記事) | `happening`・`genre` (情報/日記/主張)・`materials`・`readerWho`・`readerTrouble`・`readerKnows`・`afterFeeling`・`takeaway` (知識/視点/行動)・`oneLiner` | 同上 |

いまある企画シートは 4 本です。発表 2 (うち 1 本は外のトークに紐づき完成)、記事 2 (1 本は `note` に紐づくが原稿は改稿をやめて空、1 本は欄が空)。ネタは 0 件です。

### 2.3 その他のファイルの形

- 原稿の front matter: `title`・`hashtags`・`eyecatch`・`revises` (改稿のとき、アーカイブのディレクトリ名)。改稿ではアーカイブの front matter (`note_url`・`published_at` など) をそのまま写す
- `outline.yaml`: `sections[{title, point, grain: 密|粗, budget}]`。先頭は必ず「冒頭」(`draft.readOutline` 130)
- `feedback.yaml`: `threads[{id: tNNN, scene, state? | para, head?, by: 話者|聴衆役|Claude|検査, name?, read?, kind?, text, at, replies[{by, text?, thinking?, change?, at?}], ball: 話者|Claude|none, closed?: 直した|そのままにした|良かった点|読み直した}]`。頭書きのコメントは発表と記事で別 (`threads.mjs` 9-25)
- `readers.yaml`: `readers[{persona, why?}]`
- `reads/NNN.yaml`: `{id, at, scenes, states | paragraphs, readers[{persona, name, label, scores{key:{score, reason}}, message, wish, notes[{scene, state} | {para, head}, kind, text]}], failed[]}`

### 2.4 何が正で、何が派生か

同じ意味のものに、正が複数あるところがあります。

| 意味 | 置き場 | 画面が使うもの |
|---|---|---|
| タイトル | brief の `title`・原稿の `title`・talk.tsx の `title`・絵コンテの `# 見出し` | ホームは `work.title \|\| talk.title \|\| note.title` (`server.mjs` 255)。TalkPage は `board.title \|\| talk.title` (`TalkPage.tsx` 39) |
| 伝えたいこと | brief の `fields.oneLiner`・絵コンテの `中核メッセージ:` | 作品の画面は brief。企画の無いトークは絵コンテ (`TalkPage.tsx` 45)。読みの比較は `work.oneLiner \|\| 中核メッセージ` (`Reads.tsx` 54) |
| 聴衆 | brief の `fields.personas` (7 つの問い)・`readers.yaml` (プリセット) | 上の帯は readers.yaml の人 (`Work.tsx` 151)。記事の作品では上の帯に読み手が出ない (`data?.readers` は発表のデータだけ) |
| 公開する意思 | brief の `fields.publish`・talk.tsx の `public`・置き場 (外か中か) | 公開範囲は talk.tsx の `public` と置き場だけで決まる。`fields.publish` はどこにも効かない |
| 日付・イベント | brief の `fields.date`・`event`・talk.tsx | ホームはトークを優先 (`server.mjs` 256-257) |

### 2.5 状態がどこで決まるか

| 状態 | 決め方 | 場所 |
|---|---|---|
| 公開範囲 | 発表は `talk.info.public` (外のトークは常に false)。記事はアーカイブに `<日付>-<note>` があるか | `server.mjs` 248 (ホーム)・289 (`isPublished`)・`site-server.mjs` 131 |
| 進み具合 | 改稿中なら下書き。公開なら完成。`finishedAt` があれば完成 | `server.mjs` 253 (ホーム)・`Work.tsx` 113 (クライアントで再計算) |
| 改稿中 | 公開の記事で、原稿があるか | `server.mjs` 249 (ホームは `draftInfo` の有無)・301 (`workView`)・`Home.tsx` 68 (`visibility === 'public'` から推す)・`status.tsx` 26 |
| 削除できるか | 公開でなく、`finishedAt` も無い | `server.mjs` 306・`Work.tsx` 137-141 |
| 段階の状態 | 欄の埋まり具合と `gates` | `stages.ts stageStatus` 310-326 |
| 指摘の番 | `ball` | `threads.mjs`・`ui/lib/talk.ts` 123-125 |

---

## 3. サーバの構造

### 3.1 ルーティング

`server.mjs` の `request` ハンドラ 1 つ (434-682、約 250 行) に、if と正規表現の連なりで全 API を書いています。

| パス | 行 | 備考 |
|---|---|---|
| `GET /api/home` | 437 | 毎回、全トークの絵コンテ・全作品・全スレッド・全アーカイブ (44 本の index.md) を読む |
| `GET /api/events?talk=\|note=` | 438-448 | 接続すると `workspace()` か `watchDraft()` を立てる副作用がある |
| `POST /api/works` | 450-453 | |
| `GET/PUT/DELETE /api/works/<id>` | 460-471 | PUT は `published`・`repoFiles`・`trashDir` を捨てるが、`revising` は捨てない (462) |
| `DELETE /api/works/<id>/revise` | 473-476 | |
| `POST /api/works/<id>/draft` | 478-490 | |
| `POST /api/works/<id>/ask` | 491-500 | |
| `POST /api/seeds` | 502 | |
| `/api/drafts/<slug>/…` 12 種 | 504-587 | `state` と `paste` はメソッドを見ない |
| `POST /api/notes/<dir>/revise` | 589-602 | |
| `GET /api/notes/<dir>[/assets…]` | 604-616 | |
| `/api/talks/<slug>/…` 10 種 | 618-677 | `check`・`shoot` は画面から呼ばれていない |
| それ以外 | 678 | UI の Vite |

### 3.2 責務の混ざり方

`server.mjs` 1 ファイルが、次をすべて持っています。

- プロセスの起動と終了 (35-43・684-702)。Playwright の Chrome とサイトの開発サーバ
- トークの作業場 `Workspace` (58-200)。監視・撮影・読み・検査・絵コンテの書き換え・画面に渡す状態の組み立て
- ホームの一覧の組み立てと、状態の導出 (213-283)
- 作品の見せ方・削除・公開の判定 (286-322)
- 原稿の監視・状態の組み立て・読み・タイトルの同期 (326-408)
- UI の Vite (413-421)
- HTTP の小道具 (`json`・`body`) と全 API

ドメインの規則 (削除できる条件・改稿中の判定・slug の重複) が、HTTP のハンドラの中に直に書かれています (例: 482-484・474)。

### 3.3 Workspace と原稿で、同じ仕組みを 2 通りに書いている

| 仕組み | 発表 | 記事 |
|---|---|---|
| 作業場 | `class Workspace` (58-200)。`workspaces` の Map | 関数と 2 つの Map (`draftWatchers` 326・`draftReading` 369) |
| 監視 | 76-89。絵に関わるかで待ち時間を変える | 327-339 |
| 状態の組み立て | `Workspace.state` 93-125 | `draftState` 344-366 |
| 読み | `Workspace.read` 133-151 | `readDraftByReaders` 369-385 |
| 通知の宛先 | `slug` | 文字列 `"note:<slug>"` (334・441) |
| 読み手とペルソナの結合 | 105-108 | 358-360 |
| スレッドの API | 636-651 | 568-585 (ほぼ同じ 18 行) |
| 画像の配信 | — | 514-520 と、公開記事の 611-615 で content-type の表を 2 回書く |

### 3.4 SSE

- 接続ごとに `{res, slug}` を持ち、`broadcast(slug, type, data)` で同じ宛先に送ります (50-54)
- イベントは `board`・`thumbs`・`reading`・`check` (発表)、`draft`・`reading` (記事) です。`check` と、`thumbs` の `errors` は画面が使っていません (`ui/lib/talk.ts` 85-91)
- ホームには通知がありません。ファイルが変わっても、ホームは読み直すまで古いままです
- 毎回、状態をまるごと送ります。発表なら絵コンテ全体・全スレッド・全読み、記事なら本文・lint・全スレッド・全読み・ペルソナ全員です

### 3.5 寿命の扱い

- `Workspace` は、一度開いたら閉じません。Playwright のページと再帰の監視が、プロセスが終わるまで残ります (202-210)。閉じるのは、外のトークの下書きを削除したときと終了時だけです (311-314・696)
- 原稿の監視は、削除のときだけ閉じます (318-319)。改稿をやめたとき (473-476) は閉じないので、ごみ箱に移したディレクトリの監視が残ります
- 全トークの Vite を起動時に立てます (`site-server.mjs` 37-42)。トークを足したら studio の再起動が要ります (design.md 7 章も認めている)

### 3.6 claude -p の呼び出し

同じ処理を 2 回書いています。`ai.mjs ask` 65-84 と `readers.mjs ask` 145-162 です。違いは cwd (リポジトリか一時ディレクトリか) と、エラーに名前を付けるかだけです。タイムアウトも同時実行の上限もありません。聴衆役は全員を `Promise.all` で同時に走らせます (`readers.mjs` 189・283)。

### 3.7 巨大な関数・重いところ

- `request` ハンドラ: 約 250 行 (434-682)
- `home()`: 70 行 (213-283)。作品・トーク・記事の結合、状態の導出、並びを 1 つの関数でする
- `readers.mjs` の `buildPrompt` (97-138) と `buildNotePrompt` (229-268): 言葉だけが違う 40 行ずつ
- `runRead` (179-213) と `runNoteRead` (274-311): 同じ骨組み
- `AiTasks` は候補のラベルを得るためだけに `api.home()` を呼びます (`Work.tsx` 488-490)

### 3.8 入力と書き込み

- `body()` は JSON を `end` のハンドラの中で読みます (427-432)。壊れた JSON が来ると、例外が try の外に出てプロセスが落ちる可能性があります (未検証)
- 書き込みの競合の扱いが、ファイルごとにまちまちです

| 書き込み | 競合の扱い |
|---|---|
| 原稿の段落 | 読んだときの段落と比べ、違えば 409 (`draft.replaceBlock` 193) |
| 構成 | 丸ごと上書き (`saveOutline`)。Claude Code が同時に直すと消える |
| 話すこと | 該当コマだけ置き換え。古い画面の値で上書きしうる |
| スレッド | 読んで直して書く。同時に書くと後勝ち |
| 企画シート | 画面が手元の title・fields・gates をまとめて送る。原稿のタイトルを直したあとに企画の欄を直すと、古い title で企画シートを上書きする可能性がある (`Work.tsx` 45 と `setDraftTitle` の組み合わせ。未検証) |

---

## 4. 画面の構造

### 4.1 コンポーネントの分け方

```
main.tsx ── Home.tsx ─ CreateMenu・Seeds・Works・WorkCard・DraftTalkCard・CoverCard
         ├─ Work.tsx ─ useBrief・Progress・PublishHowTo・DeleteDraft・CancelRevision・DraftTitle
         │            StageNav・StagePanel・FieldInput・Example・Personas・Confirm・AiTasks
         │            ├─ talk/TalkTabs.tsx ─ TabBar・Compass・TalkPane・PublishView
         │            │   ├─ talk/Flow.tsx・talk/Koma.tsx (Margin・ReaderNote・Player)・talk/Reads.tsx (Survey)
         │            │   └─ talk/Threads.tsx (Compose・NewThread・ThreadCard)・talk/Handoff.tsx
         │            └─ note/DraftView.tsx・note/OutlineView.tsx・note/NoteReads.tsx・note/NotePublish.tsx
         ├─ talk/TalkPage.tsx (TalkTabs を再利用)
         └─ NoteView.tsx
```

- 共有部品が `talk/` の下にあります。記事の画面は `talk/Koma.tsx` の `Margin`、`talk/Reads.tsx` の `Survey`、`talk/Threads.tsx`、`talk/Handoff.tsx` を借りています (`note/DraftView.tsx` 11・`note/NoteReads.tsx` 9-11)
- スレッドの型 `Thread` も `ui/lib/talk.ts` (10-26) にあり、記事の位置 (`para`・`head`) を後から足しています
- `Work.tsx` は、企画の画面の部品・作品の帯の操作・タブの振り分けを 1 ファイルに持ちます (551 行)

### 4.2 kind の分岐

`kind === 'talk' / 'note'` に当たる分岐は 37 か所です (`Work.tsx` 17・`server.mjs` 9・`Home.tsx` 5・`stages.ts` 3・`ai.mjs` 1)。目立つものは次のとおりです。

- タブの決め方: `Work.tsx` 94・96。96 行は「記事なら記事のタブ、発表なら絵コンテのデータがあって企画・原稿・構成でなければ」という 1 行の入れ子の三項演算子です
- 本体の振り分け: `Work.tsx` 153-176。記事の分岐の中に、さらにタブの分岐がある
- 帯の右: `Work.tsx` 151。`data` があれば発表の Handoff、`draft` があれば記事の Handoff
- 次にやること: `Home.tsx` 76-96 の 7 段の三項演算子
- 企画の聴衆: `Work.tsx` 355 (発表だけ別の画面)・`stages.ts` 318・333
- 案の入れ先: `Work.tsx` 473-474

### 4.3 状態の持ち方

- グローバルな状態管理はありません。画面ごとに `useState` と `useEffect` で取得します
- 作品の画面は、企画シート (`useBrief`)・トーク (`useTalk`)・原稿 (`useDraft`) の 3 つを別々に取ります (`Work.tsx` 77-89)。3 つは別々の時点の値で、同じ値 (タイトル・伝えたいこと) を別々に持ちます
- ハッシュの読み方を 2 回書いています (`Work.tsx readHash` 69-74・`TalkPage.tsx read` 9-12)
- 画面の移動は `location.href` で全体を読み直します (`api.ts go` 61-63・`Work.tsx` 234・273-274・`NoteView.tsx` 17)
- 書き込みのあとは、サーバの監視から SSE で届く状態を待ちます。企画シートだけは監視が無く、手元の値が正です

### 4.4 API の型

- サーバは JS で、画面の型は手書きです (`ui/lib/api.ts`・`talk.ts`・`note.ts`)。ずれが見つかります
  - `home()` が送る `open` (`server.mjs` 228) は型に無い
  - `Talk.loadError`・`scenes[].steps`・`talk.outside`・`talk.name` は画面で使われていない
  - `thumbs` の `errors` を画面が捨てるので、撮影の失敗が話者に見えない
- fetch の包みが 3 種類あり、失敗の扱いが違います
  - `api.ts call` (32-41): 失敗で例外
  - `talk.ts send` (52): 失敗を見ない
  - `note.ts send` (44-48): 失敗で例外
- `Persona` という名前の型が 2 つあります。`stages.ts` 5-14 (企画の 7 つの問い) と `talk.ts` 31 (プリセット) です
- `studio` の型検査は、ルートの `bun run typecheck` に入っていません (`package.json` の typecheck は `packages/stage` だけ)

### 4.5 共有部品

- shadcn/ui の部品は 13 個あり、使っているのは badge・button・card・input・label・popover・tabs・textarea の 8 個です。alert・radio-group・scroll-area・separator・tooltip は使われていません
- 同じ見た目を各所で手書きしています。「あなた宛て n 件」の琥珀色の丸 (`TalkTabs.tsx` 28・`Flow.tsx` 131・`Koma.tsx` 81・`DraftView.tsx` 124・`Reads.tsx` 60・`NoteReads.tsx` 82)、「欄の外を押すと保存」の textarea (`Flow.tsx` 149・`Koma.tsx` 173・`DraftView.tsx` 160・`OutlineView.tsx` 191・201)、コピーして「コピーしました」(`Handoff.tsx` 31-41・`NotePublish.tsx` 169-175・223-233)

---

## 5. つぎはぎの箇所

### 5.1 同じことを 2 通りでやっている

| こと | 1 つ目 | 2 つ目 |
|---|---|---|
| 状態の取得と購読 | `useTalk` (`lib/talk.ts` 71-95) | `useDraft` (`lib/note.ts` 71-95) |
| 操作の API | `talkApi` (`lib/talk.ts` 55-65) | `draftApi` (`lib/note.ts` 51-67) |
| 依頼文 | `handoffText` (`lib/talk.ts` 136-144) | `draftHandoffText` (`lib/note.ts` 98-106) |
| 読みの面 | `ReadsView` (`talk/Reads.tsx` 17-89) | `NoteReadsView` (`note/NoteReads.tsx` 15-111)。ほぼ写し。`when` も 2 回定義 |
| 指摘の位置の言葉 | `where` (`lib/talk.ts` 128-131) | `placeOf` (`lib/note.ts` 113-118) |
| 読みの実行 | `runRead`・`buildPrompt` | `runNoteRead`・`buildNotePrompt` |
| アンケート | `SURVEY` | `NOTE_SURVEY` (key が 1 つだけ違う。`glance` と `hook`) |
| claude -p | `ai.mjs ask` | `readers.mjs ask` |
| 秒の読み取り | `storyboard.mjs seconds` 56-62 | `lib/talk.ts parseGrain` 99-104 |
| 作り手の覚え書きを外す正規表現 | `readers.mjs MEMO` 81 | `lib/talk.ts spokenSeconds` 108 |
| 状態の導出 | `server.mjs` 247-253・298-302 | `Work.tsx` 113・`Home.tsx` 68 |
| アーカイブを slug で引く | `server.mjs` 286・484 | `draft.mjs` 173 (`.slice(11)` が 3 か所) |
| PRIVATE の既定値 | `store.mjs` 14 | `tools/notes/src/drafts.mjs` 16 |

### 5.2 名前の不一致・衝突

- 発表 / トーク / talk: 画面は「発表」、コードとファイルは talk、設計書は「トーク」。`Brief.talk` はディレクトリ名ではなく URL の slug
- 記事 / note / draft / 原稿 / article: `Brief.note` は原稿の slug。`notes.mjs` は公開済みのアーカイブ。`/notes/<dir>` は公開済みを読む画面、`/api/drafts/<slug>` は原稿、`/api/notes/<dir>/revise` は改稿の入口。`NoteView` は公開済み、`NoteReadsView`・`NotePublishView` は原稿のタブ。`apps/studio/draft.mjs` と `tools/notes/src/drafts.mjs` は別物
- note の意味が 3 つあります。記事 (note.com)・話すこと (`storyboard` の `notes`)・聴衆役の感想 (`reads` の `notes`、`NOTE_KINDS`)。`NOTE_KINDS` は記事ではなく感想の種類です (`readers.mjs` 40)
- draft の意味が 3 つあります。進み具合の下書き (`progress: 'draft'`)・原稿のタブ (`tab: 'draft'`)・原稿のデータ (`Draft` 型)
- コマの番号の始まりが揃っていません。スレッドの `state` は 1 始まり (0 はシーン全体)、`replaceNotes` と `PUT …/note` は 0 始まり、`Player` の `pick.state` は 0 始まり
- 全体を指す値: 発表は `scene: '*'`、記事は `para: '*'`
- `gates` (コード) / 確定 (画面) / 関門 (ADR-0036)
- 読み手 (`readers`) と、読みの結果の中の 1 人 (`Reader` 型) が同じ語

### 5.3 後から足した例外

- 改稿中 (`revising`): ADR-0047 で「公開は完成」に例外を足しました。判定が 4 か所 (2.5 の表) にあり、`StateBadges` (`status.tsx` 26)・`WorkCard` の次にやること (`Home.tsx` 77・81・89)・帯の操作 (`Work.tsx` 137-147) で個別に扱います。`WorkCard` は `visibility === 'public'` を「改稿中」と読み替えています (`Home.tsx` 68)
- 公開した記事のカードは、作品があっても `/notes/<dir>` (読む画面) を開きます (`Home.tsx` 313)。発表は作品の画面を開くので、記事だけ企画・読みの記録に戻る道がありません (改稿すれば戻れる)
- 企画の無いトークは `/talks/<slug>` の別画面で、企画の無い記事の下書きは存在しえません。紐づかないものの扱いが媒体で違います
- 読み手を画面で選べるのは記事だけで、発表は `readers.yaml` を手で書きます (design.md 8 章も認めている)
- 公開のタブは、記事は中身があり、発表は再生のリンクだけです (`TalkTabs.tsx` 90-114)
- 削除の対象: 外のトークは作業場と Vite を止めてから移し (`server.mjs` 310-315)、リポジトリのトークには触らない
- ごみ箱の名前の付け方が 4 通りあります。`<日時>-<id>/works/…` (`store.trashWork` 73)・`<日時>-revise-<slug>/notes/<slug>` (`trashRevision` 93)・`<日時>-notes-<slug>/` (公開タブの依頼文 `NotePublish.tsx` 213・218 と writing-note SKILL.md 249)・実データにある `…-drafts-<slug>`・`manual-cleanup-…`
- 段階 5〜10 の定義 (`stages.ts` 276-305、`later: true`) は、ADR-0040 でタブに置き換えたあとも残っています。`stageStatus` と `PLAN` で毎回除いています

### 5.4 死んだコード・使われていない値

- `POST /api/talks/<slug>/check`・`shoot` と `Workspace.check` (180-190)。画面から呼ばれていない
- SSE の `check` イベント、`thumbs` の `errors`、状態の `loadError`
- `server.mjs` 442 の `ws` (使わないが、作業場を立てる副作用のために呼んでいる)
- `home()` の `open` (228)
- `fields.publish` (企画の「資料を公開しますか」)。どこにも効かない
- `package.json` の `cn` (shadcn の CLI が入れたもの。README 37 行も注意している)
- 使われていない shadcn の部品 5 個

### 5.5 ADR・文書と実装のずれ

- `README.md` が古いままです。`claude.mjs` とチャットの説明 (41-42 行)、ホームの「作っているもの」「新しい発表」(29 行)、`/talks/<slug>` を編集画面と書いている (35 行)
- `design.md` 77 行と `ui/lib/stages.ts` 19 行が、原稿の置き場を `articles/note/drafts/` と書いています (ADR-0046 で `<PRIVATE>/notes/` に移った)
- crafting-presentation の SKILL.md が、ホームの「作っているもの」(142 行) と「別窓で再生」(163 行) を書いています
- ADR-0039 の「集計では、直せば済むことと、話者の材料や判断が要ることを分けて出す」「人に見せた反応や当日の反応も同じ形で入れる」は未実装です
- ADR-0036 の 10 段階と関門は、段階 4 の 1 つだけが残っています
- ADR-0046 の「構成を AI に出してもらう」は未実装です (design.md 8 章が認めている)
- ADR-0047 の「取り込みが済んだら、原稿は trash に移す」は手作業で、移し先の名前が実装 (`trashRevision`) と食い違います

---

## 6. テストと、守るべき振る舞い

### 6.1 テストの有無

- `apps/studio`: テストはありません。型検査もルートの `typecheck` に入っていません
- `packages/stage/node/storyboard.mjs`: テストはありません。studio の書き換え (`replaceNotes`・`replaceSceneMeta`・`moveScene`) はここに頼っています
- `tools/notes`: `test/check.mjs` (288 行、assert だけ) があります。lint・paste・verify・パーサを検査します。studio が使う `lintDraft`・`toPasteText`・`renderBody` は、ここで守られています

作り直しの前に、次の振る舞いを固定するテストを先に書くのが安全です。

### 6.2 壊すと困るファイル形式

Claude Code と skill が同じファイルを直接読み書きするので、形を変えると skill の側も壊れます。

| ファイル | 守ること | 頼っている側 |
|---|---|---|
| `brief.yaml` | 欄の名前 (2.2)。`talk` はトークの URL の slug、`note` は原稿の slug。`finishedAt` の有無が完成。日時は ISO 文字列 | writing-note SKILL.md 74 (段階の欄名を読む) |
| `storyboard.md` | 見出し・`キー: 値`・`1.`・`>` の形。書き換えは行単位で、ほかの行を変えない | crafting-presentation・stage の流し込み (ADR-0028) |
| `feedback.yaml` | 頭書きのコメントと並びを保つ (YAML の文書のまま書き戻す。`threads.mjs` 37-53)。`ball`・`closed`・`by` の日本語の値。id は `tNNN` の連番。発表は `scene`/`state` (1 始まり)、記事は `para`/`head` | 両 skill の Phase 8・7、`references/audience-review.md` |
| `readers.yaml` | `readers[{persona, why}]` | crafting-presentation SKILL.md 138 |
| `reads/NNN.yaml` | 3 桁の連番、追記だけ。前回比はこの順で出す | 画面の前回比 |
| `outline.yaml` | 先頭は「冒頭」。`grain` は 密 / 粗 だけ | writing-note SKILL.md 137 |
| 原稿の `index.md` | front matter は公開済み記事と同じ形。`revises` | `tools/notes` の lint・paste・sync |
| `personas/*.yaml` | `id`・`name`・`label`・`who`・`troubles`・`knows`・`pushback`・`knows_speaker` | 読みの依頼文 |
| アーカイブ | 読むだけ。`index.md` は生成物 (ADR-0019) | `tools/notes` |

### 6.3 守るべき振る舞い

- 段落の番号の数え方: 空行で区切り、コードの囲みは 1 つにまとめ、見出し・画像も 1 つと数える (`draft.splitBlocks` 26-56)。書き出しは空白を除く先頭 20 字 (`headOf` 20)
- 指摘の付け直し: 番号の書き出しが同じならそのまま、違えば同じ書き出し、次に先頭 8 字、無ければ記事全体 (`draft.reanchor` 215-221)。画面で直した段落の指摘は、新しい書き出しで持ち直す (`server.mjs` 528)
- 段落の保存は、読んだときの段落と同じときだけ (`replaceBlock` 193)
- 聴衆役の取り込み: 良かった点は済んだ件にする。前の読みの Claude の番の感想は「読み直した」で閉じ、話者の番は残す (`threads.importRead` 139-174)
- 聴衆役は、リポジトリの文脈を拾わないよう一時ディレクトリで起動する (`readers.mjs` 147)。読み手ごとに 12 件まで。絵コンテに無いシーンへの感想は全体に寄せる
- 公開範囲は実物から決め、企画シートに書かない (ADR-0043・0045)。外のトークは `public: true` でも非公開
- 削除はごみ箱への移動で、リポジトリの中のファイルには触らない。完成と公開は削除できない (サーバも断る)
- 改稿はアーカイブを書き換えない。同じ記事の原稿があれば、それを開く (`reviseFromArchive` 175)
- 原稿のタイトルを直すと、企画シートの `title` も揃える
- 時間の見積もりは 1 分 300 字。話者の時間は `粗密:` に入る
- 画面と依頼文に出すトークの場所は、リポジトリの中なら相対、外なら絶対パス (`server.mjs` 46)
- 作品のタブと場所は URL のハッシュに持つ (agentation のメモが場所ごとに分かれる)
- 環境変数 `HOKUCHI_PRIVATE`・`HOKUCHI_STUDIO_PORT`・`HOKUCHI_SITE_PORT`。studio と `bun run dev` は 5280 を取り合う

---

## 作り直しで解くべき構造の問題 (重要な順)

1. 作品が 1 つの実体になっていない。作品の中身が、企画シート・トークのディレクトリ・原稿のディレクトリ・アーカイブの 4 か所にまたがります。紐づけは slug の文字列の突き合わせ (`dir.slice(11)` など) です。進み具合・公開範囲・改稿中の導出も、サーバ 3 か所とクライアント 3 か所に散っています。作品を 1 つに束ねて状態を導く層をサーバに 1 つだけ置き、画面は導いた結果を表示するだけにすると良いと考えています
2. 発表と記事を並べて 2 本ずつ書いている。API・状態の組み立て・購読・読みの実行と依頼文・読みの面・依頼文が、媒体ごとに写してあります。kind の分岐も 37 か所あります。vision の「同じ流れ、中身が違う」に合わせ、「単位 (コマ / 段落)」と「位置 (scene・state / para・head)」を差し替える媒体のアダプタ 1 つに寄せたいところです
3. `server.mjs` に全部の責務が乗っている。起動・HTTP の振り分け・ドメインの規則・監視・SSE・撮影・子プロセスが 1 ファイルにあります。ハンドラは 250 行の if の連なりです。ルーティング、ドメイン (作品・スレッド・読み)、基盤 (監視・撮影・claude) の層に分けたいです
4. 同じ意味の値に、正が複数ある。タイトル (4 か所)・伝えたいこと (企画と絵コンテ)・聴衆 (企画の 7 つの問いと readers.yaml)・公開する意思 (`fields.publish` と talk.tsx と置き場) です。どれが正で、どれを写すかを決め直す必要があります。特に聴衆は、企画で描いた人と読み手が別々のまま、記事の帯には出ません
5. 状態の遷移が、例外の積み重ねになっている。「公開は完成」「ただし改稿中は下書き」「削除は下書きだけ」「改稿をやめる」が、ボタンの出し分けとバッジの特例で表されています。作品の状態と、その状態で許す操作を 1 つの表 (状態機械) で持つと、ADR が増えても画面に例外が漏れにくくなります
6. ライブ更新と資源の寿命が場当たり。SSE の宛先を `"note:"` の接頭辞で分け、作業場は開いたら閉じず、改稿をやめても原稿の監視が残ります。ホームには通知がありません。全トークの Vite を起動時に立てるので、トークを足すと再起動が要ります。作品単位の購読と、開いているあいだだけ動く作業場にしたいです
7. ファイルへの書き込みの競合の扱いがまちまち。Claude Code と画面が同じファイルを直すのが前提です。それなのに、楽観ロックがあるのは原稿の段落だけです。構成は丸ごと上書きし、企画シートは古いタイトルで上書きしうるつくりです。全ファイルで「読んだ版と違えば保存しない」を揃えると、話者も Claude も安心して直せます
8. 画面の土台が手作り。パスの正規表現での振り分け、ハッシュの読み取りが 2 か所、`location.href` での全体の再読み込み、作品の画面での 3 つの別々の取得、ラベルのためだけの `api.home()` 呼び出しがあります。ルータと、作品単位のデータの層 (取得・購読・楽観的な更新) を最初に決めたいです
9. サーバと画面の契約が型になっていない。サーバは JS で、画面の型は手書きなのでずれています (`open`・`revising` を捨て忘れる・`errors` を捨てる)。fetch の包みも 3 種類あり、失敗の扱いが違います。studio は型検査からも外れています。API の型を 1 か所で定義し、両側で使えると良いなと思っています
10. 言葉が衝突し、死んだコードと古い文書が残っている。note が 3 つ、draft が 3 つの意味を持ちます。`Persona` は 2 つの型です。コマの番号は 0 始まりと 1 始まりが混ざります。ごみ箱の名前は 4 通りあります。`check`・`shoot`・段階 5〜10・`fields.publish`・README の古い説明も残っています。作り直しの最初に用語集 (画面の言葉とコードの名前の対応) を決めると、ほかの 9 つの設計も揃えやすくなります
