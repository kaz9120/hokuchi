import { defineScene, t } from '@hokuchi/stage'
import { motion } from 'motion/react'
import cover from '@hokuchi/stage/themes/mosh/assets/bg-cover.svg'

function Title() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: `url(${cover}) center / cover` }}>
      <motion.div style={{ position: 'absolute', left: 120, top: 220 }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={t({ duration: 0.9 })}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.02em' }}>
          強いチームの作り方は
          <br />
          <span style={{ color: 'var(--accent)' }}>AI で変わるのか</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 30, fontWeight: 600, color: 'var(--fg-sub)' }}>Dev's Garden 2026-09-29 ・ 山本 一将（MOSH）</div>
      </motion.div>
    </div>
  )
}

export default defineScene({
  id: 'title',
  steps: 1,
  Component: Title,
})
