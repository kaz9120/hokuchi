// 発表の面 (流れ・コマ・読み・公開) が読む形と、そこからの操作 (ADR-0040)。
// 作品の WorkView (shared/api.ts) から、面が読む形 (Talk) を作る。取得と購読は works.ts が持つ
import type { WorkView } from '../../shared/api'
import { current, send, workPath } from './works'

export type Koma = { screen: string; roles: string[]; notes: string[] }
export type Scene = { id: string; title: string; chapter: string | null; meta: Record<string, string>; states: Koma[]; notes: string[] }
export type Board = { title: string; meta: Record<string, string>; chapters: { name: string; meta: Record<string, string> }[]; scenes: Scene[] }

/** 指摘のスレッド。ball は、いま誰が動く番か */
export type Reply = { by: string; text?: string; thinking?: string; change?: string; at?: string }
export type Thread = {
  id: string
  scene: string
  state?: number
  /** 記事の原稿への指摘の位置 (ADR-0046)。段落の番号か、記事全体なら "*"。head は段落の書き出し */
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
  /** スレッドの版。返信・閉じるときにサーバへ送る */
  rev?: string
}

export type Score = { score: number; reason: string }
export type Reader = { persona: string; name: string; label: string; scores: Record<string, Score>; message: string; wish: string; notes: { scene: string; state: number; kind: string; text: string }[] }
export type Read = { id: number; at: string; scenes: number; states: number; readers: Reader[]; failed: string[] }
export type Persona = { id: string; name: string; label: string; who: string; troubles: string; knows: string; pushback: string; why: string }
export type Reading = { done: number; total: number; failed: string[]; error?: string }

export type Talk = {
  /** 作品の key。書き込みはこの key で送る */
  key: string
  talk: { slug: string; name: string; date: string | null; tag: string | null; title: string; dir: string; outside: boolean; event: string | null; minutes: number | null }
  board: Board
  scenes: { id: string; steps: number }[]
  loadError: string | null
  thumbsVersion: number
  stageUrl: string
  threads: Thread[]
  error: string | null
  reads: Read[]
  readers: Persona[]
  survey: { key: string; group: string; label: string }[]
  noteKinds: Record<string, string>
  /** 伝えたいこと (企画の段階 4。無ければ絵コンテの中核メッセージ) */
  oneLiner: string
}

/** 作品の WorkView から、発表の面が読む形を作る。中身 (絵コンテ) が無ければ null */
export function toTalk(v: WorkView): Talk | null {
  const b = v.body
  if (!b || b.kind !== 'talk') return null
  return {
    key: v.key,
    talk: { slug: b.slug, name: b.name, date: b.date, tag: b.tag, title: b.title, dir: b.dir, outside: b.outside, event: b.event, minutes: b.minutes },
    board: b.board,
    scenes: b.implemented,
    loadError: b.loadError,
    thumbsVersion: b.thumbsVersion,
    stageUrl: b.stageUrl,
    threads: v.threads.items as Thread[],
    error: v.threads.error,
    reads: v.reads as Read[],
    readers: v.readers,
    survey: v.survey,
    noteKinds: v.unitKinds,
    oneLiner: v.oneLiner || b.board.meta['中核メッセージ'] || '',
  }
}

const sceneOf = (v: WorkView, scene: string) => (v.body?.kind === 'talk' ? v.body.board.scenes.find((s) => s.id === scene) : undefined)
const revOf = (v: WorkView, id: string) => v.threads.items.find((t) => t.id === id)?.rev ?? ''
/** 指摘のスレッドの 1 件を、手元で書き換える (楽観的な更新) */
const patchThread = (id: string, fn: (t: WorkView['threads']['items'][number]) => WorkView['threads']['items'][number]) => (v: WorkView): WorkView => ({ ...v, threads: { ...v.threads, items: v.threads.items.map((t) => (t.id === id ? fn(t) : t)) } })

/** 指摘のスレッドへの操作。発表と記事で共通。rev は手元の最新の WorkView から添える */
export const threadOps = (key: string) => ({
  reply: async (id: string, text: string) => send(key, `/threads/${id}/reply`, 'POST', { rev: revOf(await current(key), id), text }, { optimistic: patchThread(id, (t) => ({ ...t, ball: 'Claude', closed: undefined, replies: [...(t.replies ?? []), { by: '話者', text }] })) }),
  close: async (id: string, how: '直した' | 'そのままにした') => send(key, `/threads/${id}/close`, 'POST', { rev: revOf(await current(key), id), how }, { optimistic: patchThread(id, (t) => ({ ...t, ball: 'none', closed: how })) }),
  reopen: async (id: string) => send(key, `/threads/${id}/reopen`, 'POST', { rev: revOf(await current(key), id) }),
})

