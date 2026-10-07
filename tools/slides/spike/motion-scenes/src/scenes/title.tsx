import { motion } from 'motion/react'
import { t } from '../runtime/deck'

export function Title() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'url(/brand/bg-cover.svg) center / cover' }}>
      <motion.div
        style={{ position: 'absolute', left: 120, top: 220, color: 'var(--ink)' }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t({ duration: 0.9 })}
      >
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.02em' }}>
          強いチームの作り方は
          <br />
          <span style={{ color: 'var(--coral)' }}>AI で変わるのか</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 30, fontWeight: 600, color: 'var(--sub)' }}>
          Dev's Garden 2026-09-29 ・ 山本 一将（MOSH）
        </div>
      </motion.div>
    </div>
  )
}
