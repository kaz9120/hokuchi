// studio のサーバを呼ぶ。契約は shared/api.ts。
// いまの画面 (ホーム・作品の画面・公開済みの記事) が使う形に写して返す (段 2 で画面を作り直すまでの橋渡し)
import type { ActionResult, HomeData as ApiHome, HomeItem, Seed, WorkState, WorkView as ApiWork } from '../../shared/api'
import type { Brief, Kind } from './stages'
import { call, reload, workPath, write } from './works'

export type { Seed }
export type TalkItem = { slug: string; name: string; title: string; date: string | null; tag: string | null; event: string | null; public: boolean; scenes: number; states: number; siteUrl: string }
/** 作品に紐づくトークの様子。mine は、あなたが答える指摘の数 */
export type TalkInfo = TalkItem & { mine: number; claude: number; reads: number }
export type NoteItem = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; chars: number }
/** 記事の作品に紐づく原稿の様子 (ADR-0046)。mine は、あなた宛ての指摘の数 */
export type DraftInfo = { slug: string; chars: number; paragraphs: number; blocks: number; outline: number; reads: number; mine: number; claude: number }
export type WorkItem = Brief & { talkInfo?: TalkInfo; draftInfo?: DraftInfo }
/** 進み具合。完成は、企画シートの finishedAt か、公開したもの (ADR-0045) */
export type Progress = 'draft' | 'finished'
/** 公開範囲。公開は実物 (サイトに載る発表・note のアーカイブの記事) から決まる (ADR-0043・ADR-0045) */
export type Visibility = 'private' | 'public'
/** ホームの一覧の 1 枚。企画シート・トーク・記事のどれか (紐づいていれば複数) を持つ */
export type Item = { key: string; kind: Kind; progress: Progress; visibility: Visibility; title: string; date: string | null; event: string | null; tags: string[]; work: WorkItem | null; talk: TalkItem | null; note: NoteItem | null; state: WorkState }
export type HomeData = { items: Item[]; seeds: Seed[]; tasks: Record<string, string>; siteUrl: string; privateDir: string }
/** 作品の画面で読む企画シート。published・revising・state はサーバが実物から決めた値で、保存はしない */
export type WorkView = Brief & {
  published: boolean
  /** 公開済みの記事を、原稿で改稿しているか (ADR-0047) */
  revising: boolean
  /** 紐づくリポジトリの中のファイル (talks/ のトーク・記事の原稿)。削除しても残る */
  repoFiles: string[]
  /** 削除した下書きの移し先 (ごみ箱) */
  trashDir: string
  state: WorkState
  version: string
}
export type NoteView = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; html: string }
export type Candidate = { text: string; note: string }

/** ホームの 1 枚を、いまのホームの形にする */
function toItem(i: HomeItem): Item {
  const counts = { mine: i.counts.mine, claude: i.counts.claude, reads: i.counts.reads }
  const work: WorkItem | null = i.brief ? { ...i.brief, ...(i.talk && { talkInfo: { ...i.talk, ...counts } }), ...(i.draft && { draftInfo: { ...i.draft, ...counts } }) } : null
  return {
    key: i.key,
    kind: i.kind,
    progress: i.state.progress,
    visibility: i.state.visibility,
    state: i.state,
    title: i.title,
    date: i.date,
    event: i.event,
    tags: i.tags,
    work,
    talk: i.talk,
    note: i.archive ? { ...i.archive, eyecatch: i.cover } : null,
  }
}

/** 作品の WorkView を、作品の画面が読む企画シートの形にする */
function toWorkView(v: ApiWork): WorkView {
  if (!v.brief) throw new Error('この作品には企画シートがありません')
  return { ...v.brief, title: v.title, published: v.state.visibility === 'public', revising: v.state.revising, repoFiles: v.repoFiles, trashDir: v.trashDir, state: v.state }
}

