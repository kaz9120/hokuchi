// 画面の下に出す短い知らせ (保存できなかった・コピーした など)。数秒で消える
import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { cn } from './utils'

type Notice = { id: number; text: string; tone: 'info' | 'error' }
let notices: Notice[] = []
let next = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function notify(text: string, tone: Notice['tone'] = 'info') {
  const id = ++next
  notices = [...notices.filter((n) => n.text !== text), { id, text, tone }]
  emit()
  setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
}
function dismiss(id: number) {
  notices = notices.filter((n) => n.id !== id)
  emit()
}

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => notices,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] grid justify-center gap-2">
      {list.map((n) => (
        <div
          key={n.id}
          role="status"
          className={cn(
            'pointer-events-auto flex max-w-xl animate-in items-center gap-3 rounded-lg border bg-foreground px-4 py-2.5 text-sm text-background shadow-lg fade-in-0 slide-in-from-bottom-2',
            n.tone === 'error' && 'border-destructive bg-background text-destructive',
          )}
        >
          <span className="leading-relaxed">{n.text}</span>
          <button onClick={() => dismiss(n.id)} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="閉じる">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
