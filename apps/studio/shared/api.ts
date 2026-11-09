// 画面とサーバの契約。API が受け取るものと返すものの型を、ここだけに書く。
// サーバ (server/) と画面 (ui/) の両方が読む。型だけでなく、両方で使う定数もここに置く。
//
// API の一覧 (作品は WorkKey で指す。WorkKey は企画シートの id、または talk:<slug>・note:<アーカイブ>・draft:<原稿の slug>)
//
//   GET    /api/home                                   HomeData
//   GET    /api/events?work=<key> | ?home=1             SSE。work: 'work' (WorkView)・'reading' (Reading)・'thumbs' (Thumbs)。home: 'home'
//   POST   /api/works                                  CreateWork → { key }
//   GET    /api/works/:key                             WorkView
//   PATCH  /api/works/:key/brief                       BriefPatch → BriefView
//   POST   /api/works/:key/actions/:action             {} → ActionResult (状態の表で押せる操作だけ)
//   PUT    /api/works/:key/title                       TitleEdit
//   POST   /api/works/:key/body                        CreateBody (記事の原稿を作る。slug を省くとタイトルから決める)
//   PUT    /api/works/:key/slug                        { slug } (記事の原稿の置き場の名前を変える。公開前だけ)
//   PUT    /api/works/:key/units/:unit                 UnitEdit (発表は <scene>/<コマ 1 始まり>、記事は <段落の番号>)
//   POST   /api/works/:key/units                       { text } (記事の末尾に段落を足す)
//   PATCH  /api/works/:key/outline                     OutlineOp
//   PATCH  /api/works/:key/meta                        MetaEdit (記事の front matter)
//   PUT    /api/works/:key/readers                     ReadersEdit
//   POST   /api/works/:key/read                        {} (聴衆役に読んでもらう。裏で走る)
//   POST   /api/works/:key/threads                     ThreadOpen → { id }
//   POST   /api/works/:key/threads/:id/:op             ThreadOp (op は reply・close・reopen)
//   POST   /api/works/:key/ask                         { task } → { items }
//   GET    /api/works/:key/paste                       PasteText
//   POST   /api/works/:key/open-assets                 {}
//   POST   /api/works/:key/reveal                      {} (作品の置き場を Finder で開く)
//   GET    /api/works/:key/assets/<path>               画像 (原稿か、アーカイブ)
//   GET    /api/works/:key/thumbs/<scene>/<コマ>        JPEG (作品を購読しているあいだだけ)
//   POST   /api/seeds                                  { happening, why } → Seed
//
// 失敗は { error, current? } を返す。404 は無い、400 は入力の誤り、409 は「読んだ版と違う」(画面は読み直す)

export type Kind = 'talk' | 'note'
export type WorkKey = string

// ---------------------------------------------------------------- 状態

/** 画面に出す 1 語 */
export type StateWord = '下書き' | '完成' | '公開' | '改稿中'
/** その状態で押せる操作 */
export type Action = 'finish' | 'unfinish' | 'delete' | 'publish-howto' | 'revise' | 'cancel-revision'
export type Progress = 'draft' | 'finished'
export type Visibility = 'private' | 'public'
export type WorkState = {
  word: StateWord
  /** 画面の表記。社内向けの完成は「完成（社内）」 */
  label: string
  /** データの 2 つの軸 */
  progress: Progress
  visibility: Visibility
  revising: boolean
  actions: Action[]
  /** 企画の意図と実物が食い違っているときの知らせ */
  notices: string[]
}

// ---------------------------------------------------------------- 企画シート

/** 聴衆を描く 7 つの問い (企画の段階 2。発表) */
export type AudiencePersona = { name: string; who: string; why: string; trouble: string; solve: string; action: string; pushback: string; approach: string }
export type Candidate = { text: string; note: string }
export type Brief = {
  id: string
  kind: Kind
  title: string
  createdAt: string
  updatedAt: string
  seedId: string | null
  /** 紐づくトークの slug (talk.tsx の slug。ディレクトリ名ではない) */
  talk?: string
  /** 紐づく記事の slug (原稿は <置き場>/notes/<slug>/、公開後は articles/note/<公開日>-<slug>/) */
  note?: string
  /** 「完成にする」を押した日時 */
  finishedAt?: string
  fields: Record<string, any> & { personas?: AudiencePersona[] }
  gates: Record<string, { passedAt: string; value: string }>
  candidates: Record<string, { at: string; items: Candidate[] }>
}
export type BriefView = Brief & { version: string }

