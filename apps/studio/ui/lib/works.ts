// 作品ごとのデータの層。作品の WorkView を取得し、SSE で購読し、最新のものを手元に持つ (rebuild.md 6 章の土台)。
// 書き込みは、手元の最新の WorkView から「読んだときの版や中身」を添えて送る (サーバは違えば 409 で断る)。
// 書いたあとはすぐ読み直して、続けて書くときに古い版を送らないようにする
import { useEffect, useState } from 'react'
import type { ApiError, Reading, Thumbs, WorkView } from '../../shared/api'

const latest = new Map<string, WorkView>()
const listeners = new Map<string, Set<(v: WorkView) => void>>()

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

function store(key: string, v: WorkView) {
  latest.set(key, v)
  for (const fn of listeners.get(key) ?? []) fn(v)
}

/** 手元の最新の WorkView。無ければ読む */
export async function current(key: string): Promise<WorkView> {
  return latest.get(key) ?? reload(key)
}
export async function reload(key: string): Promise<WorkView> {
  const v = await call<WorkView>(workPath(key))
  store(key, v)
  return v
}

/** 作品を直す。書いたあと、すぐ読み直す */
export async function write<T>(key: string, path: string, method: string, body?: unknown): Promise<T> {
  const out = await call<T>(`${workPath(key)}${path}`, method, body)
  await reload(key).catch(() => {})
  return out
}

/** 作品を読み、ファイルが変わるたびに受け取り直す。missing は作品が無いとき */
export function useWork(key: string | undefined) {
  const [data, setData] = useState<WorkView | null>(null)
  const [missing, setMissing] = useState(false)
  const [thumbs, setThumbs] = useState(0)
  const [reading, setReading] = useState<Reading | null>(null)
  useEffect(() => {
    setData(null)
    setMissing(false)
    if (!key) return
    const set = (v: WorkView) => {
      setData(v)
      setReading(v.reading)
      if (v.body?.kind === 'talk') setThumbs((t) => Math.max(t, (v.body as { thumbsVersion: number }).thumbsVersion))
    }
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(set)
    reload(key).catch(() => setMissing(true))
    const es = new EventSource(`/api/events?work=${encodeURIComponent(key)}`)
    es.addEventListener('work', (e) => store(key, JSON.parse((e as MessageEvent).data)))
    es.addEventListener('thumbs', (e) => setThumbs((JSON.parse((e as MessageEvent).data) as Thumbs).version))
    es.addEventListener('reading', (e) => setReading(JSON.parse((e as MessageEvent).data)))
    return () => {
      es.close()
      listeners.get(key)?.delete(set)
    }
  }, [key])
  return { data, missing, thumbs, reading }
}
