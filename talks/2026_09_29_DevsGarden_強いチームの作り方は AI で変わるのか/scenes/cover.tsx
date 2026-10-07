// 表紙と締め。締めでは表紙と同じ位置に問いが戻り、答えに変わる (前振りと対にする)
import { Swap, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import cover from '@hokuchi/stage/themes/mosh/assets/bg-cover.svg'

const bg = { position: 'absolute', inset: 0, background: `url(${cover}) center / cover` } as const
const titleBox = { position: 'absolute', left: 120, top: 200, right: 120 } as const
const big = { fontSize: 76, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.02em' }

function Title() {
  const active = useActive()
  return (
    <div style={bg}>
      <motion.div style={titleBox} initial={false} animate={{ opacity: active ? 1 : 0, y: active ? 0 : 24 }} transition={t({ duration: 0.9, delay: 0.2 })}>
        <div style={big}>
          強いチームの作り方は
          <br />
          <span style={{ color: 'var(--accent)' }}>AI で変わるのか</span>
        </div>
        <div style={{ marginTop: 40, fontSize: 26, fontWeight: 600, color: 'var(--fg-sub)', lineHeight: 1.7 }}>
          Dev's Garden ・ 2026-09-29
          <br />
          AI で開発が加速する今、強いチームをどう作る？
        </div>
        <div style={{ marginTop: 28, fontSize: 24, fontWeight: 700 }}>山本 一将（MOSH）</div>
      </motion.div>
    </div>
  )
}

function Closer() {
  const step = useStep()
  return (
    <div style={bg}>
      <div style={titleBox}>
        <div style={big}>
          強いチームの作り方は
          <Swap style={{ color: 'var(--accent)' }}>{step === 0 ? 'AI で変わるのか' : '変わっていません'}</Swap>
        </div>
      </div>
    </div>
  )
}

export const title = defineScene({ id: 'title', steps: 1, Component: Title })
export const closer = defineScene({ id: 'closer', steps: 2, Component: Closer })
