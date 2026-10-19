// ホームが使う API。契約は shared/api.ts。
// ホームの一覧を、いまのホームの形に写して返す (ホームは段 5 で作り直す。それまでの橋渡し)。作品の画面は works.ts を使う
import type { HomeData as ApiHome, HomeItem, Seed, WorkState } from '../../shared/api'
import type { Brief, Kind } from './stages'
import { call } from './works'

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

export const api = {
  home: async (): Promise<HomeData> => {
    const h = await call<ApiHome>('/api/home')
    return { ...h, items: h.items.map(toItem) }
  },
  createWork: async (kind: Kind, seedId?: string) => ({ id: (await call<{ key: string }>('/api/works', 'POST', { kind, seedId })).key }),
  saveSeed: (seed: Partial<Seed>) => call<Seed>('/api/seeds', 'POST', seed),
}

