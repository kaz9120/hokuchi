// 発表 1 本の絵コンテ・指摘・聴衆役の読みを、studio のサーバから読む (ADR-0040)。
// サーバの作品の WorkView (shared/api.ts) を、いまの画面の形 (Talk) に写して渡す
import type { WorkView } from '../../shared/api'
import { current, useWork, workPath, write } from './works'

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
  talk: { slug: string; name: string; date: string | null; tag: string | null; title: string; dir: string; outside: boolean; event: string | null; minutes: number | null }
  board: Board
  scenes: { id: string; steps: number }[]
  loadError: string | null
  thumbsVersion: number
  stageUrl: string
  threads: Thread[]
  error: string | null
  reads: Read[]
  reading: Reading | null
  readers: Persona[]
  survey: { key: string; group: string; label: string }[]
  noteKinds: Record<string, string>
  work: { id: string; oneLiner: string } | null
}

/** 作品の WorkView を、発表の画面が使う形にする (段 2 で画面を作り直すまでの橋渡し) */
export function toTalk(v: WorkView): Talk | null {
  const b = v.body
  if (!b || b.kind !== 'talk') return null
  return {
    talk: { slug: b.slug, name: b.name, date: b.date, tag: b.tag, title: b.title, dir: b.dir, outside: b.outside, event: b.event, minutes: b.minutes },
    board: b.board,
    scenes: b.implemented,
    loadError: b.loadError,
    thumbsVersion: b.thumbsVersion,
    stageUrl: b.stageUrl,
    threads: v.threads.items as Thread[],
    error: v.threads.error,
    reads: v.reads as Read[],
    reading: v.reading,
    readers: v.readers,
    survey: v.survey,
    noteKinds: v.unitKinds,
    work: v.brief ? { id: v.brief.id, oneLiner: v.oneLiner } : null,
  }
}

const keyOf = (slug: string) => `talk:${slug}`
const sceneOf = (v: WorkView, scene: string) => (v.body?.kind === 'talk' ? v.body.board.scenes.find((s) => s.id === scene) : undefined)
/** 指摘のスレッドへの操作。発表と記事で共通。rev は手元の最新の WorkView から添える */
export const threadOps = (key: string) => ({
  reply: async (id: string, text: string) => write(key, `/threads/${id}/reply`, 'POST', { rev: revOf(await current(key), id), text }),
  close: async (id: string, how: '直した' | 'そのままにした') => write(key, `/threads/${id}/close`, 'POST', { rev: revOf(await current(key), id), how }),
  reopen: async (id: string) => write(key, `/threads/${id}/reopen`, 'POST', { rev: revOf(await current(key), id) }),
})
const revOf = (v: WorkView, id: string) => v.threads.items.find((t) => t.id === id)?.rev ?? ''

/** 画面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる。コマの番号は、画面の中では 0 始まり、API は 1 始まり */
export const talkApi = (slug: string) => {
  const key = keyOf(slug)
  return {
    thumb: (scene: string, i: number, v: number) => `${workPath(key)}/thumbs/${scene}/${i + 1}?v=${v}`,
    saveNotes: async (scene: string, state: number, text: string) => write(key, `/units/${scene}/${state + 1}`, 'PUT', { orig: sceneOf(await current(key), scene)?.notes[state] ?? '', text }),
    saveMeta: async (scene: string, k: '伝えること' | '粗密', value: string) => write(key, '/outline', 'PATCH', { op: 'meta', scene, key: k, orig: sceneOf(await current(key), scene)?.meta[k] ?? '', value }),
    move: async (scene: string, dir: 1 | -1) => {
      const v = await current(key)
      return write(key, '/outline', 'PATCH', { op: 'move', scene, dir, base: v.body?.kind === 'talk' ? v.body.version : '' })
    },
    open: (scene: string, state: number | null, text: string) => write(key, '/threads', 'POST', { at: { scene, state }, text }),
    ...threadOps(key),
    read: () => write(key, '/read', 'POST', {}),
  }
}
export type TalkApi = ReturnType<typeof talkApi>
/** 指摘のスレッドへの操作。発表と記事の原稿 (ADR-0046) で共通 */
export type ThreadApi = Pick<TalkApi, 'reply' | 'close' | 'reopen'>

/** トークの状態を読み、ファイルが変わるたびに受け取り直す */
export function useTalk(slug: string | undefined) {
  const { data, thumbs, reading } = useWork(slug ? keyOf(slug) : undefined)
  return { data: data ? toTalk(data) : null, thumbs, reading }
}

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

/** Claude Code に渡す依頼文。ターミナルに貼って使う */
export function handoffText(data: Talk) {
  const list = data.threads.filter(forClaude)
  const own = list.filter((t) => t.by !== '聴衆役').length
  return [
    `${data.talk.dir}/feedback.yaml に、Claude の番の指摘が ${list.length} 件あります（話者から ${own} 件、聴衆役から ${list.length - own} 件）。`,
    'crafting-presentation skill の Phase 8 に従って、絵コンテ (storyboard.md) を先に直し、実装を追従させてください。',
    '直したら、各スレッドの replies に thinking (考えたこと) と change (変えたこと) を足してください。話者に確かめたいことは ball を「話者」に、済んだものは ball を none にして closed を書いてください。',
  ].join('\n')
}
