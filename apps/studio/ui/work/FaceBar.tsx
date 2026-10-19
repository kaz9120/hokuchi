// 面のツールバー (design.md 3 章「作品の画面」)。どの面も、上に同じ形の帯を 1 本持つ。
// 左に面の名前と要約、右にその面の操作。面の中身は <BarSummary>・<BarActions> で、ここに差し込む (React のポータル)
import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

type Slots = { summary: HTMLElement | null; actions: HTMLElement | null }
const SlotContext = createContext<Slots>({ summary: null, actions: null })

/** 面の帯と、その下の中身。帯の差し込み口を、中身に渡す */
export function FaceFrame({ label, children }: { label: string; children: React.ReactNode }) {
  const [summary, setSummary] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  return (
    <SlotContext.Provider value={{ summary, actions }}>
      <div role="toolbar" aria-label={`${label}の操作`} className="flex min-h-12 shrink-0 items-center gap-4 border-b bg-background px-6 py-1.5">
        <h2 className="shrink-0 text-base font-semibold">{label}</h2>
        <div ref={setSummary} className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm text-muted-foreground" />
        <div ref={setActions} className="flex shrink-0 items-center gap-2" />
      </div>
      {children}
    </SlotContext.Provider>
  )
}

/** 帯の左 (面の名前の右) に出す要約 */
export function BarSummary({ children }: { children: React.ReactNode }) {
  const { summary } = useContext(SlotContext)
  return summary ? createPortal(children, summary) : null
}

/** 帯の右に出す、その面の操作 */
export function BarActions({ children }: { children: React.ReactNode }) {
  const { actions } = useContext(SlotContext)
  return actions ? createPortal(children, actions) : null
}
