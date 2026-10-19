// テストが studio を操作するための薄い client。API の形が変わったら、ここだけを直す。
// テストの確かめ (studio.test.ts) は、ファイルと、ここが返す値の意味 (状態の 1 語など) にだけ頼る。
// いまの実装: 作り直す前の API (server.mjs)

export type StateWord = '下書き' | '完成' | '公開' | '改稿中'
export type Res<T = any> = { ok: boolean; status: number; data: T }
export type HomeEntry = { key: string; kind: 'talk' | 'note'; state: StateWord; title: string; briefId: string | null; talkSlug: string | null; archiveDir: string | null }

const word = (progress: string, visibility: string): StateWord =>
  visibility === 'public' ? (progress === 'draft' ? '改稿中' : '公開') : progress === 'draft' ? '下書き' : '完成'

export function client(url: string) {
  const call = async <T = any>(path: string, method = 'GET', body?: unknown): Promise<Res<T>> => {
    const r = await fetch(url + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {}
    return { ok: r.ok && !(data && typeof data === 'object' && 'error' in data && r.status >= 400), status: r.status, data }
  }
  const must = async <T = any>(p: Promise<Res<T>>) => {
    const r = await p
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`)
    return r.data
  }
  const t = (slug: string) => `/api/talks/${encodeURIComponent(slug)}`
  const d = (slug: string) => `/api/drafts/${encodeURIComponent(slug)}`
  const w = (id: string) => `/api/works/${encodeURIComponent(id)}`

  return {
    async home(): Promise<{ items: HomeEntry[]; seeds: any[] }> {
      const h = await must(call('/api/home'))
      return {
        seeds: h.seeds,
        items: h.items.map((i: any) => ({
          key: i.key,
          kind: i.kind,
          state: word(i.progress, i.visibility),
          title: i.title,
          briefId: i.work?.id ?? null,
          talkSlug: i.talk?.slug ?? null,
          archiveDir: i.note?.dir ?? null,
        })),
      }
    },
    createWork: async (kind: 'talk' | 'note', seedId?: string): Promise<string> => (await must(call('/api/works', 'POST', { kind, seedId }))).id,
    addSeed: (happening: string, why: string) => must(call('/api/seeds', 'POST', { happening, why })),
    async work(id: string): Promise<{ state: StateWord; brief: any }> {
      const v = await must(call(w(id)))
      const state: StateWord = v.revising ? '改稿中' : v.published ? '公開' : v.finishedAt ? '完成' : '下書き'
      return { state, brief: v }
    },
    /** 欄は、渡したものだけを変える (画面が手元の企画シートに重ねて送るのと同じ) */
    async patchBrief(id: string, set: { title?: string; fields?: Record<string, unknown> }) {
      const cur = await must(call(w(id)))
      return call(w(id), 'PUT', { ...set, ...(set.fields ? { fields: { ...cur.fields, ...set.fields } } : {}) })
    },
    finish: (id: string) => call(w(id), 'PUT', { finishedAt: new Date().toISOString() }),
    unfinish: (id: string) => call(w(id), 'PUT', { finishedAt: null }),
    remove: (id: string) => call<{ trash?: string }>(w(id), 'DELETE'),
    ask: (id: string, task: string) => call<{ items: { text: string; note: string }[] }>(`${w(id)}/ask`, 'POST', { task }),

    // 発表
    async talk(slug: string) {
      const s = await must(call(`${t(slug)}/state`))
      return { dir: s.talk.dir as string, threads: s.threads as any[], reads: s.reads as any[], reading: s.reading, board: s.board }
    },
    /** state は 1 始まり */
    saveTalkNotes: (slug: string, scene: string, state: number, text: string) => call(`${t(slug)}/note`, 'PUT', { scene, state: state - 1, text }),
    saveSceneMeta: (slug: string, scene: string, key: '伝えること' | '粗密', value: string) => call(`${t(slug)}/meta`, 'PUT', { scene, key, value }),
    moveScene: (slug: string, scene: string, dir: 1 | -1) => call(`${t(slug)}/move`, 'POST', { scene, dir }),
    openTalkThread: (slug: string, scene: string, state: number | null, text: string) => call<{ id: string }>(`${t(slug)}/threads`, 'POST', { scene, state, text }),
    readTalk: (slug: string) => call(`${t(slug)}/read`, 'POST'),

    // 指摘の操作 (発表と記事で共通)
    threadOp: (target: { talk: string } | { draft: string }, id: string, op: 'reply' | 'close' | 'reopen', arg: { text?: string; how?: string } = {}) =>
      call(`${'talk' in target ? t(target.talk) : d(target.draft)}/threads/${id}/${op}`, 'POST', arg),

    // 記事
    createDraft: (id: string, slug: string) => call(`${w(id)}/draft`, 'POST', { slug }),
    draft: (slug: string) => call(`${d(slug)}/state`),
    saveBlock: (slug: string, n: number, orig: string, text: string) => call(`${d(slug)}/block`, 'PUT', { n, orig, text }),
    append: (slug: string, text: string) => call(`${d(slug)}/append`, 'POST', { text }),
    saveOutline: (slug: string, sections: unknown[]) => call(`${d(slug)}/outline`, 'PUT', { sections }),
    setMeta: (slug: string, meta: { title?: string; tags?: string[]; eyecatch?: string | null }) => call(`${d(slug)}/meta`, 'PUT', meta),
    saveNoteReaders: (slug: string, readers: { persona: string; why?: string }[]) => call(`${d(slug)}/readers`, 'PUT', { readers }),
    readNote: (slug: string) => call(`${d(slug)}/read`, 'POST'),
    paste: async (slug: string) => must(call<{ text: string }>(`${d(slug)}/paste`)),
    openNoteThread: (slug: string, para: number | '*', text: string) => call<{ id: string }>(`${d(slug)}/threads`, 'POST', { para, text }),

    // 改稿
    revise: (dir: string) => call<{ work: string; slug: string }>(`/api/notes/${encodeURIComponent(dir)}/revise`, 'POST'),
    cancelRevision: (id: string) => call<{ trash: string }>(`${w(id)}/revise`, 'DELETE'),
  }
}
export type Client = ReturnType<typeof client>