// ---------------------------------------------------------------- 指摘・聴衆役

export type Reply = { by: string; text?: string; thinking?: string; change?: string; at?: string }
export type Thread = {
  id: string
  /** 発表の位置。シーンの id (全体は "*") と、コマの番号 (1 始まり。無ければシーン全体) */
  scene?: string
  state?: number
  /** 記事の位置。段落の番号 (全体は "*") と書き出し */
  para?: number | '*'
  head?: string
  by: '話者' | '聴衆役' | 'Claude' | '検査'
  name?: string
  read?: number
  kind?: string
  text: string
  at?: string
  replies?: Reply[]
  ball: '話者' | 'Claude' | 'none'
  closed?: string
  /** このスレッドの版。返信・閉じるときに送る */
  rev: string
}
export type ThreadsView = { items: Thread[]; error: string | null }

/** プリセットのペルソナ (personas/) */
export type Persona = { id: string; name: string; label: string; who: string; troubles: string; knows: string; pushback: string; knows_speaker?: boolean; tags?: string[] }
export type ReaderChoice = Persona & { why: string }
export type Score = { score: number; reason: string }
export type ReaderNote = { scene?: string; state?: number; para?: number | '*'; head?: string; kind: string; text: string }
export type ReaderResult = { persona: string; name: string; label: string; scores: Record<string, Score>; message: string; wish: string; notes: ReaderNote[] }
export type Read = { id: number; at: string; scenes?: number; states?: number; paragraphs?: number; readers: ReaderResult[]; failed: string[] }
export type Reading = { done: number; total: number; failed: string[]; error?: string }
export type SurveyItem = { key: string; group: string; label: string }

/** 聴衆役の感想の種類 (発表のコマにも、記事の段落にも使う) */
export const UNIT_KINDS: Record<string, string> = { word: '分からない言葉', jump: '話が飛んだ', unreadable: '読み切れない', unconvinced: '納得できない', good: '良かった' }

// ---------------------------------------------------------------- 中身

export type Koma = { screen: string; roles: string[]; notes: string[] }
export type Scene = { id: string; title: string; chapter: string | null; meta: Record<string, string>; states: Koma[]; notes: string[] }
export type Board = { title: string; meta: Record<string, string>; chapters: { name: string; meta: Record<string, string> }[]; scenes: Scene[] }
export type TalkBody = {
  kind: 'talk'
  slug: string
  name: string
  date: string | null
  tag: string | null
  title: string
  /** 画面と依頼文に出す場所。リポジトリの中は相対、外は絶対 */
  dir: string
  outside: boolean
  event: string | null
  /** 持ち時間 (秒) */
  minutes: number | null
  board: Board
  /** storyboard.md の版 (シーンを動かすときに送る) */
  version: string
  /** 実装済みのシーンと、その状態の数 */
  implemented: { id: string; steps: number }[]
  loadError: string | null
  thumbsVersion: number
  stageUrl: string
}

export type BlockKind = 'heading' | 'image' | 'code' | 'embed' | 'quote' | 'list' | 'comment' | 'prose'
export type Block = { n: number; kind: BlockKind; text: string; head: string }
export type Finding = { severity: 'error' | 'warn' | 'info'; id: string; message: string; n: number | null }
export type Section = { title: string; point: string; grain: '密' | '粗'; budget: number }
export type SectionChars = { title: string; n: number | null; chars: number }
export type NoteBody = {
  kind: 'note'
  slug: string
  dir: string
  file: string
  title: string
  tags: string[]
  eyecatch: string | null
  revises: string | null
  blocks: Block[]
  lint: Finding[]
  stats: { chars: number; paragraphs: number; sentences: number; medianSentence: number; images: number; headings: number }
  sections: SectionChars[]
  assets: string[]
  outline: { exists: boolean; sections: Section[]; version: string }
  /** index.md の版 */
  version: string
  /** front matter の版 (タグ・見出し画像を直すときに送る。本文を直しても変わらない) */
  metaVersion: string
}
export type Archive = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; chars: number; html?: string }

