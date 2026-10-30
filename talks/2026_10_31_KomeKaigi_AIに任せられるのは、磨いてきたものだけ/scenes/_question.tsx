// 大きな文の対話。前の文が上に退いて小さくなり、次の文が主役の位置に来る (要素を残したまま動かす)。
// question (問い) と answer (答え) で同じ位置・同じ大きさを使い、問いと答えを対にする
import { AnimatePresence, motion } from 'motion/react'
import { t, useStep } from '@hokuchi/stage'
import type { ReactNode } from 'react'

/** 主役の文の位置と大きさ */
export const BIG = { left: 120, width: 1040, top: 262, fontSize: 56, lineHeight: 1.4 }
/** 退いた文の位置と倍率 (56px × 0.42 ≒ 24px に見える) */
const SMALL = { top: 150, scale: 0.42 }
/** 主役の文の下に出す 1 文の位置 */
export const BELOW_TOP = 470

export type Line = {
  key: string
  /** この状態から主役の位置に出る */
  big: number
  /** この状態から上に退いて小さくなる */
  small?: number
  /** 文。小さくなったときと状態で色を変えたいときは関数で渡す */
  node: ReactNode | ((small: boolean, step: number) => ReactNode)
}

/** 今日の問い。question と answer で同じ文・同じ強調を出す */
export const QUESTION = (small: boolean) => (
  <>
    AI に任せる時代に
    <br />
    <Accent on={!small}>経験の価値は下がったのでしょうか</Accent>
  </>
)

/** 文の中の強調。on が false のときは地の色に戻る (強調色は 1 つの状態で 1 か所に絞る) */
export function Accent({ on, children }: { on: boolean; children: ReactNode }) {
  return <span style={{ color: on ? 'var(--accent-strong)' : 'inherit', transition: 'color 0.6s' }}>{children}</span>
}

export function Dialogue({ lines, label = [], children }: { lines: readonly Line[]; label?: readonly string[]; children?: ReactNode }) {
  const step = useStep()
  const tag = label[Math.min(step, label.length - 1)] ?? ''
  return (
    <>
      {lines.map((l) => {
        const on = step >= l.big
        const small = l.small !== undefined && step >= l.small
        return (
          <AnimatePresence key={l.key} initial={false}>
            {on && (
              <motion.div
                style={{
                  position: 'absolute',
                  left: BIG.left,
                  width: BIG.width,
                  fontSize: BIG.fontSize,
                  fontWeight: 800,
                  lineHeight: BIG.lineHeight,
                  letterSpacing: '0.02em',
                  transformOrigin: 'left top',
                  color: small ? 'var(--fg-sub)' : 'var(--fg)',
                  transition: 'color 0.6s',
                }}
                initial={{ opacity: 0, top: BIG.top + 28, scale: 1 }}
                // 前の文が退き始めてから、次の文が入る (重ねない)
                animate={small ? { opacity: 0.6, top: SMALL.top, scale: SMALL.scale, transition: t({ duration: 0.8 }) } : { opacity: 1, top: BIG.top, scale: 1, transition: t({ duration: 0.8, delay: 0.3 }) }}
                exit={{ opacity: 0, transition: t({ duration: 0.2 }) }}
              >
                {typeof l.node === 'function' ? l.node(small, step) : l.node}
              </motion.div>
            )}
          </AnimatePresence>
        )
      })}
      {/* 札 (今日の問い / 答え)。前の文が退き終わってから出す (退く途中の文と重ねない) */}
      <AnimatePresence initial={false} mode="wait">
        {tag && (
          <motion.div
            key={tag}
            style={{ position: 'absolute', left: BIG.left, top: 224, fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)', letterSpacing: '0.08em' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: t({ duration: 0.4, delay: 0.55 }) }}
            exit={{ opacity: 0, transition: t({ duration: 0.15 }) }}
          >
            {tag}
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  )
}
