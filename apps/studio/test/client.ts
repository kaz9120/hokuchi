// テストが studio を操作するための薄い client。API の形が変わったら、ここだけを直す。
// テストの確かめ (studio.test.ts) は、ファイルと、ここが返す値の意味 (状態の 1 語など) にだけ頼る。
// いまの実装: 作り直した API (server/main.ts。契約は shared/api.ts)。書き込みは、読んだときの版や中身を添えて送る
import type { HomeData, StateWord, WorkView } from '../shared/api.ts'

export type { StateWord }
export type Res<T = any> = { ok: boolean; status: number; data: T }
export type HomeEntry = { key: string; kind: 'talk' | 'note'; state: StateWord; title: string; briefId: string | null; talkSlug: string | null; archiveDir: string | null }

export function client(url: string) {
  const call = async <T = any>(path: string, method = 'GET', body?: unknown): Promise<Res<T>> => {
    const r = await fetch(url + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {}
    return { ok: r.ok, status: r.status, data }
  }
  const must = async <T = any>(p: Promise<Res<T>>) => {
    const r = await p
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`)
    return r.data
  }
  const w = (key: string) => `/api/works/${encodeURIComponent(key)}`
  const view = (key: string) => must<WorkView>(call(w(key)))
  const talkKey = (slug: string) => `talk:${slug}`
  const draftKey = (slug: string) => `draft:${slug}`
  const body = async (key: string) => (await view(key)).body as any

  return {
    async home(): Promise<{ items: HomeEntry[]; seeds: any[] }> {
      const h = await must<HomeData>(call('/api/home'))
      return {
        seeds: h.seeds,
        items: h.items.map((i) => ({
          key: i.key,
          kind: i.kind,
          state: i.state.word,
          title: i.title,
          briefId: i.brief?.id ?? null,
          talkSlug: i.talk?.slug ?? null,
          archiveDir: i.archive?.dir ?? null,
        })),
      }
    },
    createWork: async (kind: 'talk' | 'note', seedId?: string): Promise<string> => (await must(call('/api/works', 'POST', { kind, seedId }))).key,
    addSeed: (happening: string, why: string) => must(call('/api/seeds', 'POST', { happening, why })),
    async work(id: string) {
      const v = await view(id)
      return { state: v.state.word, brief: v.brief }
    },
    async patchBrief(id: string, set: { title?: string; fields?: Record<string, unknown> }) {
      const v = await view(id)
      return call(`${w(id)}/brief`, 'PATCH', { base: v.brief!.version, set })
    },
    finish: (id: string) => call(`${w(id)}/actions/finish`, 'POST', {}),
    unfinish: (id: string) => call(`${w(id)}/actions/unfinish`, 'POST', {}),
    remove: (id: string) => call<{ trash?: string }>(`${w(id)}/actions/delete`, 'POST', {}),
    ask: (id: string, task: string) => call<{ items: { text: string; note: string }[] }>(`${w(id)}/ask`, 'POST', { task }),

    // 発表
    async talk(slug: string) {
      const v = await view(talkKey(slug))
      const b = v.body as any
      return { dir: b.dir as string, threads: v.threads.items as any[], reads: v.reads as any[], reading: v.reading, board: b.board }
    },
    /** state は 1 始まり */
    async saveTalkNotes(slug: string, scene: string, state: number, text: string) {
      const b = await body(talkKey(slug))
      const orig = b.board.scenes.find((s: any) => s.id === scene)?.notes[state - 1] ?? ''
      return call(`${w(talkKey(slug))}/units/${scene}/${state}`, 'PUT', { orig, text })
    },
    async saveSceneMeta(slug: string, scene: string, key: '伝えること' | '粗密', value: string) {
      const b = await body(talkKey(slug))
      const orig = b.board.scenes.find((s: any) => s.id === scene)?.meta[key] ?? ''
      return call(`${w(talkKey(slug))}/outline`, 'PATCH', { op: 'meta', scene, key, orig, value })
    },
    async moveScene(slug: string, scene: string, dir: 1 | -1) {
      const b = await body(talkKey(slug))
      return call(`${w(talkKey(slug))}/outline`, 'PATCH', { op: 'move', scene, dir, base: b.version })
    },
    openTalkThread: (slug: string, scene: string, state: number | null, text: string) => call<{ id: string }>(`${w(talkKey(slug))}/threads`, 'POST', { at: { scene, state }, text }),
    readTalk: (slug: string) => call(`${w(talkKey(slug))}/read`, 'POST', {}),

    // 指摘の操作 (発表と記事で共通)
    async threadOp(target: { talk: string } | { draft: string }, id: string, op: 'reply' | 'close' | 'reopen', arg: { text?: string; how?: string } = {}) {
      const key = 'talk' in target ? talkKey(target.talk) : draftKey(target.draft)
      const t = (await view(key)).threads.items.find((x) => x.id === id)
      return call(`${w(key)}/threads/${id}/${op}`, 'POST', { rev: t?.rev ?? '', ...arg })
    },

    // 記事
    createDraft: (id: string, slug: string) => call(`${w(id)}/body`, 'POST', { slug }),
    async draft(slug: string): Promise<Res> {
      const r = await call<WorkView>(w(draftKey(slug)))
      if (!r.ok) return r
      if (!r.data.body) return { ok: false, status: 404, data: { error: '原稿がありません' } }
      return { ok: true, status: 200, data: { ...r.data.body, threads: r.data.threads.items, reading: r.data.reading } }
    },
    saveBlock: (slug: string, n: number, orig: string, text: string) => call(`${w(draftKey(slug))}/units/${n}`, 'PUT', { orig, text }),
    append: (slug: string, text: string) => call(`${w(draftKey(slug))}/units`, 'POST', { text }),
    async saveOutline(slug: string, sections: unknown[]) {
      const b = await body(draftKey(slug))
      return call(`${w(draftKey(slug))}/outline`, 'PATCH', { op: 'replace', base: b.outline.version, sections })
    },
    async setMeta(slug: string, meta: { title?: string; tags?: string[]; eyecatch?: string | null }) {
      const key = draftKey(slug)
      if (meta.title !== undefined) {
        const r = await call(`${w(key)}/title`, 'PUT', { orig: (await view(key)).title, title: meta.title })
        if (!r.ok) return r
      }
      if (meta.tags === undefined && meta.eyecatch === undefined) return { ok: true, status: 200, data: {} }
      const b = await body(key)
      return call(`${w(key)}/meta`, 'PATCH', { base: b.metaVersion, ...(meta.tags !== undefined && { tags: meta.tags }), ...(meta.eyecatch !== undefined && { eyecatch: meta.eyecatch }) })
    },
    async saveNoteReaders(slug: string, readers: { persona: string; why?: string }[]) {
      const v = await view(draftKey(slug))
      return call(`${w(draftKey(slug))}/readers`, 'PUT', { base: v.readersVersion, readers })
    },
    readNote: (slug: string) => call(`${w(draftKey(slug))}/read`, 'POST', {}),
    paste: async (slug: string) => must<{ text: string }>(call(`${w(draftKey(slug))}/paste`)),
    openNoteThread: (slug: string, para: number | '*', text: string) => call<{ id: string }>(`${w(draftKey(slug))}/threads`, 'POST', { at: { para }, text }),

    // 改稿
    async revise(dir: string): Promise<Res<{ work: string; slug: string }>> {
      const r = await call(`${w(`note:${dir}`)}/actions/revise`, 'POST', {})
      return r.ok ? { ...r, data: { work: r.data.key, slug: r.data.slug } } : r
    },
    cancelRevision: (id: string) => call<{ trash: string }>(`${w(id)}/actions/cancel-revision`, 'POST', {}),
  }
}
export type Client = ReturnType<typeof client>
