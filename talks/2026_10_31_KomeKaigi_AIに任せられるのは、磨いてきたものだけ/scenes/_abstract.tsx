// 将棋の外へ出る章 (knowledge〜callback) で使い回す部品。将棋の図に引っ張られない、抽象の図のための小さな型
import { UserRound } from 'lucide-react'
import type { CSSProperties } from 'react'

export type Month = '7 月' | '8 月' | '10 月'

/** 将棋の場面の月の札。two-moments の旗 (7 月 / 10 月) を小さく思い出させる */
export function MonthTag({ month, hot = false, style }: { month: Month; hot?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0 10px',
        borderRadius: 6,
        border: `2px solid ${hot ? 'var(--accent)' : 'var(--muted)'}`,
        color: hot ? 'var(--accent-strong)' : 'var(--fg-sub)',
        background: hot ? 'var(--surface)' : 'transparent',
        fontSize: 20,
        fontWeight: 800,
        lineHeight: '28px',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        transition: 'border-color 0.5s, color 0.5s, background 0.5s',
        ...style,
      }}
    >
      {month}
    </span>
  )
}

/** 列の見出し。文字の下に列の幅いっぱいの線を引く */
export function ColumnHead({ left, top, width, hot = false, children }: { left: number; top: number; width: number; hot?: boolean; children: string }) {
  return (
    <div style={{ position: 'absolute', left, top, width, paddingBottom: 10, borderBottom: `3px solid ${hot ? 'var(--accent)' : 'var(--fg-sub)'}`, fontSize: 24, fontWeight: 800, color: hot ? 'var(--accent-strong)' : 'var(--fg-sub)', letterSpacing: '0.04em', whiteSpace: 'nowrap', transition: 'color 0.5s, border-color 0.5s' }}>
      {children}
    </div>
  )
}

/** 人型。lucide の UserRound (頭と肩が接していて 1 人に見える)。cx が中心、bottom が足元 */
export function Person({ cx, bottom, height = 96, hot = false }: { cx: number; bottom: number; height?: number; hot?: boolean }) {
  // UserRound は 24 の枠の中で、肩の底が 21 の高さにある。線の太さぶんを足して、足元を bottom にそろえる
  const top = bottom - (height * 22) / 24
  return (
    <div style={{ position: 'absolute', left: cx - height / 2, top, width: height, height, color: hot ? 'var(--accent)' : 'var(--fg-sub)', transition: 'color 0.5s' }}>
      <UserRound size={height} strokeWidth={2} style={{ display: 'block' }} />
    </div>
  )
}

/** 同じ AI の印。角丸の四角に AI の字 */
export function AiMark({ cx, cy, size = 48, hot = false }: { cx: number; cy: number; size?: number; hot?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `3px solid ${hot ? 'var(--accent)' : 'var(--fg-sub)'}`,
        background: hot ? 'var(--accent-bg)' : 'var(--surface)',
        color: hot ? 'var(--accent-strong)' : 'var(--fg-sub)',
        display: 'grid',
        placeContent: 'center',
        fontFamily: 'Nunito, sans-serif',
        fontSize: size * 0.42,
        fontWeight: 800,
        letterSpacing: '0.02em',
        transition: 'border-color 0.5s, background 0.5s, color 0.5s',
      }}
    >
      AI
    </div>
  )
}

/** 「AI が自分で届く線」の見た目。result のグラフの「AI が自分で届いた線」(3200 点) とそろえる */
export const REACH_LINE = { stroke: 'var(--fg)', strokeWidth: 3, strokeLinecap: 'round' } as const