/** 渡した欄のうち、変わったものだけを返す (Claude Code が直したほかの欄を消さないため)。消した欄は null */
function diff(prev: Record<string, unknown> | undefined, next: Record<string, unknown> | undefined) {
  if (!next) return undefined
  const out: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(prev ?? {}), ...Object.keys(next)])) {
    if (JSON.stringify(prev?.[k]) !== JSON.stringify(next[k])) out[k] = next[k] === undefined ? null : next[k]
  }
  return Object.keys(out).length ? out : undefined
}

type BriefEdit = Partial<Omit<Brief, 'finishedAt'>> & { finishedAt?: string | null }

async function saveWork(id: string, edit: BriefEdit): Promise<WorkView> {
  if (edit.finishedAt !== undefined) {
    await write(id, `/actions/${edit.finishedAt ? 'finish' : 'unfinish'}`, 'POST', {})
    return toWorkView(await reload(id))
  }
  // 読んだ版がほかで変わっていたら、読み直して 1 回だけ直し直す (送るのは変えた欄だけなので、ほかの直しは消えない)
  for (let attempt = 0; ; attempt++) {
    let v = await reload(id)
    try {
      if (edit.title !== undefined && edit.title !== v.title && edit.title.trim()) {
        await call(`${workPath(id)}/title`, 'PUT', { orig: v.title, title: edit.title })
        // タイトルを書くと企画シートの版も変わるので、読み直してから欄を送る
        v = await reload(id)
      }
      const fields = diff(v.brief!.fields, edit.fields)
      const gates = diff(v.brief!.gates, edit.gates)
      if (fields || gates) await call(`${workPath(id)}/brief`, 'PATCH', { base: v.brief!.version, set: { ...(fields && { fields }), ...(gates && { gates }) } })
      return toWorkView(await reload(id))
    } catch (e) {
      if (attempt > 0 || (e as { status?: number }).status !== 409) throw e
    }
  }
}

export const api = {
  home: async (): Promise<HomeData> => {
    const h = await call<ApiHome>('/api/home')
    return { ...h, items: h.items.map(toItem) }
  },
  createWork: async (kind: Kind, seedId?: string) => ({ id: (await call<{ key: string }>('/api/works', 'POST', { kind, seedId })).key }),
  work: async (id: string) => toWorkView(await reload(id)),
  /** finishedAt に null を渡すと、下書きに戻す */
  saveWork,
  /** 記事の原稿を作る。slug を決めて index.md を作り、企画シートの note に書く (ADR-0046) */
  createDraft: async (id: string, slug: string) => toWorkView(await write<ApiWork>(id, '/body', 'POST', { slug })),
  /** 下書きを削除する。企画シートと、リポジトリの外のトークをごみ箱に移す (ADR-0044) */
  deleteWork: (id: string) => call<ActionResult>(`${workPath(id)}/actions/delete`, 'POST', {}),
  cancelRevision: (id: string) => write<ActionResult>(id, '/actions/cancel-revision', 'POST', {}),
  ask: (id: string, task: string) => write<{ items: Candidate[] }>(id, '/ask', 'POST', { task }),
  saveSeed: (seed: Partial<Seed>) => call<Seed>('/api/seeds', 'POST', seed),
  /** 公開済みの記事を改稿する。原稿に写し、紐づく作品の key を返す (ADR-0047) */
  revise: async (dir: string) => {
    const r = await call<ActionResult>(`${workPath(`note:${dir}`)}/actions/revise`, 'POST', {})
    return { work: r.key, slug: r.slug ?? '' }
  },
  note: async (dir: string): Promise<NoteView> => {
    const v = await call<ApiWork>(workPath(`note:${dir}`))
    const a = v.archive
    if (!a) throw new Error('記事が見つかりません')
    return { dir: a.dir, title: a.title, publishedAt: a.publishedAt, url: a.url, eyecatch: a.eyecatch ? `${workPath(v.key)}/${a.eyecatch}` : null, tags: a.tags, html: a.html ?? '' }
  },
}

export const go = (path: string) => {
  location.href = path
}