/** 発表の面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる。コマの番号は、画面の中では 0 始まり、API は 1 始まり */
export const talkApi = (key: string) => ({
  thumb: (scene: string, i: number, v: number) => `${workPath(key)}/thumbs/${scene}/${i + 1}?v=${v}`,
  saveNotes: async (scene: string, state: number, text: string) => {
    const v = await current(key)
    return send(key, `/units/${scene}/${state + 1}`, 'PUT', { orig: sceneOf(v, scene)?.notes[state] ?? '', text }, {
      optimistic: (w) => (w.body?.kind === 'talk' ? { ...w, body: { ...w.body, board: { ...w.body.board, scenes: w.body.board.scenes.map((s) => (s.id === scene ? { ...s, notes: s.notes.map((n, i) => (i === state ? text : n)) } : s)) } } } : w),
    })
  },
  saveMeta: async (scene: string, k: '伝えること' | '粗密', value: string) => {
    const v = await current(key)
    return send(key, '/outline', 'PATCH', { op: 'meta', scene, key: k, orig: sceneOf(v, scene)?.meta[k] ?? '', value }, {
      optimistic: (w) => (w.body?.kind === 'talk' ? { ...w, body: { ...w.body, board: { ...w.body.board, scenes: w.body.board.scenes.map((s) => (s.id === scene ? { ...s, meta: { ...s.meta, [k]: value } } : s)) } } } : w),
    })
  },
  move: async (scene: string, dir: 1 | -1) => {
    const v = await current(key)
    return send(key, '/outline', 'PATCH', { op: 'move', scene, dir, base: v.body?.kind === 'talk' ? v.body.version : '' })
  },
  open: (scene: string, state: number | null, text: string) => send(key, '/threads', 'POST', { at: { scene, state }, text }),
  ...threadOps(key),
  read: () => send(key, '/read', 'POST', {}),
})
export type TalkApi = ReturnType<typeof talkApi>
/** 指摘のスレッドへの操作。発表と記事の原稿 (ADR-0046) で共通 */
export type ThreadApi = Pick<TalkApi, 'reply' | 'close' | 'reopen'>

// ---------------------------------------------------------------- 時間
/** 「中（1 分 20 秒）」から、粗密と秒を読む */
export function parseGrain(text: string | undefined) {
  const t = text ?? ''
  const min = t.match(/(\d+(?:\.\d+)?)\s*分/)
  const sec = t.match(/(\d+)\s*秒/)
  return { grain: t.match(/^(粗|中|密)/)?.[1] ?? '', seconds: min || sec ? Math.round((min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)) : null }
}
export const formatGrain = (grain: string, seconds: number | null) => `${grain || '中'}${seconds ? `（${seconds >= 60 ? `${Math.floor(seconds / 60)} 分${seconds % 60 ? ` ${seconds % 60} 秒` : ''}` : `${seconds} 秒`}）` : ''}`

/** 話すことの字数から見積もる秒数。話す速さは 1 分 300 字 (1 秒 5 字) で置く */
export const spokenSeconds = (scene: Scene) => Math.round(scene.notes.reduce((n, t) => n + [...t.replace(/\s|（(?:要確認|検討中|調達する写真)[^）]*）/g, '')].length, 0) / 5)
/** そのシーンにかける時間。話者が決めた時間があればそれ、無ければ話すことからの見積もり */
export const sceneSeconds = (scene: Scene) => parseGrain(scene.meta['粗密']).seconds ?? spokenSeconds(scene)
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
/** 「0:45」「45」「1 分 20 秒」を秒にする。読めなければ null */
export function toSeconds(text: string) {
  const t = text.trim()
  if (!t) return null
  const m = t.match(/^(\d+):(\d{1,2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  if (/^\d+$/.test(t)) return Number(t)
  return parseGrain(`中（${t}）`).seconds
}

// ---------------------------------------------------------------- 指摘
export const mine = (t: Thread) => t.ball === '話者'
export const forClaude = (t: Thread) => t.ball === 'Claude'
export const done = (t: Thread) => t.ball === 'none'
/** 閉じた指摘の終わり方を、画面の言葉にする。ファイルの値 (closed) は変えない */
export const CLOSED_LABEL: Record<string, string> = { 直した: '解決', そのままにした: '見送り', 読み直した: '再読済み', 良かった点: '良かった点' }
export const where = (t: Thread, board: Board) => {
  const scene = board.scenes.find((s) => s.id === t.scene)
  return scene ? `${scene.title}${t.state ? `・コマ ${t.state}` : ''}` : '発表全体'
}
/** 誰が書いたか。聴衆役は名前で呼ぶ */
export const author = (t: { by: string; name?: string }) => (t.by === '聴衆役' ? (t.name ?? '聴衆役') : t.by === '話者' ? 'あなた' : t.by)
