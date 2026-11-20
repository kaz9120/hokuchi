// 画面とサーバで共有する型 (API の契約)。片側だけで変えない。
// 作品の正は hokuchi-private/works/<id>/work.yaml。番は保存せず、実行の記録と作品の記録からサーバが導く

export type Kind = 'note' | 'talk'

/** ステップ。話者が押したときだけ進む */
export type NoteStep = 'core' | 'draft' | 'publish'
export type TalkStep = 'core' | 'outline' | 'storyboard' | 'slides' | 'present'
export type Step = NoteStep | TalkStep

export const STEPS: Record<Kind, Step[]> = {
  note: ['core', 'draft', 'publish'],
  talk: ['core', 'outline', 'storyboard', 'slides', 'present'],
}

export const STEP_LABEL: Record<Step, string> = {
  core: '伝えたいこと',
  outline: '構成',
  draft: '原稿',
  publish: '公開',
  storyboard: '絵コンテ',
  slides: 'スライド',
  present: '発表',
}

export type Scope = 'public' | 'internal'

export type Reader = { who?: string; trouble?: string; knows?: string }
export type Persona = { name: string; who?: string; why?: string; trouble?: string; solve?: string }
export type EventInfo = { name?: string; url?: string; date?: string; minutes?: number; venue?: string }
export type MapRow = { chapter: string; understand: string; weight: string }
export type Option = { text: string; note?: string }
export type Learning = { text: string; file?: string; note?: string }

/** 話者が押して確定した値。Claude は書き換えられない (サーバが実行の後に戻す) */
export type Decided = {
  reader?: Reader
  audience?: Persona[]
  takeaway?: string
  core?: string
  scope?: Scope
  event?: EventInfo
  map?: MapRow[]
}

/** Claude が書く候補。画面はカードにして、選ぶ・直す・押すを出す */
export type Proposals = {
  /** 話者に求めること。Claude が返事の終わりに書く */
  ask?: Ask | null
  /** 話者の発言が明らかに選んだ候補 (core の何番目か)。画面が「これで進める」を強調する */
  picked?: { core?: number; title?: number; slug?: number; hook?: number }
  reader?: Reader
  audience?: Persona[]
  takeaway?: string
  core?: Option[]
  coreRevision?: Option
  event?: EventInfo
  scope?: Scope
  hook?: Option[]
  map?: MapRow[]
  mapRevision?: MapRow[]
  outlineRevision?: Section[]
  /** 記事の置き場の名前の案 (英語の短い名前) */
  slug?: Option[]
  /** 発表のフォルダの名前の案 (YYYY_MM_DD_タグ_演題) */
  talkDir?: string
  /** 見出し画像のモチーフの案 */
  motif?: Option[]
  title?: Option[]
  tags?: string[]
  learnings?: Learning[]
  /** 要らなくなったファイル (中身のフォルダからの相対パス)。Claude は消せないので、話者が押してごみ箱へ移す */
  trash?: { path: string; note?: string }[]
}

export type AskKind = 'choose' | 'answer' | 'read' | 'press'
/** Claude が返事の終わりに書く「話者に求めること」 */
export type Ask = { kind: AskKind; text: string }

export type Shipped = { at: string; by: 'note' | 'site' | 'presented'; ref?: string }

/** work.yaml の中身 */
export type Work = {
  id: string
  kind: Kind
  title: string
  createdAt: string
  updatedAt: string
  step: Step
  decided: Decided
  /** 記事の原稿の名前 (notes/<slug>/) と、公開後の note の key・URL */
  note?: { slug: string; key?: string; url?: string; revises?: string }
  /** 発表のトークの名前 (talk.tsx の slug) とフォルダ */
  talk?: { slug?: string; dir?: string }
  /** 同じ材料から始めた、もう一方の作品 (記事なら発表、発表なら記事) の id */
  from?: string
  /** ステップごとの Claude のセッション。サーバだけが書く */
  sessions?: Partial<Record<Step | 'shipped', string>>
  /** 社内でも公開でも、発表した記録 */
  presented?: { at: string } | null
  shipped?: Shipped | null
  dropped?: { at: string } | null
  /** サイトの組み立てが見た目の変化で止まった件数 */
  deployBlocked?: number
  /** 出した発表のスライドを手直ししている (直したらもう一度サイトに出す) */
  reworking?: boolean
  /** 移す前の企画シートで、結ぶアーカイブが 1 つに決まらなかったときの候補 (アーカイブのフォルダ名) */
  linkCandidates?: string[]
  /** 公開済みの記事を直している */
  revising?: boolean
  /** 片付け: 学びに全部答えたか、変更を記録したか */
  learned?: boolean
  recorded?: boolean
  /** この作品が変えた、リポジトリの中のファイル (リポジトリからの相対パス)。記録の対象 */
  touched?: string[]
  /** 話者が直した所・外で変わったファイル。次の実行の頭に添えて消す */
  changes?: Change[]
  /** 作品を始めたネタ */
  seed?: string
  /** 移す前の企画シートの id */
  migratedFrom?: string
}

