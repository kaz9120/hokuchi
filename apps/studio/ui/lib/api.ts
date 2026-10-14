// studio のサーバ (server.mjs) を呼ぶ
import type { Brief, Kind } from './stages'

export type TalkItem = { slug: string; name: string; title: string; date: string | null; tag: string | null; event: string | null; public: boolean; scenes: number; states: number; siteUrl: string; linked?: boolean }
/** 作品に紐づくトークの様子。mine は、あなたが答える指摘の数 */
export type TalkInfo = TalkItem & { mine: number; claude: number; reads: number }
export type NoteItem = { dir: string; title: string; publishedAt: string; url: string | null; eyecatch: string | null; tags: string[]; chars: number }
export type Seed = { id: string; createdAt: string; happening: string; why?: string; workIds?: string[] }
export type HomeData = { talks: TalkItem[]; notes: NoteItem[]; works: (Brief & { talkInfo?: TalkInfo })[]; seeds: Seed[]; tasks: Record<string, string>; siteUrl: string; privateDir: string }
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
  work: (id: string) => call<Brief>(`/api/works/${encodeURIComponent(id)}`),
  saveWork: (id: string, brief: Partial<Brief>) => call<Brief>(`/api/works/${encodeURIComponent(id)}`, { method: 'PUT', body: brief }),
  ask: (id: string, task: string) => call<{ items: Candidate[] }>(`/api/works/${encodeURIComponent(id)}/ask`, { method: 'POST', body: { task } }),
  saveSeed: (seed: Partial<Seed>) => call<Seed>('/api/seeds', { method: 'POST', body: seed }),
  note: (dir: string) => call<NoteView>(`/api/notes/${encodeURIComponent(dir)}`),
}

export const go = (path: string) => {
  location.href = path
}
