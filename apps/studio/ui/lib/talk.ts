// 発表 1 本の絵コンテ・指摘・聴衆役の読みを、studio のサーバから読む (ADR-0040)
import { useEffect, useState } from 'react'

export type Koma = { screen: string; roles: string[]; notes: string[] }
export type Scene = { id: string; title: string; chapter: string | null; meta: Record<string, string>; states: Koma[]; notes: string[] }
export type Board = { title: string; meta: Record<string, string>; chapters: { name: string; meta: Record<string, string> }[]; scenes: Scene[] }

/** 指摘のスレッド。ball は、いま誰が動く番か */
export type Reply = { by: string; text?: string; thinking?: string; change?: string; at?: string }
export type Thread = {
  id: string
  scene: string
  state?: number
  by: '話者' | '聴衆役' | 'Claude' | '検査'
  name?: string
  read?: number
  kind?: string
  text: string
  at?: string
  replies?: Reply[]
  ball: '話者' | 'Claude' | 'none'
  closed?: string
}

export type Score = { score: number; reason: string }
export type Reader = { persona: string; name: string; label: string; scores: Record<string, Score>; message: string; wish: string; notes: { scene: string; state: number; kind: string; text: string }[] }
export type Read = { id: number; at: string; scenes: number; states: number; readers: Reader[]; failed: string[] }
export type Persona = { id: string; name: string; label: string; who: string; troubles: string; knows: string; pushback: string; why: string }
export type Reading = { done: number; total: number; failed: string[]; error?: string }

export type Talk = {
  talk: { slug: string; name: string; date: string | null; tag: string | null; title: string; dir: string; event: string | null; minutes: number | null }
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

const base = (slug: string) => `/api/talks/${encodeURIComponent(slug)}`
const send = (url: string, method: string, body?: unknown) => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })

/** 画面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる */
export const talkApi = (slug: string) => ({
  thumb: (scene: string, i: number, v: number) => `${base(slug)}/thumb/${scene}-${i}?v=${v}`,
  saveNotes: (scene: string, state: number, text: string) => send(`${base(slug)}/note`, 'PUT', { scene, state, text }),
  saveMeta: (scene: string, key: '伝えること' | '粗密', value: string) => send(`${base(slug)}/meta`, 'PUT', { scene, key, value }),
  move: (scene: string, dir: 1 | -1) => send(`${base(slug)}/move`, 'POST', { scene, dir }),
  open: (scene: string, state: number | null, text: string) => send(`${base(slug)}/threads`, 'POST', { scene, state, text }),
  reply: (id: string, text: string) => send(`${base(slug)}/threads/${id}/reply`, 'POST', { text }),
  close: (id: string, how: '直した' | 'そのままにした') => send(`${base(slug)}/threads/${id}/close`, 'POST', { how }),
  reopen: (id: string) => send(`${base(slug)}/threads/${id}/reopen`, 'POST'),
  read: () => send(`${base(slug)}/read`, 'POST'),
})
export type TalkApi = ReturnType<typeof talkApi>

/** トークの状態を読み、ファイルが変わるたびに受け取り直す */
export function useTalk(slug: string | undefined) {
  const [data, setData] = useState<Talk | null>(null)
  const [thumbs, setThumbs] = useState(0)
  const [reading, setReading] = useState<Reading | null>(null)
  useEffect(() => {
    if (!slug) return
    fetch(`${base(slug)}/state`)
      .then((r) => r.json())
      .then((d: Talk) => {
        setData(d)
        setThumbs(d.thumbsVersion)
        setReading(d.reading)
      })
    const es = new EventSource(`/api/events?talk=${encodeURIComponent(slug)}`)
    es.addEventListener('board', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Talk
      setData(d)
      setReading(d.reading)
    })
    es.addEventListener('thumbs', (e) => setThumbs(JSON.parse((e as MessageEvent).data).version))
    es.addEventListener('reading', (e) => setReading(JSON.parse((e as MessageEvent).data)))
    return () => es.close()
  }, [slug])
  return { data, thumbs, reading }
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