/** 番。保存しない */
export type Turn = 'claude' | 'you' | 'shipped' | 'dropped'

export type Anchor = { ref: string; label: string; quote?: string }

export type ChatEntry = {
  id: string
  at: string
  role: 'you' | 'claude' | 'system'
  text: string
  /** 作品のフォルダからの相対パス */
  files?: string[]
  anchors?: Anchor[]
  tools?: string[]
  costUsd?: number
  /** system の知らせの種類。error は赤く出す */
  tone?: 'info' | 'error' | 'step'
  /** 失敗したときに、もう一度押せる操作 (取り込み・記録・デプロイなど)。無ければ Claude に続けてもらう */
  retry?: { action: string; label: string; payload?: unknown }
}

export type RunState = 'running' | 'queued' | 'idle'

/** 実行中の様子。画面に流す */
export type Live = { state: RunState; text: string; tools: string[]; startedAt?: string; queuedText?: string | null; /** 前の実行が止まったので、待っている文を送らずに残している */ held?: boolean }

export type Change = { kind: 'you' | 'outside'; where: string; at: string }

export type Card = {
  id: string
  kind: Kind
  title: string
  step: Step
  turn: Turn
  /** やることの 1 行 */
  ask: string
  scope: Scope
  date?: string
  updatedAt: string
  /** 実行中なら、いまの道具の 1 行 */
  doing?: string
  failed?: boolean
  cover?: string
}

export type ShelfItem = {
  key: string
  kind: Kind
  title: string
  date: string
  scope: Scope
  url?: string
  cover?: string
  workId?: string
  event?: string
}

export type Neta = { file: string; title: string; text: string; at: string; workId?: string }

export type HomeView = { todo: Card[]; working: Card[]; neta: Neta[]; shelfCount: number; siteUrl: string; /** 記録していない変更 (取り込み・学び・公開の発表・部品) の件数と、記録できる作品 */ uncommitted: { count: number; workId?: string } }

/** 記事の段落 */
export type BlockKind = 'heading' | 'image' | 'code' | 'embed' | 'quote' | 'list' | 'comment' | 'prose'
export type Block = { n: number; kind: BlockKind; text: string; head: string; chars: number }
export type Finding = { rule: string; level: 'error' | 'warn' | 'info'; message: string; n: number | null }
export type Section = { title: string; point: string; grain: '密' | '粗'; budget: number }

export type NoteView = {
  slug: string
  dir: string
  exists: boolean
  version: string
  title: string
  tags: string[]
  eyecatch?: string
  blocks: Block[]
  findings: Finding[]
  outline: Section[]
  outlineVersion: string
  /** 見出しごとの実際の字数 (空白を除く)。冒頭を含む */
  chars: { title: string; chars: number }[]
  total: number
  images: string[]
  /** 見出し画像の下地 (hokuchi-private/eyecatch/) ができている */
  eyecatchReady?: boolean
  archived?: { dir: string; url?: string; publishedAt?: string }
}

export type Koma = { n: number; note: string; screen: string }
export type SceneView = { id: string; title: string; chapter: string; message: string; seconds: number | null; grain: string; koma: Koma[] }

export type TalkView = {
  slug?: string
  dir?: string
  exists: boolean
  version: string
  title: string
  scenes: SceneView[]
  totalSeconds: number
  minutes?: number
  stageUrl?: string
  thumbsVersion: number
  thumbErrors: string[]
  onSite: boolean
}

export type ReadSummary = {
  rounds: { id: string; at: string; readers: { name: string; label?: string; scores: Record<string, number>; message?: string; wish?: string }[] }[]
  open: number
  closed: { fixed: number; kept: number; good: number }
  threads: { id: string; where: string; by: string; text: string; ball: string; closed?: string; thinking?: string }[]
}

export type FileChange = { path: string; status: string }

export type WorkView = {
  work: Work
  proposals: Proposals
  version: string
  turn: Turn
  ask: string
  live: Live
  chat: ChatEntry[]
  costUsd: number
  /** 片付けで残っていること */
  chores: string[]
  note?: NoteView
  talk?: TalkView
  reads?: ReadSummary
  /** 出したあとに記録できる変更 */
  uncommitted?: FileChange[]
  /** GitHub にまだ送っていないコミットの数 (記録したあとだけ数える) */
  unpushed?: number
  /** 公開済みの記事の改稿中 */
  revising?: boolean
}
