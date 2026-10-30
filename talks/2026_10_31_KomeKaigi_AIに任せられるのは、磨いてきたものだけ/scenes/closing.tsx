// 終わり。表紙と同じ位置に演題を出し、下に X のアカウント、右に X のアカウントの QR コードを置く
import { motion } from 'motion/react'
import { defineScene, t, useActive, useTalk } from '@hokuchi/stage'
import cover from '@hokuchi/stage/themes/mosh/assets/bg-cover.svg'
import { COVER_TITLE } from '../../../parts/cover'
import { profileAt } from '../../../parts/profile'
import qr from '../assets/x-qr.png'

const bg = `url(${cover}) center / cover`

/** QR コード。演題 (右端 830 ほど) の右に、演題と同じ高さで置く */
const QR = { left: 900, top: 210, size: 260 }

/** X のロゴ (Simple Icons, CC0) */
function XLogo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

function Closing() {
  const active = useActive()
  const p = profileAt(useTalk().date)
  const enter = (delay: number) => ({ initial: false as const, animate: { opacity: active ? 1 : 0, y: active ? 0 : 16 }, transition: t({ duration: 0.9, delay }) })
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg }}>
      <div style={COVER_TITLE}>
        AIに任せられるのは、
        <br />
        <span style={{ color: 'var(--accent)' }}>磨いてきたものだけ</span>
      </div>
      <motion.div style={{ position: 'absolute', left: 120, top: 500, display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 800 }} {...enter(0.3)}>
        <XLogo size={24} />
        {p.x}
      </motion.div>
      <motion.div style={{ position: 'absolute', left: QR.left, top: QR.top, width: QR.size, padding: 12, background: '#fff', borderRadius: 20, boxShadow: '0 6px 24px rgba(0, 0, 0, 0.08)' }} {...enter(0.5)}>
        <img src={qr} alt={`X のアカウント ${p.x} の QR コード`} width={QR.size} height={QR.size} style={{ display: 'block' }} />
      </motion.div>
    </div>
  )
}

export default defineScene({ id: 'closing', steps: 1, Component: Closing })
