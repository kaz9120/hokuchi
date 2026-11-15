// 画面への通知 (Server-Sent Events)。宛先 (topic) ごとに接続を持つ。
// 宛先は "work:<作品の key>" と "home"。最後の接続が切れたら onIdle を呼ぶ (作品の作業場を止めるため)
import type { ServerResponse } from 'node:http'

const topics = new Map<string, Set<ServerResponse>>()
const idle = new Map<string, () => void>()

export function subscribe(topic: string, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  res.write(': connected\n\n')
  if (!topics.has(topic)) topics.set(topic, new Set())
  topics.get(topic)!.add(res)
  res.on('close', () => {
    const set = topics.get(topic)
    set?.delete(res)
    if (set && set.size === 0) {
      topics.delete(topic)
      idle.get(topic)?.()
    }
  })
}

export function publish(topic: string, type: string, data: unknown) {
  const set = topics.get(topic)
  if (!set) return
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of set) res.write(msg)
}

export const listeners = (topic: string) => topics.get(topic)?.size ?? 0

/** 宛先の最後の接続が切れたときに呼ぶ */
export function onIdle(topic: string, fn: () => void) {
  idle.set(topic, fn)
}

export function closeAll() {
  for (const set of topics.values()) for (const res of set) res.end()
  topics.clear()
}
