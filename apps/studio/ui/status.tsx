// 作品の状態の 1 語。
// 判定はサーバの状態の表がする。画面は WorkState の label (「完成（社内）」を含む) を、そのまま出すだけにする
import type { StateWord, WorkState } from '../shared/api'
import { cn } from './lib/utils'

/** 1 語ごとの見た目。中立の系統の中で、濃さだけを変える */
const TONE: Record<StateWord, string> = {
  下書き: 'border-border bg-background text-foreground',
  完成: 'border-transparent bg-secondary text-secondary-foreground',
  公開: 'border-transparent bg-primary text-primary-foreground',
  改稿中: 'border-dashed border-foreground/40 bg-background text-foreground',
}

export function StateLabel({ state, className }: { state: WorkState; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[state.word], className)}>{state.label}</span>
}
