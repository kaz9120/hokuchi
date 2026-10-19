// studio のサーバ (server.mjs) を呼ぶ
import type { Brief, Kind } from './stages'

export type TalkItem = { slug: string; name: string; title: string; date: string | null; tag: string | null; event: string | null; public: boolean; scenes: number; states: number; siteUrl: string }
/** 作品に紐づくトークの様子。mine は、あなたが答える指摘の数 */
export type TalkInfo = TalkItem & { mine: number; claude: number; reads: number }
export type NoteItem = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; chars: number }
export type Seed = { id: string; createdAt: string; happening: string; why?: string; workIds?: string[] }
/** 記事の作品に紐づく原稿の様子 (ADR-0046)。mine は、あなた宛ての指摘の数 */
export type DraftInfo = { slug: string; chars: number; paragraphs: number; blocks: number; outline: number; reads: number; mine: number; claude: number }
export type WorkItem = Brief & { talkInfo?: TalkInfo; draftInfo?: DraftInfo }
/** 進み具合。完成は、企画シートの finishedAt か、公開したもの (ADR-0045) */
export type Progress = 'draft' | 'finished'
/** 公開範囲。公開は実物 (サイトに載る発表・note のアーカイブの記事) から決まる (ADR-0043・ADR-0045) */
export type Visibility = 'private' | 'public'
/** ホームの一覧の 1 枚。企画シート・トーク・記事のどれか (紐づいていれば複数) を持つ */
export type Item = { key: string; kind: Kind; progress: Progress; visibility: Visibility; title: string; date: string | null; event: string | null; tags: string[]; work: WorkItem | null; talk: TalkItem | null; note: NoteItem | null }
export type HomeData = { items: Item[]; seeds: Seed[]; tasks: Record<string, string>; siteUrl: string; privateDir: string }
/** 作品の画面で読む企画シート。published はサーバが実物から決めた値で、保存はしない */
export type WorkView = Brief & {
  published: boolean
  /** 公開済みの記事を、原稿で改稿しているか (ADR-0047) */
  revising: boolean
  /** 紐づくリポジトリの中のファイル (talks/ のトーク・記事の原稿)。削除しても残る */
  repoFiles: string[]
  /** 削除した下書きの移し先 (ごみ箱) */
  trashDir: string
}
export type NoteView = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; html: string }
export type Candidate = { text: string; note: string }

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error ?? `${r.status}`)
  return data as T
}

export const api = {
  home: () => call<HomeData>('/api/home'),
  createWork: (kind: Kind, seedId?: string) => call<Brief>('/api/works', { method: 'POST', body: { kind, seedId } }),
  work: (id: string) => call<WorkView>(`/api/works/${encodeURIComponent(id)}`),
  /** finishedAt に null を渡すと、下書きに戻す */
  saveWork: (id: string, brief: Partial<Omit<Brief, 'finishedAt'>> & { finishedAt?: string | null }) => call<WorkView>(`/api/works/${encodeURIComponent(id)}`, { method: 'PUT', body: brief }),
  /** 記事の原稿を作る。slug を決めて index.md を作り、企画シートの note に書く (ADR-0046) */
  createDraft: (id: string, slug: string) => call<WorkView>(`/api/works/${encodeURIComponent(id)}/draft`, { method: 'POST', body: { slug } }),
  /** 下書きを削除する。企画シートと、リポジトリの外のトークをごみ箱に移す (ADR-0044) */
  deleteWork: (id: string) => call<{ trash: string }>(`/api/works/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ask: (id: string, task: string) => call<{ items: Candidate[] }>(`/api/works/${encodeURIComponent(id)}/ask`, { method: 'POST', body: { task } }),
  saveSeed: (seed: Partial<Seed>) => call<Seed>('/api/seeds', { method: 'POST', body: seed }),
  /** 公開済みの記事を改稿する。原稿に写し、紐づく作品の id を返す (ADR-0047) */
  revise: (dir: string) => call<{ work: string; slug: string }>(`/api/notes/${encodeURIComponent(dir)}/revise`, { method: 'POST' }),
  note: (dir: string) => call<NoteView>(`/api/notes/${encodeURIComponent(dir)}`),
}

export const go = (path: string) => {
  location.href = path
}
