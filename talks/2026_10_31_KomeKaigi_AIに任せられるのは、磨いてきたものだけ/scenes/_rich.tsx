// 強調や改行を含む見出し。Headline は文字列しか受けないので、ReactNode を状態ごとに差し替えられるようにしたもの。
// 同じ key が続く状態では差し替えない (Headline と同じ振る舞い)
import { AnimatePresence, motion } from 'motion/react'
import { pick, t, useStep } from '@hokuchi/stage'
import type { CSSProperties, ReactNode } from 'react'

type Item = string | { key: string; node: ReactNode }

export function RichHeadline({ items, className = 'headline', style }: { items: readonly Item[]; className?: string; style?: CSSProperties }) {
  const it = pick(useStep(), items)
  const key = typeof it === 'string' ? it : it.key
  const node = typeof it === 'string' ? it : it.node
  return (
    <div className={className} style={style}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, transition: t({ duration: 0.4 }) }}
          exit={{ opacity: 0, y: -12, transition: t({ duration: 0.18, ease: 'easeIn' }) }}
        >
          {node}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
