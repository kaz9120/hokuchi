// サーバの API。失敗は { error } の文を Error にして投げる
import { useEffect, useRef, useState } from 'react'
import type { Anchor, HomeView, Kind, Neta, Proposals, Section, ShelfItem, WorkView } from '../../shared/types'

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? `${res.status}`), { status: res.status, current: data.current })
  return data as T
}

export type Attachment = { name: string; data: string }

export const api = {
  home: () => call<HomeView>('GET', '/api/home'),
  shelf: () => call<ShelfItem[]>('GET', '/api/shelf'),
  neta: () => call<Neta[]>('GET', '/api/neta'),
  addNeta: (text: string) => call<{ file: string }>('POST', '/api/neta', { text }),
  trashNeta: (file: string) => call('DELETE', `/api/neta/${encodeURIComponent(file)}`),
  start: (kind: Kind, text: string, files: Attachment[], seed?: string) => call<{ id: string }>('POST', '/api/works', { kind, text, files, seed }),
  work: (id: string) => call<WorkView>('GET', `/api/works/${id}`),
  say: (id: string, body: { text: string; files?: Attachment[]; anchors?: Anchor[]; mode?: 'after' | 'interrupt' }) => call<WorkView>('POST', `/api/works/${id}/say`, body),
  stop: (id: string) => call('POST', `/api/works/${id}/stop`),
  press: (id: string, action: string, payload: unknown = {}) => call<WorkView>('POST', `/api/works/${id}/press/${action}`, payload),
  paragraph: (id: string, n: number, text: string, base: string) => call<WorkView>('PUT', `/api/works/${id}/paragraphs/${n}`, { text, base }),
  outline: (id: string, sections: Section[], base: string) => call<WorkView>('PUT', `/api/works/${id}/outline`, { sections, base }),
  koma: (id: string, scene: string, n: number, orig: string, text: string) => call<WorkView>('PUT', `/api/works/${id}/koma/${scene}/${n}`, { orig, text }),
  proposals: (id: string, patch: Partial<Proposals>) => call<WorkView>('PATCH', `/api/works/${id}/proposals`, patch),
  paste: (id: string) => call<{ text: string }>('GET', `/api/works/${id}/paste`),
}

export const fileUrl = (id: string, rel: string) => `/api/works/${id}/file/${rel.split('/').map(encodeURIComponent).join('/')}`

/** SSE を購読する。宛先は作品か home */
export function useEvents(target: string | null, on: Record<string, (data: any) => void>) {
  const ref = useRef(on)
  ref.current = on
  useEffect(() => {
    if (target === null) return
    const es = new EventSource(target === 'home' ? '/api/events' : `/api/events?work=${encodeURIComponent(target)}`)
    // open は EventSource 自身の知らせなので、データとしては読まない
    const types = Object.keys(ref.current).filter((t) => t !== 'open')
    const handlers = types.map((t) => [t, (e: MessageEvent) => ref.current[t]?.(JSON.parse(e.data))] as const)
    for (const [t, h] of handlers) es.addEventListener(t, h as EventListener)
    // つなぎ直したら (studio を立て直したときなど)、取りこぼした変化を読み直す
    let opened = false
    es.onopen = () => {
      if (opened) ref.current.open?.(null)
      opened = true
    }
    return () => es.close()
  }, [target])
}

/** 読み込んで、SSE で知らせが来たら読み直す */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => void; set: (t: T) => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    load()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(String(e.message ?? e)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { data, error, reload: () => setN((x) => x + 1), set: setData }
}

/** 画像のファイルを、送れる形にする */
export function readImage(file: File): Promise<Attachment> {
  return new Promise((ok, ng) => {
    const r = new FileReader()
    r.onload = () => ok({ name: file.name || 'image.png', data: String(r.result) })
    r.onerror = () => ng(r.error)
    r.readAsDataURL(file)
  })
}
