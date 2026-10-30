// 7 月から 10 月の時間の帯と、人が入った場面の旗。two-moments と board-memory で同じものを出す。
// 横の位置はグラフ (_scale) と同じ目盛りで、7/29 が左端、最後の日が右端
import { t } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { FULL, dayOf, xOf } from './_scale'

export type Flag = 'jul' | 'oct'

export const BAND = { left: FULL.left, right: FULL.right, y: 456, h: 14 }
const POLE_H = 120

/** 旗の文言。lines は行数で、2 行の旗は根元を同じ高さに保ったまま上へ伸びる (7 月の旗とぶつからないよう、10 月は 2 行) */
const FLAGS: Record<Flag, { day: number; text: ReactNode; lines: number; side: 'left' | 'right' }> = {
  jul: { day: dayOf('2026-07-30'), text: '7 月: 伸びが止まった', lines: 1, side: 'right' },
  oct: {
    day: dayOf('2026-10-18'),
    text: (
      <>
        10 月: うまくいっている盤を
        <br />
        作り直した
      </>
    ),
    lines: 2,
    side: 'left',
  },
}
const LINE_H = 32
export const flagX = (f: Flag) => xOf(FLAGS[f].day, FULL)

type Zoom = {
  /** 寄る旗 */
  flag: Flag
  /** 寄ったあと、旗の根元が来る位置 */
  to: [number, number]
  on: boolean
  scale?: number
}

type Props = {
  /** 旗を見せるか */
  flags: boolean
  /** 旗が立ち始めるまでの遅れ (秒)。帯を引いてから立てるときに使う */
  flagDelay?: number
  /** 強調する旗 */
  hot?: Flag
  /** カメラが寄る演出 */
  zoom?: Zoom
  visible?: boolean
  /** 見せ始めの遅れ (秒) */
  delay?: number
  /** 帯を左から右へ引く。false の間は帯が無く、true になると引かれる (既定は引き終えた姿) */
  enter?: boolean
}

/** 時間の帯。zoom.on で旗に寄る (カメラの移動なので、帯と旗がまとめて拡大する) */
export function Timeline({ flags, flagDelay = 0, hot, zoom, visible = true, delay = 0, enter = true }: Props) {
  const ox = zoom ? flagX(zoom.flag) : BAND.left
  const oy = BAND.y
  const on = !!zoom?.on
  const s = on ? zoom!.scale ?? 1.6 : 1
  const tx = on ? zoom!.to[0] - ox : 0
  const ty = on ? zoom!.to[1] - oy : 0
  const month = { position: 'absolute', top: BAND.y + 16, width: 80, textAlign: 'center', fontSize: 22, fontWeight: 800 } as const
  return (
    <motion.div
      initial={false}
      animate={{ scale: s, x: tx, y: ty, opacity: visible ? 1 : 0 }}
      transition={t({ delay: visible ? delay : 0, duration: on ? 1.0 : 0.75 })}
      style={{ position: 'absolute', inset: 0, transformOrigin: `${ox}px ${oy}px`, pointerEvents: 'none' }}
    >
      {/* 帯と矢じり。帯は左から右へ引かれ、引き終わりに矢じりと 10 月が付く */}
      <motion.div
        initial={false}
        animate={{ scaleX: enter ? 1 : 0 }}
        transition={t({ duration: 0.8, ease: 'easeInOut' })}
        style={{ position: 'absolute', left: BAND.left, top: BAND.y - BAND.h / 2, width: BAND.right - BAND.left - 12, height: BAND.h, borderRadius: BAND.h / 2, background: 'var(--muted)', transformOrigin: 'left center' }}
      />
      <motion.div initial={false} animate={{ opacity: enter ? 1 : 0 }} transition={t({ delay: enter ? 0.65 : 0, duration: 0.3 })} style={{ position: 'absolute', left: BAND.right - 14, top: BAND.y - 15, width: 0, height: 0, borderTop: '15px solid transparent', borderBottom: '15px solid transparent', borderLeft: '22px solid var(--muted)' }} />
      <motion.div initial={false} animate={{ opacity: enter ? 1 : 0 }} transition={t({ duration: 0.3 })} style={{ ...month, left: BAND.left - 40 }}>
        7 月
      </motion.div>
      <motion.div initial={false} animate={{ opacity: enter ? 1 : 0 }} transition={t({ delay: enter ? 0.65 : 0, duration: 0.3 })} style={{ ...month, left: BAND.right - 40 }}>
        10 月
      </motion.div>

      {(['jul', 'oct'] as Flag[]).map((f, i) => {
        const x = flagX(f)
        const { text, side, lines } = FLAGS[f]
        const isHot = hot === f
        // 寄ったときに画面の端に半分だけ残る旗は、寄りながら消す
        const shown = flags && !(on && zoom!.flag !== f)
        return (
          <motion.div key={f} initial={false} animate={{ opacity: shown ? 1 : 0, y: flags ? 0 : 12 }} transition={t({ delay: flags && !on ? flagDelay + i * 0.35 : 0 })}>
            <div style={{ position: 'absolute', left: x - 2, top: BAND.y - POLE_H, width: 4, height: POLE_H, borderRadius: 2, background: isHot ? 'var(--accent)' : 'var(--fg-sub)', transition: 'background 0.5s' }} />
            <div
              style={{
                position: 'absolute',
                top: BAND.y - POLE_H - 22 - (lines - 1) * LINE_H,
                ...(side === 'right' ? { left: x } : { right: 1280 - x }),
                padding: '6px 18px',
                borderRadius: 10,
                border: `2px solid ${isHot ? 'var(--accent)' : 'var(--fg-sub)'}`,
                background: isHot ? 'var(--accent-bg)' : 'var(--surface)',
                color: isHot ? 'var(--accent-strong)' : 'var(--fg)',
                fontSize: 24,
                fontWeight: 700,
                lineHeight: `${LINE_H}px`,
                whiteSpace: 'nowrap',
                transition: 'background 0.5s, border-color 0.5s, color 0.5s',
              }}
            >
              {text}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