// ---------------------------------------------------------------- 作品

export type WorkView = {
  key: WorkKey
  kind: Kind
  title: string
  oneLiner: string
  /** 聴衆・読者の要約 (企画の段階 2) */
  audience: string
  event: string | null
  date: string | null
  state: WorkState
  brief: BriefView | null
  body: TalkBody | NoteBody | null
  archive: Archive | null
  threads: ThreadsView
  reads: Read[]
  reading: Reading | null
  readers: ReaderChoice[]
  readersVersion: string
  personas: Persona[]
  /** 企画の段階 2 で描いた人。読み手にできる (id は brief:<名前>) */
  audiencePersonas: Persona[]
  /** 中身 (絵コンテ・下書き) を Claude Code に頼む依頼文。頼む中身が無ければ null */
  bodyRequest: string | null
  survey: SurveyItem[]
  unitKinds: Record<string, string>
  /** Claude に渡す指摘 */
  handoff: { count: number; own: number; text: string }
  /** 削除しても残る、リポジトリの中のファイル */
  repoFiles: string[]
  trashDir: string
}

export type TalkSummary = { slug: string; name: string; title: string; date: string | null; tag: string | null; event: string | null; public: boolean; scenes: number; states: number; siteUrl: string }
export type DraftSummary = { slug: string; chars: number; paragraphs: number; blocks: number; outline: number }
export type Seed = { id: string; createdAt: string; happening: string; why?: string; workIds?: string[] }
export type HomeItem = {
  key: WorkKey
  kind: Kind
  state: WorkState
  title: string
  date: string | null
  event: string | null
  tags: string[]
  updatedAt: string | null
  oneLiner: string
  /** 表紙の絵 (発表は表紙のスライド、記事は見出し画像) */
  cover: string | null
  brief: Brief | null
  talk: TalkSummary | null
  draft: DraftSummary | null
  archive: Archive | null
  counts: { mine: number; claude: number; reads: number }
}
export type HomeData = { items: HomeItem[]; seeds: Seed[]; tasks: Record<string, string>; siteUrl: string; privateDir: string }

// ---------------------------------------------------------------- 送るもの

export type CreateWork = { kind: Kind; seedId?: string }
/** 企画シートを直す。base は読んだときの版。fields と gates は、渡した欄だけを変える (null で消す) */
export type BriefPatch = { base: string; set: { title?: string; fields?: Record<string, unknown>; gates?: Record<string, { passedAt: string; value: string } | null> } }
export type TitleEdit = { orig: string; title: string }
export type CreateBody = { slug?: string }
/** 単位 (コマの話すこと・段落) を直す。orig は読んだときの中身 */
export type UnitEdit = { orig: string; text: string }
export type OutlineOp =
  | { op: 'meta'; scene: string; key: '伝えること' | '粗密'; orig: string; value: string }
  | { op: 'move'; scene: string; dir: 1 | -1; base: string }
  | { op: 'replace'; base: string; sections: Section[] }
/** 記事の front matter を直す。base は front matter の版 (NoteBody.metaVersion) */
export type MetaEdit = { base: string; tags?: string[]; eyecatch?: string | null }
export type ReadersEdit = { base: string; readers: { persona: string; why?: string }[] }
export type Anchor = { scene: string; state?: number | null } | { para: number | '*' }
export type ThreadOpen = { at: Anchor; text: string }
export type ThreadOp = { rev: string; text?: string; how?: '直した' | 'そのままにした' }
export type ActionResult = { key: WorkKey; trash?: string; slug?: string }
export type PasteText = { text: string; images: { n: number; file: string; path: string; caption: string; link: string | null }[]; eyecatch: string | null }
export type Thumbs = { version: number; errors: string[] }
export type ApiError = { error: string; current?: unknown }
