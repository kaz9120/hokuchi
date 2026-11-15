// 画面の行き先。/ (やること)・/works/<id> (作品)・/shelf (積み上げ)・/neta (ネタ帳)
import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
window.addEventListener('popstate', emit)

export function navigate(path: string) {
  if (location.pathname + location.search === path) return
  history.pushState(null, '', path)
  window.scrollTo(0, 0)
  emit()
}

export function usePath(): string {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => location.pathname,
  )
}

/** a 要素の既定の遷移を、画面の中の遷移に置き換える */
export const link = (path: string) => ({
  href: path,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  },
})
