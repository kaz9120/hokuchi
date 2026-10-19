// 作品ごとのデータの層 (design.md 3 章「画面の土台」)。取得・購読 (SSE)・書き込みを、ここ 1 か所にまとめる。
//
// - 取得と購読: useWork(key) が WorkView を読み、ファイルが変わるたびにサーバから受け取り直す
// - 書き込み: send() で送る。手元の WorkView にすぐ映してから送り (楽観的な更新)、送ったあとは読み直す。
//   書くときは、手元の最新の WorkView から「読んだときの版や中身」を添える (サーバは違えば 409 で断る)
// - 409: 読み直して「ほかで変更されていたので、保存しませんでした」と知らせる。ほかの失敗も知らせる
// - 企画シートの欄: editBrief() で、少し待ってからまとめて送る。送るまでの欄は、サーバから届いた WorkView の上に重ねて見せる
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ApiError, Brief, Reading, Thumbs, WorkView } from '../../shared/api'
import { notify } from './notice'

export class ApiFailure extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** API を呼ぶ。失敗は ApiFailure で投げる */
export async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiFailure(r.status, (data as ApiError).error ?? `${r.status}`)
  return data as T
}

export const workPath = (key: string) => `/api/works/${encodeURIComponent(key)}`

// ---------------------------------------------------------------- 手元の WorkView

/** サーバから届いたままの WorkView */
const raw = new Map<string, WorkView>()
/** 画面に見せている WorkView (送る前の企画の欄と、楽観的な更新を重ねたもの) */
const shown = new Map<string, WorkView>()
const listeners = new Map<string, Set<() => void>>()

/** 企画シートの、まだ送っていない欄 */
type PendingBrief = { fields: Record<string, unknown>; gates: Record<string, unknown>; timer?: number; saving: boolean }
const pending = new Map<string, PendingBrief>()

function overlay(key: string, v: WorkView): WorkView {
  const p = pending.get(key)
  if (!p || !v.brief) return v
  const fields = { ...v.brief.fields }
  for (const [k, x] of Object.entries(p.fields)) x === null ? delete fields[k] : (fields[k] = x)
  const gates = { ...v.brief.gates } as Record<string, unknown>
  for (const [k, x] of Object.entries(p.gates)) x === null ? delete gates[k] : (gates[k] = x)
  return { ...v, brief: { ...v.brief, fields, gates: gates as Brief['gates'] }, oneLiner: String(fields.oneLiner ?? '') || v.oneLiner }
}

function publishView(key: string, v: WorkView) {
  shown.set(key, v)
  for (const fn of listeners.get(key) ?? []) fn()
}
/** サーバから届いた WorkView を手元に置く */
function store(key: string, v: WorkView) {
  raw.set(key, v)
  publishView(key, overlay(key, v))
}

/** 手元の最新の WorkView (送る前の版を添えるときに使う)。無ければ読む */
export async function current(key: string): Promise<WorkView> {
  return raw.get(key) ?? reload(key)
}
export async function reload(key: string): Promise<WorkView> {
  const v = await call<WorkView>(workPath(key))
  store(key, v)
  return v
}

// ---------------------------------------------------------------- 書き込み

const CONFLICT = 'ほかで変更されていたので、保存しませんでした。最新の内容を読み直しました。'

type SendOptions = {
  /** 送る前に、手元の WorkView をこう変えて見せる */
  optimistic?: (v: WorkView) => WorkView
  /** 失敗を知らせずに投げる (呼ぶ側で扱うとき) */
  quiet?: boolean
}

/**
 * 作品を直す。path は /api/works/<key> から先。成功したら読み直す。
 * 失敗したら読み直して知らせ、undefined を返す (quiet なら投げる)
 */
export async function send<T = unknown>(key: string, path: string, method: string, body?: unknown, opts: SendOptions = {}): Promise<T | undefined> {
  const before = shown.get(key)
  if (opts.optimistic && before) publishView(key, opts.optimistic(before))
  try {
    const out = await call<T>(`${workPath(key)}${path}`, method, body)
    await reload(key).catch(() => {})
    return out
  } catch (e) {
    await reload(key).catch(() => before && publishView(key, before))
    if (opts.quiet) throw e
    notify(e instanceof ApiFailure && e.status === 409 ? CONFLICT : `保存できませんでした: ${(e as Error).message}`, 'error')
    return undefined
  }
}

/**
 * 企画シートの欄を直す。手元にはすぐ映し、600ms 待ってから、変えた欄だけをまとめて送る
 * (Claude Code が直したほかの欄を消さないため)。値に null を渡すと、その欄を消す
 */
