// ブラウザの通知。Claude の作業が終わって話者の番になった作品を、OS の通知で知らせる。
// 変わり目は、画面が前回の一覧と比べて見つける。開いた直後の一覧は、知っているものとして通知しない
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Card } from '../../shared/types'
import { navigate } from '../lib/router'

const supported = typeof window !== 'undefined' && 'Notification' in window

export function useTurnNotifications(todo: Card[] | null) {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!todo) return
    const keys = new Set(todo.map((c) => `${c.id}:${c.ask}`))
    const before = seen.current
    seen.current = keys
    if (!before || !supported || Notification.permission !== 'granted') return
    for (const c of todo) {
      const key = `${c.id}:${c.ask}`
      if (before.has(key)) continue
      const n = new Notification(`あなたの番: ${c.title}`, { body: c.ask, tag: key })
      n.onclick = () => {
        window.focus()
        navigate(`/works/${c.id}`)
        n.close()
      }
    }
  }, [todo])
}

export function NotifyButton() {
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')
  if (!supported || permission === 'granted' || permission === 'denied') return null
  return (
    <button type="button" onClick={async () => setPermission(await Notification.requestPermission())} className="motion-press flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg">
      <Bell className="size-4" aria-hidden />
      <span className="hidden sm:inline">終わったら通知する</span>
    </button>
  )
}
