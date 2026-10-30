// 7 月の終わりの不採用 6 件のカード。six-losses と not-ai-alone で同じ見た目で出す
import { t } from '@hokuchi/stage'
import { AnimatePresence, motion } from 'motion/react'

export const LOSSES = 6

/** 6 件の中身。ADR-0109 が「単位が小さすぎた」とまとめた不採用 (ADR-0084・0102・0104・0105・0106・0107) を、将棋 AI を知らない人の言葉にしたもの */
const NAMES = ['読みを\n浅くする工夫', '時間の\n配分', '先読みの\n時間を数える', '読み筋の\n印を残す', '先読みを\n続ける', '考える時間を\n1.25 倍']

/** 1 列の置き方 */
export type Row = { left: number; top: number; width: number; height: number; gap: number }

/** 大きい 1 列 (6 枚で 1040px)。本文の領域 (170〜650) の真ん中に置く */
export const BIG_ROW: Row = { left: 120, top: 335, width: 160, height: 150, gap: 16 }
/** 小さい 1 列 (6 枚で 1030px) */
export const SMALL_ROW: Row = { left: 125, top: 548, width: 160, height: 84, gap: 14 }

/** 不採用の印 */
export function Stamp({ size = 24 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        border: `${size >= 24 ? 3 : 2}px solid var(--accent-strong)`,
        color: 'var(--accent-strong)',
        borderRadius: 6,
        padding: `${Math.round(size * 0.08)}px ${Math.round(size * 0.4)}px`,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '0.12em',
        lineHeight: 1.2,
        transform: 'rotate(-7deg)',
        whiteSpace: 'nowrap',
      }}
    >
      不採用
    </span>
  )
}

type Props = {
  on: boolean
  row: Row
  /** 見せ始めの遅れ (秒)。1 枚ずつ少しずつずらす */
  delay?: number
  /** 薄くする (主役が別のとき) */
  dim?: boolean
}

/** 不採用のカード 6 枚。row が変わると位置と大きさが補間で動く */
export function LossCards({ on, row, delay = 0, dim = false }: Props) {
  const big = row.height >= 120
  const box = (i: number) => ({ left: row.left + i * (row.width + row.gap), top: row.top, width: row.width, height: row.height })
  return (
    <AnimatePresence initial={false}>
      {on &&
        Array.from({ length: LOSSES }, (_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16, ...box(i) }}
            animate={{ opacity: dim ? 0.35 : 1, y: 0, ...box(i) }}
            exit={{ opacity: 0, transition: t({ duration: 0.15, ease: 'easeIn' }) }}
            transition={t({ delay: delay + i * 0.08 })}
            style={{
              position: 'absolute',
              boxSizing: 'border-box',
              background: 'var(--surface)',
              border: '2px solid var(--line)',
              borderRadius: 14,
              display: 'grid',
              justifyItems: 'center',
              alignContent: 'center',
              gap: big ? 16 : 6,
            }}
          >
            {/* 小さい列は思い出させるだけなので、印だけを出す */}
            {big && <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', whiteSpace: 'pre-line', color: 'var(--fg-sub)' }}>{NAMES[i]}</div>}
            <Stamp size={big ? 26 : 20} />
          </motion.div>
        ))}
    </AnimatePresence>
  )
}