export function editBrief(key: string, change: { fields?: Record<string, unknown>; gates?: Record<string, unknown> }) {
  const p = pending.get(key) ?? { fields: {}, gates: {}, saving: false }
  Object.assign(p.fields, change.fields)
  Object.assign(p.gates, change.gates)
  pending.set(key, p)
  const v = raw.get(key)
  if (v) publishView(key, overlay(key, v))
  setSaving(key, 'pending')
  clearTimeout(p.timer)
  p.timer = window.setTimeout(() => {
    p.timer = undefined
    void flushBrief(key)
  }, 600)
}

const isEmpty = (p: PendingBrief) => Object.keys(p.fields).length === 0 && Object.keys(p.gates).length === 0

async function flushBrief(key: string, attempt = 0): Promise<void> {
  const p = pending.get(key)
  if (!p || isEmpty(p)) return
  if (p.saving) {
    p.timer = window.setTimeout(() => {
      p.timer = undefined
      void flushBrief(key)
    }, 300)
    return
  }
  const sent = { fields: { ...p.fields }, gates: { ...p.gates } }
  p.saving = true
  try {
    const v = raw.get(key) ?? (await reload(key))
    if (!v.brief) throw new Error('この作品には企画シートがありません')
    await call(`${workPath(key)}/brief`, 'PATCH', { base: v.brief.version, set: { ...(Object.keys(sent.fields).length && { fields: sent.fields }), ...(Object.keys(sent.gates).length && { gates: sent.gates }) } })
    // 送っているあいだに、さらに直した欄は残す
    for (const [k, x] of Object.entries(sent.fields)) if (p.fields[k] === x) delete p.fields[k]
    for (const [k, x] of Object.entries(sent.gates)) if (p.gates[k] === x) delete p.gates[k]
    p.saving = false
    if (isEmpty(p) && p.timer === undefined) pending.delete(key)
    await reload(key).catch(() => {})
    setSaving(key, pending.has(key) ? 'pending' : 'saved')
  } catch (e) {
    p.saving = false
    // 読んだ版がほかで変わっていたら、読み直して 1 回だけ送り直す (送るのは変えた欄だけなので、ほかの直しは消えない)
    if (e instanceof ApiFailure && e.status === 409 && attempt === 0) {
      await reload(key).catch(() => {})
      return flushBrief(key, 1)
    }
    pending.delete(key)
    await reload(key).catch(() => {})
    setSaving(key, 'idle')
    notify(e instanceof ApiFailure && e.status === 409 ? CONFLICT : `企画を保存できませんでした: ${(e as Error).message}`, 'error')
  }
}

// ---------------------------------------------------------------- 保存の様子 (企画の欄)

export type Saving = 'idle' | 'pending' | 'saved'
const saving = new Map<string, Saving>()
const savingListeners = new Set<() => void>()
function setSaving(key: string, s: Saving) {
  saving.set(key, s)
  savingListeners.forEach((fn) => fn())
}
export function useSaving(key: string): Saving {
  return useSyncExternalStore(
    (fn) => {
      savingListeners.add(fn)
      return () => savingListeners.delete(fn)
    },
    () => saving.get(key) ?? 'idle',
  )
}

// ---------------------------------------------------------------- 取得と購読

export type WorkData = {
  view: WorkView | null
  /** 作品が見つからない */
  missing: boolean
  /** 作品が無くなった (ごみ箱に移した) */
  gone: boolean
  /** 縮小画像の版 (撮り直すたびに増える) */
  thumbs: number
  /** 聴衆役が読んでいる途中の進み具合 */
  reading: Reading | null
}

/** 作品を読み、ファイルが変わるたびに受け取り直す */
export function useWork(key: string): WorkData {
  const [missing, setMissing] = useState(false)
  const [gone, setGone] = useState(false)
  const [thumbs, setThumbs] = useState(0)
  const [reading, setReading] = useState<Reading | null>(null)
  const view = useSyncExternalStore(
    (fn) => {
      if (!listeners.has(key)) listeners.set(key, new Set())
      listeners.get(key)!.add(fn)
      return () => listeners.get(key)?.delete(fn)
    },
    () => shown.get(key) ?? null,
  )
  useEffect(() => {
    setMissing(false)
    setGone(false)
    reload(key).then(
      (v) => setReading(v.reading),
      () => setMissing(true),
    )
    const es = new EventSource(`/api/events?work=${encodeURIComponent(key)}`)
    es.addEventListener('work', (e) => {
      const v = JSON.parse((e as MessageEvent).data) as WorkView
      store(key, v)
      setReading(v.reading)
    })
    es.addEventListener('thumbs', (e) => setThumbs((JSON.parse((e as MessageEvent).data) as Thumbs).version))
    es.addEventListener('reading', (e) => setReading(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('gone', () => setGone(true))
    return () => es.close()
  }, [key])
  const bodyThumbs = view?.body?.kind === 'talk' ? view.body.thumbsVersion : 0
  return { view, missing, gone, thumbs: Math.max(thumbs, bodyThumbs), reading }
}
